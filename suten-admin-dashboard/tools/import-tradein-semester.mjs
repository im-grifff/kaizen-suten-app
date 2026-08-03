/**
 * Import data trade-in dari Excel semester (sheet "SEM I 2026") ke Firestore.
 *
 * Menulis ke:
 *   - tradein_requests/{autoId}      (dibaca oleh halaman Trade-In Requests DAN Customers)
 *   - tradein_plate_index/{plateKey} (index unik plat)
 *
 * Semua baris = Channel Dealer (sourceChannel/acquisitionChannel = 'first').
 * Field kosong (WA, NOPOL, NAMA) diisi dummy REALISTIS + ditandai agar bisa dilacak:
 *   - importSource, importBatch, importRowNo, importDummyFields[]
 *
 * Usage:
 *   node tools/import-tradein-semester.mjs --serviceAccount "<path.json>" --input "<xlsx>" --dry-run
 *   node tools/import-tradein-semester.mjs --serviceAccount "<path.json>" --input "<xlsx>" --commit
 *
 * Flags:
 *   --dry-run            (default) tidak menulis; hanya print statistik + preview + tulis preview JSON.
 *   --commit             benar-benar menulis ke Firestore.
 *   --sheet "<name>"     nama sheet (default "SEM I 2026").
 *   --limit <n>          batasi jumlah baris (untuk test).
 *   --previewOut <path>  file JSON hasil parse (default scratchpad).
 */
import fs from 'node:fs'
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
  if (next == null || next.startsWith('--')) return true // boolean flag
  return next
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

// ---- kolom (index) sesuai header 2-baris sheet "SEM I 2026" (layout dgn CABANG OUTLET) ----
const C = {
  NO: 0, PIC: 1, TGL: 2, NAMA: 3, ALAMAT: 4, TELP: 5, SUMBER: 6, DMS: 7,
  CABANG: 8, SPV: 9, SALES: 10, BROKER: 11,
  MERK: 12, TIPE: 13, WARNA: 14, NOPOL: 15, NEWCAR: 16, ESTIM: 17,
  LANJUT: 18, ALASAN: 19, TGLTAKS: 20, PAJAK: 21, KM: 22, MINUS: 23,
  BIAYA: 24, GRADE: 25, HARGAMINTA: 26, HARGAFINAL: 27, DEAL: 28,
  FOLLOWUP: 29, KETERANGAN: 30, TGLREAL: 31, SPK: 32,
}
const DATA_START = 5

const str = (v) => String(v == null ? '' : v).replace(/\r/g, ' ').trim()
const normalizePlate = (raw) => String(raw || '').toUpperCase().replace(/\s+/g, '')

function excelSerialToDate(v) {
  if (v === '' || v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, Math.floor(d.S || 0))
  }
  return null
}

// Tanggal dari Excel dipertahankan; jam dibuat dummy jam kerja (deterministik per baris)
// supaya tidak semua 00:00 (yang kelihatan hasil import).
function withDummyTime(d, rowNo) {
  if (!d) return null
  const hour = 8 + (rowNo % 9) // 08..16
  const minute = (rowNo * 7) % 60
  const second = (rowNo * 13) % 60
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, second)
}

// Parse angka rupiah dari teks seperti "70-73", "190-200jt", "410JUTA", "76+3", 395.
// Mengembalikan { low, high } dalam rupiah (null jika tak ada).
function parseMoneyRange(raw) {
  if (raw === '' || raw == null) return { low: null, high: null }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const val = raw < 100000 ? Math.round(raw * 1_000_000) : Math.round(raw)
    return { low: val, high: val }
  }
  const s = String(raw).toLowerCase()
  const isJuta = /jt|juta|jr/.test(s)
  const nums = (s.match(/\d+(?:[.,]\d+)?/g) || [])
    .map((n) => Number(n.replace(',', '.')))
    .filter((n) => Number.isFinite(n))
  if (!nums.length) return { low: null, high: null }
  const scale = (n) => (isJuta || n < 1000 ? Math.round(n * 1_000_000) : Math.round(n))
  const scaled = nums.map(scale)
  return { low: scaled[0], high: scaled[scaled.length - 1] }
}
function parseMoneySingle(raw) {
  const { low } = parseMoneyRange(raw)
  return low
}

