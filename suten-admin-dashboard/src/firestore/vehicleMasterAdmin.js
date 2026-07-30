import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase.js'

// Karakter Unicode tertinggi (U+F8FF) — batas atas untuk pencocokan prefix di Firestore.
const HIGH = String.fromCharCode(0xf8ff)

// Daftar merk lengkap (dari scan seluruh koleksi vehicle_master).
export const MERK_OPTIONS = [
  'TOYOTA', 'DAIHATSU', 'SUZUKI', 'HONDA', 'MITSUBISHI', 'HYUNDAI',
  'NISSAN', 'ISUZU', 'KIA', 'MAZDA', 'WULING', 'VOLKSWAGEN', 'DATSUN',
]

export function vehicleMasterCol() {
  return collection(db, 'vehicle_master')
}

/** Jumlah total dokumen (agregasi, murah — 1 read). */
export async function countVehicleMaster() {
  const snap = await getCountFromServer(vehicleMasterCol())
  return snap.data().count
}

/**
 * Ambil satu halaman data (terurut model) dengan cursor untuk "muat lebih banyak".
 * @returns {{ rows: object[], cursor: any, hasMore: boolean }}
 */
export async function fetchVehicleMasterPage({ pageSize = 100, cursor = null } = {}) {
  const q = cursor
    ? query(vehicleMasterCol(), orderBy('model'), orderBy('__name__'), startAfter(cursor), limit(pageSize))
    : query(vehicleMasterCol(), orderBy('model'), orderBy('__name__'), limit(pageSize))
  const snap = await getDocs(q)
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null
  return { rows, cursor: nextCursor, hasMore: snap.docs.length === pageSize }
}

async function prefixQuery(field, valueUpper, max) {
  const q = query(
    vehicleMasterCol(),
    orderBy(field),
    where(field, '>=', valueUpper),
    where(field, '<=', valueUpper + HIGH),
    limit(max),
  )
  const snap = await getDocs(q)
  return snap
}

/**
 * Pencarian dinamis: mencari di SELURUH koleksi berdasarkan prefix pada `model`
 * MAUPUN `merk` (digabung). Filter tahun/varian dilakukan client-side.
 * @returns {{ rows: object[], capped: boolean }}
 */
export async function searchVehicleMaster(term, { max = 500 } = {}) {
  const t = String(term || '').trim().toUpperCase()
  if (!t) return { rows: [], capped: false }
  const [byModel, byMerk] = await Promise.all([
    prefixQuery('model', t, max),
    prefixQuery('merk', t, max),
  ])
  const map = new Map()
  for (const d of [...byModel.docs, ...byMerk.docs]) map.set(d.id, { id: d.id, ...d.data() })
  const rows = [...map.values()].sort((a, b) => String(a.model || '').localeCompare(String(b.model || '')))
  return { rows, capped: byModel.size >= max || byMerk.size >= max }
}

/** Update satu dokumen master. Root / Otozentrum saja (dijaga UI + rules). */
export async function updateVehicleMaster(id, patch) {
  await updateDoc(doc(db, 'vehicle_master', id), { ...patch, updatedAt: new Date().toISOString() })
}

/** Tambah dokumen master baru. Root / Otozentrum saja. */
export async function createVehicleMaster(payload) {
  const ref = await addDoc(vehicleMasterCol(), {
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  return { id: ref.id, ...payload }
}
