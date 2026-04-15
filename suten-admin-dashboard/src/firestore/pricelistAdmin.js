import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase.js'

export function pricelistCol() {
  return collection(db, 'pricelist')
}

export function listenPricelist({ onData, onError }) {
  const q = query(pricelistCol(), orderBy('updatedAt', 'desc'), limit(100))
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData?.(rows)
    },
    (err) => onError?.(err),
  )
}

export async function createPricelistRow(payload) {
  return addDoc(pricelistCol(), { ...payload, updatedAt: serverTimestamp() })
}

export async function updatePricelistRow(id, patch) {
  const ref = doc(db, 'pricelist', id)
  return updateDoc(ref, { ...patch, updatedAt: serverTimestamp() })
}

export async function deletePricelistRow(id) {
  const ref = doc(db, 'pricelist', id)
  return deleteDoc(ref)
}

