/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { getDemoUserSnapshot } from '../demo/demoData.js'
import { isValidWaKey, normalizeWaKey } from '../utils/waPhoneFormat.js'

const demoMode =
  import.meta.env.VITE_DEMO_MODE === 'true' ||
  !import.meta.env.VITE_FIREBASE_API_KEY ||
  !import.meta.env.VITE_FIREBASE_PROJECT_ID

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [sessionRestored, setSessionRestored] = useState(false)

  const [customerWaKey, setCustomerWaKey] = useState('')
  const [customerDisplayName, setCustomerDisplayName] = useState('')

  useEffect(() => {
    if (demoMode) {
      setAuthReady(true)
      setSessionRestored(true)
      return
    }

    let unsub = null
    ;(async () => {
      const { onAuthStateChanged } = await import('firebase/auth')
      const { auth } = await import('../firebase/firebase.js')
      unsub = onAuthStateChanged(auth, (u) => {
        setAuthUser(u)
        setAuthReady(true)
      })
    })()

    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  useEffect(() => {
    if (demoMode) return undefined
    if (!authReady) return undefined

    if (!authUser?.uid) {
      setCustomerWaKey('')
      setCustomerDisplayName('')
      setSessionRestored(true)
      return undefined
    }

    let cancelled = false
    setSessionRestored(false)
    ;(async () => {
      try {
        const { getDoc } = await import('firebase/firestore')
        const { waSessionRef } = await import('../firestore/waSession.js')
        const snap = await getDoc(waSessionRef(authUser.uid))
        if (cancelled) return
        if (snap.exists()) {
          const d = snap.data() || {}
          setCustomerWaKey(String(d.waKey || ''))
          setCustomerDisplayName(String(d.displayName || ''))
        } else {
          setCustomerWaKey('')
          setCustomerDisplayName('')
        }
      } catch (e) {
        console.warn('[Auth] wa session restore', e?.code, e?.message)
        if (!cancelled) {
          setCustomerWaKey('')
          setCustomerDisplayName('')
        }
      } finally {
        if (!cancelled) setSessionRestored(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authReady, authUser?.uid])

  async function loginWithWaProfile({ name, waRaw }) {
    const waKey = normalizeWaKey(waRaw)
    if (!isValidWaKey(waKey)) {
      throw new Error('Nomor WhatsApp tidak valid. Contoh: 0812xxxx atau 62812xxxx')
    }
    const nameTrim = String(name || '').trim()
    if (nameTrim.length < 2) {
      throw new Error('Nama minimal 2 karakter.')
    }

    if (demoMode) {
      const snap = getDemoUserSnapshot(waKey, nameTrim)
      setAuthUser({ uid: waKey, isDemo: true })
      setCustomerWaKey(waKey)
      setCustomerDisplayName(snap.displayName)
      setSessionRestored(true)
      return { demo: true }
    }

    const { ensureAnonAuth } = await import('../firebase/anonAuth.js')
    const u = await ensureAnonAuth()
    setAuthUser(u)

    const { ensureWaCustomer } = await import('../firestore/waCustomers.js')
    const { displayName } = await ensureWaCustomer({ waKey, displayNameAttempt: nameTrim })

    const { setWaSession } = await import('../firestore/waSession.js')
    await setWaSession({ uid: u.uid, waKey, displayName })

    setCustomerWaKey(waKey)
    setCustomerDisplayName(displayName)
    setSessionRestored(true)
    return u
  }

  async function logout() {
    if (demoMode) {
      setAuthUser(null)
      setCustomerWaKey('')
      setCustomerDisplayName('')
      setSessionRestored(true)
      return
    }
    if (authUser?.uid) {
      try {
        const { deleteDoc } = await import('firebase/firestore')
        const { waSessionRef } = await import('../firestore/waSession.js')
        const { logout: firebaseLogout } = await import('../firebase/anonAuth.js')
        await deleteDoc(waSessionRef(authUser.uid))
        await firebaseLogout()
      } catch (e) {
        console.warn('[Auth] logout', e?.code, e?.message)
        try {
          const { logout: firebaseLogout } = await import('../firebase/anonAuth.js')
          await firebaseLogout()
        } catch {
          // ignore
        }
      }
    }
    setAuthUser(null)
    setCustomerWaKey('')
    setCustomerDisplayName('')
    setSessionRestored(true)
  }

  const value = {
    authUser,
    authReady,
    sessionRestored,
    demoMode,
    customerWaKey,
    customerDisplayName,
    loginWithWaProfile,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
