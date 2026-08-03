/**
 * Import data prospek trade-in bulanan (layout sheet "Prospek Trade-in") ke Firestore.
 *
 * Dipakai untuk file seperti "TRADE-IN TENDEAN JULI 2026.xlsx".
 * Semua baris di file ini sudah DEALING → adminStage = 'dealing' (bisa diubah via --stage).
 *
 * Menulis ke:
 *   - tradein_requests/{autoId}
 *   - tradein_plate_index/{plateKey}
 *
 * Kolom sheet yang dibaca (berdasarkan nama header, bukan index):
 *   No. | Tgl Prospek | Nama Pelanggan | Nomor wA | Model mobil baru | Type Mobil Baru |
 *   Sumber Aktivitas | Kreteria Customer | Klasifikasi Prospek | Nama Sales |
 *   Tgl Prospek Dibuat | Tgl Rencana FollowUp | Mobil yang Di trade In | PLAT NOMOR |
 *   tahun Mobil | HARGA DEALING | keterangan
 *
 * Field yang tidak ada di sheet (plat, warna, KM, STNK, ekspektasi, estimasi) diisi
 * DUMMY yang realistis & deterministik per baris, lalu dicatat di `importDummyFields`
 * supaya bisa dilacak/diperbaiki nanti.
 *
 * Usage:
 *   node tools/import-tradein-prospek-bulanan.mjs --serviceAccount "<path.json>" --input "<xlsx>" --dry-run
 *   node tools/import-tradein-prospek-bulanan.mjs --serviceAccount "<path.json>" --input "<xlsx>" --commit
 *
 * Flags:
 *   --dry-run            (default) tidak menulis; print statistik + preview JSON.
 *   --commit             benar-benar menulis ke Firestore.
 *   --sheet "<name>"     nama sheet (default "Prospek Trade-in").
 *   --stage "<stage>"    adminStage untuk semua baris (default "dealing").
 *   --branch "<nama>"    branchOutlet (default "TENDEAN").
 *   --batch "<label>"    importBatch (default diturunkan dari nama file).
 *   --limit <n>          batasi jumlah baris (untuk test).
 *   --previewOut <path>  file JSON hasil parse (default temp dir).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'
import XLSX from 'xlsx'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getArg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return fallback
  const next = process.argv[idx + 1]
  if (next == null || next.startsWith('--')) return true
  return next
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

// `xlsx` mendekode shared string UTF-8 sebagai CP1252, jadi "–" jadi "â€“".
// Ubah balik: char → byte CP1252 → decode UTF-8.
const CP1252_HIGH = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a,
  '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c,
  'ž': 0x9e, 'Ÿ': 0x9f,
}
function fixMojibake(s) {
  if (!/[ÂÃâ€][-ÿ -⃿Œ-Ÿ]/.test(s)) return s
  const bytes = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (cp <= 0xff) bytes.push(cp)
    else if (CP1252_HIGH[ch] != null) bytes.push(CP1252_HIGH[ch])
    else return s // ada karakter di luar CP1252 → bukan mojibake, jangan diutak-atik
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
    return decoded
  } catch {
    return s
  }
}

const str = (v) => fixMojibake(String(v == null ? '' : v).replace(/\r/g, ' ')).trim()
const normalizePlate = (raw) => String(raw || '').toUpperCase().replace(/\s+/g, '')
const keyNorm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Ambil nilai baris berdasarkan salah satu nama header (dicocokkan longgar). */
function pick(row, ...headers) {
  for (const h of headers) {
    const k = keyNorm(h)
    if (k in row && row[k] !== '' && row[k] != null) return row[k]
  }
  return ''
}

function excelSerialToDate(v) {
  if (v === '' || v == null) return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Date dari `xlsx` bisa meleset beberapa detik dari tengah malam → bulatkan ke hari terdekat.
    const r = new Date(Math.round(v.getTime() / 86400000) * 86400000)
    return new Date(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate())
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, Math.floor(d.S || 0))
  }
  const s = String(v).trim()
  // "2026-07-20" / "2026-07-20 00:00:00"
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  return null
}

/** Format tanggal lokal jadi "YYYY-MM-DD" (bebas timezone, tidak geser hari). */
function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Tanggal dari Excel dipertahankan; jam dibuat dummy jam kerja agar tidak semua 00:00. */
function withDummyTime(d, rowNo) {
  if (!d) return null
  const hour = 8 + (rowNo % 9) // 08..16
  const minute = (rowNo * 7) % 60
  const second = (rowNo * 13) % 60
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, second)
}

