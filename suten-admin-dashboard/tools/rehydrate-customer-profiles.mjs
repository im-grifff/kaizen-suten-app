/**
 * Gabungkan owner/vehicle/waPhone dari MOCK_CUSTOMERS ke users/{plate} tanpa menghapus field lain.
 * Berguna jika dokumen hanya punya plateNumber atau vehicle sempat tertimpa parsial.
 *
 * Usage:
 *   node tools/rehydrate-customer-profiles.mjs --serviceAccount "<path-to-json>"
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'
import { MOCK_CUSTOMERS } from './mockCustomersData.mjs'
import { normalizePlate } from './plateFormat.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function usage() {
  console.log(
    [
      'Usage:',
      '  node tools/rehydrate-customer-profiles.mjs --serviceAccount "<path-to-json>"',
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

for (const c of MOCK_CUSTOMERS) {
  const plateId = normalizePlate(c.plateNumber)
  const ref = db.collection('users').doc(plateId)
  const snap = await ref.get()
  const cur = snap.exists ? snap.data() || {} : {}

  const owner = { ...(cur.owner || {}), ...c.owner }
  const vehicle = {
    ...(cur.vehicle || {}),
    ...c.vehicle,
    noPolisi: plateId,
    modelMobil: c.vehicle.model,
  }

  const payload = {
    userId: plateId,
    plateNumber: plateId,
    waPhone: c.waPhone,
    owner,
    vehicle,
    updatedAt: ts,
  }
  if (!snap.exists) payload.createdAt = ts

  await ref.set(payload, { merge: true })

  await db
    .collection('plate_index')
    .doc(plateId)
    .set({ uid: plateId, updatedAt: ts }, { merge: true })

  console.log(`✓ rehydrate users/${plateId}`)
}

console.log(`\n✅ Rehydrated ${MOCK_CUSTOMERS.length} customer profiles.`)
