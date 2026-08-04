/**
 * Penyaringan berdasarkan rentang tanggal untuk tabel yang memakai `createdAt`.
 *
 * Nilai `createdAt` bisa berupa Timestamp Firestore (data produksi) atau string
 * ISO / Date (data demo & hasil import lama), jadi semua bentuk itu ditangani.
 */

export function toDateOrNull(v) {
  if (!v) return null
  const d = v?.toDate ? v.toDate() : v instanceof Date ? v : new Date(v)
  return Number.isNaN(d?.getTime?.()) ? null : d
}

/**
 * Batas rentang memakai waktu lokal, dan tanggal akhir bersifat inklusif
 * (sampai 23:59:59.999) — kalau tidak, memilih tanggal yang sama untuk "dari"
 * dan "sampai" akan menghasilkan nol baris, yang bikin bingung.
 */
export function inDateRange(value, from, to) {
  if (!from && !to) return true
  const d = toDateOrNull(value)
  if (!d) return false // baris tanpa tanggal tidak bisa dipastikan masuk rentang

  if (from) {
    const [fy, fm, fd] = from.split('-').map(Number)
    if (d < new Date(fy, fm - 1, fd, 0, 0, 0, 0)) return false
  }
  if (to) {
    const [ty, tm, td] = to.split('-').map(Number)
    if (d > new Date(ty, tm - 1, td, 23, 59, 59, 999)) return false
  }
  return true
}

const pad = (n) => String(n).padStart(2, '0')
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Pintasan rentang yang paling sering dipakai. */
export function presetRange(id) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (id) {
    case 'today':
      return { from: fmt(today), to: fmt(today) }
    case 'week': {
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      return { from: fmt(start), to: fmt(today) }
    }
    case 'month':
      return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(today) }
    case 'prevMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: fmt(first), to: fmt(last) }
    }
    case 'year':
      return { from: fmt(new Date(now.getFullYear(), 0, 1)), to: fmt(today) }
    default:
      return { from: '', to: '' }
  }
}

export const DATE_PRESETS = [
  { id: 'today', label: 'Hari ini' },
  { id: 'week', label: '7 hari' },
  { id: 'month', label: 'Bulan ini' },
  { id: 'prevMonth', label: 'Bulan lalu' },
  { id: 'year', label: 'Tahun ini' },
]

/** Label ringkas rentang aktif, untuk ditulis di nama file export. */
export function rangeSlug(from, to) {
  if (!from && !to) return 'semua'
  if (from && to) return from === to ? from : `${from}_sd_${to}`
  return from ? `dari-${from}` : `sampai-${to}`
}
