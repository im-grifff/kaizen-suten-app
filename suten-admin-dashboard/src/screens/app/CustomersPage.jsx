import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { listenTradeinRequests, updateTradeinRequest } from '../../firestore/tradeinRequests.js'
import { normalizePlate } from '../../utils/plateFormat.js'
import { deriveTradeinAdminStage, TRADEIN_STAGE_LABELS } from '../../utils/tradeinStages.js'
import { getInsuranceTypeOptions, INSURANCE_TERM_OPTIONS } from '../../utils/insuranceTypes.js'
import { channelLabel, requestChannel, CHANNEL_OPTIONS, CHANNEL_SECOND } from '../../utils/channel.js'

const TABS = [
  { id: 'all', label: 'All Customer' },
  { id: 'dealing', label: 'Dealing Customer' },
]

function toDigits(raw) {
  return String(raw || '').replace(/\D/g, '')
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

function formatCreated(ts) {
  if (ts?.toDate) return ts.toDate().toLocaleString('id-ID')
  return '-'
}

export function CustomersPage() {
  const { role } = useAuth()
  const isOtoxpert = role === 'otoxpert'
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('all')
  const [savingId, setSavingId] = useState('')
  const [insuranceDraft, setInsuranceDraft] = useState({})

  useEffect(() => {
    const unsub = listenTradeinRequests({
      onData: (r) => {
        setErr('')
        setRows(r)
      },
      onError: (e) => setErr(e?.message || 'Failed to load trade-in customers'),
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    setInsuranceDraft((prev) => {
      const next = { ...prev }
      for (const r of rows) {
        if (next[r.id]) continue
        next[r.id] = {
          insuranceName: String(r.insuranceName || ''),
          insuranceTermYears: r.insuranceTermYears != null ? String(r.insuranceTermYears) : '',
          insuranceType: String(r.insuranceType || ''),
        }
      }
      return next
    })
  }, [rows])

  const filtered = useMemo(() => {
    let list = rows
    if (tab === 'dealing') {
      list = list.filter((r) => deriveTradeinAdminStage(r) === 'dealing')
    }
    if (isOtoxpert) {
      list = list.filter((r) => requestChannel(r) === CHANNEL_SECOND)
    } else if (channelFilter !== 'all') {
      list = list.filter((r) => requestChannel(r) === channelFilter)
    }
    const q = search.trim().toLowerCase()
    if (!q) return list
    const qPlate = normalizePlate(search)
    return list.filter((r) => {
      const hay = [
        r.customerName || '',
        getCustomerPhone(r),
        unitSummary(r),
        r.salesName || '',
        r.newCarModel || '',
      ]
        .join(' ')
        .toLowerCase()
      if (hay.includes(q)) return true
      const plate = normalizePlate(r.plateNumber || r.plateKey || '')
      return Boolean(qPlate) && plate.includes(qPlate)
    })
  }, [rows, tab, channelFilter, search, isOtoxpert])

  async function persistInsurance(id) {
    const draft = insuranceDraft[id]
    if (!draft) return
    setSavingId(id)
    try {
      const termRaw = draft.insuranceTermYears
      const term = termRaw !== '' ? Number(termRaw) : null
      await updateTradeinRequest(id, {
        insuranceName: String(draft.insuranceName || '').trim(),
        insuranceTermYears: term,
        insuranceType: String(draft.insuranceType || '').trim(),
      })
    } finally {
      setSavingId('')
    }
  }

  function onInsuranceTermChange(id, value) {
    setInsuranceDraft((s) => {
      const prev = s[id] || { insuranceName: '', insuranceTermYears: '', insuranceType: '' }
      const opts = getInsuranceTypeOptions(value)
      const nextType = opts.includes(prev.insuranceType) ? prev.insuranceType : ''
      return { ...s, [id]: { ...prev, insuranceTermYears: value, insuranceType: nextType } }
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Customers</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Customer yang telah mengirim request trade-in via SUTEN.
          </div>
        </div>
        <div style={{ width: 320, maxWidth: '100%' }}>
          <input
            className="input"
            placeholder="Cari nama, WA, plat, unit, atau sales…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TABS.map((t) => {
              const count =
                t.id === 'all'
                  ? rows.length
                  : rows.filter((r) => deriveTradeinAdminStage(r) === 'dealing').length
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`btn ${tab === t.id ? 'btnPrimary' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label} ({count})
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>Channel:</span>
            {isOtoxpert ? (
              <span className="btn" style={{ pointerEvents: 'none' }}>OtoXpert</span>
            ) : (
              <select
                className="input"
                style={{ width: 150 }}
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
              >
                <option value="all">Semua</option>
                {CHANNEL_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {[
                  'Created',
                  'Customer',
                  'WA',
                  'Plat',
                  'Unit',
                  'Mobil Baru',
                  'Sales',
                  'Channel',
                  'Stage',
                  ...(tab === 'dealing'
                    ? ['Nama Asuransi', 'Masa Asuransi', 'Jenis Asuransi', '']
                    : []),
                ].map((h) => (
                  <th key={h || 'save'} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td className="muted" style={{ padding: 12 }} colSpan={tab === 'dealing' ? 13 : 9}>
                    Tidak ada customer di tab ini.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const stage = deriveTradeinAdminStage(r)
                  const ins = insuranceDraft[r.id] || {
                    insuranceName: '',
                    insuranceTermYears: '',
                    insuranceType: '',
                  }
                  const typeOptions = getInsuranceTypeOptions(ins.insuranceTermYears)

                  return (
                    <tr key={r.id}>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
                        {formatCreated(r.createdAt)}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {r.customerName || '-'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }} className="mono">
                        {getCustomerPhone(r) || '-'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }} className="mono">
                        {r.plateNumber || normalizePlate(r.plateKey || '') || '-'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {unitSummary(r)}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {r.newCarModel || '-'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {r.salesName || '—'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {channelLabel(requestChannel(r))}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {TRADEIN_STAGE_LABELS[stage] || stage}
                      </td>

                      {tab === 'dealing' && isOtoxpert ? (
                        <>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {ins.insuranceName || '—'}
                          </td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {ins.insuranceTermYears ? `${ins.insuranceTermYears} tahun` : '—'}
                          </td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {ins.insuranceType || '—'}
                          </td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }} />
                        </>
                      ) : tab === 'dealing' ? (
                        <>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <input
                              className="input"
                              style={{ width: 140 }}
                              placeholder="Nama asuransi"
                              value={ins.insuranceName}
                              onChange={(e) =>
                                setInsuranceDraft((s) => ({
                                  ...s,
                                  [r.id]: { ...ins, insuranceName: e.target.value },
                                }))
                              }
                              onBlur={() => persistInsurance(r.id)}
                            />
                          </td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <select
                              className="input"
                              style={{ width: 110 }}
                              value={ins.insuranceTermYears}
                              onChange={(e) => {
                                onInsuranceTermChange(r.id, e.target.value)
                              }}
                              onBlur={() => persistInsurance(r.id)}
                            >
                              <option value="">—</option>
                              {INSURANCE_TERM_OPTIONS.map((y) => (
                                <option key={y} value={String(y)}>
                                  {y} tahun
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <select
                              className="input"
                              style={{ width: 130 }}
                              value={ins.insuranceType}
                              disabled={!ins.insuranceTermYears}
                              onChange={(e) =>
                                setInsuranceDraft((s) => ({
                                  ...s,
                                  [r.id]: { ...ins, insuranceType: e.target.value },
                                }))
                              }
                              onBlur={() => persistInsurance(r.id)}
                            >
                              <option value="">—</option>
                              {typeOptions.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => persistInsurance(r.id)}
                              disabled={savingId === r.id}
                            >
                              {savingId === r.id ? '…' : 'Simpan'}
                            </button>
                          </td>
                        </>
                      ) : null}
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
