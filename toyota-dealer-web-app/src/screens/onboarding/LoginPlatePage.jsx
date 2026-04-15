import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext.jsx'
import { normalizePlate } from '../../utils/plateFormat.js'

export function LoginPlatePage() {
  const nav = useNavigate()
  const { loginWithPlate } = useAuth()
  const [plateInput, setPlateInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const normalized = useMemo(() => normalizePlate(plateInput), [plateInput])
  const canSubmit = normalized.length >= 4

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!canSubmit) {
      setError('Plat nomor tidak valid. Minimal 4 karakter. Contoh: DB1233KG')
      return
    }
    setLoading(true)
    try {
      await loginWithPlate(normalized)
      nav('/app', { replace: true })
    } catch (err) {
      setError(err?.message || 'Gagal login')
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
          <label className="label" htmlFor="plate">
            Plat Nomor
          </label>
          <input
            id="plate"
            className="input"
            placeholder="DB 1233 KG (akan jadi DB1233KG)"
            value={plateInput}
            onChange={(e) => setPlateInput(e.target.value)}
            autoComplete="off"
          />

          <div className="helper">
            <span className="muted small">Disimpan (tanpa spasi):</span>{' '}
            <span className="mono">{normalized || '-'}</span>
          </div>

          {error ? <div className="alert alert--error">{error}</div> : null}

          <button className="btn btn--primary" disabled={loading}>
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}

