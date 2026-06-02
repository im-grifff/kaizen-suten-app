import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'
import XLSX from 'xlsx'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function usage() {
  console.log(
    [
      'Usage:',
      '  node tools/seed-tradein-dealing-from-customers.mjs --serviceAccount "<path-to-json>" --input "<path-to-json>"',
      '',
      'Input format:',
      '  - JSON array (langsung dipakai), atau',
      '  - Excel/CSV (xlsx/xls/csv) dibaca pakai `xlsx` (header kolom dipakai).',
      '  [',
      '    {',
      '      // Fields yang dikenali (opsional, sisanya diisi dummy):',
      '      "customerName": "Nama Customer",',
      '      "customerWaKey": "62812xxxxxxx",',
      '      "customerPhone": "+62812xxxxxxx",',
      '      "waPhone": "+62812xxxxxxx",',
      '      // Catatan WA:',
      '      // - Kalau field WA (customerWaKey/waPhone/customerPhone) tidak ada, WA diisi dummy.',
      '      // - Opsional: pakai flag `--useNoTelpAsWa=true` untuk memetakan "noTelp" sebagai WA.',
      '      "noTelp": "+62...",',
      '      "alamat": "Alamat",',
      '',
      '      // Plat/nomor polisi (kalau tidak ada akan dibuat dummy, tapi HARUS unik):',
      '      "plateNumber": "DB1234GL",',
      '      "plateKey": "DB1234GL",',
      '      "noPolisi": "DB1234GL",',
      '      "plat": "DB1234GL",',
      '',
      '      // Unit detail (opsional, jika tidak ada akan dummy):',
      '      "merkModel": "AGYA",',
      '      "transmission": "G CVT",',
      '      "year": "2022",',
      '      "color": "WHITE",',
      '      "km": "50000",',
      '      "stnkMonth": "12",',
      '      "bpkbStatus": "Tersedia",',
      '      "expectLowPrice": 100000000,',
      '      "newCarModel": "CALYA",',
      '      "salesName": "",',
      '',
      '      // Harga fix (opsional): jika tidak ada, pakai dummy (default 0).',
      '      "fixedPrice": 120000000,',
      '    }',
      '  ]',
      '',
      'Flags opsional:',
      '  --skipDuplicates=true|false (default true)',
      '  --useNoTelpAsWa=true|false (default false)',
      '  --defaultFixedPrice=<angka> (default 0)',
    ].join('\n'),
  )
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

function toDigits(raw) {
  return String(raw || '').replace(/\D/g, '')
}

function normalizePlate(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, '')
}

function parseCreatedAt(raw) {
  // Excel export dari dashboard biasanya pakai toLocaleString('id-ID'):
  // contoh: "4/5/2026, 17.43.50" (dd/mm/yyyy, HH.MM.SS)
  if (!raw) return null
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw
  if (typeof raw === 'number') {
    // Excel date serial
    const d = XLSX.SSF.parse_date_code(raw)
    if (d) return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S)
  }
  const s = String(raw).trim()
  if (!s) return null

  const parts = s.split(',').map((p) => p.trim())
  const datePart = parts[0] || ''
  const timePart = parts[1] || ''

  const dmy = datePart.split('/').map((x) => x.trim())
  if (dmy.length !== 3) return null
  const dd = Number(dmy[0])
  const mm = Number(dmy[1])
  const yy = Number(dmy[2])
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yy)) return null

  let hh = 0
  let mi = 0
  let ss = 0
  if (timePart) {
    const t = timePart.split('.').map((x) => x.trim())
    hh = Number(t[0] || 0)
    mi = Number(t[1] || 0)
    ss = Number(t[2] || 0)
  }
  const dt = new Date(yy, mm - 1, dd, hh, mi, ss)
  if (Number.isNaN(dt.getTime())) return null
  return dt
}

function stageToAdminStage(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return ''
  if (s === 'dealing') return 'dealing'
  if (s === 'inspected') return 'inspected'
  if (s === 'contacted') return 'contacted'
  if (s === 'new') return 'new'
  if (s === 'cancel' || s === 'canceled' || s === 'cancelled') return 'cancel'
  return s
}

function adminStageToStatus(adminStage) {
  if (adminStage === 'cancel') return 'cancelled'
  if (adminStage === 'new') return 'new'
  return 'contacted'
}

