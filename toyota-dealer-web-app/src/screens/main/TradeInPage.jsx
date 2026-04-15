import { useMemo, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { createTradeinRequest } from '../../firestore/tradeinRequests.js'

function buildInspeksiWaUrl({ nomor_inspeksi, tipe, tahun }) {
  const pesan = `Halo SUTEN, saya ingin INSPEKSI untuk Trade In. Tipe mobil lama: ${tipe}. Tahun: ${tahun}. Mohon info jadwal inspeksi.`
  return `https://wa.me/${encodeURIComponent(
    nomor_inspeksi,
  )}?text=${encodeURIComponent(pesan)}`
}

export function TradeInPage() {
  const { authUser, userSnapshot } = useAuth()
  const waNumbers = userSnapshot?.waNumbers || {}

  const [tipeMobilLama, setTipeMobilLama] = useState('')
  const [tahun, setTahun] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')

  const canSubmit = useMemo(() => {
    return tipeMobilLama.trim().length >= 2 && String(tahun).trim().length >= 4
  }, [tipeMobilLama, tahun])

  async function onRequestInspeksi() {
    if (!canSubmit) return
    setDoneMsg('')
    setSubmitting(true)
    try {
      // If Firebase isn't configured (demo mode), this will fail silently and we still allow WA flow.
      if (authUser?.uid) {
        await createTradeinRequest({
          customerUid: authUser.uid,
          plateNumber: userSnapshot?.vehicle?.noPolisi || userSnapshot?.plateNumber || '',
          customerName: userSnapshot?.owner?.namaPemilik || '',
          carType: tipeMobilLama.trim(),
          year: String(tahun).trim(),
        })
        setDoneMsg('Request inspeksi terkirim. Tim Trade In akan menghubungi Anda via WhatsApp.')
      }
    } catch {
      // ignore and still allow WA link to work
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <h1 className="h1">Trade In</h1>
      <p className="muted">
        Form input (tipe mobil lama, tahun) dan tombol inspeksi akan ada di sini.
      </p>

      {doneMsg ? (
        <div className="alert alert--ok" style={{ marginTop: 12 }}>
          {doneMsg}
        </div>
      ) : null}

      <div className="card">
        <div className="form">
          <label className="label" htmlFor="tipeLama">
            Tipe Mobil Lama
          </label>
          <input
            id="tipeLama"
            className="input"
            placeholder="Contoh: Avanza 1.3"
            value={tipeMobilLama}
            onChange={(e) => setTipeMobilLama(e.target.value)}
          />

          <label className="label" htmlFor="tahunLama">
            Tahun
          </label>
          <input
            id="tahunLama"
            className="input"
            inputMode="numeric"
            placeholder="Contoh: 2017"
            value={tahun}
            onChange={(e) => setTahun(e.target.value.replace(/[^\d]/g, ''))}
          />

          <div style={{ display: 'grid', gap: 10 }}>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!canSubmit || submitting}
              onClick={async () => {
                await onRequestInspeksi()
                window.open(
                  buildInspeksiWaUrl({
                    nomor_inspeksi: waNumbers.nomor_inspeksi || '',
                    tipe: tipeMobilLama || '-',
                    tahun: tahun || '-',
                  }),
                  '_blank',
                  'noopener,noreferrer',
                )
              }}
            >
              {submitting ? 'Mengirim…' : 'INSPEKSI SEKARANG'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

