import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import {
  createTradeinRequest,
  customerRequestInspection,
  listenTradeinRequestsForWa,
} from '../../firestore/tradeinRequests.js'
import {
  customerTradeInPriceLabel,
  deriveTradeinCustomerStage,
  estimatePresent,
  pipelineLabel,
} from '../../utils/tradeinCustomerStatus.js'

const DEMO_TRADEIN_KEY = 'demo_tradein_history_v1'

function loadDemoHistory(waKey) {
  try {
    const raw = localStorage.getItem(DEMO_TRADEIN_KEY)
    const all = raw ? JSON.parse(raw) : {}
    return Array.isArray(all[waKey]) ? all[waKey] : []
  } catch {
    return []
  }
}

function saveDemoHistory(waKey, rows) {
  try {
    const raw = localStorage.getItem(DEMO_TRADEIN_KEY)
    const all = raw ? JSON.parse(raw) : {}
    all[waKey] = rows
    localStorage.setItem(DEMO_TRADEIN_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

function formatTs(ts) {
  if (ts?.toDate) return ts.toDate().toLocaleString('id-ID')
  if (typeof ts === 'string') return ts
  return new Date().toLocaleString('id-ID')
}

export function TradeInPage() {
  const { authUser, customerWaKey, customerDisplayName, demoMode } = useAuth()

  const [merkModel, setMerkModel] = useState('')
  const [transmission, setTransmission] = useState('Matic')
  const [year, setYear] = useState('')
  const [color, setColor] = useState('')
  const [km, setKm] = useState('')
  const [stnkMonth, setStnkMonth] = useState('')
  const [bpkbStatus, setBpkbStatus] = useState('Tersedia')
  const [expectLowPrice, setExpectLowPrice] = useState('')
  const [newCarModel, setNewCarModel] = useState('')
  const [salesName, setSalesName] = useState('')

  const [rows, setRows] = useState([])
  const [listErr, setListErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [requestingId, setRequestingId] = useState('')

  const refreshDemo = useCallback(() => {
    if (demoMode && customerWaKey) setRows(loadDemoHistory(customerWaKey))
  }, [demoMode, customerWaKey])

  useEffect(() => {
    refreshDemo()
  }, [refreshDemo])

  useEffect(() => {
    if (demoMode || !customerWaKey) return undefined
    const unsub = listenTradeinRequestsForWa(customerWaKey, {
      onData: (r) => {
        setListErr('')
        setRows(r)
      },
      onError: (e) => setListErr(e?.message || 'Gagal memuat riwayat'),
    })
    return () => unsub?.()
  }, [demoMode, customerWaKey])

  const canSubmit = useMemo(() => {
    return (
      merkModel.trim().length >= 2 &&
      String(year).trim().length >= 2 &&
      color.trim().length >= 1 &&
      km.trim().length >= 1 &&
      stnkMonth.trim().length >= 2 &&
      expectLowPrice.trim().length >= 1 &&
      newCarModel.trim().length >= 2
    )
  }, [merkModel, year, color, km, stnkMonth, expectLowPrice, newCarModel])

  async function onSubmit(e) {
    e.preventDefault()
    setDoneMsg('')
    if (!canSubmit || !customerWaKey) return
    const payload = {
      customerUid: authUser?.uid || '',
      customerWaKey,
      customerPhone: customerWaKey,
      customerName: customerDisplayName || 'Customer',
      merkModel: merkModel.trim(),
      transmission,
      year: String(year).trim(),
      color: color.trim(),
      km: km.trim(),
      stnkMonth: stnkMonth.trim(),
      bpkbStatus,
      expectLowPrice: expectLowPrice.trim(),
      newCarModel: newCarModel.trim(),
      salesName: salesName.trim() || '',
      carType: `${merkModel.trim()} ${transmission}`.trim(),
    }

    setSubmitting(true)
    try {
      if (demoMode) {
        const id = `demo-${Date.now()}`
        const row = {
          id,
          ...payload,
          adminStage: 'new',
          status: 'new',
          createdAt: new Date().toISOString(),
        }
        const next = [row, ...loadDemoHistory(customerWaKey)]
        saveDemoHistory(customerWaKey, next)
        setRows(next)
        setDoneMsg('Request tersimpan (mode demo).')
      } else if (authUser?.uid) {
        await createTradeinRequest(payload)
        setDoneMsg('Request trade in terkirim.')
      }
      setMerkModel('')
      setYear('')
      setColor('')
      setKm('')
      setStnkMonth('')
      setExpectLowPrice('')
      setNewCarModel('')
      setSalesName('')
      setTransmission('Matic')
      setBpkbStatus('Tersedia')
    } catch (err) {
      setDoneMsg(err?.message || 'Gagal mengirim. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  async function onRequestInspection(row) {
    if (!row?.id) return
    setDoneMsg('')
    setRequestingId(row.id)
    try {
      if (demoMode) {
        const current = loadDemoHistory(customerWaKey)
        const next = current.map((r) =>
          r.id === row.id
            ? {
                ...r,
                adminStage: 'contacted',
                status: 'contacted',
                customerRequestedInspectionAt: new Date().toISOString(),
              }
            : r,
        )
        saveDemoHistory(customerWaKey, next)
        setRows(next)
        setDoneMsg('Request inspeksi terkirim ke admin.')
      } else {
        await customerRequestInspection(row.id)
        setDoneMsg('Request inspeksi terkirim ke admin.')
      }
    } catch (err) {
      setDoneMsg(err?.message || 'Gagal mengirim request inspeksi.')
    } finally {
      setRequestingId('')
    }
  }

  return (
    <div className="page">
      <h1 className="h1">Trade In</h1>
      <p className="muted small">Isi data unit yang ingin ditukar tambah.</p>

      {doneMsg ? (
        <div className={`alert ${doneMsg.includes('Gagal') ? 'alert--error' : 'alert--ok'}`} style={{ marginTop: 12 }}>
          {doneMsg}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <form onSubmit={onSubmit} className="form">
          <label className="label" htmlFor="merk">
            Merk / Model
          </label>
          <input
            id="merk"
            className="input"
            placeholder="Rush S GR Sport"
            value={merkModel}
            onChange={(e) => setMerkModel(e.target.value)}
          />

          <label className="label" htmlFor="trans" style={{ marginTop: 10 }}>
            Type / Transmisi
          </label>
          <select
            id="trans"
            className="input"
            value={transmission}
            onChange={(e) => setTransmission(e.target.value)}
          >
            <option value="Manual">Manual</option>
            <option value="Matic">Matic</option>
          </select>

          <label className="label" htmlFor="year" style={{ marginTop: 10 }}>
            Tahun
          </label>
          <input
            id="year"
            className="input"
            placeholder="2020"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, ''))}
          />

          <label className="label" htmlFor="color" style={{ marginTop: 10 }}>
            Warna
          </label>
          <input
            id="color"
            className="input"
            placeholder="Putih"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />

          <label className="label" htmlFor="km" style={{ marginTop: 10 }}>
            KM
          </label>
          <input
            id="km"
            className="input"
            placeholder="45.000 Km"
            value={km}
            onChange={(e) => setKm(e.target.value)}
          />

          <label className="label" htmlFor="stnk" style={{ marginTop: 10 }}>
            STNK bulan
          </label>
          <input
            id="stnk"
            className="input"
            placeholder="April"
            value={stnkMonth}
            onChange={(e) => setStnkMonth(e.target.value)}
          />

          <label className="label" htmlFor="bpkb" style={{ marginTop: 10 }}>
            Status BPKB
          </label>
          <select
            id="bpkb"
            className="input"
            value={bpkbStatus}
            onChange={(e) => setBpkbStatus(e.target.value)}
          >
            <option value="Tersedia">Tersedia</option>
            <option value="Tidak Tersedia">Tidak Tersedia</option>
          </select>

          <label className="label" htmlFor="exp" style={{ marginTop: 10 }}>
            Ekspektasi harga terendah
          </label>
          <input
            id="exp"
            className="input"
            placeholder="Rp (perkiraan)"
            inputMode="decimal"
            value={expectLowPrice}
            onChange={(e) => setExpectLowPrice(e.target.value)}
          />

          <label className="label" htmlFor="newcar" style={{ marginTop: 10 }}>
            Model mobil baru
          </label>
          <input
            id="newcar"
            className="input"
            placeholder="Innova Zenix HEV"
            value={newCarModel}
            onChange={(e) => setNewCarModel(e.target.value)}
          />

          <label className="label" htmlFor="sales" style={{ marginTop: 10 }}>
            Sales <span className="muted small">(opsional)</span>
          </label>
          <input
            id="sales"
            className="input"
            placeholder="Nama sales penanggung jawab"
            value={salesName}
            onChange={(e) => setSalesName(e.target.value)}
            autoComplete="off"
          />

          <button className="btn btn--primary" type="submit" disabled={!canSubmit || submitting} style={{ marginTop: 14 }}>
            {submitting ? 'Mengirim…' : 'Kirim request'}
          </button>
        </form>
      </div>

      <h2 className="h1" style={{ fontSize: 17, marginTop: 22 }}>
        Riwayat request
      </h2>
      {listErr ? <div className="alert alert--error">{listErr}</div> : null}

      <div className="card" style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {['Tanggal', 'Unit', 'Sales', 'Status', 'Harga / proses', 'Aksi'].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: 12 }}>
                    Belum ada request.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const stage = deriveTradeinCustomerStage(r)
                  const canRequestInspection = stage === 'new' && estimatePresent(r)
                  const isRequesting = requestingId === r.id
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {formatTs(r.createdAt)}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {r.merkModel || r.carType || '-'} · {r.transmission || ''} · {r.year || '-'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {String(r.salesName || '').trim() || '—'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {pipelineLabel(r)}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {customerTradeInPriceLabel(r)}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {canRequestInspection ? (
                          <button
                            type="button"
                            className="btn btn--primary"
                            style={{ padding: '6px 10px', fontSize: 12 }}
                            disabled={isRequesting}
                            onClick={() => onRequestInspection(r)}
                          >
                            {isRequesting ? 'Mengirim…' : 'Request Inspeksi'}
                          </button>
                        ) : (
                          <span className="muted" style={{ fontSize: 11 }}>
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
