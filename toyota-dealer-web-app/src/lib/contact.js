/**
 * Nomor WhatsApp resmi yang dipakai tombol pada hasil taksasi.
 *
 * Sebelumnya kedua tombol ("Chat WhatsApp Bengkel" dan "Hubungi Sales")
 * hardcoded ke 6281234567890 — nomor contoh. Customer yang menekannya mengirim
 * pesan ke nomor yang tidak ada, dan tidak ada yang tahu.
 *
 * Untuk sementara bengkel dan sales memakai nomor yang sama. Kalau nanti
 * dipisah, cukup isi VITE_WA_BENGKEL dan VITE_WA_SALES dengan nilai berbeda —
 * tidak perlu menyentuh kode.
 *
 * Nilai bawaan sengaja diisi nomor asli, bukan string kosong, supaya tombolnya
 * tetap berfungsi walaupun env belum di-set di Vercel.
 */
const DEFAULT_WA = '6282197222519';

/** Ambil hanya angka; kalau hasilnya tidak masuk akal, pakai nilai bawaan. */
function waDigits(value, fallback) {
  const d = String(value ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d : fallback;
}

export const WA_BENGKEL = waDigits(import.meta.env.VITE_WA_BENGKEL, DEFAULT_WA);
export const WA_SALES = waDigits(import.meta.env.VITE_WA_SALES, DEFAULT_WA);
