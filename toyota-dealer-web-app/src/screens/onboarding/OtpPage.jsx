import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext.jsx'

export function OtpPage() {
  const nav = useNavigate()
  const { pendingPhoneNumber, confirmationResult, verifyOtp } = useAuth()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const maskedPhone = useMemo(() => {
    const s = pendingPhoneNumber || ''
    if (s.length < 6) return s || '-'
    return `${s.slice(0, 4)}•••${s.slice(-3)}`
  }, [pendingPhoneNumber])

  if (!confirmationResult) return <Navigate to="/login" replace />

  async function onVerify(e) {
    e.preventDefault()
    setError('')
    if (!code || code.length < 4) {
      setError('Masukkan kode OTP dengan benar.')
      return
    }

    setLoading(true)
    try {
      await verifyOtp(code)
      nav('/app', { replace: true })
    } catch (err) {
      setError(err?.message || 'OTP salah / verifikasi gagal.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen">
      <div className="card">
        <h1 className="h1">Masukkan OTP</h1>
        <p className="muted">
          Kode OTP dikirim ke nomor: <span className="mono">{maskedPhone}</span>
        </p>
        <p className="muted small" style={{ marginTop: 8 }}>
          Draft demo: masukkan kode 4 digit apa pun (contoh: <span className="mono">1234</span>).
        </p>

        <form onSubmit={onVerify} className="form">
          <label className="label" htmlFor="otp">
            Kode OTP
          </label>
          <input
            id="otp"
            className="input input--otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ''))}
            maxLength={6}
          />

          {error ? <div className="alert alert--error">{error}</div> : null}

          <button className="btn btn--primary" disabled={loading}>
            {loading ? 'Memverifikasi...' : 'Verifikasi'}
          </button>

          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => nav('/login')}
            disabled={loading}
          >
            Ubah Nomor
          </button>
        </form>
      </div>
    </div>
  )
}

