import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { listenTradeinRequests, updateTradeinRequest } from '../../firestore/tradeinRequests.js'
import { getUserById } from '../../firestore/usersLookup.js'
import { normalizePlate } from '../../utils/plateFormat.js'

function buildWaUrl({ phone, message }) {
  const normalized = String(phone || '').replace(/[^\d]/g, '')
  return `https://wa.me/${encodeURIComponent(normalized)}?text=${encodeURIComponent(message)}`
}

function toDigits(raw) {
  const d = String(raw || '').replace(/[^\d]/g, '')
  return d
}

function formatIdrCompact(rawDigits) {
  const digits = toDigits(rawDigits)
  if (!digits) return ''
  const n = Number(digits)
  if (!Number.isFinite(n)) return ''
  return new Intl.NumberFormat('id-ID').format(n)
}

export function TradeInRequestsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [estimates, setEstimates] = useState({}) // { [requestId]: { low: string, high: string } }
  const [savingId, setSavingId] = useState('')
  const [phoneCache, setPhoneCache] = useState({}) // { [plate]: waPhone }

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

  // init local state from Firestore fields (if any)
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
  }, [rows])

  const rowById = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(r.id, r)
    return m
  }, [rows])

  async function ensureCustomerPhone({ plate }) {
    const p = normalizePlate(plate)
    if (!p) return null
    if (phoneCache[p]) return phoneCache[p]
    const u = await getUserById(p)
    const wa = u?.waPhone || ''
    if (wa) setPhoneCache((s) => ({ ...s, [p]: wa }))
    return wa || null
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

  async function onChat(r) {
    const customerName = r.customerName || 'Customer'
    const carType = r.carType || '-'
    const year = r.year || '-'
    const plate = normalizePlate(r.plateNumber || r.vehiclePlate || '')

    const e = estimates[r.id] || {}
    const low = formatIdrCompact(e.low)
    const high = formatIdrCompact(e.high)
    const range =
      low && high ? `Rp${low} - Rp${high}` : low ? `Rp${low}` : high ? `Rp${high}` : '-'

    const phoneFromRequest = r.customerPhone || r.phone
    const phone = phoneFromRequest || (await ensureCustomerPhone({ plate }))
    if (!phone) {
      setErr('Nomor WhatsApp customer belum ada. Pastikan `users/{PLATE}.waPhone` terisi.')
      return
    }

    const msg = `Halo ${customerName}, kami dari SUTEN. Kami sudah menerima request inspeksi Trade In untuk ${carType} tahun ${year}. estimasi harga: ${range}. Kapan Anda tersedia untuk inspeksi?`

    // Simpan estimasi jika ada perubahan sebelum chat (best-effort)
    try {
      await persistEstimate(r.id)
    } catch {
      // ignore save failure; still allow WA message
    }

    window.open(buildWaUrl({ phone, message: msg }), '_blank', 'noreferrer')
  }

  return (
    <div>
      <div style={{ fontWeight: 900, fontSize: 18 }}>Trade In Requests</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Click “Chat WhatsApp” to contact the customer.
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

        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {['Created', 'Customer', 'Phone', 'Car', 'Year', 'Estimasi (Rp)', 'Status', '', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const customerName = r.customerName || 'Customer'
                const plate = normalizePlate(r.plateNumber || '')
                const phone = r.customerPhone || r.phone || phoneCache[plate] || ''
                const carType = r.carType || '-'
                const year = r.year || '-'
                const e = estimates[r.id] || { low: '', high: '' }
                return (
                  <tr key={r.id}>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : new Date().toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{customerName}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{phone}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{carType}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{year}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          className="input"
                          style={{ width: 140 }}
                          placeholder="Rp (min)"
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
                          style={{ width: 140 }}
                          placeholder="Rp (max)"
                          value={e.high}
                          onChange={(ev) => {
                            const v = ev.target.value
                            setEstimates((s) => ({ ...s, [r.id]: { ...(s[r.id] || {}), high: v } }))
                          }}
                          onBlur={() => persistEstimate(r.id)}
                        />
                        {savingId === r.id ? <span className="muted">Saving…</span> : null}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{r.status}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <button
                        className="btn btnPrimary"
                        type="button"
                        onClick={() => onChat(r)}
                      >
                        Chat WhatsApp
                      </button>
                    </td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => updateTradeinRequest(r.id, { status: 'contacted' })}
                      >
                        Mark contacted
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

