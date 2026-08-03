// ⚠️ MIRROR dari toyota-dealer-web-app/src/lib/appraisalUtils.js
// Mesin taksasi HARUS identik di kedua app, kalau tidak hasil Re-Appraisal admin
// akan beda dari taksasi asli customer. Ubah di sini = wajib ubah di sana juga.
// Satu-satunya perbedaan yang diizinkan: path import firebase.
/**
 * Formatting & Appraisal Utils
 */

export function formatRp(amount) {
  if (amount == null || isNaN(amount)) return 'Rp 0';
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}

export function parseRp(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[^\d]/g, '');
  return Number(cleaned) || 0;
}

// Default Criteria Weights (Industry Standard Trade-In Weights)
export const DEFAULT_WEIGHTS = {
  mesin: 0.30,
  exterior: 0.25,
  odometer: 0.15,
  interior: 0.10,
  transmisi: 0.10,
  suspensi: 0.10,
  mesin_weight: 0.30,
  exterior_weight: 0.25,
  odometer_weight: 0.15,
  interior_weight: 0.10,
  transmisi_weight: 0.10,
  suspensi_weight: 0.10,
};

// Moving Code Multipliers / Demand Retention
export const MOVING_CODE_MULTIPLIERS = {
  FM: 1.0,
  MM: 0.95,
  SM: 0.88,
  NM: 0.80,
};

export const DEFAULT_DEMAND_RETENTION = MOVING_CODE_MULTIPLIERS;

export const DEFAULT_DEMAND_WIDTHS = {
  FM: 10,
  MM: 12,
  SM: 15,
  NM: 20,
};

// Document Deductions
export const DOKUMEN_DEDUCTIONS = {
  BPKB: 0.35, // 35% deduction
  STNK: 2000000,
  'KTP sesuai': 0.015, // 1.5% deduction
  Faktur: 1000000,
};

/**
 * Odometer Brackets — berbasis KM RATA-RATA PER TAHUN (km/tahun), bukan total km.
 * Sesuai Panduan Penilaian Resmi Hasjrat Toyota / Otozentrum.
 *
 * Cara hitung: kmPerYear = totalKm / Math.max(1, currentYear - vehicleYear)
 *
 * Grade A (KM Rendah)     : < 10.000 km/tahun → BONUS +2% dari harga tertinggi
 * Grade B (KM Normal)     : 10.000 – 20.000 km/tahun → Harga Normal
 * Grade C (KM Tinggi)     : 20.001 – 40.000 km/tahun → Potong 5–10%
 * Grade D (KM Sangat Tinggi): > 40.000 km/tahun → Maks 30–50% (pertimbangkan tolak)
 */
export const DEFAULT_ODO_BRACKETS = [
  { min_kpy: 0,     max_kpy: 9999,  retensi_percent: 102,  grade: 'A', label: 'KM Rendah (<10rb/thn) — Bonus +2%' },
  { min_kpy: 10000, max_kpy: 20000, retensi_percent: 100,  grade: 'B', label: 'KM Normal (10-20rb/thn)' },
  { min_kpy: 20001, max_kpy: 40000, retensi_percent: 92.5, grade: 'C', label: 'KM Tinggi (20-40rb/thn)' },
  { min_kpy: 40001, max_kpy: null,  retensi_percent: 60,   grade: 'D', label: 'KM Sangat Tinggi (>40rb/thn)' },
];

// Default Score Retention Brackets
export const DEFAULT_SCORE_BRACKETS = {
  exterior: [
    { min_score: 90, max_score: 100, retensi_percent: 100, level_label: 'Sangat Baik' },
    { min_score: 78, max_score: 89, retensi_percent: 95, level_label: 'Baik' },
    { min_score: 65, max_score: 77, retensi_percent: 85, level_label: 'Cukup' },
    { min_score: 50, max_score: 64, retensi_percent: 70, level_label: 'Kurang' },
    { min_score: 35, max_score: 49, retensi_percent: 55, level_label: 'Buruk' },
    { min_score: 0, max_score: 34, retensi_percent: 35, level_label: 'Sangat Buruk' },
  ],
  interior: [
    { min_score: 85, max_score: 100, retensi_percent: 100, level_label: 'Sangat Baik' },
    { min_score: 65, max_score: 84, retensi_percent: 85, level_label: 'Cukup' },
    { min_score: 0, max_score: 64, retensi_percent: 60, level_label: 'Kurang' },
  ],
  mesin: [
    { min_score: 85, max_score: 100, retensi_percent: 100, level_label: 'Normal' },
    { min_score: 65, max_score: 84, retensi_percent: 80, level_label: 'Perlu Perhatian' },
    { min_score: 0, max_score: 64, retensi_percent: 55, level_label: 'Bermasalah' },
  ],
  kelistrikan: [
    { min_score: 98, max_score: 100, retensi_percent: 100,  level_label: 'Normal' },
    { min_score: 95, max_score: 97,  retensi_percent: 98.5, level_label: 'Aki Lemah (Perlu Ganti Aki)' },
    { min_score: 90, max_score: 94,  retensi_percent: 96,   level_label: 'Servis AC Ringan' },
    { min_score: 75, max_score: 89,  retensi_percent: 85,   level_label: 'Perlu Perhatian (Dinamo Starter)' },
    { min_score: 0,  max_score: 74,  retensi_percent: 60,   level_label: 'Kelistrikan Bermasalah (Kompresor AC)' },
  ],
  transmisi: [
    { min_score: 85, max_score: 100, retensi_percent: 100, level_label: 'Normal' },
    { min_score: 60, max_score: 84, retensi_percent: 80, level_label: 'Perlu Perhatian' },
    { min_score: 0, max_score: 59, retensi_percent: 55, level_label: 'Bermasalah' },
  ],
  suspensi: [
    { min_score: 85, max_score: 100, retensi_percent: 100, level_label: 'Normal' },
    { min_score: 65, max_score: 84, retensi_percent: 85, level_label: 'Perlu Perawatan' },
    { min_score: 0, max_score: 64, retensi_percent: 65, level_label: 'Perlu Perbaikan' },
  ],
};

export const CRITERIA_SCORE_BRACKETS = DEFAULT_SCORE_BRACKETS;

export function scoreToRetention(avgScore, brackets) {
  if (!brackets || brackets.length === 0) return { retensi: 1.0, label: 'Normal' };
  const sorted = [...brackets].sort((a, b) => b.min_score - a.min_score);
  for (const b of sorted) {
    if (avgScore >= b.min_score && (b.max_score === null || avgScore <= b.max_score)) {
      return { retensi: b.retensi_percent / 100, label: b.level_label };
    }
  }
  const worst = sorted[sorted.length - 1];
  return { retensi: worst ? worst.retensi_percent / 100 : 0.5, label: worst?.level_label || 'Bermasalah' };
}

export const DOKUMEN_LIST = ['Faktur', 'KTP sesuai', 'BPKB', 'STNK'];
