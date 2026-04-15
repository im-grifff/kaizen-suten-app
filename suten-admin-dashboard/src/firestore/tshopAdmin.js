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

export function tshopProductsCol() {
  return collection(db, 'tshop_products')
}

export function tshopOrdersCol() {
  return collection(db, 'tshop_orders')
}

export function listenTshopProducts({ onData, onError }) {
  const q = query(tshopProductsCol(), orderBy('updatedAt', 'desc'), limit(200))
  return onSnapshot(
    q,
    (snap) => onData?.(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err),
  )
}

export async function createTshopProduct(payload) {
  return addDoc(tshopProductsCol(), { ...payload, updatedAt: serverTimestamp() })
}

export async function updateTshopProduct(id, patch) {
  const ref = doc(db, 'tshop_products', id)
  return updateDoc(ref, { ...patch, updatedAt: serverTimestamp() })
}

export async function deleteTshopProduct(id) {
  const ref = doc(db, 'tshop_products', id)
  return deleteDoc(ref)
}

export function listenTshopOrders({ onData, onError }) {
  const q = query(tshopOrdersCol(), orderBy('createdAt', 'desc'), limit(200))
  return onSnapshot(
    q,
    (snap) => onData?.(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err),
  )
}

export async function updateTshopOrder(id, patch) {
  const ref = doc(db, 'tshop_orders', id)
  return updateDoc(ref, { ...patch, updatedAt: serverTimestamp() })
}

