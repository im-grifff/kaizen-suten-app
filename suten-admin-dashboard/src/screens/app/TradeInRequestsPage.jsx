import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { deleteTradeinRequest, listenTradeinRequests, updateTradeinRequest, updateTradeinRequestAdmin } from '../../firestore/tradeinRequests.js'
import { normalizePlate } from '../../utils/plateFormat.js'
import {
  adminStageToStatus,
  deriveTradeinAdminStage,
  TRADEIN_STAGE_LABELS,
  TRADEIN_TABS,
} from '../../utils/tradeinStages.js'
import { channelLabel, requestChannel, CHANNEL_OPTIONS, CHANNEL_SECOND } from '../../utils/channel.js'
import { canSearchByWa, shouldHideCustomerWa } from '../../utils/waVisibility.js'
import { DateRangeFilter } from '../../components/DateRangeFilter.jsx'
import { inDateRange, rangeSlug } from '../../utils/dateRange.js'
import { formatThousands } from '../../utils/numberFormat.js'
import { Timestamp } from 'firebase/firestore'
import { AppraisalResultModal } from '../../components/AppraisalResultModal.jsx'
import { ReAppraisalModal } from '../../components/ReAppraisalModal.jsx'
import { WaSalesModal } from '../../components/WaSalesModal.jsx'
import { canReAppraise } from '../../lib/reAppraisal.js'

const TABS = TRADEIN_TABS

/** True jika request punya data hasil taksasi (Pre-Appraisal AI dari app customer). */
function hasAppraisal(r) {
  return Boolean(r?.rekomendasi_ai || r?.componentBreakdown || r?.categoryScores || r?.kelas_final)
}
const STAGE_LABELS = TRADEIN_STAGE_LABELS

