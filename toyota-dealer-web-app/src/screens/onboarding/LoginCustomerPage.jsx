import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext.jsx'
import { normalizeWaKey } from '../../utils/waPhoneFormat.js'

export function LoginCustomerPage() {
  const nav = useNavigate()
  const { loginWithWaProfile } = useAuth()
  const [nameInput, setNameInput] = useState('')
  const [waInput, setWaInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const waPreview = useMemo(() => normalizeWaKey(waInput), [waInput])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await loginWithWaProfile({ name: nameInput, waRaw: waInput })
      nav('/app', { replace: true })
    } catch (err) {
      setError(err?.message || 'Gagal masuk')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen">
      <div className="card">
        <div className="brand">
          <div className="brand__mark">SUTEN</div>
          <div className="brand__text">
            <div className="brand__title">SUTEN</div>
            <div className="brand__subtitle">TOYOTA TENDEAN MANADO</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="form" style={{ marginTop: 16 }}>
          <label className="label" htmlFor="custName">
            Nama
          </label>
          <input
            id="custName"
            className="input"
            placeholder="Nama lengkap"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            autoComplete="name"
          />

          <label className="label" htmlFor="custWa" style={{ marginTop: 12 }}>
            Nomor WhatsApp
          </label>
          <input
            id="custWa"
            className="input"
            placeholder="0812xxxx atau 62812xxxx"
            inputMode="tel"
            value={waInput}
            onChange={(e) => setWaInput(e.target.value)}
            autoComplete="tel"
          />

          <div className="helper">
            <span className="muted small">Tersimpan sebagai:</span>{' '}
            <span className="mono">{waPreview || '-'}</span>
          </div>

          {error ? <div className="alert alert--error">{error}</div> : null}

          <button className="btn btn--primary" type="submit" disabled={loading}>
            {loading ? 'Masuk…' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}
