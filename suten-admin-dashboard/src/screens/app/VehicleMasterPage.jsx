import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import {
  listVehicleMaster,
  searchVehicleMasterByModel,
  updateVehicleMaster,
} from '../../firestore/vehicleMasterAdmin.js'
import { formatThousands } from '../../utils/numberFormat.js'

const RESULT_CAP = 300

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
  // Edit hanya untuk Root & Otozentrum (tradein). Selain itu view-only.
  const canEdit = role === 'root' || role === 'tradein'

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [searchModel, setSearchModel] = useState('')
  const [filterMerk, setFilterMerk] = useState('all')
  const [filterTahun, setFilterTahun] = useState('')
  const [filterVarian, setFilterVarian] = useState('')

  const [editRow, setEditRow] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_EDIT)
  const [saving, setSaving] = useState(false)
  const [editErr, setEditErr] = useState('')

  async function runSearch(modelPrefix) {
    setLoading(true)
    setErr('')
    try {
      const data = modelPrefix
        ? await searchVehicleMasterByModel(modelPrefix, { max: RESULT_CAP })
        : await listVehicleMaster({ max: 60 })
      setRows(data)
    } catch (e) {
      setErr(e?.message || 'Gagal memuat data vehicle master.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runSearch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const merkOptions = useMemo(() => {
    const set = new Set()
    for (const r of rows) if (r.merk) set.add(String(r.merk))
    return [...set].sort()
  }, [rows])

  const filtered = useMemo(() => {
    let list = rows
    if (filterMerk !== 'all') list = list.filter((r) => String(r.merk || '') === filterMerk)
    const yr = filterTahun.trim()
    if (yr) list = list.filter((r) => String(r.tahun || '').includes(yr))
    const v = filterVarian.trim().toLowerCase()
    if (v) list = list.filter((r) => String(r.varian || '').toLowerCase().includes(v))
    return list
  }, [rows, filterMerk, filterTahun, filterVarian])

  function openEditor(r) {
    if (!canEdit) return
    setEditErr('')
    setEditRow(r)
    setEditForm({
      merk: r.merk || '',
      model: r.model || '',
      varian: r.varian || '',
      tahun: r.tahun != null ? String(r.tahun) : '',
      transmisi: r.transmisi || '',
      jenis_mesin: r.jenis_mesin != null ? String(r.jenis_mesin) : '',
      harga_dasar: r.harga_dasar != null ? formatThousands(r.harga_dasar) : '',
      kode_demand: r.kode_demand || '',
    })
  }

  async function saveEditor() {
    if (!canEdit || !editRow?.id) return
    setSaving(true)
    setEditErr('')
    try {
      const patch = {
        merk: String(editForm.merk || '').trim().toUpperCase(),
        model: String(editForm.model || '').trim().toUpperCase(),
        varian: String(editForm.varian || '').trim(),
        tahun: toNumberOrNull(editForm.tahun),
        transmisi: String(editForm.transmisi || '').trim(),
        jenis_mesin: editForm.jenis_mesin === '' ? null : Number(String(editForm.jenis_mesin).replace(',', '.')),
        harga_dasar: toNumberOrNull(editForm.harga_dasar),
        kode_demand: String(editForm.kode_demand || '').trim().toUpperCase(),
      }
      await updateVehicleMaster(editRow.id, patch)
      // update baris di state agar langsung terlihat
      setRows((prev) => prev.map((x) => (x.id === editRow.id ? { ...x, ...patch } : x)))
      setEditRow(null)
    } catch (e) {
      setEditErr(e?.message || 'Gagal menyimpan. Pastikan Anda punya izin (Root/Otozentrum).')
    } finally {
      setSaving(false)
    }
  }

  const cellStyle = { padding: '9px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }

  return (
    <div className="page">
      <h1 className="h1">Vehicle Master</h1>
      <p className="muted small">
        Data master kendaraan (harga dasar dsb.) dari koleksi <code>vehicle_master</code>.{' '}
        {canEdit ? 'Anda dapat mengedit.' : 'Mode lihat saja (view only).'}
      </p>

      <div className="card" style={{ marginTop: 12 }}>
        <form
          className="row"
          style={{ flexWrap: 'wrap', gap: 10 }}
          onSubmit={(e) => {
            e.preventDefault()
            runSearch(searchModel.trim())
          }}
        >
          <input
            className="input"
            style={{ flex: '1 1 220px' }}
            placeholder="Cari MODEL (mis. CALYA, INNOVA, MUX)…"
            value={searchModel}
            onChange={(e) => setSearchModel(e.target.value)}
          />
          <button className="btn btnPrimary" type="submit" disabled={loading}>
            {loading ? 'Mencari…' : 'Cari'}
          </button>
          <select className="input" style={{ flex: '0 0 150px' }} value={filterMerk} onChange={(e) => setFilterMerk(e.target.value)}>
            <option value="all">Semua Merk</option>
            {merkOptions.map((m) => (
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
          {loading ? 'Memuat…' : `Menampilkan ${filtered.length} baris`}
          {rows.length >= RESULT_CAP ? ` (dibatasi ${RESULT_CAP} — persempit pencarian MODEL)` : ''}
          {!searchModel.trim() && rows.length >= 60 ? ' — ketik MODEL lalu Cari untuk hasil lebih lengkap' : ''}
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
                    {loading ? 'Memuat…' : 'Tidak ada data. Coba cari MODEL lain.'}
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
                        <button type="button" className="btn" onClick={() => openEditor(r)}>Edit</button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && editRow ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" onClick={() => setEditRow(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%' }}>
            <h2 className="h2" style={{ margin: 0 }}>Edit Vehicle Master</h2>
            {editErr ? <div className="alert alert--error" style={{ marginTop: 10 }}>{editErr}</div> : null}

            {[
              { k: 'merk', label: 'Merk' },
              { k: 'model', label: 'Model' },
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
                  value={editForm[f.k]}
                  inputMode={f.numeric || f.money ? 'numeric' : undefined}
                  onChange={(e) => {
                    const v = f.money ? formatThousands(e.target.value) : f.numeric ? e.target.value.replace(/[^\d]/g, '') : e.target.value
                    setEditForm((s) => ({ ...s, [f.k]: v }))
                  }}
                />
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setEditRow(null)} disabled={saving}>Batal</button>
              <button type="button" className="btn btnPrimary" onClick={saveEditor} disabled={saving}>
                {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
