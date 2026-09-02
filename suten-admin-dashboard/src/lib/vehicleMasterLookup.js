// MIRROR dari toyota-dealer-web-app/src/lib/vehicleMasterLookup.js
// Mesin taksasi HARUS identik di kedua app, kalau tidak hasil Re-Appraisal admin
// akan beda dari taksasi asli customer. Ubah di sini = wajib ubah di sana juga.
// Satu-satunya perbedaan yang diizinkan: path import firebase.
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase.js';
import { bestInYear, normText } from './vehicleMatch.js';

/**
 * Cari harga dasar unit di `vehicle_master`.
 *
 * PATOKAN UTAMA: TAHUN PEMBUATAN.
 *
 * Versi lama menyaring lebih dulu dengan `where('model','in',[...])`, yang menuntut
 * nama model sama PERSIS. Padahal database memakai nama generasi ("GRAND NEW AVANZA",
 * "ALL NEW XENIA", "NEW KIJANG INNOVA") sementara customer memilih nama pendek
 * ("Avanza", "Xenia", "Innova"). Akibatnya query sering tidak menemukan apa pun dan
 * harga jatuh ke tebakan kasar per segmen. Hal yang sama terjadi pada varian:
 * database menulis "1.3 G A/T" sedangkan input hanya "G A/T" atau "G CVT".
 *
 * Sekarang alurnya dibalik:
 *   1. Ambil semua unit pada TAHUN yang sama (tahun tidak pernah ambigu).
 *   2. Baru cocokkan model, merk, transmisi, dan varian di dalam tahun itu
 *      memakai pembandingan yang tahan beda penulisan (lihat vehicleMatch.js).
 *   3. Kalau tahun itu tidak punya model yang mirip, melebar ke +/-1, +/-2, +/-3
 *      tahun dan harganya disesuaikan 5% per tahun selisih.
 *
 * Efek samping yang ikut terselesaikan: `limit(50)` yang lama memotong kandidat
 * untuk 42 model bervarian banyak (PANTHER 166 baris, APV 165, TERIOS 152), sehingga
 * baris yang paling cocok bisa tidak pernah ikut dinilai.
 */

/**
 * Cache per tahun. Satu taksasi bisa memanggil lookup lebih dari sekali, dan satu
 * tahun berisi paling banyak sekitar 383 dokumen — tanpa cache, pembacaan Firestore
 * membengkak tanpa guna.
 */
const yearCache = new Map();

async function fetchByYear(year) {
  if (yearCache.has(year)) return yearCache.get(year);
  const snap = await getDocs(
    query(collection(db, 'vehicle_master'), where('tahun', '==', year), limit(600)),
  );
  const rows = snap.docs.map((d) => d.data());
  yearCache.set(year, rows);
  return rows;
}

export async function lookupBasePrice(merk = '', model = '', varian = '', transmisi = 'Matic', tahun = '2020') {
  const numYear = Number(String(tahun).replace(/\D/g, '')) || 2020;
  const criteria = { merk, model, varian, transmisi };

  // Tahun persis dulu, baru melebar. Selisih tahun yang kecil lebih bisa dipercaya
  // daripada menebak harga dari segmen.
  for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
    const year = numYear + offset;
    let rows = [];
    try {
      rows = await fetchByYear(year);
    } catch (err) {
      console.warn('vehicle_master query gagal, memakai fallback segmen:', err);
      break;
    }
    if (!rows.length) continue;

    const best = bestInYear(rows, criteria);
    if (!best) continue;

    let basePrice = Number(best.harga_dasar);
    const docYear = Number(best.tahun) || year;
    const yearGap = numYear - docYear;
    if (yearGap !== 0) basePrice = Math.round(basePrice * Math.pow(1.05, yearGap));

    return {
      base_price: basePrice,
      kode_demand: best.kode_demand || 'FM',
      matched_model: best.model || '',
      matched_variant: best.varian || '',
      matched_year: docYear,
      year_gap: yearGap,
    };
  }

  // Fallback terakhir: perkiraan kasar per segmen, hanya kalau model benar-benar
  // tidak ada di database untuk rentang tahun mana pun.
  const normModel = normText(model);
  let basePrice = 160000000;
  if (/AGYA|CALYA|AYLA|SIGRA/.test(normModel)) basePrice = 110000000;
  else if (/AVANZA|XENIA|RUSH|TERIOS|BRIO/.test(normModel)) basePrice = 165000000;
  else if (/XPANDER|EXPANDER|INNOVA|HR V|HRV|FORTUNER/.test(normModel)) basePrice = 220000000;
  else if (/ALPHARD|VELLFIRE|VOXY/.test(normModel)) basePrice = 750000000;

  const age = Math.max(0, new Date().getFullYear() - numYear);
  return {
    base_price: Math.round(basePrice * Math.pow(0.95, age)),
    kode_demand: 'FM',
    matched_model: '',
    matched_variant: '',
    matched_year: numYear,
    year_gap: 0,
    fallback: true,
  };
}
