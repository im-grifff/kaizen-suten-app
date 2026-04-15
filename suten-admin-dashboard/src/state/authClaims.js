import { getIdTokenResult } from 'firebase/auth'

export async function getRoleFromClaims(user) {
  if (!user) return null
  const res = await getIdTokenResult(user, true)
  const role = res?.claims?.role
  if (role === 'root' || role === 'supervisor' || role === 'aftersales' || role === 'tradein') return role
  return null
}