function parseMoney(raw) {
  if (raw === '' || raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 100000 ? Math.round(raw * 1_000_000) : Math.round(raw)
  }
  const s = String(raw).toLowerCase()
  const isJuta = /jt|juta/.test(s)
  const digits = s.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  return isJuta || n < 100000 ? Math.round(n * 1_000_000) : Math.round(n)
}

const roundJuta = (n) => (n == null ? null : Math.round(n / 1_000_000) * 1_000_000)

// ---- merk dari nama model (sheet hanya menulis model, tanpa merk) ----
const BRAND_BY_MODEL = [
  [/\bbrio\b|\bmobilio\b|\bjazz\b|\bhrv\b|\bhr-v\b|\bcrv\b|\bcr-v\b|\bbrv\b|\bbr-v\b|\bfreed\b|\bcity\b/i, 'HONDA'],
  [/\bsigra\b|\bterios\b|\bxenia\b|\bayla\b|\bgranmax\b|\bgran max\b|\bluxio\b|\bsirion\b|\brocky\b/i, 'DAIHATSU'],
  [/\bxpander\b|\bpajero\b|\bmirage\b|\btriton\b|\bl300\b|\boutlander\b/i, 'MITSUBISHI'],
  [/\bkarimun\b|\bertega\b|\bertiga\b|\bapv\b|\bswift\b|\bignis\b|\bbaleno\b|\bxl7\b|\bxl-7\b/i, 'SUZUKI'],
  [/\blivina\b|\bgrand livina\b|\bjuke\b|\bmarch\b|\bxtrail\b|\bx-trail\b|\bserena\b/i, 'NISSAN'],
  [/\bwuling\b|\bconfero\b|\bcortez\b|\balmaz\b/i, 'WULING'],
  [/\bavanza\b|\brush\b|\bcalya\b|\bagya\b|\binnova\b|\bkijang\b|\byaris\b|\bveloz\b|\bfortuner\b|\bhilux\b|\bsienta\b|\betios\b|\bvios\b|\bavanza veloz\b|\braize\b|\bcorolla\b|\bcamry\b|\balphard\b|\bland cruiser\b|\blc\b/i, 'TOYOTA'],
]
function brandOf(model) {
  for (const [re, brand] of BRAND_BY_MODEL) if (re.test(model)) return brand
  return ''
}

/**
 * Pecah "BRIO SATYA M/T 2020" / "AVANZA E M/T (2010)" / "SIGRA (2016)"
 * jadi { merkModel, transmission, year, transmissionFromSheet }.
 */
