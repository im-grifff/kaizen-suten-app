// MIRROR dari toyota-dealer-web-app/src/lib/vehicleMatch.js
// Mesin taksasi HARUS identik di kedua app, kalau tidak hasil Re-Appraisal admin
// akan beda dari taksasi asli customer. Ubah di sini = wajib ubah di sana juga.
// Satu-satunya perbedaan yang diizinkan: path import firebase.
/**
 * Pencocokan unit ke baris `vehicle_master` — logika murni, tanpa Firestore.
 *
 * Sengaja dipisah dari vehicleMasterLookup.js supaya bisa diuji langsung di Node
 * dengan data produksi, tanpa perlu menyalakan Firebase SDK.
 *
 * Masalah yang diselesaikan: nama model dan varian di database tidak pernah sama
 * persis dengan yang diketik/dipilih customer.
 *   database "GRAND NEW AVANZA"  vs  input "Avanza"
 *   database "ALL NEW XENIA"     vs  input "Xenia"
 *   database "NEW KIJANG INNOVA" vs  input "Innova"
 *   database "1.3 G A/T"         vs  input "G A/T" atau "G CVT"
 */

/** Label generasi yang dipakai database tapi tidak diketik customer. */
const GENERATION_WORDS = /\b(?:THE\s+)?(?:ALL\s+NEW|GRAND\s+NEW|ALL-NEW|GRAND|GREAT|NEW)\b/g;

/**
 * Beda penulisan nama yang sama antara katalog dan database.
 * Kedua sisi dinormalkan ke bentuk kanan supaya tidak perlu tahu mana yang benar.
 * Sengaja memakai pencocokan teks biasa, bukan regex, agar tidak ada masalah escaping.
 */
const MULTIWORD_ALIASES = [
  ['HR V', 'HRV'],
  ['CR V', 'CRV'],
  ['BR V', 'BRV'],
  ['WR V', 'WRV'],
  ['XL 7', 'XL7'],
  ['GRAN MAX', 'GRANMAX'],
  ['GRAND MAX', 'GRANMAX'],
  ['S PRESSO', 'SPRESSO'],
];

/** Alias per kata: database menulis EXPANDER, katalog menulis XPANDER. */
const TOKEN_ALIASES = {
  EXPANDER: 'XPANDER',
};
export function normText(s) {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "GRAND NEW AVANZA" dan "Avanza" sama-sama menjadi "AVANZA". */
export function modelCore(s) {
  let out = normText(s).replace(GENERATION_WORDS, ' ').replace(/\s+/g, ' ').trim();
  for (const pair of MULTIWORD_ALIASES) {
    if (out.includes(pair[0])) out = out.split(pair[0]).join(pair[1]);
  }
  return out
    .split(' ')
    .filter(Boolean)
    .map(function (t) { return TOKEN_ALIASES[t] || t; })
    .join(' ');
}

/**
 * Merk yang berbeda = mobil yang berbeda, seberapa pun miripnya nama model.
 *
 * Tanpa penjagaan ini, "Xpander Cross" (Mitsubishi) tercocok ke model bernama
 * "CROSS" (Datsun) hanya karena namanya termuat di dalamnya — harganya meleset
 * jauh. Kalau salah satu merk kosong, jangan menyaring.
 */
export function merkConflict(inputMerk, docMerk) {
  const a = normText(inputMerk);
  const b = normText(docMerk);
  if (!a || !b) return false;
  return !(a === b || a.includes(b) || b.includes(a));
}

/** Samakan penulisan transmisi: A/T, AT, Matic, CVT -> AT; M/T, MT, Manual -> MT. */
export function transCode(s) {
  const t = normText(s).replace(/\//g, '');
  if (/\b(?:AT|MATIC|OTOMATIS|AUTOMATIC|CVT)\b/.test(t)) return 'AT';
  if (/\b(?:MT|MANUAL)\b/.test(t)) return 'MT';
  return '';
}

/** "1.3 G A/T" dan "G A/T" sama-sama menjadi "G AT". */
export function variantCore(s) {
  return normText(s)
    .replace(/^[A-Z]{1,3}\s*:\s*/, ' ')
    .replace(/\b\d\.\d\b/g, ' ')
    .replace(/\b\d{3,4}\s?CC\b/g, ' ')
    .replace(GENERATION_WORDS, ' ')
    .replace(/\//g, '')
    .replace(/\b(?:MATIC|OTOMATIS|AUTOMATIC)\b/g, 'AT')
    .replace(/\bMANUAL\b/g, 'MT')
    .replace(/\s+/g, ' ')
    .trim();
}

const tokensOf = (s) => s.split(' ').filter(Boolean);

/** Berapa bagian dari daftar kata yang lebih pendek yang juga ada di daftar satunya. */
export function overlapRatio(a, b) {
  const A = tokensOf(a);
  const B = tokensOf(b);
  if (!A.length || !B.length) return 0;
  const setB = new Set(B);
  const hit = A.filter((t) => setB.has(t)).length;
  return hit / Math.min(A.length, B.length);
}

/** 0..100. Di bawah MODEL_MIN dianggap mobil yang berbeda, jangan dipakai. */
export function modelScore(inputModel, docModel) {
  const a = modelCore(inputModel);
  const b = modelCore(docModel);
  if (!a || !b) return 0;
  if (a === b) return 100;
  const aPad = ' ' + a + ' ';
  const bPad = ' ' + b + ' ';
  if (aPad.includes(bPad) || bPad.includes(aPad)) return 85;
  return Math.round(overlapRatio(a, b) * 80);
}

export const MODEL_MIN = 50;

export function variantScore(inputVar, docVar) {
  const a = variantCore(inputVar);
  const b = variantCore(docVar);
  if (!a || !b) return 15; // varian tidak diisi -> netral, jangan menghukum
  if (a === b) return 45;
  const aPad = ' ' + a + ' ';
  const bPad = ' ' + b + ' ';
  if (aPad.includes(bPad) || bPad.includes(aPad)) return 35;
  return Math.round(overlapRatio(a, b) * 30);
}

/**
 * Kandidat terbaik di antara baris satu tahun, atau null kalau tidak ada model
 * yang cukup mirip. Tahun sudah dikunci di pemanggil, jadi di sini model yang
 * paling menentukan.
 */
export function bestInYear(rows, criteria) {
  const inMerk = normText(criteria.merk);
  const inTrans = transCode(criteria.transmisi);
  let best = null;
  let bestScore = -1;

  for (const d of rows) {
    if (!(Number(d.harga_dasar) > 0)) continue;
    if (merkConflict(criteria.merk, d.merk)) continue; // merk beda = mobil lain
    const ms = modelScore(criteria.model, d.model);
    if (ms < MODEL_MIN) continue; // mobil lain, jangan dipertimbangkan

    let score = ms * 2;
    if (inMerk && inMerk === normText(d.merk)) score += 20;
    const dTrans = transCode(d.transmisi) || transCode(d.varian);
    if (inTrans && dTrans && inTrans === dTrans) score += 25;
    score += variantScore(criteria.varian, d.varian);

    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}
