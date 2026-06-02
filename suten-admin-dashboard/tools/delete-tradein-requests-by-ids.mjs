import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function usage() {
  console.log(
    [
      'Usage:',
      '  node tools/delete-tradein-requests-by-ids.mjs --serviceAccount "<path-to-json>" --ids "<comma-separated-ids>"',
      '',
      'Example:',
      '  node tools/delete-tradein-requests-by-ids.mjs --serviceAccount ".\\\\serviceAccountKey.json" --ids "id1,id2,id3"',
    ].join('\n'),
  )
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

const serviceAccountPath = getArg('serviceAccount')
const idsRaw = getArg('ids')

if (!serviceAccountPath || !idsRaw) {
  usage()
  process.exit(1)
}

const absSa = path.isAbsolute(serviceAccountPath) ? serviceAccountPath : path.join(__dirname, '..', serviceAccountPath)
const sa = JSON.parse(fs.readFileSync(absSa, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(sa),
})

const db = admin.firestore()
const ids = idsRaw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

let deleted = 0
let missing = 0
let failed = 0

for (const id of ids) {
  try {
    const ref = db.collection('tradein_requests').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      missing++
      continue
    }
    const data = snap.data() || {}
    const plateKey = String(data.plateKey || '').trim()

    const batch = db.batch()
    batch.delete(ref)
    if (plateKey) batch.delete(db.collection('tradein_plate_index').doc(plateKey))
    await batch.commit()
    deleted++
  } catch (e) {
    failed++
    if (failed <= 5) console.error(`❌ Failed delete ${id}:`, e?.message || e)
  }
}

console.log(`Done. Deleted=${deleted}, Missing=${missing}, Failed=${failed}`)