function parseUnit(raw) {
  const s = str(raw)
  let year = ''
  const ym = s.match(/((?:19|20)\d{2})/g)
  if (ym) year = ym[ym.length - 1]

  let transmission = ''
  if (/\ba\/t\b|\bat\b|matic|otomatis/i.test(s)) transmission = 'Matic'
  else if (/\bm\/t\b|\bmt\b|manual/i.test(s)) transmission = 'Manual'
  else if (/\bcvt\b/i.test(s)) transmission = 'Matic'
  const transmissionFromSheet = Boolean(transmission)

  let model = s
  if (year) model = model.split(year).join(' ')
  model = model
    .replace(/[()]/g, ' ')
    .replace(/\ba\/t\b|\bm\/t\b/gi, ' ')
    .replace(/(?<![a-z])(at|mt|cvt|matic|manual|otomatis)(?![a-z])/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const brand = brandOf(model)
  const merkModel = [brand, model.toUpperCase()].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return { merkModel: merkModel || 'UNIT', transmission, year, transmissionFromSheet }
}

// ---- dummy generators (deterministik per baris, realistis) ----
const COLOR_POOL = ['PUTIH', 'SILVER', 'HITAM', 'ABU-ABU', 'MERAH', 'ABU-ABU METALIK', 'BIRU', 'PUTIH']
const PLATE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const BULAN = [
  'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER',
]

function dummyColor(rowNo) {
  return COLOR_POOL[(rowNo * 5 + 2) % COLOR_POOL.length]
}

/** Plat Manado = DB. Dibuat deterministik, lalu digeser bila bentrok. */
function dummyPlate(rowNo, taken) {
  for (let bump = 0; bump < 500; bump++) {
    const seed = rowNo * 37 + bump * 101
    const num = 1000 + (seed % 8999) // 1000..9999
    const l1 = PLATE_LETTERS[(seed * 5) % PLATE_LETTERS.length]
    const l2 = PLATE_LETTERS[(seed * 11 + 7) % PLATE_LETTERS.length]
    const key = `DB${num}${l1}${l2}`
    if (!taken.has(key)) return { display: `DB ${num} ${l1}${l2}`, key }
  }
  throw new Error('Gagal membuat plat dummy unik')
}

/** KM realistis: ± 12rb/tahun pemakaian, dibulatkan ribuan, format "123.000". */
function dummyKm(year, rowNo) {
  const y = Number(year)
  const nowYear = new Date().getFullYear()
  const age = Number.isFinite(y) && y > 1980 ? Math.max(1, nowYear - y) : 6
  const perYear = 10000 + ((rowNo * 733) % 6000) // 10.000 - 16.000 km/tahun
  const km = Math.round((age * perYear) / 1000) * 1000
  return km.toLocaleString('id-ID')
}

/** Masa berlaku STNK berikutnya, mis. "MARET 2027". */
function dummyStnkMonth(createdDate, rowNo) {
  const base = createdDate || new Date()
  const monthIdx = (base.getMonth() + 1 + (rowNo * 3) % 12) % 12
  const year = monthIdx <= base.getMonth() ? base.getFullYear() + 1 : base.getFullYear()
  return `${BULAN[monthIdx]} ${year}`
}

// ---------- main ----------
const serviceAccountPath = getArg('serviceAccount')
const inputPath = getArg('input')
const sheetName = getArg('sheet', 'Prospek Trade-in')
const forcedStage = str(getArg('stage', 'dealing')) || 'dealing'
const branchOutlet = str(getArg('branch', 'TENDEAN'))
const limit = (() => { const v = getArg('limit'); const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null })()
const commit = hasFlag('commit')
const dryRun = !commit
const previewOut = getArg('previewOut', path.join(os.tmpdir(), 'tradein-prospek-import-preview.json'))

if (!serviceAccountPath || !inputPath) {
  console.error('Wajib: --serviceAccount <path.json> --input <xlsx>')
  process.exit(1)
}
const absSa = path.isAbsolute(serviceAccountPath) ? serviceAccountPath : path.join(__dirname, '..', serviceAccountPath)
const absInput = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath)

// TANPA cellDates: biarkan tanggal tetap serial number supaya diparse lewat
// XLSX.SSF.parse_date_code (bebas timezone). cellDates:true menghasilkan Date UTC
// yang meleset ~36 detik sebelum tengah malam → tanggal lokal mundur 1 hari.
const wb = XLSX.readFile(absInput)
if (!wb.Sheets[sheetName]) {
  console.error(`Sheet "${sheetName}" tidak ditemukan. Ada: ${wb.SheetNames.join(', ')}`)
  process.exit(1)
}
const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })

const importBatch = (() => {
  const v = getArg('batch')
  if (typeof v === 'string' && v.trim()) return v.trim()
  const base = path.basename(absInput, path.extname(absInput))
  return `${base.toUpperCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}`
})()

