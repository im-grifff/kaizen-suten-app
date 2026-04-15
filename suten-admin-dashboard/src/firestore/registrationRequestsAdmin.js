import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

export function registrationRequestsCol() {
  return collection(db, 'registration_requests')
}

export function listenRegistrationRequests({ onData, onError }) {
  const q = query(registrationRequestsCol(), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData?.(rows)
    },
    (err) => onError?.(err),
  )
}

export async function updateRegistrationRequest(id, patch) {
  const ref = doc(db, 'registration_requests', id)
  return updateDoc(ref, { ...patch, updatedAt: serverTimestamp() })
}
