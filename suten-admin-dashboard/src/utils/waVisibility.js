/**
 * Aturan siapa yang boleh melihat nomor WhatsApp customer.
 *
 * Dikumpulkan di satu file supaya tidak tercecer di beberapa halaman — dulu
 * aturannya cuma ada di TradeInRequestsPage, sehingga halaman Customers tetap
 * menampilkan nomor untuk role yang seharusnya tidak boleh melihat.
 */

/** Role yang TIDAK PERNAH boleh melihat nomor WA customer. */
const WA_BLIND_ROLES = ['sa', 'otoxpert']

/**
 * Apakah role ini buta-nomor untuk semua baris?
 *
 * Berbeda dengan `tradein` yang hanya disembunyikan pada baris tertentu
 * (lihat di bawah), role di sini disembunyikan tanpa syarat.
 */
export function isWaBlindRole(role) {
  return WA_BLIND_ROLES.includes(role)
}

/**
 * Apakah nomor WA pada satu baris harus disembunyikan dari penonton saat ini?
 *
 * - `sa` & `otoxpert` : selalu disembunyikan.
 * - `tradein` (Otozentrum): disembunyikan hanya bila customer mengisi nama sales,
 *   supaya prospek milik sales dealer tidak diambil alih.
 * - Role lain: terlihat.
 */
export function shouldHideCustomerWa(role, row) {
  if (isWaBlindRole(role)) return true
  if (role === 'tradein') return String(row?.salesName || '').trim().length > 0
  return false
}

/**
 * Nomor WA tidak boleh ikut jadi bahan pencarian untuk role yang buta-nomor.
 *
 * Kalau tetap diikutkan, nomor yang disembunyikan masih bisa dipastikan dengan
 * mengetikkannya di kotak cari dan melihat baris mana yang tersisa — kolomnya
 * tertutup, tapi datanya tetap bocor.
 */
export function canSearchByWa(role) {
  return !isWaBlindRole(role)
}