// Firestore dipakai juga saat dry-run (untuk cek bentrok plat & duplikat nama).
const sa = JSON.parse(fs.readFileSync(absSa, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const idxSnap = await db.collection('tradein_plate_index').get()
const takenPlates = new Set(idxSnap.docs.map((d) => d.id))

const reqSnap = await db.collection('tradein_requests').get()
const existingNames = new Map()
reqSnap.forEach((d) => {
  const n = str(d.data().customerName).toUpperCase().replace(/\s+/g, ' ')
  if (n) existingNames.set(n, d.id)
})

const records = []
const warnings = []
for (const raw of rawRows) {
  const row = {}
  for (const [k, v] of Object.entries(raw)) row[keyNorm(k)] = v

  const customerName = str(pick(row, 'Nama Pelanggan', 'Nama Customer', 'Customer'))
  const unitRaw = str(pick(row, 'Mobil yang Di trade In', 'Mobil Trade In'))
  if (!customerName && !unitRaw) continue

  const rowNo = Number(pick(row, 'No.', 'No')) || records.length + 1
  const dummyFields = []

  // --- tanggal ---
  const createdRaw = pick(row, 'Tgl Prospek Dibuat', 'Tgl Prospek')
  const createdDate = withDummyTime(excelSerialToDate(createdRaw), rowNo)
  const followUpDate = excelSerialToDate(pick(row, 'Tgl Rencana FollowUp', 'Tgl Rencana Follow Up'))

  // --- WA ---
  let waDigits = str(pick(row, 'Nomor wA', 'Nomor WA', 'WA', 'No WA')).replace(/\D/g, '')
  if (waDigits.startsWith('0')) waDigits = `62${waDigits.slice(1)}`
  if (!waDigits) { waDigits = `62812${String(10000000 + ((rowNo * 3797) % 89999999)).slice(0, 8)}`; dummyFields.push('customerWaKey') }
  else if (waDigits.length > 14 || waDigits.length < 10) {
    warnings.push(`Baris #${rowNo} (${customerName}): nomor WA "${waDigits}" panjangnya tidak wajar (${waDigits.length} digit) — dibiarkan apa adanya.`)
  }

  // --- unit trade-in ---
  const unit = parseUnit(unitRaw)
  const yearSheet = str(pick(row, 'tahun Mobil', 'Tahun Mobil', 'Tahun'))
  const year = yearSheet || unit.year || ''
  let transmission = unit.transmission
  if (!transmission) {
    transmission = rowNo % 2 === 0 ? 'Matic' : 'Manual'
    dummyFields.push('transmission')
  }

  // --- plat (tidak ada di sheet ini) ---
  let plateDisplay = str(pick(row, 'PLAT NOMOR', 'Plat Nomor', 'Nopol'))
  let plateKey = normalizePlate(plateDisplay)
  if (!plateKey) {
    const dp = dummyPlate(rowNo, takenPlates)
    plateDisplay = dp.display
    plateKey = dp.key
    dummyFields.push('plateNumber')
  }
  takenPlates.add(plateKey)

  // --- warna / KM / STNK (tidak ada di sheet) ---
  const color = dummyColor(rowNo); dummyFields.push('color')
  const km = dummyKm(year, rowNo); dummyFields.push('km')
  const stnkMonth = dummyStnkMonth(createdDate, rowNo); dummyFields.push('stnkMonth')

  // --- harga ---
  const fixedPrice = parseMoney(pick(row, 'HARGA DEALING', 'Harga Dealing', 'Harga Fix'))
  const expectLowPrice = fixedPrice ? roundJuta(fixedPrice * 1.07) : null
  const estimateLow = fixedPrice ? roundJuta(fixedPrice * 0.93) : null
  const estimateHigh = fixedPrice ? roundJuta(fixedPrice * 1.02) : null
  if (fixedPrice) dummyFields.push('expectLowPrice', 'estimateLow', 'estimateHigh')

  // --- mobil baru ---
  const newCarModel = [str(pick(row, 'Model mobil baru', 'Mobil Baru')), str(pick(row, 'Type Mobil Baru', 'Tipe Mobil Baru'))]
    .filter(Boolean).join(' ').trim()

  const sumberAktivitas = (() => {
    const v = str(pick(row, 'Sumber Aktivitas'))
    return /^none$/i.test(v) ? '' : v
  })()
  const keterangan = str(pick(row, 'keterangan', 'Keterangan'))

  const notesParts = []
  if (keterangan) notesParts.push(keterangan)
  if (sumberAktivitas) notesParts.push(`Sumber aktivitas: ${sumberAktivitas}`)

  const adminStage = forcedStage
  const status = adminStage === 'cancel' ? 'cancelled' : adminStage === 'new' ? 'new' : 'contacted'

  records.push({
    customerName,
    customerWaKey: waDigits,
    customerPhone: waDigits,
    customerUid: '',
    plateNumber: plateDisplay,
    plateKey,
    merkModel: unit.merkModel,
    transmission,
    year,
    color,
    km,
    stnkMonth,
    bpkbStatus: 'Tersedia',
    carType: `${unit.merkModel} ${transmission}`.trim(),
    newCarModel,
    salesName: str(pick(row, 'Nama Sales', 'Sales')),
    expectLowPrice,
    estimateLow,
    estimateHigh,
    estimateNotes: notesParts.join(' | ').slice(0, 900),
    fixedPrice: fixedPrice ?? 0,
    cancelReason: '',
    adminStage,
    status,
    sourceChannel: 'first',
    acquisitionChannel: 'first',
    // konteks tambahan dari sheet prospek
    sourceActivity: sumberAktivitas,
    customerCriteria: str(pick(row, 'Kreteria Customer', 'Kriteria Customer')),
    prospectClass: str(pick(row, 'Klasifikasi Prospek')),
    followUpPlanAt: followUpDate ? fmtDate(followUpDate) : '',
    branchOutlet,
    sourceUnit: 'DEALER HA',
    importSource: sheetName,
    importBatch,
    importRowNo: rowNo,
    importDummyFields: dummyFields,
    _createdDate: createdDate ? createdDate.toISOString() : null,
  })

  if (limit && records.length >= limit) break
}

// ---- validasi & statistik ----
for (const p of records) {
  const n = p.customerName.toUpperCase().replace(/\s+/g, ' ')
  if (existingNames.has(n)) warnings.push(`Baris #${p.importRowNo}: nama "${p.customerName}" sudah ada di Firestore (doc ${existingNames.get(n)}) — kemungkinan duplikat.`)
}
const waSeen = new Map()
for (const p of records) {
  if (waSeen.has(p.customerWaKey)) warnings.push(`Nomor WA ${p.customerWaKey} dipakai 2 baris: #${waSeen.get(p.customerWaKey)} dan #${p.importRowNo}.`)
  waSeen.set(p.customerWaKey, p.importRowNo)
}
const noPrice = records.filter((p) => !p.fixedPrice).map((p) => p.importRowNo)
if (noPrice.length) warnings.push(`Baris tanpa HARGA DEALING: ${noPrice.join(', ')}`)

console.log('=============================================')
console.log(`Mode           : ${dryRun ? 'DRY-RUN (tidak menulis)' : 'COMMIT (menulis ke Firestore)'}`)
console.log(`File           : ${path.basename(absInput)}`)
console.log(`Sheet          : ${sheetName}`)
console.log(`Import batch   : ${importBatch}`)
console.log(`Cabang         : ${branchOutlet}`)
console.log(`Stage          : ${forcedStage}`)
console.log(`Baris valid    : ${records.length}`)
console.log(`Total nilai    : Rp ${records.reduce((a, p) => a + (p.fixedPrice || 0), 0).toLocaleString('id-ID')}`)
console.log('=============================================')

console.log('\n--- semua baris ---')
for (const p of records) {
  console.log(
    `#${String(p.importRowNo).padStart(2)} | ${p.customerName.padEnd(32).slice(0, 32)} | ${p.plateNumber.padEnd(11)} | ` +
    `${`${p.merkModel} ${p.transmission} ${p.year}`.padEnd(34).slice(0, 34)} | ${p.color.padEnd(16)} | ` +
    `KM ${String(p.km).padStart(7)} | Rp ${String(p.fixedPrice.toLocaleString('id-ID')).padStart(13)} | → ${p.newCarModel}`,
  )
}

if (warnings.length) {
  console.log('\n--- PERINGATAN ---')
  warnings.forEach((w) => console.log(`⚠️  ${w}`))
}

fs.writeFileSync(previewOut, JSON.stringify(records, null, 2))
console.log(`\nPreview JSON  : ${previewOut}`)

if (dryRun) {
  console.log('\nDRY-RUN selesai. Jalankan ulang dengan --commit untuk menulis.')
  process.exit(0)
}

// ---- COMMIT ----
const ts = admin.firestore.FieldValue.serverTimestamp()
let ok = 0, skipped = 0, failed = 0
for (const p of records) {
  const { _createdDate, ...doc } = p
  const createdAt = _createdDate ? admin.firestore.Timestamp.fromDate(new Date(_createdDate)) : ts
  const reqRef = db.collection('tradein_requests').doc()
  const idxRef = db.collection('tradein_plate_index').doc(p.plateKey)
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(idxRef)
      if (snap.exists) throw new Error(`Duplicate plateKey: ${p.plateKey}`)
      tx.set(reqRef, { ...doc, createdAt })
      tx.set(idxRef, {
        plateKey: p.plateKey,
        requestId: reqRef.id,
        customerWaKey: p.customerWaKey || '',
        customerUid: '',
        createdAt,
      })
    })
    ok++
    console.log(`✅ ${reqRef.id}  ${p.customerName} - ${p.plateNumber}`)
  } catch (e) {
    const msg = e?.message || String(e)
    if (msg.startsWith('Duplicate plateKey:')) { skipped++; console.warn(`⏭️  skip #${p.importRowNo}: ${msg}`); continue }
    failed++
    console.error(`❌ row #${p.importRowNo}: ${msg}`)
  }
}
console.log(`\nDONE. OK=${ok}, Skipped(dup)=${skipped}, Failed=${failed}`)
process.exit(0)
