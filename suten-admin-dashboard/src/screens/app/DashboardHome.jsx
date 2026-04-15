import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../state/AuthContext.jsx'
import { listenTradeinRequests } from '../../firestore/tradeinRequests.js'
import {
  listenRegistrationRequests,
  updateRegistrationRequest,
} from '../../firestore/registrationRequestsAdmin.js'

function canReadTradeinOverview(role) {
  return role === 'root' || role === 'tradein' || role === 'supervisor' || role === 'aftersales'
}

function canReadRegistrationRequests(role) {
  return role === 'root' || role === 'supervisor' || role === 'aftersales'
}

function deriveTradeinStage(r) {
  if (r.adminStage) return r.adminStage
  if (r.status === 'cancelled' || r.status === 'canceled') return 'cancel'
  if (r.status === 'contacted') return 'contacted'
  return 'new'
}

function tradeinCounts(rows) {
  let newCount = 0
  let processed = 0
  for (const r of rows) {
    if (deriveTradeinStage(r) === 'new') newCount += 1
    else processed += 1
  }
  return { request: newCount, contacted: processed }
}

function formatTs(ts) {
  if (ts?.toDate) return ts.toDate().toLocaleString('id-ID')
  return '-'
}

function TradeInPie({ request, contacted }) {
  const total = request + contacted
  const requestPct = total ? (request / total) * 100 : 0
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <div
        title={`Request: ${request}, Contacted: ${contacted}`}
        style={{
          width: 140,
          height: 140,
          borderRadius: '50%',
          background:
            total === 0
              ? 'var(--border, #333)'
              : `conic-gradient(var(--accent, #3b82f6) 0 ${requestPct}%, var(--muted-fg, #64748b) ${requestPct}% 100%)`,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      />
      <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: 'var(--accent, #3b82f6)',
            }}
          />
          <span>
            Request: <strong>{request}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: 'var(--muted-fg, #64748b)',
            }}
          />
          <span>
            Contacted: <strong>{contacted}</strong>
          </span>
        </div>
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

  const { request: tiRequest, contacted: tiContacted } = useMemo(
    () => tradeinCounts(tradeinRows),
    [tradeinRows],
  )

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
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Trade In — ringkasan status</div>
          {tradeinErr ? <div className="muted" style={{ color: 'salmon' }}>{tradeinErr}</div> : null}
          <TradeInPie request={tiRequest} contacted={tiContacted} />
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
