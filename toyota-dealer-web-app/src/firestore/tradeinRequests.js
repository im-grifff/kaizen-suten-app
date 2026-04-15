import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/firebase.js'

export function tradeinRequestsCol() {
  return collection(db, 'tradein_requests')
}

export async function createTradeinRequest(payload) {
  return addDoc(tradeinRequestsCol(), {
    ...payload,
    status: 'new',
    createdAt: serverTimestamp(),
  })
}

