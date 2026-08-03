import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { normalizePlate } from '../utils/plateFormat.js'

export function tradeinRequestsCol() {
  return collection(db, 'tradein_requests')
}

function tradeinPlateIndexRef(plateKey) {
  return doc(db, 'tradein_plate_index', normalizePlate(plateKey || ''))
}

export function listenTradeinRequests({ onData, onError }) {
  const q = query(tradeinRequestsCol(), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData?.(rows)
    },
    (err) => onError?.(err),
  )
}

export async function createTradeinRequest(payload) {
  return addDoc(tradeinRequestsCol(), { ...payload, createdAt: serverTimestamp() })
}

export async function updateTradeinRequest(id, patch) {
  const ref = doc(db, 'tradein_requests', id)
  return updateDoc(ref, patch)
}

/**
 * Helper edit penuh (Root & Supervisor):
 * - Mengizinkan edit request termasuk mengganti plat.
 * - Menjaga index unik di `tradein_plate_index/{plateKey}` agar tidak bentrok.
 */
export async function updateTradeinRequestAdmin(id, patch) {
  const ref = doc(db, 'tradein_requests', id)
  const before = await getDoc(ref)
  if (!before.exists()) throw new Error('Data trade-in tidak ditemukan.')

  const beforeData = before.data() || {}
  const oldPlate = normalizePlate(beforeData.plateKey || beforeData.plateNumber || '')
  const patchPlateRaw =
    patch?.plateNumber !== undefined
      ? patch.plateNumber
      : patch?.plateKey !== undefined
        ? patch.plateKey
        : undefined
  const nextPlate = patchPlateRaw === undefined ? oldPlate : normalizePlate(patchPlateRaw || '')

  if (!nextPlate) throw new Error('Plat nomor wajib diisi.')

  // Jika ganti plat, pastikan belum dipakai request lain.
  if (nextPlate !== oldPlate) {
    const idxNew = await getDoc(tradeinPlateIndexRef(nextPlate))
    if (idxNew.exists() && idxNew.data()?.requestId && idxNew.data()?.requestId !== id) {
      throw new Error('Plat nomor ini sudah dipakai request lain.')
    }
  }

  const batch = writeBatch(db)

  const updatePatch = { ...patch, plateKey: nextPlate }
  if (patch?.plateNumber !== undefined) updatePatch.plateNumber = String(patch.plateNumber || '')
  batch.update(ref, updatePatch)

  // Hapus index lama jika memang milik request ini.
  if (oldPlate && oldPlate !== nextPlate) {
    const idxOldRef = tradeinPlateIndexRef(oldPlate)
    const idxOldSnap = await getDoc(idxOldRef)
    if (idxOldSnap.exists() && idxOldSnap.data()?.requestId === id) {
      batch.delete(idxOldRef)
    }
  }

  // Pastikan index baru menunjuk ke request ini (merge).
  batch.set(
    tradeinPlateIndexRef(nextPlate),
    {
      plateKey: nextPlate,
      requestId: id,
      customerWaKey: patch?.customerWaKey ?? beforeData.customerWaKey ?? '',
      customerUid: patch?.customerUid ?? beforeData.customerUid ?? '',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  await batch.commit()
}

/**
 * Root-only helper (rules Firestore: delete `tradein_requests` hanya untuk root):
 * - Menghapus request + index plate jika index menunjuk ke request ini.
 */
export async function deleteTradeinRequest(id) {
  const ref = doc(db, 'tradein_requests', id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return

  const data = snap.data() || {}
  const plateKey = normalizePlate(data.plateKey || data.plateNumber || '')
  if (plateKey) {
    const idxRef = tradeinPlateIndexRef(plateKey)
    const idxSnap = await getDoc(idxRef)
    if (idxSnap.exists() && idxSnap.data()?.requestId === id) {
      await deleteDoc(idxRef)
    }
  }
  await deleteDoc(ref)
}

