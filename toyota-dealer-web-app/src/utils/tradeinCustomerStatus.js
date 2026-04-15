import { formatIdr } from '../demo/demoData.js'

function estimatePresent(r) {
  const low = r.estimateLow
  const high = r.estimateHigh
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

export function customerTradeInPriceLabel(r) {
  const stage = deriveTradeinCustomerStage(r)
  if (stage === 'cancel') return r.cancelReason ? `Dibatalkan — ${r.cancelReason}` : 'Dibatalkan'
  if (stage === 'dealing') {
    const fp =
      r.fixedPrice != null && Number(r.fixedPrice) > 0 ? formatIdr(Number(r.fixedPrice)) : '-'
    return `Dealing — Harga fix ${fp}`
  }
  if (!estimatePresent(r)) return 'Menunggu Estimasi Harga'
  return 'Menunggu Jadwal Inspeksi'
}

export function pipelineLabel(r) {
  const stage = deriveTradeinCustomerStage(r)
  const map = {
    new: 'Baru',
    contacted: 'Dihubungi',
    inspected: 'Inspeksi',
    dealing: 'Dealing',
    cancel: 'Batal',
  }
  return map[stage] || String(stage)
}
