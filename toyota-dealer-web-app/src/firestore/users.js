import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase/firebase.js'

export function userDocRef(userId) {
  return doc(db, 'users', userId)
}

export async function ensureUserDoc(userId, patch = {}) {
  const ref = userDocRef(userId)
  const snap = await getDoc(ref)

  if (!snap.exists()) {
    await setDoc(ref, {
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      owner: { namaPemilik: '', alamat: '' },
      vehicle: { modelMobil: '', noPolisi: '', noMesin: '', vehicleImageUrl: '' },
      serviceData: {
        nextServiceDate: null,
      },
      ...patch,
    })
    return { ref, created: true }
  }

  await updateDoc(ref, { updatedAt: serverTimestamp(), ...patch })
  return { ref, created: false }
}

