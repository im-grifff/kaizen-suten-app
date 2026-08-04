import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext.jsx'
import { listenTradeinRequests } from '../../firestore/tradeinRequests.js'
import { deriveTradeinAdminStage } from '../../utils/tradeinStages.js'
import {
  listenRegistrationRequests,
  updateRegistrationRequest,
} from '../../firestore/registrationRequestsAdmin.js'
import { requestChannel, CHANNEL_FIRST, CHANNEL_SECOND } from '../../utils/channel.js'

function canReadTradeinOverview(role) {
  return (
    role === 'root' ||
    role === 'tradein' ||
    role === 'supervisor' ||
    role === 'aftersales' ||
    role === 'otoxpert' ||
    role === 'sa'
  )
}

/**
 * OtoXpert hanya melihat angka channel-nya sendiri, sama seperti pembatasan
 * di halaman Trade-In Requests. Role lain melihat seluruh data.
 */
function scopeRowsForRole(rows, role) {
  if (role === 'otoxpert') return rows.filter((r) => requestChannel(r) === CHANNEL_SECOND)
  return rows
}

function canReadRegistrationRequests(role) {
  return role === 'root' || role === 'supervisor' || role === 'aftersales'
}

function deriveTradeinStage(r) {
  return deriveTradeinAdminStage(r)
}

/**
 * Warna stage — dipakai bersama oleh pie pipeline dan diagram perbandingan channel,
 * supaya satu stage selalu punya warna yang sama di seluruh dashboard.
 *
 * Palet lama (#3b82f6 / #8b5cf6 / #06b6d4 / #f59e0b / #22c55e / #ef4444) gagal uji
 * keterbacaan warna: pasangan New (biru) dan Contacted (ungu) hanya berjarak
 * ΔE 1.3 untuk mata deuteranopia dan 12.0 untuk penglihatan normal — di bawah
 * batas aman 15, padahal itu dua stage terbesar. Palet di bawah lolos semua
 * pemeriksaan pada permukaan gelap #0b1220 (jarak normal terburuk ΔE 19.8,
 * kontras semua ≥ 3:1). Sisa peringatan ringan pada pasangan Inspected–Dealing
 * (ΔE 6.9 protan) ditutup dengan pembeda non-warna: jarak 2px antar segmen,
 * label langsung, legenda, dan tabel angka.
 */
const TRADEIN_PIE_STAGES = [
  { id: 'new', label: 'New', color: '#3987e5' },
  { id: 'contacted', label: 'Contacted', color: '#d95926' },
  { id: 'pre_inspection', label: 'Pre Inspection', color: '#199e70' },
  { id: 'inspected', label: 'Inspected', color: '#c98500' },
  { id: 'dealing', label: 'Dealing', color: '#008300' },
  { id: 'cancel', label: 'Cancel', color: '#e66767' },
]

/** Warna identitas channel. Lolos semua pemeriksaan CVD pada permukaan gelap. */
const CHANNELS = [
  { id: CHANNEL_FIRST, label: 'Dealer', color: '#3987e5' },
  { id: CHANNEL_SECOND, label: 'OtoXpert', color: '#d95926' },
]

const pct = (n, total) => (total > 0 ? (n / total) * 100 : 0)
const fmtPct = (v) => `${v.toFixed(v >= 10 || v === 0 ? 0 : 1)}%`

/**
 * Ringkasan per channel.
 *
 * Sengaja memisahkan dua hitungan yang gampang tertukar:
 *  - `customers` = jumlah customer unik (berdasarkan nomor WA), ini yang dipakai
 *    sebagai angka utama karena yang diminta adalah perbandingan CUSTOMER.
 *  - `requests`  = jumlah request trade-in, dipakai untuk komposisi pipeline
 *    (satu customer bisa punya lebih dari satu unit).
 *
 * Baris tanpa channel dihitung terpisah supaya totalnya tetap rekonsiliasi dan
 * tidak diam-diam dimasukkan ke salah satu channel.
 */
