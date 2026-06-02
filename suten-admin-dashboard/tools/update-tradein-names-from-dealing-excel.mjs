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
      '  node tools/update-tradein-names-from-dealing-excel.mjs --serviceAccount "<path-to-json>" --input "<path-to-xlsx>"',
      '',
      'Notes:',
      '  - Script ini update field `customerName` di koleksi `tradein_requests`',
      '  - Matching dilakukan via `plateKey` dari kolom "Plat Nomor" (di-normalize: upper + hapus spasi).',
    ].join('\n'),
  )
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

function normalizePlate(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, '')
}

const serviceAccountPath = getArg('serviceAccount')
const inputPath = getArg('input')

if (!serviceAccountPath || !inputPath) {
  usage()
  process.exit(1)
}

const absSa = path.isAbsolute(serviceAccountPath) ? serviceAccountPath : path.join(__dirname, '..', serviceAccountPath)
const absInput = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath)

const sa = JSON.parse(fs.readFileSync(absSa, 'utf8'))
admin.initializeApp({
  credential: admin.credential.cert(sa),
})

const db = admin.firestore()

const wb = XLSX.readFile(absInput)
const sheetName = wb.SheetNames[0]
const sheet = wb.Sheets[sheetName]
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

let updated = 0
let missingIndex = 0
let missingReq = 0
let skipped = 0
let failed = 0

for (const r of rows) {
  try {
    const plateRaw = r?.['Plat Nomor'] ?? r?.plat ?? r?.plateNumber ?? ''
    const plateKey = normalizePlate(plateRaw)
    const name = String(r?.Customer ?? r?.customer ?? r?.['Customer'] ?? '').trim()

    if (!plateKey || plateKey.length < 4) {
      skipped++
      continue
    }
    if (!name) {
      skipped++
      continue
    }

    const indexRef = db.collection('tradein_plate_index').doc(plateKey)
    const indexSnap = await indexRef.get()
    if (!indexSnap.exists) {
      missingIndex++
      continue
    }
    const requestId = String(indexSnap.data()?.requestId || '').trim()
    if (!requestId) {
      missingReq++
      continue
    }

    await db.collection('tradein_requests').doc(requestId).set({ customerName: name }, { merge: true })
    updated++
  } catch (e) {
    failed++
    if (failed <= 5) console.error('❌ Failed:', e?.message || e)
  }
}

console.log(
  `Done. Updated=${updated}, MissingIndex=${missingIndex}, MissingRequestId=${missingReq}, Skipped=${skipped}, Failed=${failed}`,
)

