import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../../lib/firebase.js'
import { useAuth } from '../../state/AuthContext.jsx'

function friendlyAuthError(err) {
  const code = err?.code || ''
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'Email atau password salah, atau user belum dibuat di Firebase Authentication.'
  }
  if (code === 'auth/user-not-found') {
    return 'User admin tidak ditemukan. Buat user di Firebase Authentication → Users.'
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password belum diaktifkan. Aktifkan di Firebase Authentication → Sign-in method.'
  }
  if (code === 'auth/too-many-requests') {
    return 'Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.'
  }
  return err?.message || 'Login failed'
}

export function LoginPage() {
  const nav = useNavigate()
  const { refreshClaims } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const canSubmit = useMemo(() => email.trim().length >= 3 && password.length >= 6, [email, password])

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setErr('')
    setSubmitting(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      await refreshClaims()
      nav('/app', { replace: true })
    } catch (e2) {
      setErr(friendlyAuthError(e2))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container" style={{ minHeight: '100svh', display: 'grid', placeItems: 'center' }}>
      <div className="card" style={{ width: 'min(420px, 100%)', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/logo.png"
            alt="SUTEN"
            style={{ height: 48, width: 48, objectFit: 'cover', borderRadius: 12, display: 'block' }}
          />
          <div style={{ fontWeight: 900, fontSize: 18 }}>SUTEN Admin Dashboard</div>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          Login admin (Supervisor / Aftersales / Trade In)
        </div>

        {err ? (
          <div
            className="card"
            style={{
              marginTop: 12,
              padding: 12,
              borderColor: 'rgba(239, 68, 68, 0.5)',
              background: 'rgba(239, 68, 68, 0.12)',
            }}
          >
            {err}
          </div>
        ) : null}

        <form onSubmit={onSubmit} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label className="muted" style={{ fontSize: 12 }}>
            Email
          </label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />

          <label className="muted" style={{ fontSize: 12 }}>
            Password
          </label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="btn btnPrimary" type="submit" disabled={!canSubmit || submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

