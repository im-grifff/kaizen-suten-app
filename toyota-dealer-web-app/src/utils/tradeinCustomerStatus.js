import { formatIdr } from '../demo/demoData.js'

export function estimatePresent(r) {
  const low = r?.estimateLow
  const high = r?.estimateHigh
  return (low != null && Number(low) > 0) || (high != null && Number(high) > 0)
}

export function deriveTradeinCustomerStage(r) {
  return (
    r.adminStage ||
    (r.status === 'cancelled' || r.status === 'canceled'
      ? 'cancel'
      : r.status === 'contacted'
        ? 'contacted'
        : 'new')
  )
}

function formatEstimateRangeFromDoc(r) {
  const low = r.estimateLow
  const high = r.estimateHigh
  const lowS = low != null && Number(low) > 0 ? new Intl.NumberFormat('id-ID').format(Number(low)) : ''
  const highS = high != null && Number(high) > 0 ? new Intl.NumberFormat('id-ID').format(Number(high)) : ''
  if (lowS && highS) return `Estimasi Rp${lowS} – Rp${highS}`
  if (lowS) return `Estimasi Rp${lowS}`
  if (highS) return `Estimasi Rp${highS}`
  return ''
}

export function customerTradeInPriceLabel(r) {
  const stage = deriveTradeinCustomerStage(r)
  if (stage === 'cancel') return r.cancelReason ? `Dibatalkan — ${r.cancelReason}` : 'Dibatalkan'
  if (stage === 'dealing') {
    const fp =
      r.fixedPrice != null && Number(r.fixedPrice) > 0 ? formatIdr(Number(r.fixedPrice)) : '-'
    return `Dealing — Harga fix ${fp}`
  }
  if (stage === 'pre_inspection') {
    if (!estimatePresent(r)) return 'Menunggu Estimasi Harga'
    return 'Pre Inspeksi — Menunggu jadwal'
  }
  // Status Baru: tampilkan angka estimasi admin (bukan teks "Menunggu jadwal inspeksi").
  if (stage === 'new') {
    if (!estimatePresent(r)) return 'Menunggu Estimasi Harga'
    return formatEstimateRangeFromDoc(r) || 'Menunggu Estimasi Harga'
  }
  if (!estimatePresent(r)) return 'Menunggu Estimasi Harga'
  return 'Menunggu Jadwal Inspeksi'
}

export function pipelineLabel(r) {
  const stage = deriveTradeinCustomerStage(r)
  const map = {
    new: 'Baru',
    contacted: 'Dihubungi',
    pre_inspection: 'Pre Inspeksi',
    inspected: 'Inspeksi',
    dealing: 'Dealing',
    cancel: 'Batal',
  }
  return map[stage] || String(stage)
}
