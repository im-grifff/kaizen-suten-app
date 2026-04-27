import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/firebase.js'
import { normalizePlate } from '../utils/plateFormat.js'

export function tradeinRequestsCol() {
  return collection(db, 'tradein_requests')
}

export class DuplicatePlateError extends Error {
  constructor(plate) {
    super(`Mobil dengan Plat nomor ${plate} sudah pernah di input`)
    this.name = 'DuplicatePlateError'
    this.plate = plate
  }
}

/**
 * Cek cepat (non-atomic) apakah plat sudah pernah diinput.
 * Mengembalikan true jika doc index tradein_plate_index/{plateKey} sudah ada.
 */
export async function isPlateAlreadyUsed(rawPlate) {
  const plateKey = normalizePlate(rawPlate)
  if (!plateKey) return false
  const snap = await getDoc(doc(db, 'tradein_plate_index', plateKey))
  return snap.exists()
}

export function listenTradeinRequestsForWa(waKey, { onData, onError }) {
  if (!waKey) {
    onData?.([])
    return () => {}
  }
  const q = query(tradeinRequestsCol(), where('customerWaKey', '==', waKey), orderBy('createdAt', 'desc'))
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
 * Membuat request trade-in secara atomik bersama dokumen
 * `tradein_plate_index/{plateKey}` agar plat nomor unik antar customer.
 *
 * Throws `DuplicatePlateError` jika plat sudah dipakai.
 */
export async function createTradeinRequest(payload) {
  const plateKey = normalizePlate(payload?.plateKey || payload?.plateNumber || '')
  if (!plateKey) throw new Error('Plat nomor wajib diisi.')

  const newReqRef = doc(tradeinRequestsCol())
  const indexRef = doc(db, 'tradein_plate_index', plateKey)

  await runTransaction(db, async (tx) => {
    const indexSnap = await tx.get(indexRef)
    if (indexSnap.exists()) {
      throw new DuplicatePlateError(payload?.plateNumber || plateKey)
    }
    tx.set(newReqRef, {
      ...payload,
      plateKey,
      adminStage: 'new',
      status: 'new',
      createdAt: serverTimestamp(),
    })
    tx.set(indexRef, {
      plateKey,
      requestId: newReqRef.id,
      customerWaKey: payload?.customerWaKey || '',
      customerUid: payload?.customerUid || '',
      createdAt: serverTimestamp(),
    })
  })

  return newReqRef
}

/**
 * Customer menekan "Request Inspeksi" pada riwayat trade-in.
 * Memindahkan dokumen dari stage `new` ke `contacted` pada admin dashboard.
 */
export async function customerRequestInspection(id) {
  const ref = doc(db, 'tradein_requests', id)
  return updateDoc(ref, {
    adminStage: 'contacted',
    status: 'contacted',
    customerRequestedInspectionAt: serverTimestamp(),
  })
}
