import { useEffect, useMemo, useState } from 'react'
import {
  createTshopProduct,
  deleteTshopProduct,
  listenTshopOrders,
  listenTshopProducts,
  updateTshopOrder,
  updateTshopProduct,
} from '../../firestore/tshopAdmin.js'

const CATS = [
  { id: 'spare_part', label: 'Spare Part' },
  { id: 'oli', label: 'Oli' },
  { id: 'ban', label: 'Ban' },
]

function emptyProduct() {
  return { name: '', category: 'spare_part', price: '', active: true }
}

export function TshopAdminPage() {
  const [tab, setTab] = useState('products')
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(emptyProduct)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const unsub1 = listenTshopProducts({
      onData: (r) => setProducts(r),
      onError: (e) => setErr(e?.message || 'Failed to load products'),
    })
    const unsub2 = listenTshopOrders({
      onData: (r) => setOrders(r),
      onError: (e) => setErr(e?.message || 'Failed to load orders'),
    })
    return () => {
      unsub1?.()
      unsub2?.()
    }
  }, [])

  const productForm = useMemo(() => (selected ? selected : createForm), [selected, createForm])

  async function onCreateProduct(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await createTshopProduct({
        name: String(productForm.name || ''),
        category: String(productForm.category || 'spare_part'),
        price: Number(productForm.price || 0),
        active: Boolean(productForm.active),
      })
      setCreateOpen(false)
      setCreateForm(emptyProduct())
    } finally {
      setSaving(false)
    }
  }

  async function onSaveProduct() {
    if (!selected?.id) return
    setSaving(true)
    try {
      await updateTshopProduct(selected.id, {
        name: String(productForm.name || ''),
        category: String(productForm.category || 'spare_part'),
        price: Number(productForm.price || 0),
        active: Boolean(productForm.active),
      })
      setSelected(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Tshop</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Aftersales can manage products and update orders.
          </div>
        </div>
        {tab === 'products' ? (
          <button className="btn btnPrimary" type="button" onClick={() => setCreateOpen(true)}>
            + Add product
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button className={`btn ${tab === 'products' ? 'btnPrimary' : ''}`} onClick={() => setTab('products')}>
          Products
        </button>
        <button className={`btn ${tab === 'orders' ? 'btnPrimary' : ''}`} onClick={() => setTab('orders')}>
          Orders
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

      {tab === 'products' ? (
        <div className="card" style={{ marginTop: 12, padding: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {['Name', 'Category', 'Price', 'Active', 'Updated', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{p.name}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{p.category}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{p.price}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{p.active ? 'yes' : 'no'}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {p.updatedAt?.toDate ? p.updatedAt.toDate().toLocaleString() : '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <button className="btn" type="button" onClick={() => setSelected(p)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 ? (
                <tr>
                  <td className="muted" style={{ padding: 12 }} colSpan={6}>
                    No products yet. Add one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 12, padding: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                {['Created', 'Customer', 'Plate', 'Pickup', 'Total', 'Status', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {o.customerName || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {o.plateNumber || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {o.pickupDate || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {o.totalAmount || 0}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {o.status || 'pending'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <select
                      className="input"
                      style={{ padding: '8px 10px' }}
                      value={o.status || 'pending'}
                      onChange={(e) => updateTshopOrder(o.id, { status: e.target.value })}
                    >
                      {['pending', 'processing', 'completed', 'cancelled'].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td className="muted" style={{ padding: 12 }} colSpan={7}>
                    No orders yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {(createOpen || selected) ? (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Product editor"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCreateOpen(false)
              setSelected(null)
              setCreateForm(emptyProduct())
            }
          }}
        >
          <div className="modalCard" style={{ width: 'min(100%, 520px)' }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{selected ? 'Edit' : 'Add'} product</div>
            <form
              onSubmit={selected ? (e) => (e.preventDefault(), onSaveProduct()) : onCreateProduct}
              style={{ marginTop: 12, display: 'grid', gap: 10 }}
            >
              <label className="muted" style={{ fontSize: 12 }}>
                Name
              </label>
              <input
                className="input"
                value={productForm.name || ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (selected) setSelected((s) => ({ ...s, name: v }))
                  else setCreateForm((s) => ({ ...s, name: v }))
                }}
              />

              <label className="muted" style={{ fontSize: 12 }}>
                Category
              </label>
              <select
                className="input"
                value={productForm.category || 'spare_part'}
                onChange={(e) => {
                  const v = e.target.value
                  if (selected) setSelected((s) => ({ ...s, category: v }))
                  else setCreateForm((s) => ({ ...s, category: v }))
                }}
              >
                {CATS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              <label className="muted" style={{ fontSize: 12 }}>
                Price (number)
              </label>
              <input
                className="input"
                inputMode="numeric"
                value={productForm.price || ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (selected) setSelected((s) => ({ ...s, price: v }))
                  else setCreateForm((s) => ({ ...s, price: v }))
                }}
              />

              <label className="muted" style={{ fontSize: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(productForm.active)}
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
                      if (!confirm('Delete this product?')) return
                      await deleteTshopProduct(selected.id)
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
                      setCreateForm(emptyProduct())
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

