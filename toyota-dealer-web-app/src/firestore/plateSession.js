import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/firebase.js'

export function plateSessionRef(uid) {
  return doc(db, 'plate_sessions', uid)
}

export async function setPlateSession({ uid, plate, targetUid }) {
  await setDoc(
    plateSessionRef(uid),
    {
      plate: String(plate || ''),
      targetUid: String(targetUid || ''),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

