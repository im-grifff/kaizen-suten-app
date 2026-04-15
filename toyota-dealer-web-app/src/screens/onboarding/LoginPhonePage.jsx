import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext.jsx'

function normalizePhoneId(phoneRaw) {
  const digits = String(phoneRaw || '').replace(/[^\d+]/g, '')
  if (!digits) return ''
  if (digits.startsWith('+')) return digits
  // Default Indonesia when user types 08xxxx or 8xxxx
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`
  if (digits.startsWith('62')) return `+${digits}`
  return `+${digits}`
}

export function LoginPhonePage() {
  const nav = useNavigate()
  const { requestOtp } = useAuth()
  const [phoneInput, setPhoneInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const normalized = useMemo(
    () => normalizePhoneId(phoneInput),
    [phoneInput],
  )

  async function onRequestOtp(e) {
    e.preventDefault()
    setError('')

    if (!normalized || normalized.length < 9) {
      setError('Nomor tidak valid. Contoh: 0812xxxx atau +62812xxxx')
      return
    }

    setLoading(true)
    try {
      await requestOtp(normalized)
      nav('/otp')
    } catch (err) {
      setError(err?.message || 'Gagal mengirim OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen">
      <div className="card">
        <h1 className="h1">Input Nomor WhatsApp</h1>
        <p className="muted">
          Masukkan nomor WhatsApp Anda. Format otomatis akan diubah menjadi{' '}
          <span className="chip">+62...</span>
        </p>

        <form onSubmit={onRequestOtp} className="form">
          <label className="label" htmlFor="phone">
            Nomor WhatsApp
          </label>
          <input
            id="phone"
            inputMode="tel"
            autoComplete="tel"
            className="input"
            placeholder="08123456789"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
          />
          <div className="helper">
            <span className="muted small">Terbaca:</span>{' '}
            <span className="mono">{normalized || '-'}</span>
          </div>

          <div id="recaptcha-container" />

          {error ? <div className="alert alert--error">{error}</div> : null}

          <button className="btn btn--primary" disabled={loading}>
            {loading ? 'Mengirim OTP...' : 'Kirim OTP'}
          </button>
        </form>
      </div>
    </div>
  )
}

