import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

export async function getUserById(userId) {
  const ref = doc(db, 'users', String(userId || ''))
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