// Pisah "TIPE TAHUN" (mis. "Innova g 2.0 at 2017", "RUSH S TRD AT2018", "ETIOS E 1.2 M/T")
// menjadi { model, transmission, year }.
function parseUnit(merk, tipeRaw) {
  const tipe = str(tipeRaw)
  let year = ''
  const ym = tipe.match(/((?:19|20)\d{2})/g)
  if (ym) year = ym[ym.length - 1]
  let transmission = ''
  if (/matic|otomatis|\bat\b|a\/t|(?<![a-z])at(?=\d)/i.test(tipe)) transmission = 'AT'
  else if (/manual|\bmt\b|m\/t|(?<![a-z])mt(?=\d)/i.test(tipe)) transmission = 'MT'
  else if (/\bcvt\b/i.test(tipe)) transmission = 'CVT'
  // model = tipe tanpa token tahun & transmisi
  let model = tipe
  if (year) model = model.replace(new RegExp(`\\b${year}\\b`), ' ').replace(year, ' ')
  model = model
    .replace(/\bmatic\b|\botomatis\b|\bmanual\b/gi, ' ')
    .replace(/\ba\/t\b|\bm\/t\b/gi, ' ')
    .replace(/(?<![a-z])(at|mt|cvt)(?![a-z])/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const merkStr = str(merk)
  // Hindari merk ganda: kalau model sudah diawali nama merk (mis. TIPE "Toyota Agya"
  // dengan MERK "TOYOTA"), jangan prepend lagi.
  const modelStartsWithMerk = merkStr && model.toLowerCase().startsWith(merkStr.toLowerCase())
  const merkModel = (modelStartsWithMerk ? model : [merkStr, model].filter(Boolean).join(' '))
    .replace(/\s+/g, ' ')
    .trim()
  return { merkModel: merkModel || merkStr || 'Unit', transmission, year }
}

/**
 * Tentukan stage mengikuti proses nyata di Excel:
 *   new -> contacted -> pre_inspection -> inspected -> dealing / cancel
 * Sinyal kolom:
 *   - DEAL/KETERANGAN "DEAL" atau TGL REALISASI/SPK terisi  => dealing
 *   - "BATAL/TIDAK COCOK/TIDAK BISA DIHUBUNGI/TERJUAL DI LUAR" atau LANJUT=TIDAK => cancel
 *   - TGL TAKSASI / hasil cek unit (KM, GRADE, MINUS, BIAYA, PAJAK) terisi => inspected
 *   - LANJUT=YA (setuju lanjut cek unit) tapi belum diinspeksi => pre_inspection
 *   - ada estimasi awal / harga permintaan => contacted
 *   - selain itu => new
 */
function deriveStage(r) {
  const deal = str(r[C.DEAL]).toUpperCase()
  const ket = str(r[C.KETERANGAN]).toUpperCase()
  const alasan = str(r[C.ALASAN]).toUpperCase()
  const hay = `${deal} ${ket} ${alasan}`
  const lanjut = str(r[C.LANJUT]).toUpperCase()

  const realized = Boolean(str(r[C.TGLREAL]) || str(r[C.SPK]))
  const inspected = Boolean(
    str(r[C.TGLTAKS]) || str(r[C.KM]) || str(r[C.GRADE]) || str(r[C.MINUS]) || str(r[C.BIAYA]) || str(r[C.PAJAK]),
  )

  const dealed = /\bDEAL\b/.test(hay) && !/NO DEAL|BLM DEAL|BELUM DEAL|TDK DEAL|TIDAK DEAL/.test(hay)
  const cancel =
    /\bBATAL\b|TIDAK COCOK|TDK COCOK|TIDAK BISA|TDK BISA|TIDAK DI?HUBUNGI|TDK DIHUBUNGI|TERJUAL DI|JUAL DI ?LUAR|JUAL KELUAR|GAGAL|CANCEL|TIDAK JADI|URUNG/.test(
      hay,
    )
  const lanjutTidak = /^TIDAK|^TDK|^NO\b/.test(lanjut)

  if (dealed || (realized && !cancel)) return 'dealing'
  if (cancel || lanjutTidak) return 'cancel'
  if (inspected) return 'inspected'
  if (/^YA\b|^Y$|^OK/.test(lanjut)) return 'pre_inspection'
  if (str(r[C.ESTIM]) || str(r[C.HARGAMINTA])) return 'contacted'
  return 'new'
}
function adminStageToStatus(s) {
  if (s === 'cancel') return 'cancelled'
  if (s === 'new') return 'new'
  return 'contacted'
}

// ---- dummy generators (deterministik per baris, realistis) ----
const NAME_POOL = [
  'Andi', 'Budi', 'Rian', 'Yusuf', 'Fadli', 'Reza', 'Deni', 'Hendra', 'Iwan', 'Rudi',
  'Sinta', 'Maya', 'Rina', 'Dewi', 'Lita', 'Nita', 'Vira', 'Yuni', 'Tina', 'Wulan',
  'Marlon', 'Ferry', 'Ronny', 'Steven', 'Alex', 'Vicky', 'Glen', 'Recky', 'Frans', 'Julius',
]
const SURNAME_POOL = [
  'Tumbol', 'Manopo', 'Lumingkewas', 'Sondakh', 'Pangkey', 'Rumondor', 'Mamahit',
  'Wowor', 'Sumual', 'Kaunang', 'Rorong', 'Tampi', 'Lengkong', 'Runtu', 'Wenas',
]
function dummyName(rowNo) {
  const a = NAME_POOL[rowNo % NAME_POOL.length]
  const b = SURNAME_POOL[(rowNo * 7) % SURNAME_POOL.length]
  return `${a} ${b}`
}
function dummyPhone(rowNo) {
  // 62 + 81x + 8 digit, terlihat seperti nomor HP Indonesia.
  const prefixes = ['812', '813', '852', '853', '821', '822', '895', '896']
  const p = prefixes[rowNo % prefixes.length]
  const body = String(10000000 + ((rowNo * 3797 + 12345) % 89999999)).slice(0, 8)
  return `62${p}${body}`
}
const PLATE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
function dummyPlate(rowNo) {
  const num = 1000 + ((rowNo * 17 + 3) % 8999) // 1000..9999
  const l1 = PLATE_LETTERS[(rowNo * 5) % PLATE_LETTERS.length]
  const l2 = PLATE_LETTERS[(rowNo * 11 + 7) % PLATE_LETTERS.length]
  return { display: `DB ${num} ${l1}${l2}`, key: `DB${num}${l1}${l2}` }
}

// ---------- main ----------
const serviceAccountPath = getArg('serviceAccount')
const inputPath = getArg('input')
const sheetName = getArg('sheet', 'SEM I 2026')
const limit = (() => { const v = getArg('limit'); const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null })()
const commit = hasFlag('commit')
const dryRun = !commit
import os from 'node:os'
const previewOut = getArg('previewOut', path.join(os.tmpdir(), 'tradein-import-preview.json'))

if (!serviceAccountPath || !inputPath) {
  console.error('Wajib: --serviceAccount <path> --input <xlsx>')
  process.exit(1)
}
const absSa = path.isAbsolute(serviceAccountPath) ? serviceAccountPath : path.join(__dirname, '..', serviceAccountPath)
const absInput = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath)

