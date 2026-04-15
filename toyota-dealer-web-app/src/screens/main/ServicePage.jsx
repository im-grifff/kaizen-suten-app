import { useMemo, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'

function buildBookingWaUrl({ nomor_SA, tanggalWaktu }) {
  const pesan = `Halo SUTEN, saya ingin BOOKING SERVICE pada ${tanggalWaktu}. Mohon konfirmasi. Terima kasih.`
  return `https://wa.me/${encodeURIComponent(
    nomor_SA,
  )}?text=${encodeURIComponent(pesan)}`
}

export function ServicePage() {
  const [tab, setTab] = useState('history')
  const { userSnapshot } = useAuth()
  const waNumbers = userSnapshot?.waNumbers || {}

  const nextDate = userSnapshot?.serviceData?.nextServiceDate
  const serviceHistory = userSnapshot?.serviceHistory || []

  const [tanggal, setTanggal] = useState('')
  const [waktu, setWaktu] = useState('10:00')

  const canBook = useMemo(() => {
    return Boolean(tanggal && tanggal.length >= 8 && waktu && waktu.length >= 4)
  }, [tanggal, waktu])

  const tabs = useMemo(
    () => [
      { id: 'history', label: 'History' },
      { id: 'booked', label: 'Booked' },
    ],
    [],
  )

  return (
    <div className="page">
      <h1 className="h1">Service</h1>

      <div className="card card--soft">
        <div className="row">
          <div>
            <div className="muted small">NEXT SERVICE REMINDER</div>
            <div className="h2">{nextDate || '-'}</div>
          </div>
        </div>
      </div>

      <div className="segmented" role="tablist" aria-label="Service navigation">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`segmented__item ${tab === t.id ? 'isActive' : ''}`}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <div style={{ marginTop: 12 }}>
          {serviceHistory.length === 0 ? (
            <div className="empty">
              <div className="empty__title">Belum ada history</div>
              <div className="empty__desc">Data demo belum tersedia.</div>
            </div>
          ) : (
            serviceHistory.map((h) => (
              <div key={h.id} className="card" style={{ marginTop: 12 }}>
                <div className="row">
                  <div>
                    <div className="muted small">{h.tanggal}</div>
                    <div className="h2">{h.deskripsi}</div>
                    <div className="muted small" style={{ marginTop: 6 }}>
                      Rekomendasi:{' '}
                      <span className="mono">{h.rekomendasi || '-'}</span>
                    </div>
                  </div>
                  <div className="chip">{h.status}</div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="card">
          <h2 className="h2">Booked Service</h2>
          <p className="muted small">Pilih tanggal & waktu, lalu konfirmasi via WhatsApp.</p>

          <div className="form" style={{ marginTop: 12 }}>
            <label className="label" htmlFor="svcDate">
              Tanggal
            </label>
            <input
              id="svcDate"
              type="date"
              className="input"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
            />

            <label className="label" htmlFor="svcTime">
              Waktu
            </label>
            <input
              id="svcTime"
              type="time"
              className="input"
              value={waktu}
              onChange={(e) => setWaktu(e.target.value)}
            />

            <a
              className="btn btn--primary"
              href={buildBookingWaUrl({
                nomor_SA: waNumbers.nomor_SA || '',
                tanggalWaktu: `${tanggal || '-'} ${waktu || '-'}`,
              })}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!canBook}
              style={{
                opacity: canBook ? 1 : 0.6,
                pointerEvents: canBook ? 'auto' : 'none',
              }}
            >
              KONFIRMASI BOOKING
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