function deriveAdminStage(r) {
  return deriveTradeinAdminStage(r)
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

/**
 * Kapan customer menekan "Minta Pemeriksaan Fisik".
 * Nilainya bisa Timestamp Firestore (produksi) atau string ISO (data demo/lama).
 */
function formatRequestedInspection(r) {
  const v = r?.customerRequestedInspectionAt
  if (!v) return ''
  const d = v?.toDate ? v.toDate() : new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('id-ID')
}

function unitSummary(r) {
  const mm = r.merkModel || r.carType || '-'
  const tr = r.transmission || ''
  const col = r.color || ''
  const yr = r.year || '-'
  return [mm, tr, col, yr].filter(Boolean).join(' · ')
}

function rowSalesName(r) {
  return String(r.salesName || '').trim()
}

function matchesSearch(r, q, waSearchable = true) {
  if (!q) return true
  const hay = [
    r.customerName || '',
    // Nomor WA hanya ikut dicari kalau penontonnya memang boleh melihatnya.
    waSearchable ? getCustomerPhone(r) : '',
    r.plateNumber || normalizePlate(r.plateKey || ''),
    unitSummary(r),
    rowSalesName(r),
  ]
    .join(' ')
    .toLowerCase()
  if (hay.includes(q)) return true
  const plate = normalizePlate(r.plateNumber || r.plateKey || '')
  const qPlate = normalizePlate(q)
  return Boolean(qPlate) && plate.includes(qPlate)
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

export function TradeInRequestsPage() {
  const { user, role } = useAuth()
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('new')
  const [channelFilter, setChannelFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [estimates, setEstimates] = useState({})
  const [notesDraft, setNotesDraft] = useState({})
  const [fixedDraft, setFixedDraft] = useState({})
  const [cancelDraft, setCancelDraft] = useState({})
  const [savingId, setSavingId] = useState('')
  const isRoot = role === 'root'
  const isOtoxpert = role === 'otoxpert'
  // Root & Supervisor: boleh edit request + WA ke sales.
  // Hapus tetap root-only (rules Firestore: delete tradein_requests hanya root).
  const isRootOrSupervisor = isRoot || role === 'supervisor'
  // SA (Sales Advisor): akses baca + Re-Appraisal saja, tanpa aksi pipeline.
  const isSa = role === 'sa'

  const [appraisalRow, setAppraisalRow] = useState(null)
  const [reapprRow, setReapprRow] = useState(null)
  const [waSalesRow, setWaSalesRow] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState('')
  const [editErr, setEditErr] = useState('')
  const [editForm, setEditForm] = useState({
    createdAt: '',
    adminStage: 'new',
    sourceChannel: '',
    customerName: '',
    customerPhone: '',
    customerWaKey: '',
    plateNumber: '',
    merkModel: '',
    transmission: '',
    year: '',
    color: '',
    km: '',
    stnkMonth: '',
    bpkbStatus: 'Tersedia',
    expectLowPrice: '',
    newCarModel: '',
    salesName: '',
    estimateLow: '',
    estimateHigh: '',
    estimateNotes: '',
    fixedPrice: '',
    cancelReason: '',
  })

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
        next[r.id] = { low: formatThousands(low), high: formatThousands(high) }
      }
      return next
    })
    setNotesDraft((prev) => {
      const next = { ...prev }
      for (const r of rows) {
        if (next[r.id] != null) continue
        next[r.id] = String(r.estimateNotes || '')
      }
      return next
    })
    setFixedDraft((prev) => {
      const next = { ...prev }
      for (const r of rows) {
        if (next[r.id] != null) continue
        if (r.fixedPrice != null && Number(r.fixedPrice) > 0) next[r.id] = formatThousands(r.fixedPrice)
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
    let list = tab === 'all' ? rows : rows.filter((r) => deriveAdminStage(r) === tab)
    if (isOtoxpert) {
      list = list.filter((r) => requestChannel(r) === CHANNEL_SECOND)
    } else if (channelFilter !== 'all') {
      list = list.filter((r) => requestChannel(r) === channelFilter)
    }
    if (dateFrom || dateTo) {
      list = list.filter((r) => inDateRange(r.createdAt, dateFrom, dateTo))
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => matchesSearch(r, q, canSearchByWa(role)))
    }
    return list
  }, [rows, tab, channelFilter, search, isOtoxpert, role, dateFrom, dateTo])

  /** Kolom harga fix + alasan hanya dari tab Inspected ke bawah, atau tab All (read-only). */
  const showFixAndReason =
    tab === 'inspected' || tab === 'dealing' || tab === 'cancel' || tab === 'all'
  // SA hanya boleh Re-Appraisal — estimasi/harga fix tetap milik tim pipeline.
  const estimateEditable = tab === 'new' && !isOtoxpert && !isSa
  const isAllTab = tab === 'all'

  const isTradeInOnly = role === 'tradein'

  function tradeinHidesPipelineActions(r) {
    return isTradeInOnly && rowSalesName(r).length > 0
  }

  /** Lihat src/utils/waVisibility.js untuk aturan lengkapnya. */
  function shouldHideCustomerWaForViewer(r) {
    return shouldHideCustomerWa(role, r)
  }

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

  async function persistNotes(id) {
    const notes = String(notesDraft[id] || '')
    setSavingId(id)
    try {
      await updateTradeinRequest(id, { estimateNotes: notes })
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

  function buildExcelRow(r, i) {
    return {
      No: i + 1,
      Created: r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('id-ID') : '',
      Stage: STAGE_LABELS[deriveAdminStage(r)] || deriveAdminStage(r),
      Customer: r.customerName || '',
      Channel: channelLabel(requestChannel(r)),
      WA: shouldHideCustomerWaForViewer(r) ? '' : getCustomerPhone(r) || '',
      'Plat Nomor': r.plateNumber || normalizePlate(r.plateKey || '') || '',
      'Merk / Model': r.merkModel || r.carType || '',
      Transmisi: r.transmission || '',
      Tahun: r.year || '',
      Warna: r.color || '',
      KM: r.km || '',
      'STNK Bulan': r.stnkMonth || '',
      'Status BPKB': r.bpkbStatus || '',
      'Ekspektasi Terendah': r.expectLowPrice || '',
      'Mobil Baru': r.newCarModel || '',
      Sales: rowSalesName(r),
      'Estimasi Min': r.estimateLow != null ? Number(r.estimateLow) : '',
      'Estimasi Max': r.estimateHigh != null ? Number(r.estimateHigh) : '',
      'Keterangan Estimasi': r.estimateNotes || '',
      'PIC Sales': r.picSalesName || '',
      'WA PIC Sales': r.picSalesPhone || '',
      'Harga Fix': r.fixedPrice != null ? Number(r.fixedPrice) : '',
      'Alasan Batal': r.cancelReason || '',
      'Minta Inspeksi': formatRequestedInspection(r) || '',
    }
  }

  /** Export mengikuti persis apa yang sedang tampil (tab + channel + tanggal + pencarian). */
  function exportToExcel() {
    if (!filtered.length) return
    const data = filtered.map(buildExcelRow)
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    const sheetName = `Trade-In ${TABS.find((t) => t.id === tab)?.label || tab}`.slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    const stamp = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `tradein-${tab}-${rangeSlug(dateFrom, dateTo)}-${stamp}.xlsx`)
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

  /**
   * Root / Supervisor: hubungi sales internal.
   *
   * Dulu nomornya diminta lewat `window.prompt` yang hanya muat satu isian,
   * jadi nama PIC sales tidak pernah bisa ikut dicatat. Sekarang lewat modal
   * dua field, dan nama PIC-nya disimpan ke request supaya tetap terlihat di
   * tab berikutnya.
   */
  async function submitWaSales({ picSalesName, picSalesPhone }) {
    const r = waSalesRow
    if (!r) return

    const salesFromCustomer = rowSalesName(r)
    const stageLabel = STAGE_LABELS[tab] || tab
    const lines = [
      `Halo ${picSalesName},`,
      '',
      `Info trade-in — tab admin: ${stageLabel}`,
      `Customer: ${r.customerName || '-'}`,
      `WA customer: ${getCustomerPhone(r) || '-'}`,
      `Sales (diisi customer): ${salesFromCustomer || '-'}`,
      `Unit: ${unitSummary(r)}`,
      `Estimasi (min–max): ${estimateRangeText(r.id)}`,
    ]

    // Buka WhatsApp DULU, baru simpan. Kalau `window.open` dipanggil setelah
    // `await`, browser sudah kehilangan konteks klik user dan tab-nya bisa
    // diblokir sebagai popup — terutama saat koneksi lambat.
    window.open(buildWaApiUrl(picSalesPhone, lines.join('\n')), '_blank', 'noopener,noreferrer')

    // Kalau penyimpanan gagal, error dilempar ke modal supaya tetap terbuka dan
    // admin bisa mencoba lagi — WhatsApp-nya sendiri sudah terlanjur terbuka.
    await updateTradeinRequest(r.id, { picSalesName, picSalesPhone })

    setErr('')
    setWaSalesRow(null)
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

  function openEditor(r) {
    setEditErr('')
    setEditId(r.id)
    setEditForm({
      createdAt: toDatetimeLocalValue(r.createdAt),
      adminStage: deriveAdminStage(r),
      sourceChannel: requestChannel(r) || '',
      customerName: r.customerName || '',
      customerPhone: r.customerPhone || '',
      customerWaKey: r.customerWaKey || '',
      plateNumber: r.plateNumber || normalizePlate(r.plateKey || '') || '',
      merkModel: r.merkModel || '',
      transmission: r.transmission || '',
      year: r.year || '',
      color: r.color || '',
      km: formatThousands(r.km || ''),
      stnkMonth: r.stnkMonth || '',
      bpkbStatus: r.bpkbStatus || 'Tersedia',
      expectLowPrice: formatThousands(r.expectLowPrice ?? ''),
      newCarModel: r.newCarModel || '',
      salesName: r.salesName || '',
      estimateLow: formatThousands(r.estimateLow ?? ''),
      estimateHigh: formatThousands(r.estimateHigh ?? ''),
      estimateNotes: r.estimateNotes || '',
      fixedPrice: formatThousands(r.fixedPrice ?? ''),
      cancelReason: r.cancelReason || '',
    })
    setEditOpen(true)
  }

  async function saveEditor() {
    if (!isRootOrSupervisor || !editId) return
    setEditErr('')
    setSavingId(editId)
    try {
      const createdAtDate = fromDatetimeLocalValue(editForm.createdAt)
      const adminStage = editForm.adminStage
      const patch = {
        adminStage,
        status: adminStageToStatus(adminStage),
        sourceChannel: editForm.sourceChannel || '',
        customerName: String(editForm.customerName || '').trim(),
        customerPhone: String(editForm.customerPhone || editForm.customerWaKey || '').trim(),
        customerWaKey: String(editForm.customerWaKey || editForm.customerPhone || '').trim(),
        plateNumber: String(editForm.plateNumber || '').trim(),
        merkModel: String(editForm.merkModel || '').trim(),
        transmission: String(editForm.transmission || '').trim(),
        year: String(editForm.year || '').trim(),
        color: String(editForm.color || '').trim(),
        km: String(editForm.km || '').trim(),
        stnkMonth: String(editForm.stnkMonth || '').trim(),
        bpkbStatus: String(editForm.bpkbStatus || '').trim(),
        expectLowPrice: String(editForm.expectLowPrice || '').trim(),
        newCarModel: String(editForm.newCarModel || '').trim(),
        salesName: String(editForm.salesName || '').trim(),
        estimateLow: toNumberOrNull(editForm.estimateLow),
        estimateHigh: toNumberOrNull(editForm.estimateHigh),
        estimateNotes: String(editForm.estimateNotes || '').trim(),
        fixedPrice: toNumberOrNull(editForm.fixedPrice),
        cancelReason: String(editForm.cancelReason || '').trim(),
      }
      if (createdAtDate) patch.createdAt = Timestamp.fromDate(createdAtDate)

      await updateTradeinRequestAdmin(editId, patch)
      setEditOpen(false)
      setEditId('')
    } catch (e) {
      setEditErr(e?.message || 'Gagal menyimpan.')
    } finally {
      setSavingId('')
    }
  }

  async function deleteEditor() {
    if (!isRoot || !editId) return
    const ok = window.confirm('Hapus data request trade-in ini? Tindakan ini tidak bisa dibatalkan.')
    if (!ok) return
    setEditErr('')
    setSavingId(editId)
    try {
      await deleteTradeinRequest(editId)
      setEditOpen(false)
      setEditId('')
    } catch (e) {
      setEditErr(e?.message || 'Gagal menghapus.')
    } finally {
      setSavingId('')
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 900, fontSize: 18 }}>Trade In Requests</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Kelola pipeline: New → Contacted → Pre Inspection → Inspected → Dealing / Cancel.
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

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TABS.map((t) => {
              const count = t.id === 'all' ? rows.length : rows.filter((r) => deriveAdminStage(r) === t.id).length
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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

        <div style={{ marginTop: 10 }}>
          <input
            className="input"
            style={{ width: 360, maxWidth: '100%' }}
            placeholder={
              canSearchByWa(role)
                ? 'Cari customer, WA, plat, unit, atau sales…'
                : 'Cari customer, plat, unit, atau sales…'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <DateRangeFilter
          from={dateFrom}
          to={dateTo}
          onChange={({ from, to }) => {
            setDateFrom(from)
            setDateTo(to)
          }}
          count={filtered.length}
          onExport={exportToExcel}
          exportDisabled={!filtered.length}
        />

        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {[
                  'No.',
                  'Created',
                  'Customer',
                  'WA',
                  'Plat',
                  'Unit',
                  'Detail',
                  'Sales',
                  'Channel',
                  ...(isAllTab ? ['Stage'] : []),
                  'Estimasi',
                  ...(showFixAndReason ? ['Harga fix', 'Alasan'] : []),
                  ...(isRootOrSupervisor ? ['Edit'] : []),
                  ...(!isAllTab && !isOtoxpert ? ['Aksi'] : []),
                ].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      10 +
                      (showFixAndReason ? 2 : 0) +
                      (isAllTab ? 1 : 0) +
                      (isRootOrSupervisor ? 1 : 0) +
                      (!isAllTab && !isOtoxpert ? 1 : 0)
                    }
                    className="muted"
                    style={{ padding: 12 }}
                  >
                    Tidak ada data di tab ini.
                  </td>
                </tr>
              ) : (
                filtered.map((r, rowIdx) => {
                  const e = estimates[r.id] || { low: '', high: '' }
                  const plateRaw = r.plateNumber || normalizePlate(r.plateKey || '') || ''
                  const detail = [
                    r.km ? `KM ${r.km}` : '',
                    r.stnkMonth ? `STNK ${r.stnkMonth}` : '',
                    r.bpkbStatus || '',
                    r.expectLowPrice ? `Eks: ${r.expectLowPrice}` : '',
                    r.newCarModel ? `Baru: ${r.newCarModel}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')

                  const stageOfRow = deriveAdminStage(r)
                  const hideWa = shouldHideCustomerWaForViewer(r)

                  return (
                    <tr key={r.id}>
                      <td
                        className="muted"
                        style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}
                      >
                        {rowIdx + 1}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
                        {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('id-ID') : '-'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {r.customerName || '-'}
                        {r.customerRequestedInspectionAt ? (
                          <div
                            title={`Customer meminta pemeriksaan fisik pada ${formatRequestedInspection(r)}`}
                            style={{
                              marginTop: 4,
                              display: 'inline-block',
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 999,
                              whiteSpace: 'nowrap',
                              color: '#bae6fd',
                              background: 'rgba(56, 189, 248, 0.14)',
                              border: '1px solid rgba(56, 189, 248, 0.45)',
                            }}
                          >
                            🎯 Minta inspeksi
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }} className="mono">
                        {hideWa ? (
                          <span className="muted" title="Disembunyikan: customer mencantumkan sales">
                            Tersembunyi
                          </span>
                        ) : (
                          getCustomerPhone(r) || '-'
                        )}
                      </td>
                      <td
                        className="mono"
                        style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}
                      >
                        {plateRaw || '-'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {unitSummary(r)}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', maxWidth: 220 }}>
                        {detail || '-'}
                      </td>

                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {rowSalesName(r) || '—'}
                      </td>

                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {channelLabel(requestChannel(r))}
                      </td>

                      {isAllTab ? (
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {STAGE_LABELS[stageOfRow] || stageOfRow}
                        </td>
                      ) : null}

                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {hasAppraisal(r) ? (
                            <div
                              style={{
                                fontSize: 11,
                                lineHeight: 1.35,
                                padding: '6px 8px',
                                borderRadius: 8,
                                background: 'rgba(56,189,248,0.10)',
                                border: '1px solid rgba(56,189,248,0.30)',
                              }}
                            >
                              <div style={{ fontWeight: 800, color: '#38bdf8', marginBottom: 2 }}>
                                Taksasi AI{r.kelas_final ? ` · Grade ${r.kelas_final}` : ''}
                              </div>
                              <div>
                                Rp {formatThousands(r.harga_min ?? '')} – Rp {formatThousands(r.harga_max ?? '')}
                              </div>
                              {r.midpoint ? (
                                <div style={{ color: '#94a3b8' }}>Titik tengah: Rp {formatThousands(r.midpoint)}</div>
                              ) : null}
                            </div>
                          ) : null}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              className="input"
                              style={{
                                width: 90,
                                opacity: estimateEditable ? 1 : 0.75,
                                cursor: estimateEditable ? undefined : 'not-allowed',
                              }}
                              placeholder="Min"
                              readOnly={!estimateEditable}
                              value={e.low}
                              onChange={
                                estimateEditable
                                  ? (ev) => {
                                      const v = formatThousands(ev.target.value)
                                      setEstimates((s) => ({ ...s, [r.id]: { ...(s[r.id] || {}), low: v } }))
                                    }
                                  : undefined
                              }
                              onBlur={estimateEditable ? () => persistEstimate(r.id) : undefined}
                            />
                            <span className="muted">-</span>
                            <input
                              className="input"
                              style={{
                                width: 90,
                                opacity: estimateEditable ? 1 : 0.75,
                                cursor: estimateEditable ? undefined : 'not-allowed',
                              }}
                              placeholder="Max"
                              readOnly={!estimateEditable}
                              value={e.high}
                              onChange={
                                estimateEditable
                                  ? (ev) => {
                                      const v = formatThousands(ev.target.value)
                                      setEstimates((s) => ({ ...s, [r.id]: { ...(s[r.id] || {}), high: v } }))
                                    }
                                  : undefined
                              }
                              onBlur={estimateEditable ? () => persistEstimate(r.id) : undefined}
                            />
                            {!estimateEditable ? (
                              <span className="muted" style={{ fontSize: 10 }}>
                                (kunci)
                              </span>
                            ) : null}
                            {savingId === r.id ? <span className="muted">…</span> : null}
                          </div>
                          {isAllTab ? (
                            <span className="muted" style={{ fontSize: 11, whiteSpace: 'pre-wrap', maxWidth: 220 }}>
                              {String(r.estimateNotes || '').trim() || '—'}
                            </span>
                          ) : (
                            <textarea
                              className="input"
                              style={{
                                width: 200,
                                minHeight: 40,
                                resize: 'vertical',
                                opacity: estimateEditable ? 1 : 0.75,
                                cursor: estimateEditable ? undefined : 'not-allowed',
                              }}
                              placeholder="Keterangan"
                              readOnly={!estimateEditable}
                              value={notesDraft[r.id] ?? ''}
                              onChange={
                                estimateEditable
                                  ? (ev) =>
                                      setNotesDraft((s) => ({ ...s, [r.id]: ev.target.value }))
                                  : undefined
                              }
                              onBlur={estimateEditable ? () => persistNotes(r.id) : undefined}
                            />
                          )}
                          {/* PIC sales yang diisi saat menekan "WA ke sales" di tab
                              sebelumnya — ditaruh di bawah Keterangan agar terbawa
                              terlihat pada tab-tab berikutnya. */}
                          {r.picSalesName ? (
                            <div
                              title={
                                r.picSalesPhone
                                  ? `PIC sales: ${r.picSalesName} · ${r.picSalesPhone}`
                                  : `PIC sales: ${r.picSalesName}`
                              }
                              style={{
                                marginTop: 2,
                                fontSize: 11,
                                maxWidth: 200,
                                color: '#bae6fd',
                              }}
                            >
                              <span className="muted">PIC sales:</span>{' '}
                              <strong>{r.picSalesName}</strong>
                            </div>
                          ) : null}
                        </div>
                      </td>

                      {showFixAndReason ? (
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {tab === 'dealing' || tab === 'cancel' || isAllTab || isOtoxpert || isSa ? (
                            <strong>
                              {r.fixedPrice != null && Number(r.fixedPrice) > 0
                                ? `Rp${formatIdrCompact(String(r.fixedPrice))}`
                                : '-'}
                            </strong>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <input
                                className="input"
                                style={{ width: 100 }}
                                placeholder="Rp fix"
                                value={fixedDraft[r.id] ?? ''}
                                onChange={(ev) =>
                                  setFixedDraft((s) => ({ ...s, [r.id]: formatThousands(ev.target.value) }))
                                }
                              />
                              <button type="button" className="btn" onClick={() => persistFixed(r.id)}>
                                Simpan
                              </button>
                            </div>
                          )}
                        </td>
                      ) : null}

                      {showFixAndReason ? (
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {isAllTab || isOtoxpert || isSa ? (
                            <span className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                              {String(r.cancelReason || '').trim() || '—'}
                            </span>
                          ) : (
                            <>
                              <textarea
                                className="input"
                                style={{ width: 160, minHeight: 48, resize: 'vertical' }}
                                placeholder="Alasan batal"
                                readOnly={tab === 'dealing'}
                                value={cancelDraft[r.id] ?? ''}
                                onChange={
                                  tab !== 'dealing'
                                    ? (ev) =>
                                        setCancelDraft((s) => ({ ...s, [r.id]: ev.target.value }))
                                    : undefined
                                }
                              />
                              {tab !== 'dealing' ? (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ marginTop: 4 }}
                                  onClick={() => persistCancelReason(r.id)}
                                >
                                  Simpan alasan
                                </button>
                              ) : null}
                            </>
                          )}
                        </td>
                      ) : null}

                      {isRootOrSupervisor ? (
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <button type="button" className="btn" onClick={() => openEditor(r)}>
                            Edit
                          </button>
                        </td>
                      ) : null}

                      {!isAllTab && !isOtoxpert ? (
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                          {hasAppraisal(r) ? (
                            <button type="button" className="btn btnPrimary" onClick={() => setAppraisalRow(r)}>
                              Hasil Taksasi
                            </button>
                          ) : null}
                          {canReAppraise(role, stageOfRow) ? (
                            <button
                              type="button"
                              className="btn"
                              title="Hitung ulang taksasi dan ganti hasil yang dilihat customer"
                              onClick={() => setReapprRow(r)}
                            >
                              🔄 Re-Appraisal
                              {Number(r.reappraisalCount) > 0 ? ` (${r.reappraisalCount}×)` : ''}
                            </button>
                          ) : null}
                          {tab === 'new' ? (
                            <>
                              {isRootOrSupervisor ? (
                                <button type="button" className="btn" onClick={() => setWaSalesRow(r)}>
                                  WA ke sales
                                </button>
                              ) : null}
                              {!tradeinHidesPipelineActions(r) && !isSa ? (
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
                                    onClick={() => {
                                      const reason =
                                        window.prompt('Alasan pembatalan:', '')?.trim() || 'Dibatalkan'
                                      void setStage(r.id, 'cancel', { cancelReason: reason })
                                    }}
                                  >
                                    Batalkan
                                  </button>
                                </>
                              ) : (
                                <span className="muted" style={{ fontSize: 11 }}>
                                  Hanya isi estimasi/harga
                                </span>
                              )}
                            </>
                          ) : null}
                          {tab === 'contacted' ? (
                            <>
                              {isRootOrSupervisor ? (
                                <button type="button" className="btn" onClick={() => setWaSalesRow(r)}>
                                  WA ke sales
                                </button>
                              ) : null}
                              {!tradeinHidesPipelineActions(r) && !isSa ? (
                                <>
                                  <button type="button" className="btn btnPrimary" onClick={() => chatNew(r)}>
                                    Chat WhatsApp
                                  </button>
                                  <button type="button" className="btn" onClick={() => setStage(r.id, 'pre_inspection')}>
                                    Pindah ke Pre Inspection
                                  </button>
                                  <button
                                    type="button"
                                    className="btn"
                                    onClick={() => {
                                      const reason =
                                        window.prompt('Alasan pembatalan:', '')?.trim() || 'Dibatalkan'
                                      void setStage(r.id, 'cancel', { cancelReason: reason })
                                    }}
                                  >
                                    Batalkan
                                  </button>
                                </>
                              ) : (
                                <span className="muted" style={{ fontSize: 11 }}>
                                  Hanya isi estimasi/harga
                                </span>
                              )}
                            </>
                          ) : null}
                          {tab === 'pre_inspection' ? (
                            <>
                              {isRootOrSupervisor ? (
                                <button type="button" className="btn" onClick={() => setWaSalesRow(r)}>
                                  WA ke sales
                                </button>
                              ) : null}
                              {!tradeinHidesPipelineActions(r) && !isSa ? (
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
                                    onClick={() => {
                                      const reason =
                                        window.prompt('Alasan pembatalan:', '')?.trim() || 'Dibatalkan'
                                      void setStage(r.id, 'cancel', { cancelReason: reason })
                                    }}
                                  >
                                    Batalkan
                                  </button>
                                </>
                              ) : (
                                <span className="muted" style={{ fontSize: 11 }}>
                                  Hanya isi estimasi/harga
                                </span>
                              )}
                            </>
                          ) : null}
                          {tab === 'inspected' ? (
                            <>
                              {isRootOrSupervisor ? (
                                <button type="button" className="btn" onClick={() => setWaSalesRow(r)}>
                                  WA ke sales
                                </button>
                              ) : null}
                              {!tradeinHidesPipelineActions(r) && !isSa ? (
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
                              ) : (
                                <span className="muted" style={{ fontSize: 11 }}>
                                  Hanya isi estimasi/harga
                                </span>
                              )}
                            </>
                          ) : null}
                          {tab === 'dealing' && !isSa ? (
                            <button type="button" className="btn btnPrimary" onClick={() => chatDealingToSales(r)}>
                              WA ke sales
                            </button>
                          ) : null}
                        </div>
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

      {appraisalRow ? (
        <AppraisalResultModal result={appraisalRow} onClose={() => setAppraisalRow(null)} />
      ) : null}

      {waSalesRow ? (
        <WaSalesModal
          row={waSalesRow}
          onClose={() => setWaSalesRow(null)}
          onSubmit={submitWaSales}
        />
      ) : null}

      {reapprRow ? (
        <ReAppraisalModal
          row={reapprRow}
          actor={{ email: user?.email || '', role }}
          onClose={() => setReapprRow(null)}
          onSave={(patch) => updateTradeinRequest(reapprRow.id, patch)}
        />
      ) : null}

      {isRootOrSupervisor && editOpen ? (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Trade-in editor"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditErr('')
              setEditOpen(false)
              setEditId('')
            }
          }}
        >
          <div className="modalCard" style={{ width: 'min(100%, 860px)' }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Edit trade-in request</div>
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
                  <label className="muted" style={{ fontSize: 12 }}>
                    Created
                  </label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={editForm.createdAt}
                    onChange={(e) => setEditForm((s) => ({ ...s, createdAt: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>
                    Stage
                  </label>
                  <select
                    className="input"
                    value={editForm.adminStage}
                    onChange={(e) => setEditForm((s) => ({ ...s, adminStage: e.target.value }))}
                  >
                    {['new', 'contacted', 'pre_inspection', 'inspected', 'dealing', 'cancel'].map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s] || s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="muted" style={{ fontSize: 12 }}>
                  Channel
                </label>
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
                  <label className="muted" style={{ fontSize: 12 }}>
                    Customer name
                  </label>
                  <input
                    className="input"
                    value={editForm.customerName}
                    onChange={(e) => setEditForm((s) => ({ ...s, customerName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>
                    WA / Phone
                  </label>
                  <input
                    className="input"
                    value={editForm.customerWaKey}
                    onChange={(e) => setEditForm((s) => ({ ...s, customerWaKey: e.target.value, customerPhone: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>
                    Plat nomor
                  </label>
                  <input
                    className="input"
                    value={editForm.plateNumber}
                    onChange={(e) => setEditForm((s) => ({ ...s, plateNumber: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>
                    Sales
                  </label>
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
                    <label className="muted" style={{ fontSize: 12 }}>
                      Merk / Model
                    </label>
                    <input
                      className="input"
                      value={editForm.merkModel}
                      onChange={(e) => setEditForm((s) => ({ ...s, merkModel: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Transmisi
                    </label>
                    <input
                      className="input"
                      value={editForm.transmission}
                      onChange={(e) => setEditForm((s) => ({ ...s, transmission: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Tahun
                    </label>
                    <input
                      className="input"
                      value={editForm.year}
                      onChange={(e) => setEditForm((s) => ({ ...s, year: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Warna
                    </label>
                    <input
                      className="input"
                      value={editForm.color}
                      onChange={(e) => setEditForm((s) => ({ ...s, color: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      KM
                    </label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={editForm.km}
                      onChange={(e) => setEditForm((s) => ({ ...s, km: formatThousands(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      STNK Bulan
                    </label>
                    <input
                      className="input"
                      value={editForm.stnkMonth}
                      onChange={(e) => setEditForm((s) => ({ ...s, stnkMonth: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Status BPKB
                    </label>
                    <input
                      className="input"
                      value={editForm.bpkbStatus}
                      onChange={(e) => setEditForm((s) => ({ ...s, bpkbStatus: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Ekspektasi terendah
                    </label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={editForm.expectLowPrice}
                      onChange={(e) => setEditForm((s) => ({ ...s, expectLowPrice: formatThousands(e.target.value) }))}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Mobil baru diincar
                    </label>
                    <input
                      className="input"
                      value={editForm.newCarModel}
                      onChange={(e) => setEditForm((s) => ({ ...s, newCarModel: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 12, background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Estimasi & hasil</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Estimasi Min
                    </label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={editForm.estimateLow}
                      onChange={(e) => setEditForm((s) => ({ ...s, estimateLow: formatThousands(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Estimasi Max
                    </label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={editForm.estimateHigh}
                      onChange={(e) => setEditForm((s) => ({ ...s, estimateHigh: formatThousands(e.target.value) }))}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Keterangan Estimasi
                    </label>
                    <textarea
                      className="input"
                      style={{ minHeight: 64, resize: 'vertical' }}
                      value={editForm.estimateNotes}
                      onChange={(e) => setEditForm((s) => ({ ...s, estimateNotes: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Harga Fix
                    </label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={editForm.fixedPrice}
                      onChange={(e) => setEditForm((s) => ({ ...s, fixedPrice: formatThousands(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>
                      Alasan Batal
                    </label>
                    <input
                      className="input"
                      value={editForm.cancelReason}
                      onChange={(e) => setEditForm((s) => ({ ...s, cancelReason: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                <button type="button" className="btn" onClick={() => { setEditOpen(false); setEditId('') }}>
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
