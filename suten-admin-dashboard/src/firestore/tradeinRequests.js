import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, updateDoc, doc } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

export function tradeinRequestsCol() {
  return collection(db, 'tradein_requests')
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

