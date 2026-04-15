/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from 'react'
import { useAuth } from './AuthContext.jsx'

const CartContext = createContext(null)

function cartKey(userId) {
  return `siteman_cart_${userId || 'guest'}`
}

export function CartProvider({ children }) {
  const { authUser } = useAuth()
  const uid = authUser?.uid || authUser?.phoneNumber || 'guest'
  const [items, setItems] = useState([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartKey(uid))
      const next = raw ? JSON.parse(raw) : []
      startTransition(() => setItems(next))
    } catch {
      startTransition(() => setItems([]))
    }
  }, [uid])

  useEffect(() => {
    try {
      localStorage.setItem(cartKey(uid), JSON.stringify(items))
    } catch {
      /* ignore */
    }
  }, [items, uid])

  const addItem = useCallback((product, qty = 1) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.productId === product.id)
      if (i === -1) {
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            category: product.category,
            price: product.price,
            qty: Math.max(1, qty),
          },
        ]
      }
      const next = [...prev]
      next[i] = { ...next[i], qty: next[i].qty + qty }
      return next
    })
  }, [])

  const setQty = useCallback((productId, qty) => {
    setItems((prev) => {
      const q = Math.max(0, Number(qty) || 0)
      if (q === 0) return prev.filter((x) => x.productId !== productId)
      return prev.map((x) =>
        x.productId === productId ? { ...x, qty: q } : x,
      )
    })
  }, [])

  const removeItem = useCallback((productId) => {
    setItems((prev) => prev.filter((x) => x.productId !== productId))
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const totals = useMemo(() => {
    const count = items.reduce((s, x) => s + x.qty, 0)
    const subtotal = items.reduce((s, x) => s + x.price * x.qty, 0)
    return { count, subtotal }
  }, [items])

  const value = {
    items,
    addItem,
    setQty,
    removeItem,
    clearCart,
    totals,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
