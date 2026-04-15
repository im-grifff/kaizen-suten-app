import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/firebase.js'

export function waCustomerRef(waKey) {
  return doc(db, 'wa_customers', waKey)
}

/**
 * Buat akun WA jika belum ada. Nama hanya diset saat pertama kali (tidak di-overwrite).
 * @returns {{ displayName: string, waKey: string }}
 */
export async function ensureWaCustomer({ waKey, displayNameAttempt }) {
  const ref = waCustomerRef(waKey)
  const snap = await getDoc(ref)
  const trimmed = String(displayNameAttempt || '').trim()
  if (!snap.exists()) {
    await setDoc(ref, {
      waKey,
      displayName: trimmed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { displayName: trimmed, waKey }
  }
  const existing = String(snap.data()?.displayName || '').trim() || 'Customer'
  return { displayName: existing, waKey }
}
