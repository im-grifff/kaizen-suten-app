import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/firebase.js'
import { normalizePlate } from '../utils/plateFormat.js'

export function plateIndexRef(plate) {
  return doc(db, 'plate_index', normalizePlate(plate))
}

export async function getUidByPlate(plate) {
  const snap = await getDoc(plateIndexRef(plate))
  if (!snap.exists()) return null
  const uid = snap.data()?.uid
  return typeof uid === 'string' && uid.length > 3 ? uid : null
}

export async function setUidForPlate({ plate, uid }) {
  await setDoc(
    plateIndexRef(plate),
    { uid: String(uid), updatedAt: serverTimestamp() },
    { merge: true },
  )
}

