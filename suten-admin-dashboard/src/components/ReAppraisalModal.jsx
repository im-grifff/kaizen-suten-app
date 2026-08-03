import { useMemo, useState } from 'react'
import { formatRp } from '../lib/appraisalUtils.js'
import {
  CONDITION_OPTIONS,
  DOKUMEN_OPTIONS,
  buildInitialConditions,
  priceSnapshot,
  runReAppraisal,
} from '../lib/reAppraisal.js'

const CONDITION_FIELDS = [
  ['bodyCondition', 'Eksterior / Body'],
  ['banCondition', 'Ban & Velg'],
  ['interiorCondition', 'Interior / Kabin'],
  ['mesinCondition', 'Mesin'],
  ['transmisiCondition', 'Transmisi'],
  ['suspensiCondition', 'Suspensi / Kaki-kaki'],
  ['acCondition', 'AC'],
  ['starterCondition', 'Starter / Aki'],
]

function Delta({ before, after }) {
  const d = (Number(after) || 0) - (Number(before) || 0)
  if (!d) return <span className="muted">tetap</span>
  const naik = d > 0
  return (
    <span style={{ color: naik ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
      {naik ? '▲' : '▼'} {formatRp(Math.abs(d))}
    </span>
  )
}

/**
 * Modal Re-Appraisal — hitung ulang taksasi lalu (setelah dikonfirmasi) menimpa
 * hasil taksasi yang ada. Sengaja dua langkah: Hitung Ulang dulu untuk melihat
 * perbandingan, baru Simpan. Menimpa hasil customer itu tidak bisa di-undo.
 */
export function ReAppraisalModal({ row, actor, onClose, onSave }) {
  const [form, setForm] = useState(() => buildInitialConditions(row))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)
  const [saved, setSaved] = useState(false)

  const before = useMemo(() => priceSnapshot(row), [row])
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }))

  function toggleDokumen(dok) {
    setForm((s) => {
      const has = s.dokumenKurang.includes(dok)
      return {
        ...s,
        dokumenKurang: has ? s.dokumenKurang.filter((d) => d !== dok) : [...s.dokumenKurang, dok],
      }
    })
  }

  async function onCompute() {
    setBusy(true)
    setErr('')
    setResult(null)
    try {
      const res = await runReAppraisal({ row, conditions: form, actor })
      setResult(res)
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onApply() {
    if (!result) return
    setBusy(true)
    setErr('')
    try {
      await onSave(result.patch)
      setSaved(true)
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const unitLabel = [row.merkModel || row.carType, row.transmission, row.year]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Re-Appraisal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="modalCard" style={{ width: 'min(100%, 920px)' }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Re-Appraisal — hitung ulang taksasi</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {row.customerName || 'Customer'} · {row.plateNumber || row.plateKey || '-'} · {unitLabel || '-'}
        </div>

        {err ? (
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
            {err}
          </div>
        ) : null}

        {saved ? (
          <div
            className="card"
            style={{
              marginTop: 10,
              padding: 10,
              borderColor: 'rgba(34, 197, 94, 0.5)',
              background: 'rgba(34, 197, 94, 0.12)',
              fontSize: 13,
            }}
          >
            Hasil taksasi berhasil diperbarui. Hasil lama sudah diganti.
          </div>
        ) : null}

        {!saved ? (
          <>
            <div
              className="card"
              style={{ marginTop: 12, padding: 10, fontSize: 12, background: 'rgba(234, 179, 8, 0.10)', borderColor: 'rgba(234, 179, 8, 0.4)' }}
            >
              Hasil hitung ulang akan <strong>menimpa</strong> hasil taksasi yang sudah dilihat
              customer. Koreksi dulu kondisi di bawah kalau isian customer tidak sesuai kenyataan.
            </div>

            {/* ── Data unit ── */}
            <div style={{ marginTop: 12, fontWeight: 800, fontSize: 13 }}>Data unit</div>
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                ['merk', 'Merk'],
                ['model', 'Model'],
                ['tipe', 'Tipe / Varian'],
                ['transmission', 'Transmisi'],
                ['year', 'Tahun'],
                ['km', 'KM total'],
              ].map(([k, label]) => (
                <div key={k}>
                  <label className="muted" style={{ fontSize: 12 }}>
                    {label}
                  </label>
                  <input className="input" value={form[k]} onChange={(e) => set(k, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Merk / Model / Tipe / Transmisi / Tahun dipakai untuk mencari harga dasar di Vehicle
              Master — makin cocok, makin akurat harganya.
            </div>

            {/* ── Kondisi ── */}
            <div style={{ marginTop: 14, fontWeight: 800, fontSize: 13 }}>Kondisi kendaraan</div>
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {CONDITION_FIELDS.map(([field, label]) => (
                <div key={field}>
                  <label className="muted" style={{ fontSize: 12 }}>
                    {label}
                  </label>
                  <select className="input" value={form[field]} onChange={(e) => set(field, e.target.value)}>
                    {CONDITION_OPTIONS[field].map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* ── Pajak & dokumen ── */}
            <div style={{ marginTop: 14, fontWeight: 800, fontSize: 13 }}>Pajak &amp; dokumen</div>
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="muted" style={{ fontSize: 12 }}>
                  Status pajak STNK
                </label>
                <select
                  className="input"
                  value={form.statusPajak}
                  onChange={(e) => set('statusPajak', e.target.value)}
                >
                  <option value="Aktif">Pajak Hidup / Aktif</option>
                  <option value="Lewat">Pajak Mati / Lewat Bln</option>
                </select>
              </div>
              <div>
                <label className="muted" style={{ fontSize: 12 }}>
                  Telat berapa bulan
                </label>
                <input
                  className="input"
                  inputMode="numeric"
                  disabled={form.statusPajak !== 'Lewat'}
                  value={form.bulanTelatPajak}
                  onChange={(e) => set('bulanTelatPajak', e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Dokumen yang TIDAK ada
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                {DOKUMEN_OPTIONS.map((dok) => (
                  <label key={dok} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={form.dokumenKurang.includes(dok)}
                      onChange={() => toggleDokumen(dok)}
                    />
                    {dok}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label className="muted" style={{ fontSize: 12 }}>
                Alasan re-appraisal (tersimpan di riwayat)
              </label>
              <input
                className="input"
                placeholder="mis. harga dasar Vehicle Master sudah diupdate / kondisi body tidak sesuai isian customer"
                value={form.reappraisalNote}
                onChange={(e) => set('reappraisalNote', e.target.value)}
              />
            </div>
          </>
        ) : null}

        {/* ── Hasil perbandingan ── */}
        {result ? (
          <div className="card" style={{ marginTop: 14, padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Perbandingan hasil</div>
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    {['', 'Sebelum', 'Sesudah', 'Selisih'].map((h) => (
                      <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Harga dasar', 'base_price'],
                    ['Harga min', 'harga_min'],
                    ['Harga max', 'harga_max'],
                    ['Midpoint', 'midpoint'],
                  ].map(([label, key]) => (
                    <tr key={key}>
                      <td style={{ padding: '6px 8px' }}>{label}</td>
                      <td style={{ padding: '6px 8px' }}>{formatRp(before[key])}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>{formatRp(result.after[key])}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <Delta before={before[key]} after={result.after[key]} />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '6px 8px' }}>Grade</td>
                    <td style={{ padding: '6px 8px' }}>{before.kelas_final || '-'}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 700 }}>{result.after.kelas_final || '-'}</td>
                    <td style={{ padding: '6px 8px' }} className="muted">
                      {before.kelas_final === result.after.kelas_final ? 'tetap' : 'berubah'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {result.aiError ? (
              <div
                className="card"
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderColor: 'rgba(234, 179, 8, 0.5)',
                  background: 'rgba(234, 179, 8, 0.12)',
                  fontSize: 12,
                }}
              >
                Narasi AI gagal dibuat ulang ({result.aiError}). Angka di atas tetap valid dan bisa
                disimpan, tapi narasi lama akan ditandai kedaluwarsa karena tidak lagi cocok dengan
                angka baru.
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
                Narasi &amp; rekomendasi AI ikut dibuat ulang.
              </div>
            )}
          </div>
        ) : null}

        {/* ── Aksi ── */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            {saved ? 'Tutup' : 'Batal'}
          </button>
          {!saved ? (
            <>
              <button type="button" className="btn" disabled={busy} onClick={onCompute}>
                {busy && !result ? 'Menghitung…' : result ? 'Hitung ulang lagi' : 'Hitung Ulang'}
              </button>
              <button
                type="button"
                className="btn btnPrimary"
                disabled={busy || !result}
                onClick={onApply}
              >
                {busy && result ? 'Menyimpan…' : 'Simpan & Ganti Hasil Taksasi'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
