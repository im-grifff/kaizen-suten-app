/** Sama dengan src/utils/plateFormat.js — untuk skrip Node (seed / migrate). */
export function normalizePlate(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, '')
}
