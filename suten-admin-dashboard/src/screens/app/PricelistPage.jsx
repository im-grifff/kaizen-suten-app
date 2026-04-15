import { useEffect, useMemo, useState } from 'react'
import {
  createPricelistRow,
  deletePricelistRow,
  listenPricelist,
  updatePricelistRow,
} from '../../firestore/pricelistAdmin.js'

function emptyForm() {
  return { carName: '', otr: '', imageLabel: '', active: true }
}

export function PricelistPage() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [createForm, setCreateForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub = listenPricelist({
      onData: (r) => setRows(r),
      onError: (e) => setErr(e?.message || 'Failed to load pricelist'),
    })
    return () => unsub?.()
  }, [])

  const form = useMemo(() => (selected ? selected : createForm), [selected, createForm])

  async function onSaveExisting() {
    if (!selected?.id) return
    setSaving(true)
    try {
      await updatePricelistRow(selected.id, {
        carName: String(form.carName || ''),
        otr: Number(form.otr || 0),
        imageLabel: String(form.imageLabel || ''),
        active: Boolean(form.active),
      })
      setSelected(null)
    } finally {
      setSaving(false)
    }
  }

  async function onCreate(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await createPricelistRow({
        carName: String(form.carName || ''),
        otr: Number(form.otr || 0),
        imageLabel: String(form.imageLabel || ''),
        active: Boolean(form.active),
      })
      setCreateOpen(false)
      setCreateForm(emptyForm())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Pricelist</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Supervisor can create/update car pricelist data.
          </div>
        </div>
        <button className="btn btnPrimary" type="button" onClick={() => setCreateOpen(true)}>
          + Add
        </button>
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

      <div className="card" style={{ marginTop: 12, padding: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              {['Car', 'OTR', 'Image', 'Active', 'Updated', ''].map((h) => (
                <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{r.carName}</td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{r.otr}</td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{r.imageLabel}</td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {r.active ? 'yes' : 'no'}
                </td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {r.updatedAt?.toDate ? r.updatedAt.toDate().toLocaleString() : '-'}
                </td>
                <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <button className="btn" type="button" onClick={() => setSelected(r)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="muted" style={{ padding: 12 }} colSpan={6}>
                  No pricelist rows yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {(createOpen || selected) ? (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Pricelist editor"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCreateOpen(false)
              setSelected(null)
            }
          }}
        >
          <div className="modalCard" style={{ width: 'min(100%, 520px)' }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {selected ? 'Edit' : 'Add'} pricelist row
            </div>
            <form
              onSubmit={selected ? (e) => (e.preventDefault(), onSaveExisting()) : onCreate}
              style={{ marginTop: 12, display: 'grid', gap: 10 }}
            >
              <label className="muted" style={{ fontSize: 12 }}>
                Car name
              </label>
              <input
                className="input"
                value={form.carName || ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (selected) setSelected((s) => ({ ...s, carName: v }))
                  else setCreateForm((s) => ({ ...s, carName: v }))
                }}
              />

              <label className="muted" style={{ fontSize: 12 }}>
                OTR (number)
              </label>
              <input
                className="input"
                inputMode="numeric"
                value={form.otr || ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (selected) setSelected((s) => ({ ...s, otr: v }))
                  else setCreateForm((s) => ({ ...s, otr: v }))
                }}
              />

              <label className="muted" style={{ fontSize: 12 }}>
                Image label
              </label>
              <input
                className="input"
                value={form.imageLabel || ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (selected) setSelected((s) => ({ ...s, imageLabel: v }))
                  else setCreateForm((s) => ({ ...s, imageLabel: v }))
                }}
              />

              <label className="muted" style={{ fontSize: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(form.active)}
                  onChange={(e) => {
                    const v = e.target.checked
                    if (selected) setSelected((s) => ({ ...s, active: v }))
                    else setCreateForm((s) => ({ ...s, active: v }))
                  }}
                />
                Active
              </label>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
                {selected ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={async () => {
                      if (!confirm('Delete this row?')) return
                      await deletePricelistRow(selected.id)
                      setSelected(null)
                    }}
                  >
                    Delete
                  </button>
                ) : (
                  <div />
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setCreateOpen(false)
                      setSelected(null)
                      setCreateForm(emptyForm())
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button className="btn btnPrimary" type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

