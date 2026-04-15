/**
 * Format kanonik plat: HURUF BESAR, tanpa spasi (contoh: DB1233KG).
 */
export function normalizePlate(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, '')
}
