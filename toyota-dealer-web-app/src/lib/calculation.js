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
      if (value === 'butuh service ringan')   return 94;
      if (value === 'mati/tidak berfungsi')   return 65;
      return 100;
    }
    case 'starter': {
      if (value === 'lambat/aki lemah')         return 96;
      if (value === 'kasar/dinamo bermasalah')  return 80;
      return 100;
    }
    default:
      return 100;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE DETERMINISTIC ENGINE
// ─────────────────────────────────────────────────────────────────────────────

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

  // ── LAYER 1: BASE PRICE SELECTION VIA DEMAND TIER (Terpisah dari Kondisi) ──
  let effectiveBasePrice = Number(base_price || 0);
  let demandNote = '';
  if (kode_demand === 'FM') {
    // Fast Moving: Pasaran High (100% dari Base Price)
    effectiveBasePrice = Math.round(effectiveBasePrice * 1.00);
    demandNote = 'Fast Moving (Pasaran High)';
  } else if (kode_demand === 'MM') {
    // Medium Moving: Pasaran Average (100%)
    effectiveBasePrice = Math.round(effectiveBasePrice * 1.00);
    demandNote = 'Medium Moving (Pasaran Average)';
  } else if (kode_demand === 'SM') {
    // Slow Moving: Pasaran Average - 12%
    effectiveBasePrice = Math.round(effectiveBasePrice * 0.88);
    demandNote = 'Slow Moving (Pasaran Lower)';
  } else if (kode_demand === 'NM') {
    // Non-Moving / Death Stock: Pasaran Average - 20%
    effectiveBasePrice = Math.round(effectiveBasePrice * 0.80);
    demandNote = 'Death Stock / Non-Moving (Manual Review)';
  }

  // ── LAYER 2: ADDITIVE WEIGHTED CONDITION SCORE (ADDITIF Σ, Bukan Perkalian Π) ──
  // Bobot Additif 100%: Mesin (30%), Bodi (25%), Odo (15%), Interior (10%), Transmisi (10%), Suspensi (10%)
  const wMes  = weights.mesin    || 0.30;
  const wExt  = weights.exterior || 0.25;
  const wOdo  = weights.odometer || 0.15;
  const wInt  = weights.interior || 0.10;
  const wTra  = weights.transmisi|| 0.10;
  const wSus  = weights.suspensi || 0.10;

  // Retensi komposit Mesin (menggabungkan Mesin + AC/Aki)
  const mesCombinedRet = Math.min(criteria.mesin_retensi, criteria.kelistrikan_retensi ?? 1);

  const score_total =
    (wMes * mesCombinedRet) +
    (wExt * criteria.exterior_retensi) +
    (wOdo * criteria.odometer_retensi) +
    (wInt * criteria.interior_retensi) +
    (wTra * criteria.transmisi_retensi) +
    (wSus * criteria.suspensi_retensi);

  // ── RULE-BASED WEAKEST-LINK GRADING (Sesuai Panduan Resmi Otozentrum 2026) ──
  const retMes = mesCombinedRet;
  const retExt = criteria.exterior_retensi;
  const retInt = criteria.interior_retensi;
  const retTra = criteria.transmisi_retensi;
  const retSus = criteria.suspensi_retensi;
  const retOdo = criteria.odometer_retensi;

  const minCoreRet = Math.min(retMes, retExt, retInt, retOdo);
  const minAllRet  = Math.min(minCoreRet, retTra, retSus);

  let kelas_final = 'B';
  let override_applied = false;

  const bpkbHilang = dokumen_kurang.includes('BPKB');
  const stnkHilang = dokumen_kurang.includes('STNK');

  // Grade F (TIDAK AMBIL): Ex Laka Berat, Ex Banjir, Ex Kejahatan, Surat Bermasalah (BPKB+STNK Hilang), Death Stock
  if (has_critical_flag || (bpkbHilang && stnkHilang) || kode_demand === 'NM') {
    kelas_final = 'F'; // TIDAK AMBIL / REJECT
    override_applied = true;
  }
  // Grade D: Ex Laka Sedang, Pemakaian Tidak Wajar, KM > 40rb/thn (retensi <= 60%)
  else if (minCoreRet <= 0.60) {
    kelas_final = 'D'; // GRADE D
    override_applied = true;
  }
  // Grade C: Ex Laka Ringan atau Salah 1 (Body, Interior, Mesin, Odometer) Grade C (retensi < 90%)
  else if (minCoreRet < 0.90) {
    kelas_final = 'C'; // GRADE C
    override_applied = true;
  }
  // Grade B: Salah 1 komponen di bawah A (retensi < 98%)
  else if (minAllRet < 0.98) {
    kelas_final = 'B'; // GRADE B
  }
  // Grade A+: Full Original + Fast Moving + SEMUA Komponen Grade A (retensi >= 98%)
  else if (kode_demand === 'FM' && minAllRet >= 0.98) {
    kelas_final = 'A+'; // GRADE A+
  }
  // Grade A: SEMUA Komponen Grade A (retensi >= 98%)
  else if (minAllRet >= 0.98) {
    kelas_final = 'A'; // GRADE A
  }

  // ── LAYER 3: NET FINAL PRICE CALCULATIONS ──
  const harga_setelah_kondisi = Math.round(effectiveBasePrice * score_total);

  // Pajak & Dokumen
  const pkb_per_bulan = (effectiveBasePrice * 0.018) / 12;
  const deduksi_pajak = Math.round(bulan_telat_pajak * pkb_per_bulan);

  let deduksi_dokumen = 0;
  const dokumenDeduksiDetail = [];
  dokumen_kurang.forEach((doc) => {
    let val = 0;
    if (doc === 'BPKB') {
      val = Math.round(harga_setelah_kondisi * 0.35);
    } else if (doc === 'STNK') {
      val = 2000000;
    } else if (doc === 'KTP sesuai') {
      val = Math.round(effectiveBasePrice * 0.015);
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
      jumlah: deduksi_pajak,
    });
  }

  const deduksi_total = deduksi_pajak + deduksi_dokumen;
  let midpoint = Math.max(0, harga_setelah_kondisi - deduksi_total);

  const rawWidth = demand_range_widths[kode_demand] ?? DEFAULT_DEMAND_WIDTHS[kode_demand] ?? 10;
  const widthPercent = typeof rawWidth === 'number' ? rawWidth : (rawWidth?.width_percent ?? 10);
  const width = widthPercent / 100;
  const harga_min = Math.max(0, Math.round(midpoint * (1 - width)));

  // Untuk unit Grade B/C/D (belum direkondisi), harga_max dibatasi maksimal harga_setelah_kondisi unit tersebut.
  // Plafon 100% Grade A (base_price) HANYA terbuka jika unit Grade A atau pasca-rekondisi di Bengkel Resmi!
  const maxCapBeforeRepair = (kelas_final === 'A' || kelas_final === 'A+') ? base_price : harga_setelah_kondisi;
  const harga_max = Math.min(maxCapBeforeRepair, Math.max(0, Math.round(midpoint * (1 + width))));

  const flag_review_mesin =
    mesin_avg_score < 85 ||
    servis_terakhir === '>1 tahun lalu' ||
    servis_terakhir === 'tidak rutin tercatat';

  return {
    score_total,
    effectiveBasePrice,
    demandNote,
    kelas_final,
    harga_setelah_kondisi,
    deduksi_total,
    deduksi_pajak,
    deduksi_dokumen,
    dokumenDeduksiDetail,
    midpoint,
    harga_min,
    harga_max,
    flag_review_mesin,
    override_applied,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGH-LEVEL FACADE — dipanggil langsung dari TradeInPage
// ─────────────────────────────────────────────────────────────────────────────

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
  if (banScore < 100) extScore = Math.min(extScore, banScore);

  const intScore   = mapConditionToScore('interior', interiorCondition);
  const mesScore   = mapConditionToScore('mesin', mesinCondition, soundClassification);
  const transScore = mapConditionToScore('transmisi', transmisiCondition);
  const suspScore  = mapConditionToScore('suspensi', suspensiCondition);
  const acScore    = mapConditionToScore('ac', acCondition);
  const startScore = mapConditionToScore('starter', starterCondition);
  const listrikScore = Math.min(acScore, startScore);

  // ── 2. Konversi score ke retensi (lookup dari CRITERIA_SCORE_BRACKETS) ────
  const extRet     = scoreToRetention(extScore,     CRITERIA_SCORE_BRACKETS.exterior);
  const intRet     = scoreToRetention(intScore,     CRITERIA_SCORE_BRACKETS.interior);
  const mesRet     = scoreToRetention(mesScore,     CRITERIA_SCORE_BRACKETS.mesin);
  const listrikRet = scoreToRetention(listrikScore, CRITERIA_SCORE_BRACKETS.kelistrikan);
  const transRet   = scoreToRetention(transScore,   CRITERIA_SCORE_BRACKETS.transmisi);
  const suspRet    = scoreToRetention(suspScore,    CRITERIA_SCORE_BRACKETS.suspensi);
  const odoResult  = getOdometerRetentionByYear(kmPerYear);

  const mesCombinedRet = Math.min(mesRet.retensi, listrikRet.retensi);

  // ── 3. Flag kritis (HANYA Laka Berat / Ex Banjir / Kejahatan / Surat Hilang Total) ──
  const hasCriticalFlag =
    bodyCondition === 'laka berat';

  // ── 4. Jalankan engine deterministik 3 Layer ──────────────────────────────
  const mathResult = calculateAppraisal({
    base_price:  basePrice,
    kode_demand: kodeDemand,
    criteria: {
      exterior_retensi:    extRet.retensi,
      interior_retensi:    intRet.retensi,
      mesin_retensi:       mesRet.retensi,
      kelistrikan_retensi: listrikRet.retensi,
      transmisi_retensi:   transRet.retensi,
      suspensi_retensi:    suspRet.retensi,
      odometer_retensi:    odoResult.retensi,
    },
    has_critical_flag: hasCriticalFlag,
    bulan_telat_pajak: bulanTelatPajak,
    dokumen_kurang:    dokumenKurang,
    mesin_avg_score:   mesScore,
  });

  const effBase = mathResult.effectiveBasePrice;

  // Proportional Deductions Additif langsung: BasePrice * Bobot * (1 - Retensi)
  const proportionalDeduksi = (key) => {
    switch (key) {
      case 'mesin':
        return Math.round(effBase * 0.30 * (1 - mesCombinedRet));
      case 'exterior':
        return Math.round(effBase * 0.25 * (1 - extRet.retensi));
      case 'odometer':
        return odoResult.retensi >= 1.0 ? 0 : Math.round(effBase * 0.15 * (1 - odoResult.retensi));
      case 'interior':
        return Math.round(effBase * 0.10 * (1 - intRet.retensi));
      case 'transmisi':
        return Math.round(effBase * 0.10 * (1 - transRet.retensi));
      case 'suspensi':
        return Math.round(effBase * 0.10 * (1 - suspRet.retensi));
      default:
        return 0;
    }
  };

  const repairableKeys = ['exterior', 'interior', 'mesin', 'transmisi', 'suspensi'];
  const totalRepairableGain = repairableKeys.reduce((sum, k) => sum + proportionalDeduksi(k), 0);

  const projectedMidpoint = mathResult.midpoint + totalRepairableGain;
  const projectedGrade = mathResult.kelas_final === 'D' || mathResult.kelas_final === 'C' ? 'B' : 'A';

  const getMesinDefects = () => {
    const defects = [];
    if (mesinCondition !== 'normal') {
      defects.push(mesinCondition === 'ada gejala' ? 'Mesin Ada Gejala' : 'Mesin Bermasalah');
    }
    if (acCondition !== 'normal') {
      defects.push(acCondition === 'butuh service ringan' ? 'AC Perlu Servis' : 'AC Tidak Berfungsi');
    }
    if (starterCondition !== 'halus') {
      defects.push(starterCondition === 'lambat/aki lemah' ? 'Aki/Starter Lemah' : 'Dinamo Starter Bermasalah');
    }
    return defects.join(', ') || 'Normal';
  };

  const getExtDefects = () => {
    const defects = [];
    if (bodyCondition !== 'full original') {
      const bodyMap = {
        'baret minor': 'Cat Baret Minor',
        'baret besar': 'Baret Besar / Perlu Cat',
        'laka ringan': 'Laka Ringan',
        'laka sedang': 'Laka Sedang',
        'laka berat':  'Laka Berat',
      };
      defects.push(bodyMap[bodyCondition] || bodyCondition);
    }
    if (banCondition && banCondition !== 'tebal' && banCondition !== 'normal') {
      const banMap = {
        'aus':        'Ban Aus',
        'velg_baret': 'Velg Baret',
      };
      defects.push(banMap[banCondition] || banCondition);
    }
    return defects.join(', ') || 'Mulus';
  };

  const getInteriorDefects = () => {
    if (interiorCondition === 'kurang rapi') return 'Kabin Kurang Rapi';
    if (interiorCondition === 'tidak layak') return 'Kabin Tidak Layak';
    return 'Original';
  };

  const getTransmisiDefects = () => {
    if (transmisiCondition === 'perlu_perhatian') return 'Perlu Perhatian / Servis';
    if (transmisiCondition === 'bermasalah') return 'Transmisi Bermasalah';
    return 'Normal';
  };

  const getSuspensiDefects = () => {
    if (suspensiCondition === 'gluduk' || suspensiCondition === 'bushing_aus') return 'Bunyi Gluduk / Bushing Aus';
    if (suspensiCondition === 'shock_bocor') return 'Shockbreaker Bocor';
    return 'Normal';
  };

  const componentBreakdown = [
    {
      komponen:      'Mesin & Kelistrikan',
      kondisi:       getMesinDefects(),
      skor:          mesScore,
      grade:         mesRet.label,
      retensi:       mesCombinedRet,
      deduksi_rp:    proportionalDeduksi('mesin'),
      deduksi_rp_actual: proportionalDeduksi('mesin'),
      is_permanent:  false,
      kenaikan_nilai_if_repaired: proportionalDeduksi('mesin'),
    },
    {
      komponen:      'Eksterior / Body',
      kondisi:       getExtDefects(),
      ban:           banCondition,
      skor:          extScore,
      grade:         extRet.label,
      retensi:       extRet.retensi,
      deduksi_rp:    proportionalDeduksi('exterior'),
      deduksi_rp_actual: proportionalDeduksi('exterior'),
      is_permanent:  false,
      kenaikan_nilai_if_repaired: proportionalDeduksi('exterior'),
    },
    {
      komponen:      'Interior / Kabin',
      kondisi:       getInteriorDefects(),
      skor:          intScore,
      grade:         intRet.label,
      retensi:       intRet.retensi,
      deduksi_rp:    proportionalDeduksi('interior'),
      deduksi_rp_actual: proportionalDeduksi('interior'),
      is_permanent:  false,
      kenaikan_nilai_if_repaired: proportionalDeduksi('interior'),
    },
    {
      komponen:      'Transmisi',
      kondisi:       getTransmisiDefects(),
      skor:          transScore,
      grade:         transRet.label,
      retensi:       transRet.retensi,
      deduksi_rp:    proportionalDeduksi('transmisi'),
      deduksi_rp_actual: proportionalDeduksi('transmisi'),
      is_permanent:  false,
      kenaikan_nilai_if_repaired: proportionalDeduksi('transmisi'),
    },
    {
      komponen:      'Suspensi / Kaki-Kaki',
      kondisi:       getSuspensiDefects(),
      skor:          suspScore,
      grade:         suspRet.label,
      retensi:       suspRet.retensi,
      deduksi_rp:    proportionalDeduksi('suspensi'),
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
      is_permanent:  true,
      deduksi_rp:    odoResult.retensi >= 1.0 ? 0 : proportionalDeduksi('odometer'),
      deduksi_rp_actual: proportionalDeduksi('odometer'),
      kenaikan_nilai_if_repaired: 0,
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
      exterior:    extScore,
      interior:    intScore,
      mesin:       mesScore,
      kelistrikan: listrikScore,
      transmisi:   transScore,
      suspensi:    suspScore,
    },
    categoryRetentions: {
      exterior:    extRet.retensi,
      interior:    intRet.retensi,
      mesin:       mesRet.retensi,
      kelistrikan: listrikRet.retensi,
      transmisi:   transRet.retensi,
      suspensi:    suspRet.retensi,
      odometer:    odoResult.retensi,
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
