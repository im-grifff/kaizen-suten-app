import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

export async function getTypesForModel(model) {
  const m = String(model || '').trim()
  if (!m) return []
  const ref = doc(db, 'model_types', m)
  const snap = await getDoc(ref)
  if (!snap.exists()) return []
  const types = snap.data()?.types
  return Array.isArray(types) ? types.filter((x) => typeof x === 'string') : []
}

