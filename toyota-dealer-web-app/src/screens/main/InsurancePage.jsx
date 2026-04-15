import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { saveInsuranceExtendRequest } from '../../lib/pendingOrders.js'

const SCHEMES = [
  '1AR-4TLO',
  '2AR-3TLO',
  '3AR-2TLO',
  '4AR-1TLO',
  'FULL ALL RISK',
]

export function InsurancePage() {
  const { authUser, userSnapshot } = useAuth()
  const polis = userSnapshot?.insurancePolis

  const [extendOpen, setExtendOpen] = useState(false)
  const [scheme, setScheme] = useState(SCHEMES[0])
  const [pickupDate, setPickupDate] = useState('')
  const [confirmOrder, setConfirmOrder] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')

  function openExtend() {
    setDoneMsg('')
    setScheme(SCHEMES[0])
    setPickupDate('')
    setConfirmOrder(false)
    setExtendOpen(true)
  }

  async function onSendRequest(e) {
    e.preventDefault()
    if (!pickupDate || !confirmOrder) return
    setSubmitting(true)
    try {
      const row = saveInsuranceExtendRequest({
        userId: userSnapshot?.userId || authUser?.uid || authUser?.phoneNumber,
        phone: authUser?.phoneNumber,
        customerName: userSnapshot?.owner?.namaPemilik,
        currentPolis: polis?.jenisPolis,
        requestedScheme: scheme,
        pickupDate,
      })
      setExtendOpen(false)
      setDoneMsg(
        `Permintaan perpanjangan terkirim (ID: ${row.id.slice(0, 8)}…). Tim admin akan menghubungi Anda.`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <h1 className="h1">Asuransi</h1>
      <p className="muted">Detail polis asuransi unit (demo).</p>

      {doneMsg ? (
        <div className="alert alert--ok" style={{ marginTop: 12 }}>
          {doneMsg}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="infoList">
          <div className="infoRow">
            <div className="infoRow__k">Jenis Polis</div>
            <div className="infoRow__v">{polis?.jenisPolis || '-'}</div>
          </div>
          <div className="infoRow">
            <div className="infoRow__k">Masa Berlaku</div>
            <div className="infoRow__v">{polis?.masaBerlaku || '-'}</div>
          </div>
          <div className="infoRow">
            <div className="infoRow__k">Cakupan</div>
            <div className="infoRow__v">{polis?.cakupan || '-'}</div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--primary"
          style={{ marginTop: 16, width: '100%' }}
          onClick={openExtend}
        >
          Extend Insurance
        </button>
      </div>

      {extendOpen ? (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="extend-ins-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setExtendOpen(false)
          }}
        >
          <div className="modalCard">
            <h2 id="extend-ins-title" className="h2">
              Extend Insurance
            </h2>
            <p className="muted small">
              Pilih skema asuransi. Permintaan akan disimpan untuk Dashboard admin
              (demo: localStorage).
            </p>

            <form className="form" onSubmit={onSendRequest}>
              <label className="label" htmlFor="insScheme">
                Skema asuransi
              </label>
              <select
                id="insScheme"
                className="input"
                value={scheme}
                onChange={(e) => setScheme(e.target.value)}
              >
                {SCHEMES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <label className="label" htmlFor="insPickup">
                Tanggal pengambilan / follow-up
              </label>
              <input
                id="insPickup"
                type="date"
                className="input"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                required
              />

              <label className="checkRow">
                <input
                  type="checkbox"
                  checked={confirmOrder}
                  onChange={(e) => setConfirmOrder(e.target.checked)}
                />
                <span>
                  Apakah Anda yakin ingin mengajukan perpanjangan asuransi ini?
                </span>
              </label>

              <button
                type="submit"
                className="btn btn--primary"
                disabled={submitting || !pickupDate || !confirmOrder}
              >
                {submitting ? 'Mengirim…' : 'Send Request'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setExtendOpen(false)}
              >
                Tutup
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
