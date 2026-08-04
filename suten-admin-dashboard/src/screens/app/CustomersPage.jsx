import { useEffect, useMemo, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../../state/AuthContext.jsx'
import {
  deleteTradeinRequest,
  listenTradeinRequests,
  updateTradeinRequest,
  updateTradeinRequestAdmin,
} from '../../firestore/tradeinRequests.js'
import { normalizePlate } from '../../utils/plateFormat.js'
import { adminStageToStatus, deriveTradeinAdminStage, TRADEIN_STAGE_LABELS } from '../../utils/tradeinStages.js'
import { getInsuranceTypeOptions, INSURANCE_TERM_OPTIONS } from '../../utils/insuranceTypes.js'
import { channelLabel, requestChannel, CHANNEL_OPTIONS, CHANNEL_SECOND } from '../../utils/channel.js'
import { formatThousands } from '../../utils/numberFormat.js'
import { canSearchByWa, shouldHideCustomerWa } from '../../utils/waVisibility.js'

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

function toNumberOrNull(raw) {
  const digits = String(raw ?? '').replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

function toDatetimeLocalValue(ts) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocalValue(v) {
  const s = String(v || '').trim()
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d
}

const EMPTY_EDIT_FORM = {
  createdAt: '',
  adminStage: 'new',
  sourceChannel: '',
  customerName: '',
  customerWaKey: '',
  customerPhone: '',
  plateNumber: '',
  salesName: '',
  merkModel: '',
  transmission: '',
  year: '',
  color: '',
  km: '',
  stnkMonth: '',
  bpkbStatus: 'Tersedia',
  expectLowPrice: '',
  newCarModel: '',
  insuranceName: '',
  insuranceTermYears: '',
  insuranceType: '',
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
  const isRoot = role === 'root'
  // Edit data customer: Root & Supervisor. Hapus tetap root-only (rules Firestore).
  const canEdit = isRoot || role === 'supervisor'
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('all')
  const [savingId, setSavingId] = useState('')
  const [insuranceDraft, setInsuranceDraft] = useState({})

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState('')
  const [editErr, setEditErr] = useState('')
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM)

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
        // Nomor yang disembunyikan tidak boleh bisa dipastikan lewat kotak cari.
        canSearchByWa(role) ? getCustomerPhone(r) : '',
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
  }, [rows, tab, channelFilter, search, isOtoxpert, role])

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

  function openEditor(r) {
    setEditErr('')
    setEditId(r.id)
    setEditForm({
      createdAt: toDatetimeLocalValue(r.createdAt),
      adminStage: deriveTradeinAdminStage(r),
      sourceChannel: requestChannel(r) || '',
      customerName: r.customerName || '',
      customerWaKey: r.customerWaKey || r.customerPhone || '',
      customerPhone: r.customerPhone || r.customerWaKey || '',
      plateNumber: r.plateNumber || normalizePlate(r.plateKey || '') || '',
      salesName: r.salesName || '',
      merkModel: r.merkModel || '',
      transmission: r.transmission || '',
      year: r.year || '',
      color: r.color || '',
      km: formatThousands(r.km || ''),
      stnkMonth: r.stnkMonth || '',
      bpkbStatus: r.bpkbStatus || 'Tersedia',
      expectLowPrice: formatThousands(r.expectLowPrice ?? ''),
      newCarModel: r.newCarModel || '',
      insuranceName: r.insuranceName || '',
      insuranceTermYears: r.insuranceTermYears != null ? String(r.insuranceTermYears) : '',
      insuranceType: r.insuranceType || '',
    })
    setEditOpen(true)
  }

  function closeEditor() {
    setEditErr('')
    setEditOpen(false)
    setEditId('')
  }

  function onEditTermChange(value) {
    setEditForm((s) => {
      const opts = getInsuranceTypeOptions(value)
      const nextType = opts.includes(s.insuranceType) ? s.insuranceType : ''
      return { ...s, insuranceTermYears: value, insuranceType: nextType }
    })
  }

  async function saveEditor() {
    if (!canEdit || !editId) return
    setEditErr('')
    setSavingId(editId)
    try {
      const createdAtDate = fromDatetimeLocalValue(editForm.createdAt)
      const adminStage = editForm.adminStage
      const termRaw = editForm.insuranceTermYears
      const patch = {
        adminStage,
        status: adminStageToStatus(adminStage),
        sourceChannel: editForm.sourceChannel || '',
        customerName: String(editForm.customerName || '').trim(),
        customerWaKey: String(editForm.customerWaKey || editForm.customerPhone || '').trim(),
        customerPhone: String(editForm.customerPhone || editForm.customerWaKey || '').trim(),
        plateNumber: String(editForm.plateNumber || '').trim(),
        salesName: String(editForm.salesName || '').trim(),
        merkModel: String(editForm.merkModel || '').trim(),
        transmission: String(editForm.transmission || '').trim(),
        year: String(editForm.year || '').trim(),
        color: String(editForm.color || '').trim(),
        km: String(editForm.km || '').trim(),
        stnkMonth: String(editForm.stnkMonth || '').trim(),
        bpkbStatus: String(editForm.bpkbStatus || '').trim(),
        expectLowPrice: String(editForm.expectLowPrice || '').trim(),
        newCarModel: String(editForm.newCarModel || '').trim(),
        insuranceName: String(editForm.insuranceName || '').trim(),
        insuranceTermYears: termRaw !== '' ? Number(termRaw) : null,
        insuranceType: String(editForm.insuranceType || '').trim(),
      }
      if (createdAtDate) patch.createdAt = Timestamp.fromDate(createdAtDate)

      await updateTradeinRequestAdmin(editId, patch)
      closeEditor()
    } catch (e) {
      setEditErr(e?.message || 'Gagal menyimpan.')
    } finally {
      setSavingId('')
    }
  }

  async function deleteEditor() {
    if (!isRoot || !editId) return
    const ok = window.confirm('Hapus data customer (request trade-in) ini? Tindakan ini tidak bisa dibatalkan.')
    if (!ok) return
    setEditErr('')
    setSavingId(editId)
    try {
      await deleteTradeinRequest(editId)
      closeEditor()
    } catch (e) {
      setEditErr(e?.message || 'Gagal menghapus.')
    } finally {
      setSavingId('')
    }
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
            placeholder={
              canSearchByWa(role)
                ? 'Cari nama, WA, plat, unit, atau sales…'
                : 'Cari nama, plat, unit, atau sales…'
            }
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
                  ...(canEdit ? ['Edit'] : []),
                ].map((h, i) => (
                  <th key={h || `col-${i}`} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td className="muted" style={{ padding: 12 }} colSpan={(tab === 'dealing' ? 13 : 9) + (canEdit ? 1 : 0)}>
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
                  const hideWa = shouldHideCustomerWa(role, r)

                  return (
                    <tr key={r.id}>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
                        {formatCreated(r.createdAt)}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {r.customerName || '-'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }} className="mono">
                        {hideWa ? (
                          <span className="muted" title="Nomor WA tidak ditampilkan untuk role Anda">
                            ••••••
                          </span>
                        ) : (
                          getCustomerPhone(r) || '-'
                        )}
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

                      {canEdit ? (
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <button type="button" className="btn" onClick={() => openEditor(r)}>
                            Edit
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && editOpen ? (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Customer editor"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditor()
          }}
        >
          <div className="modalCard">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Edit data customer</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              ID: {editId}
            </div>

            {editErr ? (
              <div
                className="card"
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderColor: 'rgba(239, 68, 68, 0.5)',
                  background: 'rgba(239, 68, 68, 0.12)',
                  fontSize: 13,
                }}
              >
                {editErr}
              </div>
            ) : null}

            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>Created</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={editForm.createdAt}
                    onChange={(e) => setEditForm((s) => ({ ...s, createdAt: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>Stage</label>
                  <select
                    className="input"
                    value={editForm.adminStage}
                    onChange={(e) => setEditForm((s) => ({ ...s, adminStage: e.target.value }))}
                  >
                    {['new', 'contacted', 'pre_inspection', 'inspected', 'dealing', 'cancel'].map((s) => (
                      <option key={s} value={s}>
                        {TRADEIN_STAGE_LABELS[s] || s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="muted" style={{ fontSize: 12 }}>Channel</label>
                <select
                  className="input"
                  value={editForm.sourceChannel}
                  onChange={(e) => setEditForm((s) => ({ ...s, sourceChannel: e.target.value }))}
                >
                  <option value="">—</option>
                  {CHANNEL_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>Customer name</label>
                  <input
                    className="input"
                    value={editForm.customerName}
                    onChange={(e) => setEditForm((s) => ({ ...s, customerName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>WA / Phone</label>
                  <input
                    className="input"
                    value={editForm.customerWaKey}
                    onChange={(e) => setEditForm((s) => ({ ...s, customerWaKey: e.target.value, customerPhone: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>Plat nomor</label>
                  <input
                    className="input"
                    value={editForm.plateNumber}
                    onChange={(e) => setEditForm((s) => ({ ...s, plateNumber: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>Sales</label>
                  <input
                    className="input"
                    value={editForm.salesName}
                    onChange={(e) => setEditForm((s) => ({ ...s, salesName: e.target.value }))}
                  />
                </div>
              </div>

              <div className="card" style={{ padding: 12, background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Unit</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Merk / Model</label>
                    <input
                      className="input"
                      value={editForm.merkModel}
                      onChange={(e) => setEditForm((s) => ({ ...s, merkModel: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Transmisi</label>
                    <input
                      className="input"
                      value={editForm.transmission}
                      onChange={(e) => setEditForm((s) => ({ ...s, transmission: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Tahun</label>
                    <input
                      className="input"
                      value={editForm.year}
                      onChange={(e) => setEditForm((s) => ({ ...s, year: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Warna</label>
                    <input
                      className="input"
                      value={editForm.color}
                      onChange={(e) => setEditForm((s) => ({ ...s, color: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>KM</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={editForm.km}
                      onChange={(e) => setEditForm((s) => ({ ...s, km: formatThousands(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>STNK Bulan</label>
                    <input
                      className="input"
                      value={editForm.stnkMonth}
                      onChange={(e) => setEditForm((s) => ({ ...s, stnkMonth: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Status BPKB</label>
                    <input
                      className="input"
                      value={editForm.bpkbStatus}
                      onChange={(e) => setEditForm((s) => ({ ...s, bpkbStatus: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Ekspektasi terendah</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={editForm.expectLowPrice}
                      onChange={(e) => setEditForm((s) => ({ ...s, expectLowPrice: formatThousands(e.target.value) }))}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="muted" style={{ fontSize: 12 }}>Mobil baru diincar</label>
                    <input
                      className="input"
                      value={editForm.newCarModel}
                      onChange={(e) => setEditForm((s) => ({ ...s, newCarModel: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 12, background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Asuransi</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Nama Asuransi</label>
                    <input
                      className="input"
                      value={editForm.insuranceName}
                      onChange={(e) => setEditForm((s) => ({ ...s, insuranceName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Masa Asuransi</label>
                    <select
                      className="input"
                      value={editForm.insuranceTermYears}
                      onChange={(e) => onEditTermChange(e.target.value)}
                    >
                      <option value="">—</option>
                      {INSURANCE_TERM_OPTIONS.map((y) => (
                        <option key={y} value={String(y)}>
                          {y} tahun
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Jenis Asuransi</label>
                    <select
                      className="input"
                      value={editForm.insuranceType}
                      disabled={!editForm.insuranceTermYears}
                      onChange={(e) => setEditForm((s) => ({ ...s, insuranceType: e.target.value }))}
                    >
                      <option value="">—</option>
                      {getInsuranceTypeOptions(editForm.insuranceTermYears).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                <button type="button" className="btn" onClick={closeEditor}>
                  Close
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isRoot ? (
                    <button
                      type="button"
                      className="btn"
                      style={{ borderColor: 'rgba(239, 68, 68, 0.6)', color: 'rgba(239, 68, 68, 0.95)' }}
                      onClick={deleteEditor}
                      disabled={savingId === editId}
                    >
                      Hapus
                    </button>
                  ) : null}
                  <button type="button" className="btn btnPrimary" onClick={saveEditor} disabled={savingId === editId}>
                    Simpan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
