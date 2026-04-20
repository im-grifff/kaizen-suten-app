import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/firebase.js'

export function tradeinRequestsCol() {
  return collection(db, 'tradein_requests')
}

export function listenTradeinRequestsForWa(waKey, { onData, onError }) {
  if (!waKey) {
    onData?.([])
    return () => {}
  }
  const q = query(tradeinRequestsCol(), where('customerWaKey', '==', waKey), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData?.(rows)
    },
    (err) => onError?.(err),
  )
}

export async function createTradeinRequest(payload) {
  return addDoc(tradeinRequestsCol(), {
    ...payload,
    adminStage: 'new',
    status: 'new',
    createdAt: serverTimestamp(),
  })
}

/**
 * Customer menekan "Request Inspeksi" pada riwayat trade-in.
 * Memindahkan dokumen dari stage `new` ke `contacted` pada admin dashboard.
 */
export async function customerRequestInspection(id) {
  const ref = doc(db, 'tradein_requests', id)
  return updateDoc(ref, {
    adminStage: 'contacted',
    status: 'contacted',
    customerRequestedInspectionAt: serverTimestamp(),
  })
}
