import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import {
  createTradeinRequest,
  customerRequestInspection,
  DuplicatePlateError,
  listenTradeinRequestsForWa,
} from '../../firestore/tradeinRequests.js'
import {
  customerTradeInPriceLabel,
  deriveTradeinCustomerStage,
  estimatePresent,
  pipelineLabel,
} from '../../utils/tradeinCustomerStatus.js'
import { normalizePlate } from '../../utils/plateFormat.js'
import { getChannelOrDefault } from '../../utils/channel.js'
import { formatThousands } from '../../utils/numberFormat.js'
import { ComboBox } from '../../components/ComboBox.jsx'
import { brandOptions, modelOptions, typeOptions } from '../../data/carCatalog.js'

const DEMO_TRADEIN_KEY = 'demo_tradein_history_v1'

const EXTERIOR_OPTIONS = [
  'Body Ex Perbaikan Lecet Minor / Ada Lecet',
  'Body Ex Perbaikan Lecet Besar atau Perlu Perbaikan',
  'Unit ex Laka Ringan',
  'Unit Ex Laka Sedang',
  'Unit Ex laka Berat',
]

const INTERIOR_OPTIONS = [
  'FULL ORIGINAL BERSIH & RAPIH, FITUR-FITUR NORMAL',
  'INTERIOR KURANG RAPIH, FITUR-FITUR PERLU PERBAIKAN',
  'Interior Sudah difariasi atau Ada fitur yang tidak berfungsi',
]

const ENGINE_OPTIONS = [
  'KONDISI NORMAL - TIDAK ADA INDIKASI MASALAH',
  'KONDISI KURANG NORMAL - ADA INDIKASI MASALAH',
  'KONDISI MESIN ADA MASALAH',
]

const TRANSMISSION_MATIC_OPTIONS = [
  'METIK FULL RESPONSIF & HALUS',
  'METIK SLOW RESPONS & SUDAH MULAI BERGEJALA UNTUK PENGGANTIAN',
  'TRANSMISI METIK SUDAH TERINDIKASI BERMASALAH UNTUK PENGGANTIAN',
]

const SUSPENSION_OPTIONS = [
  'KONDISI SUSPENSI NORMAL & NYAMAN',
  'KONDISI SUSPENSI PERLU PENGGANTIAN/PERAWATAN RINGAN',
  'KONDSI SUSPENSI PERLU PENGGANTAIN BESAR',
]

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

/** Turunkan transmisi (Manual/Matic) dari string Tipe. Kosong jika tak terdeteksi. */
function deriveTransmission(tipe) {
  const s = String(tipe || '').toUpperCase()
  if (/\bM\/?T\b|MANUAL/.test(s)) return 'Manual'
  if (/\bA\/?T\b|\bCVT\b|MATIC|OTOMATIS|\bHEV\b|\bEV\b/.test(s)) return 'Matic'
  return ''
}