function keyNorm(s) {
  // Buang spasi/tanda baca agar header Excel seperti "NAMA CUSTOMER" bisa dipetakan.
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeRow(row) {
  const out = {}
  for (const [k, v] of Object.entries(row || {})) {
    out[keyNorm(k)] = v
  }
  return out
}

function dummyPlate(i) {
  // Pastikan aman untuk normalizePlate (tanpa spasi).
  const n = 1000 + i
  return `DB${n}ZZ`
}

function dummyPhone(i) {
  // 62 + 12 digit dummy, hanya untuk menghindari field kosong.
  return `620000000000${i}`.slice(0, 15)
}

const serviceAccountPath = getArg('serviceAccount')
const inputPath = getArg('input')

if (!serviceAccountPath || !inputPath) {
  usage()
  process.exit(1)
}

const absSa = path.isAbsolute(serviceAccountPath) ? serviceAccountPath : path.join(__dirname, '..', serviceAccountPath)
const absInput = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath)

const skipDuplicates = (() => {
  const v = getArg('skipDuplicates')
  if (v == null) return true
  return String(v).toLowerCase() === 'true' || v === '1'
})()

const useNoTelpAsWa = (() => {
  const v = getArg('useNoTelpAsWa')
  if (v == null) return false
  return String(v).toLowerCase() === 'true' || v === '1'
})()

const defaultFixedPrice = (() => {
  const v = getArg('defaultFixedPrice')
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
})()

const sa = JSON.parse(fs.readFileSync(absSa, 'utf8'))
admin.initializeApp({
  credential: admin.credential.cert(sa),
})

const db = admin.firestore()
const ts = admin.firestore.FieldValue.serverTimestamp()

const ext = path.extname(absInput).toLowerCase()
let raw = []
if (ext === '.json') {
  raw = JSON.parse(fs.readFileSync(absInput, 'utf8'))
  if (!Array.isArray(raw)) {
    console.error('Input JSON harus berupa array.')
    process.exit(1)
  }
} else {
  // Support Excel/CSV yang bisa dibaca oleh xlsx.
  const wb = XLSX.readFile(absInput)
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  raw = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (!Array.isArray(raw)) {
    console.error('Input harus berupa tabel (Excel/CSV).')
    process.exit(1)
  }
}

const tradeinCol = 'tradein_requests'
const plateIndexCol = 'tradein_plate_index'

let ok = 0
let failed = 0
let skipped = 0

