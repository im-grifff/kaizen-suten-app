/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { getDemoUserSnapshot } from '../demo/demoData.js'
import { normalizePlate } from '../utils/plateFormat.js'

const demoMode =
  import.meta.env.VITE_DEMO_MODE === 'true' ||
  !import.meta.env.VITE_FIREBASE_API_KEY ||
  !import.meta.env.VITE_FIREBASE_PROJECT_ID

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  const [userSnapshot, setUserSnapshot] = useState(null)
  const [plateNumber, setPlateNumber] = useState('')
  const [activeUserId, setActiveUserId] = useState('')
  const [unregisteredPlate, setUnregisteredPlate] = useState(false)

  useEffect(() => {
    if (demoMode) {
      setAuthReady(true)
      return
    }

    // Non-demo mode: use Firebase auth state listener.
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
    // Hanya users/{canonicalUid} dari plat — jangan pakai authUser.uid (anon), itu bukan dokumen customer.
    const uid = activeUserId
    if (!uid) {
      setUserSnapshot(null)
      return undefined
    }

    let unsub = null
    ;(async () => {
      const { onSnapshot } = await import('firebase/firestore')
      const { userDocRef } = await import('../firestore/users.js')
      const ref = userDocRef(uid)
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setUserSnapshot(null)
            return
          }
          setUserSnapshot({ ...snap.data(), userId: uid })
        },
        (err) => {
          console.error('[Auth] users snapshot error', err?.code, err?.message)
        },
      )
    })()

    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [authReady, activeUserId])

  // Setelah refresh: anon auth tetap ada tapi state React hilang — pulihkan targetUid dari plate_sessions.
  useEffect(() => {
    if (demoMode) return undefined
    if (!authReady || !authUser?.uid) return undefined

    let cancelled = false
    ;(async () => {
      try {
        const { getDoc } = await import('firebase/firestore')
        const { plateSessionRef } = await import('../firestore/plateSession.js')
        const snap = await getDoc(plateSessionRef(authUser.uid))
        if (cancelled || !snap.exists()) return
        const d = snap.data() || {}
        const plate = normalizePlate(d.plate || '')
        const targetUid = normalizePlate(d.targetUid || '')
        if (!plate || !targetUid) return

        setPlateNumber((prev) => prev || plate)
        setActiveUserId((prev) => prev || targetUid)
        setUnregisteredPlate(false)

        const { userDocRef } = await import('../firestore/users.js')
        const prof = await getDoc(userDocRef(targetUid))
        if (prof.exists()) {
          setUserSnapshot({ ...prof.data(), userId: targetUid })
        }
      } catch (e) {
        console.warn('[Auth] restore session/profile', e?.code, e?.message)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authReady, authUser?.uid])

  async function loginWithPlate(plateRaw) {
    const plate = normalizePlate(plateRaw)
    if (!plate || plate.length < 4) {
      throw new Error('Plat nomor tidak valid. Minimal 4 karakter (tanpa spasi). Contoh: DB1233KG')
    }

    if (demoMode) {
      setAuthUser({ uid: plate, isDemo: true })
      setPlateNumber(plate)
      setActiveUserId(plate)
      setUserSnapshot(getDemoUserSnapshot(plate))
      return { demo: true }
    }

    const { ensureAnonAuth } = await import('../firebase/anonAuth.js')
    const u = await ensureAnonAuth()
    setAuthUser(u)
    setPlateNumber(plate)

    const { ensureUserDoc } = await import('../firestore/users.js')
    const { getUidByPlate } = await import('../firestore/plateIndex.js')
    const { setPlateSession } = await import('../firestore/plateSession.js')
    const mappedUid = await getUidByPlate(plate)
    if (!mappedUid) {
      setUnregisteredPlate(true)
      setActiveUserId('')
      setUserSnapshot(null)
      return { unregistered: true }
    }

    setUnregisteredPlate(false)
    // Tulis plate_sessions SEBELUM setActiveUserId: listener Firestore butuh rule ini agar bisa baca users/{targetUid}.
    await setPlateSession({ uid: u.uid, plate, targetUid: mappedUid })
    setActiveUserId(mappedUid)
    await ensureUserDoc(mappedUid, { plateNumber: plate })
    try {
      const { getDoc } = await import('firebase/firestore')
      const { userDocRef } = await import('../firestore/users.js')
      const profileSnap = await getDoc(userDocRef(mappedUid))
      if (profileSnap.exists()) {
        setUserSnapshot({ ...profileSnap.data(), userId: mappedUid })
      }
    } catch (e) {
      console.warn('[Auth] login profile getDoc', e?.code, e?.message)
    }
    return u
  }

  async function logout() {
    if (!demoMode) {
      const { logout: firebaseLogout } = await import('../firebase/anonAuth.js')
      await firebaseLogout()
    }
    setAuthUser(null)
    setUserSnapshot(null)
    setPlateNumber('')
    setActiveUserId('')
    setUnregisteredPlate(false)
  }

  const value = {
    authUser,
    authReady,
    userSnapshot,
    plateNumber,
    unregisteredPlate,
    loginWithPlate,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

