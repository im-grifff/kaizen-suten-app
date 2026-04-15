/**
 * Hapus dokumen `users/*` duplikat per nomor plat (plateNumber / vehicle.noPolisi).
 * Mempertahankan satu dokumen canonical dan memperbaiki `plate_index/{plate}`.
 *
 * Usage:
 *   node tools/dedupe-users.mjs --serviceAccount "<path-to-json>" [--dry-run]
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'
import { normalizePlate } from './plateFormat.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function usage() {
  console.log(
    [
      'Usage:',
      '  node tools/dedupe-users.mjs --serviceAccount "<path-to-json>" [--dry-run]',
      '',
      'Menyatukan duplikat plat: menyisakan satu users/{id}, menghapus sisanya, memperbarui plate_index.',
    ].join('\n'),
  )
}

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

function plateFromData(data) {
  return normalizePlate(data?.plateNumber || data?.vehicle?.noPolisi || '')
}

function tsToMillis(t) {
  if (!t) return 0
  if (typeof t.toMillis === 'function') return t.toMillis()
  if (typeof t.seconds === 'number') return t.seconds * 1000
  return 0
}

const serviceAccountPath = getArg('serviceAccount')
const dryRun = process.argv.includes('--dry-run')

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

const snap = await db.collection('users').get()

const byPlate = new Map()

for (const doc of snap.docs) {
  const p = plateFromData(doc.data())
  if (!p) {
    console.warn(`[skip no-plate] users/${doc.id}`)
    continue
  }
  if (!byPlate.has(p)) byPlate.set(p, [])
  byPlate.get(p).push(doc)
}

let dupGroups = 0
let deleted = 0

for (const [plate, docs] of byPlate) {
  if (docs.length <= 1) continue
  dupGroups += 1

  let keeper = docs.find((d) => d.id === plate)

  if (!keeper) {
    const pi = await db.collection('plate_index').doc(plate).get()
    if (pi.exists) {
      const u = pi.data()?.uid
      if (typeof u === 'string') {
        keeper = docs.find((d) => d.id === u)
      }
    }
  }

  if (!keeper) {
    keeper = [...docs].sort((a, b) => {
      const ma = tsToMillis(a.data()?.updatedAt) || tsToMillis(a.data()?.createdAt)
      const mb = tsToMillis(b.data()?.updatedAt) || tsToMillis(b.data()?.createdAt)
      return mb - ma
    })[0]
  }

  const losers = docs.filter((d) => d.id !== keeper.id)

  console.log(
    `[dup x${docs.length}] ${plate} → keep users/${keeper.id}, remove [${losers.map((d) => d.id).join(', ')}]`,
  )

  if (!dryRun) {
    const batch = db.batch()
    for (const d of losers) {
      batch.delete(d.ref)
      deleted += 1
    }
    batch.set(
      db.collection('plate_index').doc(plate),
      { uid: keeper.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    )
    await batch.commit()
  }
}

console.log(
  dryRun
    ? `[dry-run] ${dupGroups} grup duplikat ditemukan (tidak ada perubahan).`
    : `Selesai. ${dupGroups} grup duplikat, ${deleted} dokumen users dihapus, plate_index diselaraskan.`,
)
