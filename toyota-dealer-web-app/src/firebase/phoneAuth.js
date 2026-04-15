import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase.js'

export function createOrGetRecaptcha(containerId = 'recaptcha-container') {
  if (window.__toyotaRecaptchaVerifier) return window.__toyotaRecaptchaVerifier

  window.__toyotaRecaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
  })
  return window.__toyotaRecaptchaVerifier
}

export async function requestOtp(phoneE164) {
  const verifier = createOrGetRecaptcha('recaptcha-container')
  return await signInWithPhoneNumber(auth, phoneE164, verifier)
}

export async function logout() {
  await signOut(auth)
}

