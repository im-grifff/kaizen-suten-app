export const INSURANCE_TERM_OPTIONS = [1, 2, 3, 4, 5]

/**
 * Jenis asuransi berdasarkan masa (tahun).
 * n=1 → 1AR, 1TLO
 * n=2 → 1AR-1TLO, 2AR, 2TLO
 * n=3 → 1AR-2TLO, 2AR-1TLO, 3AR, 3TLO … dst.
 */
export function getInsuranceTypeOptions(years) {
  const n = Number(years)
  if (!Number.isFinite(n) || n < 1 || n > 5) return []
  if (n === 1) return ['1AR', '1TLO']
  const opts = []
  for (let i = 1; i < n; i += 1) {
    opts.push(`${i}AR-${n - i}TLO`)
  }
  opts.push(`${n}AR`, `${n}TLO`)
  return opts
}

export function isValidInsuranceType(years, type) {
  if (!type) return false
  return getInsuranceTypeOptions(years).includes(String(type))
}
