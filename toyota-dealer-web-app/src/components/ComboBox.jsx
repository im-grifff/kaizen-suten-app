import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Dropdown yang bisa diketik (custom, bukan <datalist> native).
 * - Panah dropdown selalu terlihat (termasuk di mobile).
 * - Klik panah / fokus input => daftar langsung muncul.
 * - Mengetik menyaring daftar; tetap menerima teks bebas.
 * - Kalau nilai saat ini sudah sama persis dengan salah satu opsi, membuka daftar
 *   menampilkan SEMUA opsi (tidak perlu hapus dulu untuk ganti pilihan).
 *
 * Props: id, value, onChange(value), options[], placeholder
 */
export function ComboBox({ id, value, onChange, options = [], placeholder }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const norm = (s) => String(s || '').trim().toLowerCase()

  const list = useMemo(() => {
    const seen = new Set()
    const clean = options
      .map((o) => String(o || '').trim())
      .filter((o) => o && !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase()))
    const v = norm(value)
    const isExact = clean.some((o) => norm(o) === v)
    if (!v || isExact) return clean // tampilkan semua saat kosong / sudah terpilih
    return clean.filter((o) => norm(o).includes(v))
  }, [options, value])

  useEffect(() => {
    function onDocDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('touchstart', onDocDown)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('touchstart', onDocDown)
    }
  }, [])

  function pick(opt) {
    onChange(opt)
    setOpen(false)
  }

  return (
    <div className="combo" ref={wrapRef}>
      <input
        id={id}
        className="input combo__input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      <button
        type="button"
        className="combo__arrow"
        tabIndex={-1}
        aria-label="Tampilkan pilihan"
        onMouseDown={(e) => {
          e.preventDefault()
          setOpen((o) => !o)
        }}
      >
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && list.length > 0 ? (
        <ul className="combo__list" role="listbox">
          {list.map((opt) => (
            <li
              key={opt}
              role="option"
              aria-selected={norm(opt) === norm(value)}
              className={`combo__opt${norm(opt) === norm(value) ? ' is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(opt)
              }}
            >
              {opt}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
