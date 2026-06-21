import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/firebase.js'

export function waCustomerRef(waKey) {
  return doc(db, 'wa_customers', waKey)
}

/**
 * Buat akun WA jika belum ada. Nama hanya diset saat pertama kali (tidak di-overwrite).
 *
 * Channel:
 * - `acquisitionChannel` memakai aturan first-touch (hanya diset saat dokumen
 *   pertama dibuat / jika belum ada nilainya), supaya sumber asli customer tetap.
 * - `lastChannel` selalu di-update mengikuti channel akses terakhir.
 *
 * @returns {{ displayName: string, waKey: string }}
 */
export async function ensureWaCustomer({ waKey, displayNameAttempt, channel }) {
  const ref = waCustomerRef(waKey)
  const snap = await getDoc(ref)
  const trimmed = String(displayNameAttempt || '').trim()
  const ch = channel === 'first' || channel === 'second' ? channel : ''

  if (!snap.exists()) {
    await setDoc(ref, {
      waKey,
      displayName: trimmed,
      ...(ch ? { acquisitionChannel: ch, lastChannel: ch } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { displayName: trimmed, waKey }
  }

  const data = snap.data() || {}
  if (ch) {
    const patch = { lastChannel: ch, updatedAt: serverTimestamp() }
    // first-touch: isi acquisitionChannel hanya jika belum pernah ada.
    if (!data.acquisitionChannel) patch.acquisitionChannel = ch
    await setDoc(ref, patch, { merge: true })
  }

  const existing = String(data.displayName || '').trim() || 'Customer'
  return { displayName: existing, waKey }
}
