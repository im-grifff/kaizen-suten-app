import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { listenTradeinRequests, updateTradeinRequest } from '../../firestore/tradeinRequests.js'
import { normalizePlate } from '../../utils/plateFormat.js'

const TABS = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'inspected', label: 'Inspected' },
  { id: 'dealing', label: 'Dealing' },
  { id: 'cancel', label: 'Cancel' },
]

function deriveAdminStage(r) {
  if (r.adminStage) return r.adminStage
  if (r.status === 'cancelled' || r.status === 'canceled') return 'cancel'
  if (r.status === 'contacted') return 'contacted'
  return 'new'
}

function toDigits(raw) {
  return String(raw || '').replace(/\D/g, '')
}

function formatIdrCompact(rawDigits) {
  const digits = toDigits(rawDigits)
  if (!digits) return ''
  const n = Number(digits)
  if (!Number.isFinite(n)) return ''
  return new Intl.NumberFormat('id-ID').format(n)
}

function buildWaApiUrl(phone, message) {
  const normalized = toDigits(phone)
  return `https://api.whatsapp.com/send?phone=${encodeURIComponent(normalized)}&text=${encodeURIComponent(message)}`
}

function getCustomerPhone(r) {
  return String(r.customerPhone || r.customerWaKey || '').replace(/\D/g, '')
}

function unitSummary(r) {
  const mm = r.merkModel || r.carType || '-'
  const tr = r.transmission || ''
  const col = r.color || ''
  const yr = r.year || '-'
  return [mm, tr, col, yr].filter(Boolean).join(' · ')
}

