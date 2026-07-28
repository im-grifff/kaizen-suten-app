import {
  DEFAULT_WEIGHTS,
  DEFAULT_DEMAND_RETENTION,
  DEFAULT_DEMAND_WIDTHS,
  DEFAULT_ODO_BRACKETS,
  CRITERIA_SCORE_BRACKETS,
  scoreToRetention,
} from './appraisalUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hitung odometer retention dari km rata-rata per tahun (km/tahun).
 * Gunakan DEFAULT_ODO_BRACKETS yang sudah berbasis km/tahun.
 *
 * @param {number} kmPerYear - Rata-rata km per tahun
 * @returns {{ retensi: number, grade: string, label: string }}
 */
export function getOdometerRetentionByYear(kmPerYear, brackets = DEFAULT_ODO_BRACKETS) {
  const kpy = Number(kmPerYear || 0);
  for (const b of brackets) {
    if (kpy >= b.min_kpy && (b.max_kpy === null || kpy <= b.max_kpy)) {
      return {
        retensi: b.retensi_percent / 100,
        grade: b.grade,
        label: b.label,
      };
    }
  }
  // Fallback ke Grade D jika melebihi semua bracket
  return { retensi: 0.60, grade: 'D', label: 'KM Sangat Tinggi — Perlu Kajian' };
}

/**
 * Mapping kondisi fisik (string dari UI) ke numeric score 0–100.
 * Satu sumber kebenaran — tidak ada duplikasi inline di TradeInPage.
 */
