import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase.js'
import { normalizePlate } from '../utils/plateFormat.js'

export function usersCol() {
  return collection(db, 'users')
}

function plateIndexRef(plate) {
  return doc(db, 'plate_index', plate)
}

/** True if another user doc already uses this plate (excluding optional doc id). */
export async function isPlateTaken(plate, opts = {}) {
  const p = normalizePlate(plate)
  if (!p) return true
  const { exceptUserId } = opts
  const q = query(usersCol(), where('plateNumber', '==', p), limit(25))
  const snap = await getDocs(q)
  for (const d of snap.docs) {
    if (exceptUserId && d.id === exceptUserId) continue
    return true
  }
  return false
}

export function listenUsers({ onData, onError, searchPlate = '' }) {
  const plate = normalizePlate(searchPlate)
  const q = plate
    ? query(usersCol(), where('plateNumber', '==', plate), limit(50))
    : query(usersCol(), orderBy('updatedAt', 'desc'), limit(50))

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData?.(rows)
    },
    (err) => onError?.(err),
  )
}

/**
 * Create customer: doc id = normalized plate (unique). Syncs `plate_index/{plate}`.
 */
export async function createUserDoc(payload) {
  const plate = normalizePlate(payload.plateNumber || '')
  if (!plate) throw new Error('Plate wajib diisi.')

  if (await isPlateTaken(plate)) {
    throw new Error('Nomor plat ini sudah terdaftar.')
  }

  const ref = doc(db, 'users', plate)
  const batch = writeBatch(db)
  batch.set(ref, {
    ...payload,
    plateNumber: plate,
    userId: plate,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(plateIndexRef(plate), { uid: plate, updatedAt: serverTimestamp() }, { merge: true })
  await batch.commit()
  return ref
}

export async function updateUser(uid, patch) {
  const ref = doc(db, 'users', uid)
  const before = await getDoc(ref)
  if (!before.exists()) throw new Error('Data pelanggan tidak ditemukan.')

  const oldPlate = normalizePlate(before.data()?.plateNumber || '')
  const nextPlate =
    patch.plateNumber !== undefined ? normalizePlate(patch.plateNumber) : oldPlate

  if (!nextPlate) throw new Error('Plate wajib diisi.')

  if (nextPlate !== oldPlate && (await isPlateTaken(nextPlate, { exceptUserId: uid }))) {
    throw new Error('Nomor plat ini sudah terdaftar.')
  }

  const batch = writeBatch(db)
  batch.update(ref, { ...patch, plateNumber: nextPlate, updatedAt: serverTimestamp() })

  if (oldPlate && oldPlate !== nextPlate) {
    const idxOldSnap = await getDoc(plateIndexRef(oldPlate))
    if (idxOldSnap.exists() && idxOldSnap.data()?.uid === uid) {
      batch.delete(plateIndexRef(oldPlate))
    }
  }

  batch.set(plateIndexRef(nextPlate), { uid, updatedAt: serverTimestamp() }, { merge: true })

  await batch.commit()
}

export async function deleteUser(uid) {
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  const plate = normalizePlate(snap.data()?.plateNumber || '')
  if (plate) {
    const idxRef = plateIndexRef(plate)
    const idxSnap = await getDoc(idxRef)
    if (idxSnap.exists() && idxSnap.data()?.uid === uid) {
      await deleteDoc(idxRef)
    }
  }
  await deleteDoc(ref)
}