const wb = XLSX.readFile(absInput)
if (!wb.Sheets[sheetName]) {
  console.error(`Sheet "${sheetName}" tidak ditemukan. Ada: ${wb.SheetNames.join(', ')}`)
  process.exit(1)
}
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
const cabangFilter = (() => { const v = getArg('cabang'); return typeof v === 'string' ? v.trim().toUpperCase() : null })()
const today = new Date().toISOString().slice(0, 10)
const importBatch = cabangFilter ? `SEM-I-2026-${cabangFilter}-${today}` : `SEM-I-2026-${today}`

const records = []
let lastExcelDate = null // untuk carry-forward tanggal saat TgL kosong
for (let i = DATA_START; i < rows.length; i++) {
  const r = rows[i]
  const merk = str(r[C.MERK])
  const tipe = str(r[C.TIPE])
  if (!merk && !tipe) continue // baris kosong / bukan prospek
  // Lacak tanggal Excel terakhir (dari semua baris valid, sebelum filter cabang) agar
  // urutan kronologis tetap benar untuk carry-forward.
  const excelDate = excelSerialToDate(r[C.TGL])
  if (excelDate) lastExcelDate = excelDate
  const cabang = str(r[C.CABANG])
  if (cabangFilter && cabang.toUpperCase() !== cabangFilter) continue // hanya cabang tertentu
  const rowNo = Number(r[C.NO]) || i

  const dummyFields = []

  // customer name
  let customerName = str(r[C.NAMA])
  if (!customerName) { customerName = dummyName(rowNo); dummyFields.push('customerName') }

  // WA / phone
  let waDigits = str(r[C.TELP]).replace(/\D/g, '')
  if (!waDigits) { waDigits = dummyPhone(rowNo); dummyFields.push('customerWaKey') }
  else if (waDigits.startsWith('0')) waDigits = `62${waDigits.slice(1)}`

  // plate
  let plateDisplay = str(r[C.NOPOL])
  let plateKey = normalizePlate(plateDisplay)
  if (!plateKey) { const dp = dummyPlate(rowNo); plateDisplay = dp.display; plateKey = dp.key; dummyFields.push('plateNumber') }

  const unit = parseUnit(merk, tipe)
  const estim = parseMoneyRange(r[C.ESTIM])
  const hargaMinta = parseMoneySingle(r[C.HARGAMINTA])
  const hargaFinal = parseMoneySingle(r[C.HARGAFINAL])
  const createdDate = withDummyTime(excelDate || lastExcelDate, rowNo)

  const adminStage = deriveStage(r)
  const status = adminStageToStatus(adminStage)

  const cancelReason = adminStage === 'cancel'
    ? (str(r[C.ALASAN]) || str(r[C.KETERANGAN]) || str(r[C.DEAL])) : ''

  const notesParts = []
  if (str(r[C.GRADE])) notesParts.push(`Grade: ${str(r[C.GRADE])}`)
  if (str(r[C.KM])) notesParts.push(`KM: ${str(r[C.KM])}`)
  if (str(r[C.MINUS])) notesParts.push(`Minus: ${str(r[C.MINUS])}`)
  if (str(r[C.KETERANGAN])) notesParts.push(str(r[C.KETERANGAN]))

  const payload = {
    customerName,
    customerWaKey: waDigits,
    customerPhone: waDigits,
    customerUid: '',
    plateNumber: plateDisplay,
    plateKey,
    merkModel: unit.merkModel,
    transmission: unit.transmission,
    year: unit.year,
    color: str(r[C.WARNA]),
    km: str(r[C.KM]),
    stnkMonth: '',
    bpkbStatus: 'Tersedia',
    carType: unit.merkModel,
    newCarModel: str(r[C.NEWCAR]),
    salesName: str(r[C.SALES]),
    expectLowPrice: hargaMinta ?? null,
    estimateLow: estim.low,
    estimateHigh: estim.high,
    estimateNotes: notesParts.join(' | ').slice(0, 900),
    fixedPrice: adminStage === 'dealing' ? (hargaFinal ?? hargaMinta ?? 0) : 0,
    cancelReason,
    adminStage,
    status,
    sourceChannel: 'first',
    acquisitionChannel: 'first',
    // metadata import (traceability)
    customerAddress: str(r[C.ALAMAT]),
    picAppraisal: str(r[C.PIC]),
    unitGrade: str(r[C.GRADE]),
    sourceUnit: str(r[C.SUMBER]) || 'DEALER HA',
    branchOutlet: cabang,
    spvName: str(r[C.SPV]),
    brokerName: str(r[C.BROKER]),
    importSource: sheetName,
    importBatch,
    importRowNo: rowNo,
    importDummyFields: dummyFields,
    _createdDate: createdDate ? createdDate.toISOString() : null, // hanya untuk preview
  }
  records.push(payload)
  if (limit && records.length >= limit) break
}

