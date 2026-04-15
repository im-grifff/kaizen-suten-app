import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/firebase.js'

export function registrationRequestsCol() {
  return collection(db, 'registration_requests')
}

/** Pelanggan belum terdaftar: klik Daftarkan → buat baris untuk admin. */
export async function createRegistrationRequest({ plateNumber }) {
  return addDoc(registrationRequestsCol(), {
    plateNumber: String(plateNumber || ''),
    status: 'new',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
