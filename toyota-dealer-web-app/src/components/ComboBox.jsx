/**
 * Input dengan saran dropdown yang bisa diketik (native <datalist>).
 * - Tetap menerima ketikan bebas (nilai tidak dibatasi ke daftar).
 * - Saat mengetik, browser otomatis menyaring saran sesuai teks.
 *
 * Props:
 *   id, value, onChange(value), options[], placeholder, autoCapitalize
 */
export function ComboBox({ id, value, onChange, options = [], placeholder, autoCapitalize }) {
  const listId = `${id}-list`
  // Buang duplikat & nilai kosong dari saran.
  const seen = new Set()
  const opts = options.filter((o) => {
    const s = String(o || '').trim()
    if (!s || seen.has(s.toLowerCase())) return false
    seen.add(s.toLowerCase())
    return true
  })

  return (
    <>
      <input
        id={id}
        className="input"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize={autoCapitalize}
      />
      <datalist id={listId}>
        {opts.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  )
}