// ---- statistik ----
const stageDist = {}
let dCustomer = 0, dPhone = 0, dPlate = 0
const plateSeen = new Map()
const dupPlates = []
for (const p of records) {
  stageDist[p.adminStage] = (stageDist[p.adminStage] || 0) + 1
  if (p.importDummyFields.includes('customerName')) dCustomer++
  if (p.importDummyFields.includes('customerWaKey')) dPhone++
  if (p.importDummyFields.includes('plateNumber')) dPlate++
  if (plateSeen.has(p.plateKey)) dupPlates.push(p.plateKey)
  plateSeen.set(p.plateKey, (plateSeen.get(p.plateKey) || 0) + 1)
}

console.log('=============================================')
console.log(`Mode           : ${dryRun ? 'DRY-RUN (tidak menulis)' : 'COMMIT (menulis ke Firestore)'}`)
console.log(`Sheet          : ${sheetName}`)
console.log(`Filter cabang  : ${cabangFilter || '(semua)'}`)
console.log(`Import batch   : ${importBatch}`)
console.log(`Baris valid    : ${records.length}`)
console.log(`Stage distrib  : ${JSON.stringify(stageDist)}`)
console.log(`Dummy nama     : ${dCustomer}`)
console.log(`Dummy WA       : ${dPhone}`)
console.log(`Dummy plat     : ${dPlate}`)
console.log(`Plat duplikat (dalam batch) : ${dupPlates.length}${dupPlates.length ? ' -> ' + dupPlates.slice(0, 10).join(', ') : ''}`)
console.log('=============================================')