function channelBreakdown(rows) {
  const empty = () => ({
    requests: 0,
    waKeys: new Set(),
    stages: { new: 0, contacted: 0, pre_inspection: 0, inspected: 0, dealing: 0, cancel: 0 },
  })
  const acc = { [CHANNEL_FIRST]: empty(), [CHANNEL_SECOND]: empty(), unknown: empty() }

  for (const r of rows) {
    const ch = requestChannel(r)
    const bucket = ch === CHANNEL_FIRST || ch === CHANNEL_SECOND ? acc[ch] : acc.unknown
    bucket.requests += 1
    const wa = String(r.customerWaKey || r.customerPhone || '').replace(/\D/g, '')
    if (wa) bucket.waKeys.add(wa)
    const s = deriveTradeinStage(r)
    if (Object.prototype.hasOwnProperty.call(bucket.stages, s)) bucket.stages[s] += 1
  }

  const shape = (b) => ({
    requests: b.requests,
    customers: b.waKeys.size,
    stages: b.stages,
    dealing: b.stages.dealing,
    // Konversi dihitung terhadap request, bukan customer, karena stage melekat
    // pada request. Menyebutnya "dari N request" supaya tidak salah baca.
    conversion: pct(b.stages.dealing, b.requests),
  })

  return {
    [CHANNEL_FIRST]: shape(acc[CHANNEL_FIRST]),
    [CHANNEL_SECOND]: shape(acc[CHANNEL_SECOND]),
    unknown: shape(acc.unknown),
  }
}

