import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/firebase.js'

export async function fetchActiveTshopProducts() {
  const q = query(
    collection(db, 'tshop_products'),
    orderBy('updatedAt', 'desc'),
    limit(200),
  )
  const snap = await getDocs(q)
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return rows.filter((r) => r.active === true)
}

export async function createTshopOrder(payload) {
  return addDoc(collection(db, 'tshop_orders'), {
    ...payload,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