fs.writeFileSync(previewOut, JSON.stringify(records, null, 2))
console.log(`Preview JSON  : ${previewOut}`)

console.log('\n--- 3 contoh baris (nama asli) ---')
records.filter((p) => !p.importDummyFields.includes('customerName')).slice(0, 3)
  .forEach((p) => console.log(JSON.stringify({ name: p.customerName, wa: p.customerWaKey, plate: p.plateNumber, unit: p.merkModel, tr: p.transmission, yr: p.year, color: p.color, sales: p.salesName, newCar: p.newCarModel, est: [p.estimateLow, p.estimateHigh], expect: p.expectLowPrice, fixed: p.fixedPrice, stage: p.adminStage, dummy: p.importDummyFields }, null, 0)))
console.log('\n--- 3 contoh baris (nama dummy) ---')
records.filter((p) => p.importDummyFields.includes('customerName')).slice(0, 3)
  .forEach((p) => console.log(JSON.stringify({ name: p.customerName, wa: p.customerWaKey, plate: p.plateNumber, unit: p.merkModel, tr: p.transmission, yr: p.year, sales: p.salesName, stage: p.adminStage, dummy: p.importDummyFields }, null, 0)))

if (dryRun) {
  console.log('\nDRY-RUN selesai. Jalankan ulang dengan --commit untuk menulis.')
  process.exit(0)
}

// ---- COMMIT ----
const sa = JSON.parse(fs.readFileSync(absSa, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const ts = admin.firestore.FieldValue.serverTimestamp()

let ok = 0, skipped = 0, failed = 0
for (const p of records) {
  const { _createdDate, ...doc } = p
  const createdAt = _createdDate ? admin.firestore.Timestamp.fromDate(new Date(_createdDate)) : ts
  const reqRef = db.collection('tradein_requests').doc()
  const idxRef = db.collection('tradein_plate_index').doc(p.plateKey)
  try {
    await db.runTransaction(async (tx) => {
      const idxSnap = await tx.get(idxRef)
      if (idxSnap.exists) throw new Error(`Duplicate plateKey: ${p.plateKey}`)
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
    if (ok <= 5) console.log(`✅ ${reqRef.id}  ${p.customerName} - ${p.plateNumber}`)
  } catch (e) {
    const msg = e?.message || String(e)
    if (msg.startsWith('Duplicate plateKey:')) { skipped++; continue }
    failed++
    if (failed <= 10) console.error(`❌ row #${p.importRowNo}: ${msg}`)
  }
}
console.log(`\nDONE. OK=${ok}, Skipped(dup)=${skipped}, Failed=${failed}`)
process.exit(0)
