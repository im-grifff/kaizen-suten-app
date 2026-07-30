import {
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
  const base = [orderBy('model'), orderBy('__name__'), limit(pageSize)]
  const q = cursor
    ? query(vehicleMasterCol(), orderBy('model'), orderBy('__name__'), startAfter(cursor), limit(pageSize))
    : query(vehicleMasterCol(), ...base)
  const snap = await getDocs(q)
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null
  return { rows, cursor: nextCursor, hasMore: snap.docs.length === pageSize }
}

/** Cari berdasarkan prefix MODEL (UPPERCASE). Filter merk/tahun/varian dilakukan client-side. */
export async function searchVehicleMasterByModel(modelPrefix, { max = 500 } = {}) {
  const p = String(modelPrefix || '').trim().toUpperCase()
  if (!p) return { rows: [], capped: false }
  const q = query(
    vehicleMasterCol(),
    orderBy('model'),
    where('model', '>=', p),
    where('model', '<=', p + HIGH),
    limit(max),
  )
  const snap = await getDocs(q)
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return { rows, capped: rows.length >= max }
}

/** Update satu dokumen master. Dipanggil hanya oleh Root / Otozentrum (dijaga UI + rules). */
export async function updateVehicleMaster(id, patch) {
  const ref = doc(db, 'vehicle_master', id)
  await updateDoc(ref, { ...patch, updatedAt: new Date().toISOString() })
}