/** Satu batang komposisi pipeline (100%) untuk satu channel. */
function StageBar({ stages, total }) {
  if (total === 0) {
    return (
      <div
        style={{
          height: 26,
          borderRadius: 6,
          background: 'rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 10,
          fontSize: 11,
          color: 'var(--muted)',
        }}
      >
        Belum ada data.
      </div>
    )
  }

  return (
    // gap 2px = pembeda non-warna antar segmen (disyaratkan karena satu pasangan
    // warna ada di ambang batas CVD).
    <div style={{ display: 'flex', gap: 2, height: 26 }}>
      {TRADEIN_PIE_STAGES.map(({ id, label, color }, i) => {
        const n = stages[id] || 0
        if (n === 0) return null
        const p = pct(n, total)
        // Stage yang jumlahnya 0 tidak dirender, jadi "ujung batang" harus dicari
        // dari segmen yang benar-benar tampil — bukan dari indeks array. Kalau
        // memakai `i === 0`, batang yang stage New-nya kosong (mis. OtoXpert)
        // kehilangan sudut membulat di kiri.
        const isFirst = !TRADEIN_PIE_STAGES.slice(0, i).some(({ id: j }) => (stages[j] || 0) > 0)
        const isLast = !TRADEIN_PIE_STAGES.slice(i + 1).some(({ id: j }) => (stages[j] || 0) > 0)
        return (
          <div
            key={id}
            title={`${label}: ${n} request (${fmtPct(p)})`}
            style={{
              width: `${p}%`,
              background: color,
              // sudut membulat hanya di ujung batang, mengikuti anatomi mark
              borderTopLeftRadius: isFirst ? 4 : 0,
              borderBottomLeftRadius: isFirst ? 4 : 0,
              borderTopRightRadius: isLast ? 4 : 0,
              borderBottomRightRadius: isLast ? 4 : 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              minWidth: 3,
            }}
          >
            {/* Label langsung hanya kalau segmennya benar-benar muat. Ambang 7%
                ≈ 55px pada lebar kartu normal — cukup untuk 2–3 digit. Segmen
                yang lebih tipis dibiarkan polos dan angkanya dibaca dari tabel. */}
            {p >= 7 ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                {n}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function ChannelComparison({ data }) {
  const totalCustomers = CHANNELS.reduce((s, { id }) => s + data[id].customers, 0)
  const hasUnknown = data.unknown.requests > 0

  return (
    <div>
      {/* Angka utama per channel */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {CHANNELS.map(({ id, label, color }) => {
          const d = data[id]
          return (
            <div
              key={id}
              style={{
                padding: 12,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, lineHeight: 1.1 }}>
                {d.customers}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                customer{totalCustomers > 0 ? ` · ${fmtPct(pct(d.customers, totalCustomers))} dari total` : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                {d.requests} request · <strong style={{ color: 'var(--text)' }}>{d.dealing} dealing</strong>{' '}
                ({fmtPct(d.conversion)})
              </div>
            </div>
          )
        })}
      </div>

      {/* Komposisi pipeline, dinormalkan 100% supaya bentuknya bisa dibandingkan
          walau volumenya jauh berbeda. Angka absolut tetap ditulis di segmen & tabel. */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>Komposisi pipeline</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
          Tiap batang dinormalkan ke 100% agar bentuknya bisa dibandingkan meski jumlahnya
          berbeda jauh. Angka di dalam segmen adalah jumlah request.
        </div>
        {CHANNELS.map(({ id, label }) => (
          <div key={id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{label}</span>
              <span style={{ color: 'var(--muted)' }}>{data[id].requests} request</span>
            </div>
            <StageBar stages={data[id].stages} total={data[id].requests} />
          </div>
        ))}
      </div>

      {/* Legenda — identitas tidak boleh bergantung pada warna saja */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
        {TRADEIN_PIE_STAGES.map(({ id, label, color }) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ color: 'var(--muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Tabel angka — jalur baca alternatif kalau warna tidak terbaca */}
      <div style={{ overflowX: 'auto', marginTop: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              {['Channel', 'Customer', 'Request', ...TRADEIN_PIE_STAGES.map((s) => s.label)].map((h) => (
                <th key={h} style={{ padding: '8px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...CHANNELS, ...(hasUnknown ? [{ id: 'unknown', label: 'Tanpa channel' }] : [])].map(
              ({ id, label }) => (
                <tr key={id}>
                  <td style={{ padding: '8px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>
                    {label}
                  </td>
                  <td style={{ padding: '8px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {data[id].customers}
                  </td>
                  <td style={{ padding: '8px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {data[id].requests}
                  </td>
                  {TRADEIN_PIE_STAGES.map((s) => (
                    <td key={s.id} style={{ padding: '8px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {data[id].stages[s.id] || 0}
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {hasUnknown ? (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          {data.unknown.requests} request lama tidak punya penanda channel, jadi tidak dimasukkan ke
          Dealer maupun OtoXpert. Ditampilkan terpisah agar totalnya tetap cocok.
        </div>
      ) : null}
    </div>
  )
}

function tradeinCountsByStage(rows) {
  const c = { new: 0, contacted: 0, pre_inspection: 0, inspected: 0, dealing: 0, cancel: 0 }
  for (const r of rows) {
    const s = deriveTradeinStage(r)
    if (Object.prototype.hasOwnProperty.call(c, s)) c[s] += 1
  }
  return c
}

function formatTs(ts) {
  if (ts?.toDate) return ts.toDate().toLocaleString('id-ID')
  return '-'
}

function TradeInPie({ counts }) {
  const total = TRADEIN_PIE_STAGES.reduce((sum, { id }) => sum + (counts[id] || 0), 0)

  let cumPct = 0
  const gradientStops =
    total > 0
      ? TRADEIN_PIE_STAGES.map(({ id, color }) => {
          const n = counts[id] || 0
          const pct = (n / total) * 100
          const start = cumPct
          cumPct += pct
          return `${color} ${start}% ${cumPct}%`
        }).join(', ')
      : null

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <div
        title={TRADEIN_PIE_STAGES.map(({ id, label }) => `${label}: ${counts[id] || 0}`).join(' · ')}
        style={{
          width: 160,
          height: 160,
          borderRadius: '50%',
          background:
            total === 0
              ? 'var(--border, #333)'
              : `conic-gradient(${gradientStops})`,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      />
      <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
        {TRADEIN_PIE_STAGES.map(({ id, label, color }) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: color,
                flexShrink: 0,
              }}
            />
            <span>
              {label}: <strong>{counts[id] || 0}</strong>
            </span>
          </div>
        ))}
        {total === 0 ? <div className="muted">Belum ada data trade in.</div> : null}
      </div>
    </div>
  )
}

export function DashboardHome() {
  const { role } = useAuth()
  const [tradeinRows, setTradeinRows] = useState([])
  const [tradeinErr, setTradeinErr] = useState('')
  const [regRows, setRegRows] = useState([])
  const [regErr, setRegErr] = useState('')

  const showTradeinPie = role && canReadTradeinOverview(role)
  const showRegist = role && canReadRegistrationRequests(role)

  useEffect(() => {
    if (!showTradeinPie) return undefined
    const unsub = listenTradeinRequests({
      onData: (r) => {
        setTradeinErr('')
        setTradeinRows(r)
      },
      onError: (e) => setTradeinErr(e?.message || 'Gagal memuat trade in'),
    })
    return () => unsub?.()
  }, [showTradeinPie])

  useEffect(() => {
    if (!showRegist) return undefined
    const unsub = listenRegistrationRequests({
      onData: (r) => {
        setRegErr('')
        setRegRows(r)
      },
      onError: (e) => setRegErr(e?.message || 'Gagal memuat permintaan registrasi'),
    })
    return () => unsub?.()
  }, [showRegist])

  // OtoXpert dibatasi ke channel-nya sendiri di seluruh aplikasi; overview ikut
  // aturan yang sama supaya angka pipeline dealer tidak bocor ke mitra.
  const scopedRows = useMemo(() => scopeRowsForRole(tradeinRows, role), [tradeinRows, role])
  const tiStageCounts = useMemo(() => tradeinCountsByStage(scopedRows), [scopedRows])
  const channelData = useMemo(() => channelBreakdown(tradeinRows), [tradeinRows])

  // Kartu perbandingan channel sifatnya lintas-channel, jadi tidak masuk akal
  // (dan tidak boleh) ditampilkan ke OtoXpert.
  const showChannelCompare = showTradeinPie && role !== 'otoxpert'

  const sortedRegRows = useMemo(() => {
    const copy = [...regRows]
    copy.sort((a, b) => {
      const ca = a.status === 'contacted' ? 1 : 0
      const cb = b.status === 'contacted' ? 1 : 0
      if (ca !== cb) return ca - cb
      const ta = a.createdAt?.toDate?.()?.getTime?.() || 0
      const tb = b.createdAt?.toDate?.()?.getTime?.() || 0
      return tb - ta
    })
    return copy
  }, [regRows])

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 900 }}>Dashboard</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Choose a module based on your role.
      </div>

      {showTradeinPie ? (
        <div className="card" style={{ marginTop: 16, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Trade In — ringkasan per pipeline</div>
          <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
            New, Contacted, Inspected, Dealing, Cancel (sama dengan tab Trade In Requests).
            {role === 'otoxpert' ? ' Khusus channel OtoXpert.' : ''}
          </div>
          {tradeinErr ? <div className="muted" style={{ color: 'salmon' }}>{tradeinErr}</div> : null}
          <TradeInPie counts={tiStageCounts} />
        </div>
      ) : null}

      {showChannelCompare ? (
        <div className="card" style={{ marginTop: 16, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            Perbandingan Channel — Dealer vs OtoXpert
          </div>
          <div className="muted" style={{ marginBottom: 14, fontSize: 12 }}>
            Jumlah customer unik per channel (dihitung dari nomor WA) dan sebaran pipeline-nya.
          </div>
          {tradeinErr ? <div className="muted" style={{ color: 'salmon' }}>{tradeinErr}</div> : null}
          <ChannelComparison data={channelData} />
        </div>
      ) : null}

      {showRegist ? (
        <div className="card" style={{ marginTop: 16, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Regist Request</div>
          <div className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
            Pelanggan dengan kendaraan belum terdaftar yang menekan &quot;Daftarkan&quot; di aplikasi.
          </div>
          {regErr ? <div className="muted" style={{ color: 'salmon', marginBottom: 8 }}>{regErr}</div> : null}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  {['Dibuat', 'No. Polisi', 'Status', ''].map((h) => (
                    <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRegRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted" style={{ padding: 12 }}>
                      Belum ada permintaan registrasi.
                    </td>
                  </tr>
                ) : (
                  sortedRegRows.map((r) => {
                    const done = r.status === 'contacted'
                    return (
                      <tr
                        key={r.id}
                        style={{
                          color: done ? 'var(--muted, #94a3b8)' : undefined,
                          opacity: done ? 0.72 : 1,
                          background: done ? 'rgba(148,163,184,0.06)' : undefined,
                        }}
                      >
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {formatTs(r.createdAt)}
                        </td>
                        <td
                          className="mono"
                          style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                        >
                          {r.plateNumber || '-'}
                        </td>
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {r.status || 'new'}
                        </td>
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {done ? null : (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => updateRegistrationRequest(r.id, { status: 'contacted' })}
                            >
                              Mark contacted
                            </button>
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
      ) : null}

      <div style={{ marginTop: 14, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {(role === 'supervisor' || role === 'aftersales') ? (
          <Link className="card" to="/app/customers" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>Customers</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>CRUD all customer data</div>
          </Link>
        ) : null}

        {role === 'supervisor' ? (
          <Link className="card" to="/app/pricelist" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>Pricelist</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>CRUD pricelist</div>
          </Link>
        ) : null}

        {role === 'aftersales' ? (
          <Link className="card" to="/app/tshop" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>Tshop</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>CRUD products / manage orders</div>
          </Link>
        ) : null}

        {role === 'tradein' ? (
          <Link className="card" to="/app/tradein-requests" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900 }}>Trade In Requests</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>WhatsApp response workflow</div>
          </Link>
        ) : null}
      </div>
    </div>
  )
}