export function TradeInRequestsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('new')
  const [estimates, setEstimates] = useState({})
  const [fixedDraft, setFixedDraft] = useState({})
  const [cancelDraft, setCancelDraft] = useState({})
  const [savingId, setSavingId] = useState('')

  useEffect(() => {
    const unsub = listenTradeinRequests({
      onData: (r) => {
        setErr('')
        setRows(r)
      },
      onError: (e) => setErr(e?.message || 'Failed to load requests'),
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    setEstimates((prev) => {
      const next = { ...prev }
      for (const r of rows) {
        if (next[r.id]) continue
        const low = r.estimateLow ?? r.estimasiLow ?? ''
        const high = r.estimateHigh ?? r.estimasiHigh ?? ''
        next[r.id] = { low: String(low || ''), high: String(high || '') }
      }
      return next
    })
    setFixedDraft((prev) => {
      const next = { ...prev }
      for (const r of rows) {
        if (next[r.id] != null) continue
        if (r.fixedPrice != null && Number(r.fixedPrice) > 0) next[r.id] = String(r.fixedPrice)
        else next[r.id] = ''
      }
      return next
    })
    setCancelDraft((prev) => {
      const next = { ...prev }
      for (const r of rows) {
        if (next[r.id] == null) next[r.id] = String(r.cancelReason || '')
      }
      return next
    })
  }, [rows])

  const rowById = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(r.id, r)
    return m
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((r) => deriveAdminStage(r) === tab)
  }, [rows, tab])

  async function persistEstimate(id) {
    const r = rowById.get(id)
    if (!r) return
    const e = estimates[id] || {}
    const lowDigits = toDigits(e.low)
    const highDigits = toDigits(e.high)
    const patch = {
      estimateLow: lowDigits ? Number(lowDigits) : null,
      estimateHigh: highDigits ? Number(highDigits) : null,
    }
    setSavingId(id)
    try {
      await updateTradeinRequest(id, patch)
    } finally {
      setSavingId('')
    }
  }

  async function persistFixed(id) {
    const r = rowById.get(id)
    if (!r) return
    const digits = toDigits(fixedDraft[id] || '')
    const n = digits ? Number(digits) : null
    setSavingId(id)
    try {
      await updateTradeinRequest(id, { fixedPrice: n })
    } finally {
      setSavingId('')
    }
  }

  async function persistCancelReason(id) {
    const reason = String(cancelDraft[id] || '').trim()
    setSavingId(id)
    try {
      await updateTradeinRequest(id, { cancelReason: reason })
    } finally {
      setSavingId('')
    }
  }

  function estimateRangeText(id) {
    const e = estimates[id] || { low: '', high: '' }
    const low = formatIdrCompact(e.low)
    const high = formatIdrCompact(e.high)
    if (low && high) return `Rp${low} - Rp${high}`
    if (low) return `Rp${low}`
    if (high) return `Rp${high}`
    return '-'
  }

  async function chatNew(r) {
    const customerName = r.customerName || 'Customer'
    const phone = getCustomerPhone(r)
    if (!phone) {
      setErr('Nomor WhatsApp customer tidak ada pada request.')
      return
    }
    try {
      await persistEstimate(r.id)
    } catch {
      // ignore
    }
    const range = estimateRangeText(r.id)
    const msg = `Halo ${customerName}, kami dari SUTEN. Kami sudah menerima request inspeksi Trade In untuk ${unitSummary(r)}. Estimasi harga: ${range}. Kapan Anda tersedia untuk inspeksi?`
    window.open(buildWaApiUrl(phone, msg), '_blank', 'noopener,noreferrer')
  }

  async function chatInspected(r) {
    const customerName = r.customerName || 'Customer'
    const phone = getCustomerPhone(r)
    if (!phone) {
      setErr('Nomor WhatsApp customer tidak ada pada request.')
      return
    }
    const mm = r.merkModel || r.carType || '-'
    const tr = r.transmission || '-'
    const col = r.color || '-'
    const yr = r.year || '-'
    const priceTxt = formatIdrCompact(toDigits(fixedDraft[r.id] || '')) || '(isi harga fix di kolom)'
    const msg = `Halo ${customerName}, kami dari SUTEN. Setelah mengevaluasi hasil Inspeksi untuk ${mm} ${tr} ${col} ${yr}, Kami ingin mengajukan harga pengambilan unit di Rp${priceTxt}. Apakah harga tersebut cocok ?`
    try {
      await persistFixed(r.id)
    } catch {
      // ignore
    }
    window.open(buildWaApiUrl(phone, msg), '_blank', 'noopener,noreferrer')
  }

  function chatDealingToSales(r) {
    const raw = window.prompt('Nomor WhatsApp sales (contoh: 62812xxxxxxxx)', '')
    const sales = toDigits(raw || '')
    if (!sales || sales.length < 10) {
      setErr('Nomor sales tidak valid.')
      return
    }
    const lines = [
      `Data customer Trade In (Dealing):`,
      `Nama: ${r.customerName || '-'}`,
      `WA: ${getCustomerPhone(r) || '-'}`,
      `Unit: ${unitSummary(r)}`,
      `KM: ${r.km || '-'}`,
      `STNK: ${r.stnkMonth || '-'}`,
      `BPKB: ${r.bpkbStatus || '-'}`,
      `Ekspektasi terendah: ${r.expectLowPrice || '-'}`,
      `Mobil baru diincar: ${r.newCarModel || '-'}`,
      `Harga fix: ${r.fixedPrice != null ? formatIdrCompact(String(r.fixedPrice)) : '-'}`,
    ]
    const msg = lines.join('\n')
    window.open(buildWaApiUrl(sales, msg), '_blank', 'noopener,noreferrer')
    setErr('')
  }

  async function setStage(id, adminStage, extra = {}) {
    const status =
      adminStage === 'new' ? 'new' : adminStage === 'cancel' ? 'cancelled' : 'contacted'
    setSavingId(id)
    try {
      await updateTradeinRequest(id, {
        adminStage,
        status,
        ...extra,
      })
    } finally {
      setSavingId('')
    }
  }

  function hasEstimate(id) {
    const e = estimates[id] || { low: '', high: '' }
    return toDigits(e.low).length > 0 || toDigits(e.high).length > 0
  }

  return (
    <div>
      <div style={{ fontWeight: 900, fontSize: 18 }}>Trade In Requests</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Kelola pipeline: New → Contacted → Inspected → Dealing / Cancel.
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

      <div className="card" style={{ marginTop: 12, padding: 12 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Signed in as: {user?.email || user?.uid}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn ${tab === t.id ? 'btnPrimary' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label} (
              {rows.filter((r) => deriveAdminStage(r) === t.id).length})
            </button>
          ))}
        </div>

        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {['Created', 'Customer', 'WA', 'Unit', 'Detail', 'Estimasi', 'Harga fix', 'Alasan', 'Aksi'].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted" style={{ padding: 12 }}>
                    Tidak ada data di tab ini.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const e = estimates[r.id] || { low: '', high: '' }
                  const plate = normalizePlate(r.plateNumber || '')
                  const detail = [
                    r.km ? `KM ${r.km}` : '',
                    r.stnkMonth ? `STNK ${r.stnkMonth}` : '',
                    r.bpkbStatus || '',
                    r.expectLowPrice ? `Eks: ${r.expectLowPrice}` : '',
                    r.newCarModel ? `Baru: ${r.newCarModel}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')

                  return (
                    <tr key={r.id}>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
                        {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('id-ID') : '-'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {r.customerName || '-'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }} className="mono">
                        {getCustomerPhone(r) || '-'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {unitSummary(r)}
                        {plate ? <div className="muted">Plat (legacy): {plate}</div> : null}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', maxWidth: 220 }}>
                        {detail || '-'}
                      </td>

                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            className="input"
                            style={{ width: 90 }}
                            placeholder="Min"
                            value={e.low}
                            onChange={(ev) => {
                              const v = ev.target.value
                              setEstimates((s) => ({ ...s, [r.id]: { ...(s[r.id] || {}), low: v } }))
                            }}
                            onBlur={() => persistEstimate(r.id)}
                          />
                          <span className="muted">-</span>
                          <input
                            className="input"
                            style={{ width: 90 }}
                            placeholder="Max"
                            value={e.high}
                            onChange={(ev) => {
                              const v = ev.target.value
                              setEstimates((s) => ({ ...s, [r.id]: { ...(s[r.id] || {}), high: v } }))
                            }}
                            onBlur={() => persistEstimate(r.id)}
                          />
                          {savingId === r.id ? <span className="muted">…</span> : null}
                        </div>
                      </td>

                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {tab === 'dealing' ? (
                          <strong>
                            {r.fixedPrice != null ? `Rp${formatIdrCompact(String(r.fixedPrice))}` : '-'}
                          </strong>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              className="input"
                              style={{ width: 100 }}
                              placeholder="Rp fix"
                              value={fixedDraft[r.id] ?? ''}
                              onChange={(ev) =>
                                setFixedDraft((s) => ({ ...s, [r.id]: ev.target.value }))
                              }
                            />
                            <button type="button" className="btn" onClick={() => persistFixed(r.id)}>
                              Simpan
                            </button>
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <textarea
                          className="input"
                          style={{ width: 160, minHeight: 48, resize: 'vertical' }}
                          placeholder="Alasan batal"
                          value={cancelDraft[r.id] ?? ''}
                          onChange={(ev) =>
                            setCancelDraft((s) => ({ ...s, [r.id]: ev.target.value }))
                          }
                        />
                        <button type="button" className="btn" style={{ marginTop: 4 }} onClick={() => persistCancelReason(r.id)}>
                          Simpan alasan
                        </button>
                      </td>

                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                          {tab === 'new' ? (
                            <>
                              <button type="button" className="btn btnPrimary" onClick={() => chatNew(r)}>
                                Chat WhatsApp
                              </button>
                              <button
                                type="button"
                                className="btn"
                                disabled={!hasEstimate(r.id)}
                                onClick={() => setStage(r.id, 'contacted')}
                              >
                                Pindah ke Contacted
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setStage(r.id, 'cancel', {
                                    cancelReason: cancelDraft[r.id] || 'Dibatalkan',
                                  })
                                }
                              >
                                Batalkan
                              </button>
                            </>
                          ) : null}
                          {tab === 'contacted' ? (
                            <>
                              <button type="button" className="btn btnPrimary" onClick={() => chatNew(r)}>
                                Chat WhatsApp
                              </button>
                              <button type="button" className="btn" onClick={() => setStage(r.id, 'inspected')}>
                                Pindah ke Inspected
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setStage(r.id, 'cancel', {
                                    cancelReason: cancelDraft[r.id] || 'Dibatalkan',
                                  })
                                }
                              >
                                Batalkan
                              </button>
                            </>
                          ) : null}
                          {tab === 'inspected' ? (
                            <>
                              <button type="button" className="btn btnPrimary" onClick={() => chatInspected(r)}>
                                Chat WhatsApp
                              </button>
                              <button
                                type="button"
                                className="btn"
                                disabled={!toDigits(fixedDraft[r.id] || '').length}
                                onClick={() => setStage(r.id, 'dealing')}
                              >
                                Pindah ke Dealing
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setStage(r.id, 'cancel', {
                                    cancelReason: cancelDraft[r.id] || 'Dibatalkan',
                                  })
                                }
                              >
                                Batalkan
                              </button>
                            </>
                          ) : null}
                          {tab === 'dealing' ? (
                            <button type="button" className="btn btnPrimary" onClick={() => chatDealingToSales(r)}>
                              WA ke sales
                            </button>
                          ) : null}
                        </div>
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
