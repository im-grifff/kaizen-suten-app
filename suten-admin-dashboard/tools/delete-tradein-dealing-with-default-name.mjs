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
      '  node tools/delete-tradein-dealing-with-default-name.mjs --serviceAccount "<path-to-json>"',
      '',
      'Deletes:',
      '  tradein_requests where adminStage=="dealing" and customerName=="Customer"',
      '  and also deletes matching tradein_plate_index/{plateKey} if present.',
    ].join('\n'),
  )
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

const serviceAccountPath = getArg('serviceAccount')
if (!serviceAccountPath) {
  usage()
  process.exit(1)
}

const absSa = path.isAbsolute(serviceAccountPath) ? serviceAccountPath : path.join(__dirname, '..', serviceAccountPath)
const sa = JSON.parse(fs.readFileSync(absSa, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(sa),
})

const db = admin.firestore()

let deleted = 0
let failed = 0

const q = db.collection('tradein_requests').where('adminStage', '==', 'dealing').where('customerName', '==', 'Customer')
const snap = await q.get()

for (const docSnap of snap.docs) {
  try {
    const data = docSnap.data() || {}
    const plateKey = String(data.plateKey || '').trim()
    const batch = db.batch()
    batch.delete(docSnap.ref)
    if (plateKey) batch.delete(db.collection('tradein_plate_index').doc(plateKey))
    await batch.commit()
    deleted++
  } catch (e) {
    failed++
    if (failed <= 5) console.error(`❌ Failed delete ${docSnap.id}:`, e?.message || e)
  }
}

console.log(`Done. Deleted=${deleted}, Failed=${failed}`)

