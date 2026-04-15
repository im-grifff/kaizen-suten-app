/** Normalisasi ke kunci dokumen WA (hanya digit, awalan 62). */
export function normalizeWaKey(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('0')) d = `62${d.slice(1)}`
  else if (d.startsWith('8')) d = `62${d}`
  else if (!d.startsWith('62') && d.length > 0) d = `62${d}`
  return d
}

export function isValidWaKey(waKey) {
  return typeof waKey === 'string' && waKey.length >= 11 && waKey.length <= 15 && waKey.startsWith('62')
}
