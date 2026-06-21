export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

/**
 * Group a numeric string with '.' as thousand separator (id-ID style).
 * Non-digit characters are stripped first, so it is safe to call on
 * already-formatted values (idempotent).
 */
export function formatThousands(value) {
  const digits = digitsOnly(value)
  if (!digits) return ''
  return new Intl.NumberFormat('id-ID').format(Number(digits))
}
