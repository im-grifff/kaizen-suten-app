import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import {
  countVehicleMaster,
  createVehicleMaster,
  fetchVehicleMasterPage,
  MERK_OPTIONS,
  searchVehicleMaster,
  updateVehicleMaster,
} from '../../firestore/vehicleMasterAdmin.js'
import { formatThousands } from '../../utils/numberFormat.js'

const PAGE_SIZE = 100
const SEARCH_CAP = 500

function toNumberOrNull(raw) {
  const digits = String(raw ?? '').replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

const EMPTY_EDIT = {
  merk: '',
  model: '',
  varian: '',
  tahun: '',
  transmisi: '',
  jenis_mesin: '',
  harga_dasar: '',
  kode_demand: '',
}

export function VehicleMasterPage() {
  const { role } = useAuth()
  // Tambah/Edit hanya untuk Root & Otozentrum (tradein). Selain itu view-only.
  const canEdit = role === 'root' || role === 'tradein'

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [err, setErr] = useState('')

  const [mode, setMode] = useState('browse') // 'browse' | 'search'
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [searchCapped, setSearchCapped] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [filterMerk, setFilterMerk] = useState('all')
  const [filterTahun, setFilterTahun] = useState('')
  const [filterVarian, setFilterVarian] = useState('')

  // modal: null | { mode: 'edit'|'create', id?: string }
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_EDIT)
  const [saving, setSaving] = useState(false)
  const [modalErr, setModalErr] = useState('')

  async function loadFirstPage() {
    setLoading(true)
    setErr('')
    setMode('browse')
    setSearchTerm('')
    setFilterMerk('all')
    try {
      const [cnt, page] = await Promise.all([
        total == null ? countVehicleMaster() : Promise.resolve(total),
        fetchVehicleMasterPage({ pageSize: PAGE_SIZE }),
      ])
      if (total == null) setTotal(cnt)
      setRows(page.rows)
      setCursor(page.cursor)
      setHasMore(page.hasMore)
      setSearchCapped(false)
    } catch (e) {
      setErr(e?.message || 'Gagal memuat data vehicle master.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (mode !== 'browse' || !cursor) return
    setLoadingMore(true)
    try {
      const page = await fetchVehicleMasterPage({ pageSize: PAGE_SIZE, cursor })
      setRows((prev) => [...prev, ...page.rows])
      setCursor(page.cursor)
      setHasMore(page.hasMore)
    } catch (e) {
      setErr(e?.message || 'Gagal memuat data tambahan.')
    } finally {
      setLoadingMore(false)
    }
  }

  // Cari di SELURUH database (model atau merk). term kosong -> kembali browse.
  async function runSearch(term) {
    const t = String(term || '').trim()
    if (!t) {
      loadFirstPage()
      return
    }
    setLoading(true)
    setErr('')
    setMode('search')
    try {
      const res = await searchVehicleMaster(t, { max: SEARCH_CAP })
      setRows(res.rows)
      setHasMore(false)
      setCursor(null)
      setSearchCapped(res.capped)
    } catch (e) {
      setErr(e?.message || 'Gagal mencari data.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  function onSelectMerk(merk) {
    setFilterMerk(merk)
    setSearchTerm('')
    if (merk === 'all') loadFirstPage()
    else runSearch(merk)
  }

  useEffect(() => {
    loadFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Filter client-side (tahun/varian) di atas hasil DB saat ini.
  const filtered = useMemo(() => {
    let list = rows
    const yr = filterTahun.trim()
    if (yr) list = list.filter((r) => String(r.tahun || '').includes(yr))
    const v = filterVarian.trim().toLowerCase()
    if (v) list = list.filter((r) => String(r.varian || '').toLowerCase().includes(v))
    return list
  }, [rows, filterTahun, filterVarian])

  function openCreate() {
    setModalErr('')
    setForm(EMPTY_EDIT)
    setModal({ mode: 'create' })
  }

  function openEdit(r) {
    setModalErr('')
    setForm({
      merk: r.merk || '',
      model: r.model || '',
      varian: r.varian || '',
      tahun: r.tahun != null ? String(r.tahun) : '',
      transmisi: r.transmisi || '',
      jenis_mesin: r.jenis_mesin != null ? String(r.jenis_mesin) : '',
      harga_dasar: r.harga_dasar != null ? formatThousands(r.harga_dasar) : '',
      kode_demand: r.kode_demand || '',
    })
    setModal({ mode: 'edit', id: r.id })
  }

  function buildPatch() {
    return {
      merk: String(form.merk || '').trim().toUpperCase(),
      model: String(form.model || '').trim().toUpperCase(),
      varian: String(form.varian || '').trim(),
      tahun: toNumberOrNull(form.tahun),
      transmisi: String(form.transmisi || '').trim(),
      jenis_mesin: form.jenis_mesin === '' ? null : Number(String(form.jenis_mesin).replace(',', '.')),
      harga_dasar: toNumberOrNull(form.harga_dasar),
      kode_demand: String(form.kode_demand || '').trim().toUpperCase(),
    }
  }

  async function saveModal() {
    if (!canEdit || !modal) return
    if (!form.merk.trim() || !form.model.trim()) {
      setModalErr('Merk dan Model wajib diisi.')
      return
    }
    setSaving(true)
    setModalErr('')
    try {
      const patch = buildPatch()
      if (modal.mode === 'create') {
        const created = await createVehicleMaster(patch)
        setRows((prev) => [created, ...prev])
        setTotal((t) => (t == null ? t : t + 1))
      } else {
        await updateVehicleMaster(modal.id, patch)
        setRows((prev) => prev.map((x) => (x.id === modal.id ? { ...x, ...patch } : x)))
      }
      setModal(null)
    } catch (e) {
      setModalErr(e?.message || 'Gagal menyimpan. Pastikan Anda punya izin (Root/Otozentrum).')
    } finally {
      setSaving(false)
    }
  }

  const cellStyle = { padding: '9px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }
  const totalText = total != null ? total.toLocaleString('id-ID') : '…'

  return (
    <div className="page">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <h1 className="h1">Vehicle Master</h1>
          <p className="muted small">
            Data master kendaraan dari koleksi <code>vehicle_master</code> — total <strong>{totalText}</strong> unit.{' '}
            {canEdit ? 'Anda dapat menambah & mengedit.' : 'Mode lihat saja (view only).'}
          </p>
        </div>
        {canEdit ? (
          <button type="button" className="btn btnPrimary" onClick={openCreate} style={{ whiteSpace: 'nowrap' }}>
            + Tambah
          </button>
        ) : null}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <form
          className="row"
          style={{ flexWrap: 'wrap', gap: 10 }}
          onSubmit={(e) => {
            e.preventDefault()
            setFilterMerk('all')
            runSearch(searchTerm)
          }}
        >
          <input
            className="input"
            style={{ flex: '1 1 240px' }}
            placeholder="Cari (Model atau Merk) — mis. CALYA, INNOVA, TOYOTA…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button className="btn btnPrimary" type="submit" disabled={loading}>
            {loading ? 'Memuat…' : 'Cari'}
          </button>
          {mode === 'search' ? (
            <button className="btn" type="button" onClick={() => loadFirstPage()}>
              Reset
            </button>
          ) : null}
          <select className="input" style={{ flex: '0 0 160px' }} value={filterMerk} onChange={(e) => onSelectMerk(e.target.value)}>
            <option value="all">Semua Merk</option>
            {MERK_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            className="input"
            style={{ flex: '0 0 110px' }}
            placeholder="Tahun"
            inputMode="numeric"
            value={filterTahun}
            onChange={(e) => setFilterTahun(e.target.value.replace(/[^\d]/g, ''))}
          />
          <input
            className="input"
            style={{ flex: '1 1 160px' }}
            placeholder="Filter varian…"
            value={filterVarian}
            onChange={(e) => setFilterVarian(e.target.value)}
          />
        </form>
        <div className="muted small" style={{ marginTop: 8 }}>
          {loading
            ? 'Memuat…'
            : mode === 'search'
              ? `Hasil pencarian: ${filtered.length} baris${searchCapped ? ` (dibatasi ${SEARCH_CAP} — persempit pencarian)` : ''}`
              : `Menampilkan ${filtered.length} dari ${totalText} unit${hasMore ? ' — klik "Muat lebih banyak"' : ' (semua dimuat)'}`}
        </div>
      </div>

      {err ? <div className="alert alert--error" style={{ marginTop: 12 }}>{err}</div> : null}

      <div className="card" style={{ marginTop: 12, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {['Merk', 'Model', 'Varian', 'Tahun', 'Transmisi', 'CC', 'Harga Dasar', 'Kode', ...(canEdit ? ['Aksi'] : [])].map((h) => (
                  <th key={h} style={{ ...cellStyle, borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="muted" style={{ padding: 14 }}>
                    {loading ? 'Memuat…' : 'Tidak ada data.'}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={cellStyle}>{r.merk || '-'}</td>
                    <td style={cellStyle}>{r.model || '-'}</td>
                    <td style={cellStyle}>{r.varian || '-'}</td>
                    <td style={cellStyle}>{r.tahun ?? '-'}</td>
                    <td style={cellStyle}>{r.transmisi || '-'}</td>
                    <td style={cellStyle}>{r.jenis_mesin ?? '-'}</td>
                    <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                      {r.harga_dasar != null ? `Rp ${formatThousands(r.harga_dasar)}` : '-'}
                    </td>
                    <td style={cellStyle}>{r.kode_demand || '-'}</td>
                    {canEdit ? (
                      <td style={cellStyle}>
                        <button type="button" className="btn" onClick={() => openEdit(r)}>Edit</button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {mode === 'browse' && hasMore ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button className="btn" type="button" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Memuat…' : `Muat lebih banyak (${rows.length} / ${totalText})`}
          </button>
        </div>
      ) : null}

      {canEdit && modal ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" onClick={() => setModal(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%' }}>
            <h2 className="h2" style={{ margin: 0 }}>
              {modal.mode === 'create' ? 'Tambah Vehicle Master' : 'Edit Vehicle Master'}
            </h2>
            {modalErr ? <div className="alert alert--error" style={{ marginTop: 10 }}>{modalErr}</div> : null}

            {[
              { k: 'merk', label: 'Merk *' },
              { k: 'model', label: 'Model *' },
              { k: 'varian', label: 'Varian' },
              { k: 'tahun', label: 'Tahun', numeric: true },
              { k: 'transmisi', label: 'Transmisi' },
              { k: 'jenis_mesin', label: 'CC / Jenis Mesin' },
              { k: 'harga_dasar', label: 'Harga Dasar (Rp)', money: true },
              { k: 'kode_demand', label: 'Kode Demand' },
            ].map((f) => (
              <div key={f.k} style={{ marginTop: 10 }}>
                <label className="label">{f.label}</label>
                <input
                  className="input"
                  value={form[f.k]}
                  inputMode={f.numeric || f.money ? 'numeric' : undefined}
                  onChange={(e) => {
                    const v = f.money ? formatThousands(e.target.value) : f.numeric ? e.target.value.replace(/[^\d]/g, '') : e.target.value
                    setForm((s) => ({ ...s, [f.k]: v }))
                  }}
                />
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setModal(null)} disabled={saving}>Batal</button>
              <button type="button" className="btn btnPrimary" onClick={saveModal} disabled={saving}>
                {saving ? 'Menyimpan…' : modal.mode === 'create' ? 'Tambah' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
