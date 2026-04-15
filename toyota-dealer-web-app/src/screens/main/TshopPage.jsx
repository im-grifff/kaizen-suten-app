import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useCart } from '../../state/CartContext.jsx'
import {
  formatIdr,
  tshopCategoryLabels,
  tshopProducts,
} from '../../demo/demoData.js'
import { createTshopOrder, fetchActiveTshopProducts } from '../../firestore/tshop.js'

const CATS = ['spare_part', 'oli', 'ban']

export function TshopPage() {
  const { authUser, customerDisplayName, customerWaKey } = useAuth()
  const { items, addItem, setQty, totals, clearCart } = useCart()
  const [cat, setCat] = useState('spare_part')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [pickupDate, setPickupDate] = useState('')
  const [confirmOrder, setConfirmOrder] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [orderErr, setOrderErr] = useState('')
  const [products, setProducts] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchActiveTshopProducts()
        if (!cancelled) setProducts(list)
      } catch {
        if (!cancelled) setProducts([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const effectiveProducts = useMemo(() => {
    if (products && products.length > 0) return products
    return tshopProducts
  }, [products])

  const filtered = useMemo(() => effectiveProducts.filter((p) => p.category === cat), [effectiveProducts, cat])

  function openCheckout() {
    setDoneMsg('')
    setOrderErr('')
    setPickupDate('')
    setConfirmOrder(false)
    setCheckoutOpen(true)
  }

  async function onOrderParts(e) {
    e.preventDefault()
    setOrderErr('')
    if (!pickupDate || !confirmOrder || items.length === 0) return
    if (!authUser?.uid) {
      setOrderErr('Sesi login belum siap. Silakan refresh halaman lalu coba lagi.')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        customerUid: authUser.uid,
        plateNumber: '',
        customerWaKey: customerWaKey || '',
        customerName: customerDisplayName || '',
        pickupDate: pickupDate || '',
        items: items.map((x) => ({
          productId: x.productId,
          name: x.name,
          category: x.category,
          price: x.price,
          qty: x.qty,
        })),
        totalAmount: totals.subtotal,
      }
      const row = await createTshopOrder(payload)
      clearCart()
      setCheckoutOpen(false)
      setDoneMsg(`Pesanan terkirim (ID: ${row.id.slice(0, 8)}…). Admin akan memproses.`)
    } catch (err) {
      const code = err?.code || ''
      if (code === 'permission-denied') {
        setOrderErr('Tidak punya izin untuk membuat order. Pastikan Anda sudah login dan coba lagi.')
      } else {
        setOrderErr(err?.message || 'Gagal membuat order.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page page--tshop">
      <div className="tshopHead">
        <div>
          <h1 className="h1">Tshop</h1>
          <p className="muted small">
            Spare part, oli, dan ban — masukkan ke keranjang lalu konfirmasi pembelian.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--small btn--primary tshopCartBtn"
          onClick={openCheckout}
        >
          Keranjang
          {totals.count > 0 ? (
            <span className="tshopCartBadge">{totals.count}</span>
          ) : null}
        </button>
      </div>

      <div className="segmented segmented--3" role="tablist" aria-label="Kategori Tshop">
        {CATS.map((c) => (
          <button
            key={c}
            type="button"
            className={`segmented__item ${cat === c ? 'isActive' : ''}`}
            onClick={() => setCat(c)}
            role="tab"
            aria-selected={cat === c}
          >
            {tshopCategoryLabels[c]}
          </button>
        ))}
      </div>

      {doneMsg ? (
        <div className="alert alert--ok" style={{ marginTop: 12 }}>
          {doneMsg}
        </div>
      ) : null}

      <div className="tshopGrid">
        {filtered.map((p) => (
          <div key={p.id} className="tshopCard">
            <div className="tshopCard__name">{p.name}</div>
            <div className="tshopCard__price mono">Rp {formatIdr(p.price)}</div>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => addItem(p, 1)}
            >
              Tambah ke keranjang
            </button>
          </div>
        ))}
      </div>

      {checkoutOpen ? (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCheckoutOpen(false)
          }}
        >
          <div className="modalCard">
            <h2 id="checkout-title" className="h2">
              Konfirmasi pembelian
            </h2>
            <p className="muted small">
              Order akan dikirim ke Dashboard admin.
            </p>

            {orderErr ? (
              <div className="alert alert--error" style={{ marginTop: 12 }}>
                {orderErr}
              </div>
            ) : null}

            {items.length === 0 ? (
              <p className="muted" style={{ marginTop: 12 }}>
                Keranjang kosong.
              </p>
            ) : (
              <ul className="checkoutList">
                {items.map((line) => (
                  <li key={line.productId} className="checkoutLine">
                    <div>
                      <div className="checkoutLine__name">{line.name}</div>
                      <div className="muted small">
                        {tshopCategoryLabels[line.category] || line.category}
                      </div>
                    </div>
                    <div className="checkoutLine__right">
                      <input
                        type="number"
                        min={1}
                        className="input input--qty"
                        value={line.qty}
                        onChange={(e) =>
                          setQty(line.productId, e.target.value)
                        }
                      />
                      <span className="mono small">
                        Rp {formatIdr(line.price * line.qty)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form className="form" onSubmit={onOrderParts} style={{ marginTop: 14 }}>
              <label className="label" htmlFor="pickupDate">
                Tanggal pengambilan pesanan
              </label>
              <input
                id="pickupDate"
                type="date"
                className="input"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                required
              />

              <label className="checkRow">
                <input
                  type="checkbox"
                  checked={confirmOrder}
                  onChange={(e) => setConfirmOrder(e.target.checked)}
                />
                <span>
                  Apakah Anda yakin ingin memesan produk ini?
                </span>
              </label>

              <button
                type="submit"
                className="btn btn--primary"
                disabled={
                  submitting ||
                  items.length === 0 ||
                  !pickupDate ||
                  !confirmOrder
                }
              >
                {submitting ? 'Memproses…' : 'Order Parts'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setCheckoutOpen(false)}
              >
                Tutup
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
