import { collection, doc, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

// Karakter Unicode tertinggi — batas atas untuk pencocokan prefix di Firestore.
const HIGH = ''

export function vehicleMasterCol() {
  return collection(db, 'vehicle_master')
}

/**
 * Koleksi vehicle_master besar (ribuan dok) → tidak bisa dimuat semua.
 * Default: tampilkan sebagian terurut model. Search: prefix pada `model` (UPPERCASE).
 * Filter merk/tahun/varian dilakukan client-side atas hasil terbatas ini.
 */
export async function listVehicleMaster({ max = 60 } = {}) {
  const q = query(vehicleMasterCol(), orderBy('model'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function searchVehicleMasterByModel(modelPrefix, { max = 300 } = {}) {
  const p = String(modelPrefix || '').trim().toUpperCase()
  if (!p) return listVehicleMaster({ max: 60 })
  const q = query(
    vehicleMasterCol(),
    orderBy('model'),
    where('model', '>=', p),
    where('model', '<=', p + HIGH),
    limit(max),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Update satu dokumen master. Dipanggil hanya oleh Root / Otozentrum (dijaga UI + rules). */
export async function updateVehicleMaster(id, patch) {
  const ref = doc(db, 'vehicle_master', id)
  await updateDoc(ref, { ...patch, updatedAt: new Date().toISOString() })
}
