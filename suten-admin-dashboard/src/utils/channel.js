/**
 * Sumber customer (acquisition / source channel):
 * - first  = Dealer
 * - second = OtoExpert
 */
export const CHANNEL_FIRST = 'first'
export const CHANNEL_SECOND = 'second'

export const CHANNEL_OPTIONS = [
  { id: CHANNEL_FIRST, label: 'Dealer' },
  { id: CHANNEL_SECOND, label: 'OtoExpert' },
]

export function channelLabel(c) {
  if (c === CHANNEL_SECOND) return 'OtoExpert'
  if (c === CHANNEL_FIRST) return 'Dealer'
  return '-'
}

/** Channel sebuah request trade-in (fallback ke acquisitionChannel jika ada). */
export function requestChannel(r) {
  return r?.sourceChannel || r?.acquisitionChannel || ''
}
