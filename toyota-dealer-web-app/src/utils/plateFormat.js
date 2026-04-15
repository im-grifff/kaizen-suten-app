/**
 * Format kanonik plat: HURUF BESAR, tanpa spasi (contoh: DB1233KG).
 * Dipakai untuk login, plate_index, dan dokumen users/{plat}.
 */
export function normalizePlate(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, '')
}
