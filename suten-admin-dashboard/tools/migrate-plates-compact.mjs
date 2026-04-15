/**
 * Migrasi sekali pakai: semua plat jadi HURUF BESAR tanpa spasi (DB1233KG).
 * - users: pindahkan/merge dokumen ke id kanonik, perbarui plateNumber & vehicle.noPolisi
 * - plate_index: bangun ulang dari users
 * - plate_sessions: normalisasi field plate & targetUid
 * - tradein_requests / tshop_orders: normalisasi plateNumber jika ada
 *
 * Usage:
 *   node tools/migrate-plates-compact.mjs --serviceAccount "<path-to-json>" [--dry-run]
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'
import { normalizePlate } from './plateFormat.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  return process.argv[idx + 1] || null
}

function tsMillis(t) {
  if (!t) return 0
  if (typeof t.toMillis === 'function') return t.toMillis()
  if (typeof t.seconds === 'number') return t.seconds * 1000
  return 0
}

const serviceAccountPath = getArg('serviceAccount')
const dryRun = process.argv.includes('--dry-run')

if (!serviceAccountPath) {
  console.log('Usage: node tools/migrate-plates-compact.mjs --serviceAccount "<json>" [--dry-run]')
  process.exit(1)
}

const abs = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(__dirname, '..', serviceAccountPath)

const sa = JSON.parse(fs.readFileSync(abs, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const ts = admin.firestore.FieldValue.serverTimestamp()

function plateFromUserData(data, docId) {
  return normalizePlate(data?.plateNumber || data?.vehicle?.noPolisi || docId)
}

async function commitBatches(writes) {
  const chunk = 400
  for (let i = 0; i < writes.length; i += chunk) {
    const batch = db.batch()
    for (const w of writes.slice(i, i + chunk)) {
      w(batch)
    }
    if (!dryRun) await batch.commit()
  }
}

console.log(dryRun ? '--- DRY RUN (no writes) ---' : '--- LIVE MIGRATION ---')

// 1) Kelompokkan users lama → plat kanonik
const usersSnap = await db.collection('users').get()
/** @type {Map<string, { oldId: string, data: object }[]>} */
const byCanon = new Map()

for (const d of usersSnap.docs) {
  const oldId = d.id
  const data = d.data() || {}
  const canon = plateFromUserData(data, oldId)
  if (!canon) {
    console.warn(`[skip empty plate] users/${oldId}`)
    continue
  }
  if (!byCanon.has(canon)) byCanon.set(canon, [])
  byCanon.get(canon).push({ oldId, data })
}

const writes = []

for (const [canon, group] of byCanon) {
  let best = group[0]
  for (const g of group) {
    if (tsMillis(g.data.updatedAt) > tsMillis(best.data.updatedAt)) best = g
  }
  const base = { ...best.data }
  const merged = {
    ...base,
    userId: canon,
    plateNumber: canon,
    vehicle: {
      ...(base.vehicle || {}),
      noPolisi: canon,
      modelMobil: base.vehicle?.modelMobil || base.vehicle?.model || '',
    },
    updatedAt: ts,
  }
  if (!base.createdAt) merged.createdAt = ts

  writes.push((batch) => {
    batch.set(db.collection('users').doc(canon), merged, { merge: true })
  })

  for (const g of group) {
    if (g.oldId !== canon) {
      writes.push((batch) => {
        batch.delete(db.collection('users').doc(g.oldId))
      })
    }
  }
}

await commitBatches(writes)
console.log(`Users: ${byCanon.size} plat kanonik, ${usersSnap.size} dokumen lama diproses.`)

// 2) plate_index: hapus semua, bangun ulang
const idxSnap = await db.collection('plate_index').get()
const idxWrites = []
for (const d of idxSnap.docs) {
  idxWrites.push((b) => b.delete(d.ref))
}
await commitBatches(idxWrites)

const usersFinal = await db.collection('users').get()
const idxCreates = []
for (const d of usersFinal.docs) {
  const id = d.id
  idxCreates.push((b) => {
    b.set(db.collection('plate_index').doc(id), { uid: id, updatedAt: ts }, { merge: true })
  })
}
await commitBatches(idxCreates)
console.log(`plate_index: ${idxSnap.size} dihapus, ${usersFinal.size} entri baru.`)

// 3) plate_sessions
const sessSnap = await db.collection('plate_sessions').get()
let sessN = 0
for (const d of sessSnap.docs) {
  const x = d.data() || {}
  const plate = normalizePlate(x.plate || '')
  const targetUid = normalizePlate(x.targetUid || '')
  if (!plate && !targetUid) continue
  sessN += 1
  if (!dryRun) {
    await d.ref.set(
      {
        ...(plate ? { plate } : {}),
        ...(targetUid ? { targetUid } : {}),
        updatedAt: ts,
      },
      { merge: true },
    )
  }
}
console.log(`plate_sessions: ${sessN} dokumen diperbarui.`)

// 4) tradein_requests
const trSnap = await db.collection('tradein_requests').get()
let trN = 0
for (const d of trSnap.docs) {
  const x = d.data() || {}
  if (!x.plateNumber) continue
  const p = normalizePlate(x.plateNumber)
  if (p === x.plateNumber) continue
  trN += 1
  if (!dryRun) await d.ref.update({ plateNumber: p })
}
console.log(`tradein_requests: ${trN} plateNumber di-normalisasi.`)

// 5) tshop_orders
const ordSnap = await db.collection('tshop_orders').get()
let ordN = 0
for (const d of ordSnap.docs) {
  const x = d.data() || {}
  if (!x.plateNumber) continue
  const p = normalizePlate(x.plateNumber)
  if (p === x.plateNumber) continue
  ordN += 1
  if (!dryRun) await d.ref.update({ plateNumber: p })
}
console.log(`tshop_orders: ${ordN} plateNumber di-normalisasi.`)

console.log(dryRun ? '\nDry run selesai.' : '\n✅ Migrasi plat (compact) selesai.')