export function TradeInPage() {
  const { authUser, customerWaKey, customerDisplayName, demoMode } = useAuth()

  const [step, setStep] = useState(1)

  const [merk, setMerk] = useState('')
  const [model, setModel] = useState('')
  const [tipe, setTipe] = useState('')
  const [year, setYear] = useState('')
  const [color, setColor] = useState('')
  const [km, setKm] = useState('')
  const [stnkMonth, setStnkMonth] = useState('')
  const [bpkbStatus, setBpkbStatus] = useState('Tersedia')
  const [expectLowPrice, setExpectLowPrice] = useState('')
  const [newCarModel, setNewCarModel] = useState('')
  const [salesName, setSalesName] = useState('')
  const [plateNumber, setPlateNumber] = useState('')

  // Step 2 — Kondisi Kendaraan
  const [exteriorCondition, setExteriorCondition] = useState('')
  const [interiorCondition, setInteriorCondition] = useState('')
  const [engineCondition, setEngineCondition] = useState('')
  const [transmissionCondition, setTransmissionCondition] = useState('')
  const [suspensionCondition, setSuspensionCondition] = useState('')

  const [rows, setRows] = useState([])
  const [listErr, setListErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [requestingId, setRequestingId] = useState('')
  const [duplicatePlate, setDuplicatePlate] = useState('')

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

  // Transmisi diturunkan dari Tipe (mis. "G A/T" -> Matic, "G M/T" -> Manual).
  const transmission = useMemo(() => deriveTransmission(tipe), [tipe])
  const isMatic = transmission === 'Matic'

  const modelSuggestions = useMemo(() => modelOptions(merk), [merk])
  const typeSuggestions = useMemo(() => typeOptions(merk, model), [merk, model])
  const merkModel = useMemo(() => [merk, model, tipe].map((s) => s.trim()).filter(Boolean).join(' '), [merk, model, tipe])

  // Cascade: ganti Merk -> reset Model & Tipe; ganti Model -> reset Tipe.
  const onMerkChange = useCallback((v) => {
    setMerk(v)
    setModel('')
    setTipe('')
  }, [])
  const onModelChange = useCallback((v) => {
    setModel(v)
    setTipe('')
  }, [])

  const canProceedStep1 = useMemo(() => {
    return (
      merk.trim().length >= 2 &&
      model.trim().length >= 1 &&
      String(year).trim().length >= 2 &&
      color.trim().length >= 1 &&
      stnkMonth.trim().length >= 2 &&
      expectLowPrice.trim().length >= 1 &&
      newCarModel.trim().length >= 2 &&
      normalizePlate(plateNumber).length >= 4
    )
  }, [merk, model, year, color, stnkMonth, expectLowPrice, newCarModel, plateNumber])

  const canSubmit = useMemo(() => {
    return (
      canProceedStep1 &&
      km.trim().length >= 1 &&
      Boolean(exteriorCondition) &&
      Boolean(interiorCondition) &&
      Boolean(engineCondition) &&
      Boolean(suspensionCondition) &&
      (!isMatic || Boolean(transmissionCondition))
    )
  }, [
    canProceedStep1,
    km,
    exteriorCondition,
    interiorCondition,
    engineCondition,
    suspensionCondition,
    isMatic,
    transmissionCondition,
  ])

  function goToStep2() {
    setDoneMsg('')
    if (!canProceedStep1) return
    setStep(2)
  }

  async function onSubmit(e) {
    e.preventDefault()
    setDoneMsg('')
    if (!canSubmit || !customerWaKey) return
    const plateRaw = plateNumber.trim()
    const plateKey = normalizePlate(plateRaw)
    const payload = {
      customerUid: authUser?.uid || '',
      customerWaKey,
      customerPhone: customerWaKey,
      customerName: customerDisplayName || 'Customer',
      merk: merk.trim(),
      model: model.trim(),
      tipe: tipe.trim(),
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
      plateNumber: plateRaw,
      plateKey,
      carType: `${merkModel.trim()} ${transmission}`.trim(),
      sourceChannel: getChannelOrDefault(),
      exteriorCondition,
      interiorCondition,
      engineCondition,
      transmissionCondition: isMatic ? transmissionCondition : '',
      suspensionCondition,
    }

    setSubmitting(true)
    try {
      if (demoMode) {
        const existing = loadDemoHistory(customerWaKey).find(
          (r) => normalizePlate(r.plateKey || r.plateNumber || '') === plateKey,
        )
        if (existing) {
          setDuplicatePlate(plateRaw)
          return
        }
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
      setMerk('')
      setModel('')
      setTipe('')
      setYear('')
      setColor('')
      setKm('')
      setStnkMonth('')
      setExpectLowPrice('')
      setNewCarModel('')
      setSalesName('')
      setPlateNumber('')
      setBpkbStatus('Tersedia')
      setExteriorCondition('')
      setInteriorCondition('')
      setEngineCondition('')
      setTransmissionCondition('')
      setSuspensionCondition('')
      setStep(1)
    } catch (err) {
      if (err instanceof DuplicatePlateError) {
        setDuplicatePlate(err.plate || plateRaw)
      } else {
        setDoneMsg(err?.message || 'Gagal mengirim. Coba lagi.')
      }
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
      <p className="muted small">
        Langkah {step} dari 2 — {step === 1 ? 'Data Kendaraan' : 'Kondisi Kendaraan'}
      </p>

      {doneMsg ? (
        <div className={`alert ${doneMsg.includes('Gagal') ? 'alert--error' : 'alert--ok'}`} style={{ marginTop: 12 }}>
          {doneMsg}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <form onSubmit={onSubmit} className="form">
          {step === 1 ? (
            <>
              <h2 className="h2" style={{ margin: 0 }}>Data Kendaraan</h2>

              <label className="label" htmlFor="plate" style={{ marginTop: 10 }}>
                Plat Nomor
              </label>
              <input
                id="plate"
                className="input"
                placeholder="DB 1234 GM"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                autoComplete="off"
              />

              <label className="label" htmlFor="merk" style={{ marginTop: 10 }}>
                Merk
              </label>
              <ComboBox
                id="merk"
                value={merk}
                onChange={onMerkChange}
                options={brandOptions()}
                placeholder="Pilih Merek Mobil"
              />

              <label className="label" htmlFor="model" style={{ marginTop: 10 }}>
                Model
              </label>
              <ComboBox
                id="model"
                value={model}
                onChange={onModelChange}
                options={modelSuggestions}
                placeholder="Pilih Model Mobil"
              />

              <label className="label" htmlFor="tipe" style={{ marginTop: 10 }}>
                Tipe
              </label>
              <ComboBox
                id="tipe"
                value={tipe}
                onChange={setTipe}
                options={typeSuggestions}
                placeholder="Pilih Tipe Mobil"
              />

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
                inputMode="numeric"
                value={expectLowPrice}
                onChange={(e) => setExpectLowPrice(formatThousands(e.target.value))}
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

              <button
                className="btn btn--primary"
                type="button"
                disabled={!canProceedStep1}
                style={{ marginTop: 14 }}
                onClick={goToStep2}
              >
                Selanjutnya
              </button>
            </>
          ) : (
            <>
              <h2 className="h2" style={{ margin: 0 }}>Kondisi Kendaraan</h2>

              <label className="label" htmlFor="exterior" style={{ marginTop: 10 }}>
                Kondisi Exterior
              </label>
              <select
                id="exterior"
                className="input"
                value={exteriorCondition}
                onChange={(e) => setExteriorCondition(e.target.value)}
              >
                <option value="">Pilih kondisi exterior…</option>
                {EXTERIOR_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>

              <label className="label" htmlFor="interior" style={{ marginTop: 10 }}>
                Kondisi Interior
              </label>
              <select
                id="interior"
                className="input"
                value={interiorCondition}
                onChange={(e) => setInteriorCondition(e.target.value)}
              >
                <option value="">Pilih kondisi interior…</option>
                {INTERIOR_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>

              <label className="label" htmlFor="engine" style={{ marginTop: 10 }}>
                Kondisi Mesin
              </label>
              <select
                id="engine"
                className="input"
                value={engineCondition}
                onChange={(e) => setEngineCondition(e.target.value)}
              >
                <option value="">Pilih kondisi mesin…</option>
                {ENGINE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>

              {isMatic ? (
                <>
                  <label className="label" htmlFor="transCond" style={{ marginTop: 10 }}>
                    Transmisi (Matic)
                  </label>
                  <select
                    id="transCond"
                    className="input"
                    value={transmissionCondition}
                    onChange={(e) => setTransmissionCondition(e.target.value)}
                  >
                    <option value="">Pilih kondisi transmisi…</option>
                    {TRANSMISSION_MATIC_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}

              <label className="label" htmlFor="suspension" style={{ marginTop: 10 }}>
                Suspensi &amp; Kaki-kaki
              </label>
              <select
                id="suspension"
                className="input"
                value={suspensionCondition}
                onChange={(e) => setSuspensionCondition(e.target.value)}
              >
                <option value="">Pilih kondisi suspensi…</option>
                {SUSPENSION_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>

              <label className="label" htmlFor="km" style={{ marginTop: 10 }}>
                KM
              </label>
              <input
                id="km"
                className="input"
                placeholder="65.000"
                inputMode="numeric"
                value={km}
                onChange={(e) => setKm(formatThousands(e.target.value))}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  className="btn"
                  type="button"
                  style={{ flex: '0 0 auto' }}
                  onClick={() => setStep(1)}
                  disabled={submitting}
                >
                  Kembali
                </button>
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={!canSubmit || submitting}
                  style={{ flex: 1 }}
                >
                  {submitting ? 'Mengirim…' : 'Kirim request'}
                </button>
              </div>
            </>
          )}
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

      {duplicatePlate ? (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setDuplicatePlate('')}
        >
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h2 className="h2" style={{ margin: 0 }}>Plat sudah terdaftar</h2>
            <p style={{ marginTop: 10 }}>
              Mobil dengan Plat nomor <strong>{duplicatePlate}</strong> sudah pernah di input.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setDuplicatePlate('')}
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