export function mapConditionToScore(category, value, soundClassification = null) {
  switch (category) {
    case 'body': {
      const map = {
        'full original': 100,
        'baret minor':   90,
        'baret besar':   80,
        'laka ringan':   65,
        'laka sedang':   50,
        'laka berat':    30,
      };
      return map[value] ?? 100;
    }
    case 'ban': {
      // Ban berkontribusi ke score eksterior sebagai cap
      if (value === 'aus')        return 85;
      if (value === 'velg_baret') return 90;
      return 100;
    }
    case 'interior': {
      if (value === 'kurang rapi')  return 75;
      if (value === 'tidak layak')  return 55;
      return 100;
    }
    case 'mesin': {
      let score = 100;
      if (value === 'ada gejala')  score = 75;
      if (value === 'bermasalah')  score = 50;
      // Koreksi dari analisis suara AI
      if (soundClassification === 'sedang') score = Math.min(score, 80);
      if (soundClassification === 'kasar')  score = Math.min(score, 55);
      return score;
    }
    case 'transmisi': {
      if (value === 'perlu_perhatian') return 75;
      if (value === 'bermasalah')      return 50;
      return 100;
    }
    case 'suspensi': {
      if (value === 'gluduk' || value === 'bushing_aus') return 75;
      if (value === 'shock_bocor')                       return 65;
      return 100;
    }
    case 'ac': {
      if (value === 'butuh service ringan')   return 80;
      if (value === 'mati/tidak berfungsi')   return 50;
      return 100;
    }
    case 'starter': {
      if (value === 'lambat/aki lemah')         return 80;
      if (value === 'kasar/dinamo bermasalah')  return 65;
      return 100;
    }
    default:
      return 100;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE DETERMINISTIC ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic vehicle appraisal calculation.
 * Uses Weighted Product (geometric weighted mean) — NOT simple average.
 *
 * === FORMULA ===
 * score_total = Π (retensi_i ^ bobot_i)
 */
export function calculateAppraisal(input) {
  const {
    base_price,
    kode_demand = 'FM',
    criteria,
    weights = DEFAULT_WEIGHTS,
    demand_range_widths = DEFAULT_DEMAND_WIDTHS,
    deductions = { biaya_per_dokumen_kurang: 1000000 },
    has_critical_flag = false,
    mesin_avg_score = 100,
    servis_terakhir = '<3 bulan lalu',
    bulan_telat_pajak = 0,
    dokumen_kurang = [],
  } = input;

  const w = (key) => {
    const val =
      weights[key] ??
      weights[`${key}_weight`] ??
      DEFAULT_WEIGHTS[key] ??
      DEFAULT_WEIGHTS[`${key}_weight`] ??
      0;
    return val > 1 ? val / 100 : val;
  };

  const demandRetensi = criteria.demand_retensi ?? DEFAULT_DEMAND_RETENTION[kode_demand] ?? 1.0;

  const score_total =
    Math.pow(demandRetensi,              w('demand'))    *
    Math.pow(criteria.exterior_retensi, w('exterior'))  *
    Math.pow(criteria.interior_retensi, w('interior'))  *
    Math.pow(criteria.mesin_retensi,    w('mesin'))     *
    Math.pow(criteria.transmisi_retensi,w('transmisi')) *
    Math.pow(criteria.suspensi_retensi, w('suspensi'))  *
    Math.pow(criteria.odometer_retensi, w('odometer'));

  let finalScore = score_total;
  let override_applied = false;

  // Override: critical flags cap at Grade C
  if (has_critical_flag) {
    finalScore = Math.min(finalScore, 0.79);
    override_applied = true;
  }

  // Hard reject if both BPKB and STNK are missing → cap at Grade D
  const bpkbHilang = dokumen_kurang.includes('BPKB');
  const stnkHilang = dokumen_kurang.includes('STNK');
  if (bpkbHilang && stnkHilang) {
    finalScore = Math.min(finalScore, 0.35);
    override_applied = true;
  }

  // Worst-component grade cap:
  // Grade A = SEMUA komponen repairable harus retensi ≥ 0.90
  // Grade B max = jika ada komponen retensi 0.80–0.89
  // Grade C max = jika ada komponen retensi < 0.80
  const toRet = (v) => { const n = typeof v === 'number' ? v : 0; return n > 1 ? n / 100 : n; };
  const repairableRetentions = [
    toRet(criteria.exterior_retensi),
    toRet(criteria.interior_retensi),
    toRet(criteria.mesin_retensi),
    toRet(criteria.transmisi_retensi),
    toRet(criteria.suspensi_retensi),
  ];
  const minRepairableRet = Math.min(...repairableRetentions);

  // Count defective components (retention < 0.95)
  const defectiveCount = repairableRetentions.filter((r) => r < 0.95).length;

  if (!override_applied) {
    if (minRepairableRet <= 0.80 || defectiveCount >= 3) {
      // Banyak komponen bermasalah (≥ 3 komponen) atau ada komponen bermasalah serius (retensi ≤ 80%) → Grade C
      const capScore = defectiveCount >= 4 ? 0.73 : defectiveCount >= 3 ? 0.77 : 0.79;
      finalScore = Math.min(finalScore, capScore);
      override_applied = true;
    } else if (minRepairableRet < 0.90 || defectiveCount >= 1) {
      // Ada 1–2 komponen minor bermasalah → Grade B
      finalScore = Math.min(finalScore, 0.88);
      override_applied = true;
    }
  }

  // Determine overall grade
  let kelas_final = 'D';
  if (finalScore >= 0.92)      kelas_final = 'A';
  else if (finalScore >= 0.80) kelas_final = 'B';
  else if (finalScore >= 0.65) kelas_final = 'C';

  // Price after condition
  const harga_setelah_kondisi = base_price * finalScore;

  // Tax deduction: PKB ~1.8% per tahun, monthly = /12
  const pkb_per_bulan = (base_price * 0.018) / 12;
  const deduksi_pajak = bulan_telat_pajak * pkb_per_bulan;

  // Document deductions
  let deduksi_dokumen = 0;
  const dokumenDeduksiDetail = [];
  dokumen_kurang.forEach((doc) => {
    let val = 0;
    if (doc === 'BPKB') {
      val = Math.round(harga_setelah_kondisi * 0.35);
    } else if (doc === 'STNK') {
      val = 2000000;
    } else if (doc === 'KTP sesuai') {
      val = Math.round(base_price * 0.015);
    } else if (doc === 'Faktur') {
      val = 1000000;
    } else {
      val = deductions.biaya_per_dokumen_kurang || 1000000;
    }
    deduksi_dokumen += val;
    dokumenDeduksiDetail.push({ dokumen: doc, jumlah: val });
  });

  if (bulan_telat_pajak > 0) {
    dokumenDeduksiDetail.push({
      dokumen: `Pajak Telat ${bulan_telat_pajak} Bulan`,
      jumlah: Math.round(deduksi_pajak),
    });
  }

  const deduksi_total = deduksi_pajak + deduksi_dokumen;

  let midpoint = harga_setelah_kondisi - deduksi_total;
  if (midpoint < 0) midpoint = 0;

  // Range width based on demand class
  const rawWidth = demand_range_widths[kode_demand] ?? DEFAULT_DEMAND_WIDTHS[kode_demand] ?? 10;
  const widthPercent = typeof rawWidth === 'number' ? rawWidth : (rawWidth?.width_percent ?? 10);
  const width = widthPercent / 100;
  const harga_min = Math.max(0, Math.round(midpoint * (1 - width)));
  const harga_max = Math.max(0, Math.round(midpoint * (1 + width)));

  const flag_review_mesin =
    mesin_avg_score >= 85 &&
    (servis_terakhir === '>1 tahun lalu' || servis_terakhir === 'tidak rutin tercatat');

  return {
    score_total: finalScore,
    kelas_final,
    harga_setelah_kondisi: Math.round(harga_setelah_kondisi),
    deduksi_total: Math.round(deduksi_total),
    deduksi_pajak: Math.round(deduksi_pajak),
    deduksi_dokumen: Math.round(deduksi_dokumen),
    dokumenDeduksiDetail,
    midpoint: Math.round(midpoint),
    harga_min,
    harga_max,
    flag_review_mesin,
    override_applied,
    demandRetensi,
    criteriaRetentions: {
      exterior:  criteria.exterior_retensi,
      interior:  criteria.interior_retensi,
      mesin:     criteria.mesin_retensi,
      transmisi: criteria.transmisi_retensi,
      suspensi:  criteria.suspensi_retensi,
      odometer:  criteria.odometer_retensi,
      demand:    demandRetensi,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGH-LEVEL FACADE — dipanggil langsung dari TradeInPage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Konversi seluruh inputan kondisi customer (string dari dropdown UI) menjadi
 * hasil appraisal matematis lengkap — satu sumber kebenaran.
 *
 * @param {object} p
 * @param {string}   p.bodyCondition
 * @param {string}   p.banCondition
 * @param {string}   p.interiorCondition
 * @param {string}   p.mesinCondition
 * @param {string}   p.transmisiCondition
 * @param {string}   p.suspensiCondition
 * @param {string}   p.acCondition
 * @param {string}   p.starterCondition
 * @param {string|null} p.soundClassification  - hasil analisa suara AI ('halus'|'sedang'|'kasar')
 * @param {number}   p.kmTotal                 - total odometer (absolut)
 * @param {number}   p.vehicleYear             - tahun pembuatan kendaraan
 * @param {number}   p.basePrice               - harga dasar pasaran mulus (dari vehicle_master)
 * @param {string}   p.kodeDemand              - 'FM'|'MM'|'SM'|'NM'
 * @param {number}   p.bulanTelatPajak
 * @param {string[]} p.dokumenKurang
 * @returns {object} mathResult — semua angka yang dibutuhkan AI dan modal
 */
export function buildAppraisalFromConditions({
  bodyCondition      = 'full original',
  banCondition       = 'tebal',
  interiorCondition  = 'original',
  mesinCondition     = 'normal',
  transmisiCondition = 'normal',
  suspensiCondition  = 'normal',
  acCondition        = 'normal',
  starterCondition   = 'halus',
  soundClassification = null,
  kmTotal            = 0,
  vehicleYear        = 2020,
  basePrice          = 0,
  kodeDemand         = 'FM',
  bulanTelatPajak    = 0,
  dokumenKurang      = [],
}) {
  const currentYear = new Date().getFullYear();
  const vehicleAge  = Math.max(1, currentYear - vehicleYear);
  const kmPerYear   = Math.round(kmTotal / vehicleAge);

  // ── 1. Score per komponen ──────────────────────────────────────────────────
  let extScore = mapConditionToScore('body', bodyCondition);
  const banScore = mapConditionToScore('ban', banCondition);
  // Ban memengaruhi cap eksterior
  if (banScore < 100) extScore = Math.min(extScore, banScore);

  const intScore   = mapConditionToScore('interior', interiorCondition);
  const mesScore   = mapConditionToScore('mesin', mesinCondition, soundClassification);
  const transScore = mapConditionToScore('transmisi', transmisiCondition);
  const suspScore  = mapConditionToScore('suspensi', suspensiCondition);
  // AC & Starter berkontribusi ke komponen Mesin (sebagai sub-faktor)
  const acScore    = mapConditionToScore('ac', acCondition);
  const startScore = mapConditionToScore('starter', starterCondition);
  // Gabungkan skor mesin dengan AC dan starter (rata-rata berbobot sederhana)
  const mesinKompositScore = Math.round((mesScore * 0.6) + (acScore * 0.25) + (startScore * 0.15));

  // ── 2. Konversi score ke retensi (lookup dari CRITERIA_SCORE_BRACKETS) ────
  const extRet   = scoreToRetention(extScore,          CRITERIA_SCORE_BRACKETS.exterior);
  const intRet   = scoreToRetention(intScore,          CRITERIA_SCORE_BRACKETS.interior);
  const mesRet   = scoreToRetention(mesinKompositScore, CRITERIA_SCORE_BRACKETS.mesin);
  const transRet = scoreToRetention(transScore,        CRITERIA_SCORE_BRACKETS.transmisi);
  const suspRet  = scoreToRetention(suspScore,         CRITERIA_SCORE_BRACKETS.suspensi);

  // ── 3. Odometer retention — berbasis km/tahun ──────────────────────────────
  const odoResult = getOdometerRetentionByYear(kmPerYear);

  // ── 4. Flag kritis — body ex-laka sedang ke atas OR mesin bermasalah ──────
  const hasCriticalFlag =
    bodyCondition === 'laka ringan'   ||
    bodyCondition === 'laka sedang'   ||
    mesinCondition === 'bermasalah'   ||
    soundClassification === 'kasar';

  // ── 5. Jalankan engine deterministik ─────────────────────────────────────
  const mathResult = calculateAppraisal({
    base_price:  basePrice,
    kode_demand: kodeDemand,
    criteria: {
      exterior_retensi:  extRet.retensi,
      interior_retensi:  intRet.retensi,
      mesin_retensi:     mesRet.retensi,
      transmisi_retensi: transRet.retensi,
      suspensi_retensi:  suspRet.retensi,
      odometer_retensi:  odoResult.retensi,
    },
    has_critical_flag: hasCriticalFlag,
    bulan_telat_pajak: bulanTelatPajak,
    dokumen_kurang:    dokumenKurang,
    mesin_avg_score:   mesinKompositScore,
  });

  // ── 6. Bangun detail per-komponen untuk AI & modal ────────────────────────
  //
  // CATATAN PENTING:
  // deduksi_rp (lama) = basePrice × (1 - retensi) secara individual (tidak bisa dijumlah)
  // deduksi_rp_actual (baru) = kontribusi proporsional nyata ke total deduction
  //   → Metode: Weighted Shortfall Proportional Attribution
  //   → Formula: shortfall_i = weight_i × max(0, 1 - retensi_i)
  //              proportion_i = shortfall_i / sum(all shortfalls)
  //              deduksi_rp_actual_i = proportion_i × totalActualDeduction
  // ─────────────────────────────────────────────────────────────────────────

  // Weights sesuai DEFAULT_WEIGHTS
  const W = DEFAULT_WEIGHTS;
  const retentions = {
    exterior:  extRet.retensi,
    interior:  intRet.retensi,
    mesin:     mesRet.retensi,
    transmisi: transRet.retensi,
    suspensi:  suspRet.retensi,
    odometer:  odoResult.retensi,
  };

  // Weighted shortfall per komponen (nilai negatif bonus diabaikan)
  const shortfalls = {
    exterior:  (W.exterior  || 0.15) * Math.max(0, 1 - retentions.exterior),
    interior:  (W.interior  || 0.15) * Math.max(0, 1 - retentions.interior),
    mesin:     (W.mesin     || 0.20) * Math.max(0, 1 - retentions.mesin),
    transmisi: (W.transmisi || 0.10) * Math.max(0, 1 - retentions.transmisi),
    suspensi:  (W.suspensi  || 0.05) * Math.max(0, 1 - retentions.suspensi),
    odometer:  (W.odometer  || 0.10) * Math.max(0, 1 - retentions.odometer), // permanent
  };
  const totalShortfall = Object.values(shortfalls).reduce((s, v) => s + v, 0);

  // Total deduction aktual (rugi nyata dari base_price ke midpoint yang sudah dihitung)
  const totalActualDeduction = Math.max(0, basePrice - mathResult.midpoint);

  /**
   * Hitung deduksi_rp_actual proporsional untuk setiap komponen.
   * @param {string} key - key nama komponen
   */
  const proportionalDeduksi = (key) => {
    if (totalShortfall === 0) return 0;
    return Math.round((shortfalls[key] / totalShortfall) * totalActualDeduction);
  };

  // ── Proyeksi skor & harga setelah SEMUA komponen repairable diperbaiki ─────
  // Komponen repairable (Body, Interior, Mesin, Transmisi, Suspensi) diperbaiki ke Grade A (100%)
  // Odometer = permanent (deduksi KM tetap ada jika ada).
  // Total pengembalian nilai = sum dari deduksi_rp_actual semua komponen repairable
  const repairableKeys = ['exterior', 'interior', 'mesin', 'transmisi', 'suspensi'];
  const totalRepairableGain = repairableKeys.reduce((sum, k) => sum + proportionalDeduksi(k), 0);

  const projectedMidpoint = mathResult.midpoint + totalRepairableGain;
  const projectedGrade = 'A'; // Rekondisi penuh di bengkel resmi menjamin unit naik ke Grade A Certified

  const componentBreakdown = [
    {
      komponen:      'Eksterior / Body',
      kondisi:       bodyCondition,
      ban:           banCondition,
      skor:          extScore,
      grade:         extRet.label,
      retensi:       extRet.retensi,
      deduksi_rp:    Math.round(basePrice * (1 - extRet.retensi)),  // legacy
      deduksi_rp_actual: proportionalDeduksi('exterior'),
      is_permanent:  false,
      kenaikan_nilai_if_repaired: proportionalDeduksi('exterior'),
    },
    {
      komponen:      'Interior / Kabin',
      kondisi:       interiorCondition,
      skor:          intScore,
      grade:         intRet.label,
      retensi:       intRet.retensi,
      deduksi_rp:    Math.round(basePrice * (1 - intRet.retensi)),
      deduksi_rp_actual: proportionalDeduksi('interior'),
      is_permanent:  false,
      kenaikan_nilai_if_repaired: proportionalDeduksi('interior'),
    },
    {
      komponen:      'Mesin, AC & Kelistrikan',
      kondisi:       mesinCondition,
      kondisi_ac:    acCondition,
      kondisi_starter: starterCondition,
      sound:         soundClassification,
      skor:          mesinKompositScore,
      grade:         mesRet.label,
      retensi:       mesRet.retensi,
      deduksi_rp:    Math.round(basePrice * (1 - mesRet.retensi)),
      deduksi_rp_actual: proportionalDeduksi('mesin'),
      is_permanent:  false,
      kenaikan_nilai_if_repaired: proportionalDeduksi('mesin'),
    },
    {
      komponen:      'Transmisi',
      kondisi:       transmisiCondition,
      skor:          transScore,
      grade:         transRet.label,
      retensi:       transRet.retensi,
      deduksi_rp:    Math.round(basePrice * (1 - transRet.retensi)),
      deduksi_rp_actual: proportionalDeduksi('transmisi'),
      is_permanent:  false,
      kenaikan_nilai_if_repaired: proportionalDeduksi('transmisi'),
    },
    {
      komponen:      'Suspensi / Kaki-Kaki',
      kondisi:       suspensiCondition,
      skor:          suspScore,
      grade:         suspRet.label,
      retensi:       suspRet.retensi,
      deduksi_rp:    Math.round(basePrice * (1 - suspRet.retensi)),
      deduksi_rp_actual: proportionalDeduksi('suspensi'),
      is_permanent:  false,
      kenaikan_nilai_if_repaired: proportionalDeduksi('suspensi'),
    },
    {
      komponen:      'Odometer',
      kondisi:       `${kmTotal.toLocaleString('id-ID')} km total (${kmPerYear.toLocaleString('id-ID')} km/tahun)`,
      skor:          Math.round(odoResult.retensi * 100),
      grade:         odoResult.grade,
      grade_label:   odoResult.label,
      retensi:       odoResult.retensi,
      km_per_year:   kmPerYear,
      vehicle_age:   vehicleAge,
      is_bonus:      odoResult.retensi > 1.0,
      is_permanent:  true,  // ← Odometer TIDAK BISA diperbaiki
      deduksi_rp:    odoResult.retensi >= 1.0 ? 0 : Math.round(basePrice * (1 - odoResult.retensi)),
      deduksi_rp_actual: proportionalDeduksi('odometer'),  // 0 jika bonus
      kenaikan_nilai_if_repaired: 0,  // ← Odometer tidak bisa naik
    },
  ];

  return {
    ...mathResult,
    // Tambahan untuk AI & modal
    kmPerYear,
    vehicleAge,
    odoGrade:          odoResult.grade,
    odoLabel:          odoResult.label,
    odoIsBonus:        odoResult.retensi > 1.0,
    componentBreakdown,
    // Proyeksi setelah semua komponen repairable diperbaiki
    projected_score_after_repair:    0.95,
    projected_grade_after_repair:    projectedGrade,
    projected_midpoint_after_repair: projectedMidpoint,
    // Raw scores (dipakai di modal AppraisalResultModal)
    categoryScores: {
      exterior:  extScore,
      interior:  intScore,
      mesin:     mesinKompositScore,
      transmisi: transScore,
      suspensi:  suspScore,
    },
    categoryRetentions: {
      exterior:  extRet.retensi,
      interior:  intRet.retensi,
      mesin:     mesRet.retensi,
      transmisi: transRet.retensi,
      suspensi:  suspRet.retensi,
      odometer:  odoResult.retensi,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy export — kept for backward compat (tidak digunakan di flow utama)
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Gunakan getOdometerRetentionByYear() + DEFAULT_ODO_BRACKETS baru */
export function getOdometerRetention(kmPerYear) {
  return getOdometerRetentionByYear(kmPerYear).retensi;
}

export function getScoresFromChecklist(answers) {
  const extScore  = mapConditionToScore('body', (answers.body_conditions || [])[0] || 'full original');
  const intScore  = mapConditionToScore('interior', answers.interior_condition || 'original');
  const mesScore  = mapConditionToScore('mesin', (answers.mesin_conditions || [])[0] || 'normal', answers.sound_classification);
  const hasCriticalBody  = extScore <= 30;
  const hasCriticalMesin = mesScore <= 55;
  return {
    categoryScores: {
      exterior: extScore,
      interior: intScore,
      mesin:    mesScore,
      transmisi: 100,
      suspensi:  100,
    },
    hasCriticalFlag: hasCriticalBody || hasCriticalMesin,
  };
}
