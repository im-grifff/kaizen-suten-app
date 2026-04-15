import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'
import { MOCK_CUSTOMERS } from './mockCustomersData.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function usage() {
  console.log(
    [
      'Usage:',
      '  node tools/seed-mock-customers.mjs --serviceAccount "<path-to-json>"',
      '',
      'Example:',
      '  node tools/seed-mock-customers.mjs --serviceAccount ".\\\\serviceAccountKey.json"',
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

const abs = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(__dirname, '..', serviceAccountPath)

const sa = JSON.parse(fs.readFileSync(abs, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(sa),
})

const db = admin.firestore()
const ts = admin.firestore.FieldValue.serverTimestamp()

const batch = db.batch()
for (const c of MOCK_CUSTOMERS) {
  const plateId = c.plateNumber
  const ref = db.collection('users').doc(plateId)
  batch.set(ref, {
    userId: ref.id,
    plateNumber: c.plateNumber,
    waPhone: c.waPhone,
    owner: c.owner,
    vehicle: {
      ...c.vehicle,
      modelMobil: c.vehicle.model,
    },
    createdAt: ts,
    updatedAt: ts,
  })
  batch.set(db.collection('plate_index').doc(c.plateNumber), { uid: ref.id, updatedAt: ts }, { merge: true })
}

await batch.commit()

console.log(`✅ Seeded ${MOCK_CUSTOMERS.length} mock customers into users/*`)
