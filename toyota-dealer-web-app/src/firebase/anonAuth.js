import { signInAnonymously, signOut } from 'firebase/auth'
import { auth } from './firebase.js'

export async function ensureAnonAuth() {
  if (auth.currentUser) return auth.currentUser
  const cred = await signInAnonymously(auth)
  return cred.user
}

export async function logout() {
  await signOut(auth)
}