async function seedRow(c, i) {
  const cn = normalizeRow(c)
  const customerName = String(
    cn.customer ||
      c?.Customer ||
      c?.['Customer'] ||
      cn.customername ||
      cn.namacustomer ||
      cn.nama ||
      cn.namapemilik ||
      c?.owner?.namaPemilik ||
      'Customer',
  ).trim()

  // CreatedAt: dari export dashboard (kolom "Created") atau dari input lain.
  const createdAtDate =
    parseCreatedAt(c?.Created) ||
    parseCreatedAt(c?.createdAt) ||
    parseCreatedAt(cn.created) ||
    parseCreatedAt(cn.createdat) ||
    null

  const waKeyDigits =
    toDigits(
      cn.customerwakey ||
        cn.customerphone ||
        cn.waphone ||
        cn.wa ||
        cn.phone ||
        (useNoTelpAsWa ? cn.notelp : '') ||
        (useNoTelpAsWa ? cn.notelpon : '') ||
        (useNoTelpAsWa ? cn.notelp2 : '') ||
        '',
    ) || toDigits(dummyPhone(i))

  // Firestore query dipakai oleh customerWaKey.
  const customerWaKey = waKeyDigits

  const customerUid = String(cn.customeruid || cn.uid || c?.customerUid || '')

  const plateNumberRaw =
    cn.platnomor ||
    c?.['Plat Nomor'] ||
    cn.plat ||
    cn.nopolisi ||
    cn.nopol ||
    cn.noplat ||
    cn.platenumber ||
    cn.platekey ||
    c?.plateNumber ||
    c?.plateKey ||
    c?.noPolisi ||
    c?.plat ||
    ''
  const plateNumber = plateNumberRaw ? String(plateNumberRaw).trim() : dummyPlate(i)
  const plateKey = normalizePlate(cn.platekey || plateNumber)

  // Unit detail (kalau tidak ada, isi dummy).
  const merkModel = String(cn.merkmodel || c?.['Merk / Model'] || cn.merk || 'DUMMY').trim()
  const transmission = String(cn.transmisi || c?.Transmisi || cn.transmission || cn.tipe || 'Matic').trim()
  const carType = String(c?.carType || `${merkModel} ${transmission}`).trim()
  const year = String(cn.year || cn.tahun || '2000').trim()
  const color = String(cn.color || cn.warna || 'DUMMY').trim()
  const km = String(cn.km || cn.kM || c?.km || c?.KM || '0').trim()
  const stnkMonth = String(cn.stnkbulan || cn.stnkmonth || cn.stnk || '12').trim()
  const bpkbStatus = String(cn.statusbpkb || cn.bpkbstatus || cn.bpkb || 'Tersedia').trim()
  const expectLowPrice =
    cn.ekspektasiterendah != null && cn.ekspektasiterendah !== ''
      ? Number(cn.ekspektasiterendah)
      : cn.expectlowprice != null && cn.expectlowprice !== ''
        ? Number(cn.expectlowprice)
        : cn.estimasilowprice != null && cn.estimasilowprice !== ''
          ? Number(cn.estimasilowprice)
          : c?.expectLowPrice != null
            ? Number(c?.expectLowPrice)
            : c?.estimasiLowPrice != null
              ? Number(c?.estimasiLowPrice)
              : null
  const newCarModel = String(cn.mobilbaru || cn.newcarmodel || c?.newCarModel || c?.mobilBaru || 'DUMMY').trim()
  const salesName = String(cn.sales || cn.namasales || cn.salesname || c?.Sales || c?.salesName || '').trim()

  const fixedPriceRaw = cn.hargafix ?? cn.fixedprice ?? c?.fixedPrice ?? c?.hargaFix ?? null
  const fixedPrice = fixedPriceRaw != null ? Number(fixedPriceRaw) : null

  const estimateLowRaw = cn.estimasimin ?? cn.estimasiMin ?? c?.['Estimasi Min'] ?? null
  const estimateHighRaw = cn.estimasimax ?? cn.estimasiMax ?? c?.['Estimasi Max'] ?? null
  const estimateLow =
    estimateLowRaw != null && estimateLowRaw !== '' ? Number(String(estimateLowRaw).replace(/[^\d]/g, '')) : null
  const estimateHigh =
    estimateHighRaw != null && estimateHighRaw !== '' ? Number(String(estimateHighRaw).replace(/[^\d]/g, '')) : null
  const estimateNotes = String(cn.keteranganestimasi || c?.['Keterangan Estimasi'] || '').trim()
  const cancelReason = String(cn.alasanbatal || c?.['Alasan Batal'] || '').trim()

  const adminStageFromSheet = stageToAdminStage(cn.stage || c?.Stage || '')
  const adminStage = adminStageFromSheet || 'dealing'
  const status = adminStageToStatus(adminStage)

  // payload sesuai yang dipakai UI.
  const payload = {
    customerUid,
    customerWaKey,
    customerPhone: customerWaKey,
    customerName,
    merkModel,
    transmission,
    year,
    color,
    km,
    stnkMonth,
    bpkbStatus,
    expectLowPrice,
    newCarModel,
    salesName,
    plateNumber,
    plateKey,
    carType,
    fixedPrice: fixedPrice == null ? defaultFixedPrice : fixedPrice,
    estimateLow,
    estimateHigh,
    estimateNotes,
    cancelReason,
  }

  // Catatan alamat: tidak dipakai UI tradein_requests, tapi kita simpan sebagai field ekstra.
  const alamat = cn.alamat || c?.alamat || c?.address || ''
  if (alamat) payload.customerAddress = String(alamat).trim()

  const newReqRef = db.collection(tradeinCol).doc()
  const indexRef = db.collection(plateIndexCol).doc(plateKey)

  await db.runTransaction(async (tx) => {
    const indexSnap = await tx.get(indexRef)
    if (indexSnap.exists) {
      throw new Error(`Duplicate plateKey: ${plateKey}`)
    }

    tx.set(newReqRef, {
      ...payload,
      adminStage,
      status,
      createdAt: createdAtDate ? admin.firestore.Timestamp.fromDate(createdAtDate) : ts,
    })

    tx.set(indexRef, {
      plateKey,
      requestId: newReqRef.id,
      customerWaKey: customerWaKey || '',
      customerUid: customerUid || '',
      createdAt: createdAtDate ? admin.firestore.Timestamp.fromDate(createdAtDate) : ts,
    })
  })

  return newReqRef.id
}

for (let i = 0; i < raw.length; i++) {
  const c = raw[i]
  try {
    const id = await seedRow(c, i)
    ok++
    if (ok <= 5) console.log(`✅ Seeded: ${id}`)
  } catch (e) {
    const msg = e?.message || ''
    if (skipDuplicates && msg.startsWith('Duplicate plateKey:')) {
      skipped++
      continue
    }
    failed++
    if (failed <= 5) console.error(`❌ Failed row #${i + 1}:`, msg || e)
  }
}

console.log(`Done. OK=${ok}, Failed=${failed}, Skipped=${skipped}`)

