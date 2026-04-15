import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/firebase.js'

export function waSessionRef(uid) {
  return doc(db, 'wa_sessions', uid)
}

export async function setWaSession({ uid, waKey, displayName }) {
  await setDoc(
    waSessionRef(uid),
    {
      waKey: String(waKey || ''),
      displayName: String(displayName || ''),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}
