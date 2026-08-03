/**
 * Re-Appraisal — hitung ulang hasil taksasi dari sisi admin.
 *
 * Alurnya sengaja dibuat identik dengan `onSubmitAppraisal` di
 * toyota-dealer-web-app/src/screens/main/TradeInPage.jsx supaya angka yang keluar
 * konsisten dengan taksasi asli customer. Bedanya hanya:
 *
 *  - Analisis suara mesin TIDAK dijalankan ulang (video-nya tidak disimpan).
 *    Klasifikasi hasil analisis lama (`analisa_suara_mesin`) dipakai kembali.
 *  - Riwayat servis dipakai ulang dari dokumen; kalau kosong baru di-fetch lagi.
 *  - Admin boleh mengoreksi kondisi kendaraan sebelum hitung ulang.
 *
 * Customer TIDAK punya jalur ke sini — modul ini hanya di-import admin dashboard,
 * dan rules Firestore membatasi update customer ke transisi stage new -> contacted.
 */
import { buildAppraisalFromConditions } from './calculation.js'
import { generateRecommendation } from './ai.js'
import { lookupBasePrice } from './vehicleMasterLookup.js'
import { getDynamicRepairEstimatesAsync } from './flatRateMaster.js'
import { fetchVehicleServiceHistory } from './vehicleServiceHistory.js'

/** Stage yang boleh di-Re-Appraisal: sebelum unit diinspeksi fisik. */
export const REAPPRAISAL_ALLOWED_STAGES = ['new', 'contacted', 'pre_inspection']

/** Role yang boleh menjalankan Re-Appraisal. */
export const REAPPRAISAL_ALLOWED_ROLES = ['root', 'supervisor', 'tradein', 'sa']

export function canReAppraise(role, adminStage) {
  return (
    REAPPRAISAL_ALLOWED_ROLES.includes(role) && REAPPRAISAL_ALLOWED_STAGES.includes(adminStage)
  )
}

/**
 * Opsi kondisi — nilai HARUS sama persis dengan `mapConditionToScore` di calculation.js
 * dan dengan dropdown di form customer, kalau tidak skor-nya jatuh ke default 100.
 */
export const CONDITION_OPTIONS = {
  bodyCondition: [
    { value: 'full original', label: 'Full Original / Mulus' },
    { value: 'baret minor', label: 'Lecet Minor / Baret Tipis' },
    { value: 'baret besar', label: 'Lecet Besar >10%' },
    { value: 'laka ringan', label: 'Bekas Laka Ringan' },
    { value: 'laka sedang', label: 'Bekas Laka Sedang' },
    { value: 'laka berat', label: 'Bekas Laka Berat / Banjir (Grade F)' },
  ],
  banCondition: [
    { value: 'tebal', label: 'Ban Masih Tebal (>80%) & Velg Mulus' },
    { value: 'aus', label: 'Ban Aus / Perlu Ganti Baru' },
    { value: 'velg_baret', label: 'Velg Terdapat Baret Curb' },
  ],
  interiorCondition: [
    { value: 'original', label: 'Full Original & Bersih' },
    { value: 'kurang rapi', label: 'Kurang Rapi / Perlu Perawatan' },
    { value: 'tidak layak', label: 'Modifikasi / Tidak Layak' },
  ],
  mesinCondition: [
    { value: 'normal', label: 'Mesin Normal & Bertenaga' },
    { value: 'ada gejala', label: 'Ada Gejala Ringan / Kurang Bertenaga' },
    { value: 'bermasalah', label: 'Bermasalah / Rusak' },
  ],
  transmisiCondition: [
    { value: 'normal', label: 'Perpindahan Gigi Halus & Responsif' },
    { value: 'perlu_perhatian', label: 'Kopling Agak Berat / Selip Ringan' },
    { value: 'bermasalah', label: 'Perpindahan Gigi Hentakan Kasar / Delay' },
  ],
  suspensiCondition: [
    { value: 'normal', label: 'Senyap & Normal Prima (Siap Pakai)' },
    { value: 'gluduk', label: 'Ada Bunyi Gluduk saat Lewat Berlubang' },
    { value: 'bushing_aus', label: 'Bushing Arm / Tierod Aus' },
    { value: 'shock_bocor', label: 'Shockbreaker Merembes / Bocor' },
  ],
  acCondition: [
    { value: 'normal', label: 'Dingin & Normal' },
    { value: 'butuh service ringan', label: 'Kurang Dingin / Butuh Service' },
    { value: 'mati/tidak berfungsi', label: 'Mati / Tidak Berfungsi' },
  ],
  starterCondition: [
    { value: 'halus', label: 'Starter Halus & Cepat' },
    { value: 'lambat/aki lemah', label: 'Starter Lambat / Aki Lemah' },
    { value: 'kasar/dinamo bermasalah', label: 'Starter Kasar / Dinamo Bermasalah' },
  ],
}

export const DOKUMEN_OPTIONS = ['Faktur', 'KTP sesuai', 'BPKB', 'STNK']

const FALLBACKS = {
  bodyCondition: 'full original',
  banCondition: 'tebal',
  interiorCondition: 'original',
  mesinCondition: 'normal',
  transmisiCondition: 'normal',
  suspensiCondition: 'normal',
  acCondition: 'normal',
  starterCondition: 'halus',
}

function pickOption(field, raw) {
  const allowed = CONDITION_OPTIONS[field].map((o) => o.value)
  const v = String(raw ?? '').trim()
  return allowed.includes(v) ? v : FALLBACKS[field]
}

function toInt(raw, fallback = 0) {
  const n = Number(String(raw ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : fallback
}

/**
 * Bentuk state awal form Re-Appraisal dari dokumen tradein_request.
 * Data lama bisa saja tidak punya field kondisi (mis. hasil import Excel) —
 * di situ dipakai nilai default yang sama dengan default form customer.
 */
export function buildInitialConditions(row = {}) {
  return {
    merk: String(row.merk || '').trim(),
    model: String(row.model || row.merkModel || '').trim(),
    tipe: String(row.tipe || '').trim(),
    transmission: String(row.transmission || '').trim(),
    year: String(row.year || '').trim(),
    km: String(toInt(row.km, 0) || ''),

    bodyCondition: pickOption('bodyCondition', row.bodyCondition),
    banCondition: pickOption('banCondition', row.banCondition),
    interiorCondition: pickOption('interiorCondition', row.interiorCondition),
    mesinCondition: pickOption('mesinCondition', row.mesinCondition),
    transmisiCondition: pickOption('transmisiCondition', row.transmisiCondition),
    suspensiCondition: pickOption('suspensiCondition', row.suspensiCondition),
    acCondition: pickOption('acCondition', row.acCondition),
    starterCondition: pickOption('starterCondition', row.starterCondition),

    statusPajak: row.statusPajak === 'Lewat' ? 'Lewat' : 'Aktif',
    bulanTelatPajak: String(toInt(row.bulan_telat_pajak, 0)),
    dokumenKurang: Array.isArray(row.dokumen_kurang) ? [...row.dokumen_kurang] : [],

    sellingPoints: String(row.sellingPoints || ''),
    expectLowPrice: String(row.expectLowPrice || ''),
    reappraisalNote: '',
  }
}

/** Ringkasan angka sebelum/sesudah, untuk konfirmasi & audit trail. */
export function priceSnapshot(src = {}) {
  return {
    base_price: Number(src.base_price) || 0,
    kelas_final: String(src.kelas_final || ''),
    harga_min: Number(src.harga_min) || 0,
    harga_max: Number(src.harga_max) || 0,
    midpoint: Number(src.midpoint) || 0,
  }
}

/**
 * Jalankan ulang pipeline taksasi.
 *
 * @returns {{ patch: object, mathResult: object, aiResponse: object|null, before: object, after: object, aiError: string }}
 */
export async function runReAppraisal({ row, conditions, actor }) {
  if (!row?.id) throw new Error('Data trade-in tidak valid.')

  const c = conditions || buildInitialConditions(row)

  if (c.bodyCondition === 'laka berat') {
    throw new Error(
      'Kondisi body "Bekas Laka Berat / Banjir" otomatis Grade F (tidak diambil). ' +
        'Kalau memang benar, pindahkan request ini ke stage Cancel, bukan di-Re-Appraisal.',
    )
  }

  // KM: samakan dengan perilaku form customer — angka pendek dianggap ribuan.
  let kmNum = toInt(c.km, 0)
  if (kmNum > 0 && kmNum <= 500) kmNum = kmNum * 1000
  if (kmNum <= 0) throw new Error('KM kendaraan wajib diisi untuk menghitung ulang taksasi.')

  const vehicleYear = toInt(c.year, 0) || new Date().getFullYear() - 5
  const merk = String(c.merk || '').trim()
  const model = String(c.model || '').trim()
  const tipe = String(c.tipe || '').trim()
  const transmission = String(c.transmission || '').trim()

  // ── Harga dasar terbaru dari vehicle_master ────────────────────────────────
  const { base_price: basePrice, kode_demand: kodeDemand } = await lookupBasePrice(
    merk,
    model,
    tipe,
    transmission,
    String(vehicleYear),
  )

  // ── Riwayat servis: pakai yang tersimpan, fetch ulang hanya kalau kosong ───
  let serviceHistory = Array.isArray(row.serviceHistory) ? row.serviceHistory : []
  let serviceHistoryContext = ''
  if (!serviceHistory.length) {
    try {
      const res = await fetchVehicleServiceHistory(row.plateNumber || row.plateKey || '')
      serviceHistory = res.history || []
      serviceHistoryContext = res.contextText || ''
    } catch {
      // riwayat servis opsional — jangan gagalkan re-appraisal
    }
  }

  // Analisis suara mesin lama dipakai ulang (video tidak disimpan).
  const soundAnalysis = row.analisa_suara_mesin || null

  const bulanTelatPajak = c.statusPajak === 'Lewat' ? toInt(c.bulanTelatPajak, 0) : 0
  const dokumenKurang = Array.isArray(c.dokumenKurang) ? c.dokumenKurang : []

  // ── Kalkulasi deterministik ────────────────────────────────────────────────
  const mathResult = buildAppraisalFromConditions({
    bodyCondition: c.bodyCondition,
    banCondition: c.banCondition,
    interiorCondition: c.interiorCondition,
    mesinCondition: c.mesinCondition,
    transmisiCondition: c.transmisiCondition,
    suspensiCondition: c.suspensiCondition,
    acCondition: c.acCondition,
    starterCondition: c.starterCondition,
    soundClassification: soundAnalysis?.classification || null,
    kmTotal: kmNum,
    vehicleYear,
    basePrice,
    kodeDemand,
    bulanTelatPajak,
    dokumenKurang,
  })
  mathResult.kmTotal = kmNum
  mathResult.base_price = basePrice
  mathResult.kodeDemand = kodeDemand

  // ── Estimasi biaya perbaikan (hanya komponen bermasalah) ───────────────────
  const jobTypesNeededMap = {
    body: c.bodyCondition !== 'full original' && c.bodyCondition !== 'baret minor',
    interior: c.interiorCondition !== 'original',
    tuneup: c.mesinCondition !== 'normal' || soundAnalysis?.classification === 'kasar',
    ac: c.acCondition !== 'normal',
    battery: c.starterCondition !== 'halus',
    transmisi: c.transmisiCondition !== 'halus' && c.transmisiCondition !== 'normal',
    suspensi: c.suspensiCondition !== 'empuk' && c.suspensiCondition !== 'normal',
    tire: c.banCondition !== 'tebal' && c.banCondition !== 'normal',
  }
  const repairEstimates = await getDynamicRepairEstimatesAsync(model || merk, jobTypesNeededMap)

  // ── Narasi AI ──────────────────────────────────────────────────────────────
  // Kalau gagal (key belum di-set / rate limit), angka tetap tersimpan dan narasi
  // lama ditandai kedaluwarsa — jangan sampai admin kehilangan hasil hitungnya.
  let aiResponse = null
  let aiError = ''
  try {
    aiResponse = await generateRecommendation({
      mathResult,
      repairEstimates,
      merk,
      model,
      tipe,
      year: String(vehicleYear),
      color: String(row.color || '').trim(),
      plateNumber: String(row.plateNumber || row.plateKey || '').trim(),
      transmission,
      bodyCondition: c.bodyCondition,
      banCondition: c.banCondition,
      interiorCondition: c.interiorCondition,
      mesinCondition: c.mesinCondition,
      transmisiCondition: c.transmisiCondition,
      suspensiCondition: c.suspensiCondition,
      acCondition: c.acCondition,
      starterCondition: c.starterCondition,
      soundAnalysis,
      userSoundDescription: row.user_sound_description || '',
      serviceHistoryContext,
      expectLowPrice: String(c.expectLowPrice || '').trim(),
      sellingPoints: String(c.sellingPoints || ''),
      dokumenKurang,
      bulanTelatPajak,
      newCarModel: String(row.newCarModel || '').trim(),
      salesName: String(row.salesName || '').trim(),
    })
  } catch (err) {
    aiError = err?.message || String(err)
  }

  const before = priceSnapshot(row)
  const after = priceSnapshot({ ...mathResult, base_price: basePrice })

  // Audit trail ringkas — sengaja TIDAK menyimpan payload penuh supaya dokumen
  // tidak menabrak batas 1MB Firestore setelah beberapa kali re-appraisal.
  const historyEntry = {
    at: new Date().toISOString(),
    by: actor?.email || '',
    role: actor?.role || '',
    note: String(c.reappraisalNote || '').slice(0, 500),
    before,
    after,
    aiRegenerated: Boolean(aiResponse),
  }
  const prevHistory = Array.isArray(row.reappraisalHistory) ? row.reappraisalHistory : []
  const reappraisalHistory = [...prevHistory, historyEntry].slice(-20)

  const patch = {
    // Kondisi (hasil koreksi admin)
    bodyCondition: c.bodyCondition,
    banCondition: c.banCondition,
    interiorCondition: c.interiorCondition,
    mesinCondition: c.mesinCondition,
    transmisiCondition: c.transmisiCondition,
    suspensiCondition: c.suspensiCondition,
    acCondition: c.acCondition,
    starterCondition: c.starterCondition,
    km: kmNum,
    year: String(vehicleYear),
    statusPajak: c.statusPajak,
    bulan_telat_pajak: bulanTelatPajak,
    dokumen_kurang: dokumenKurang,
    sellingPoints: String(c.sellingPoints || ''),
    expectLowPrice: String(c.expectLowPrice || '').trim(),
    merk,
    model,
    tipe,
    transmission,

    // Hasil kalkulasi — menggantikan hasil taksasi customer
    base_price: basePrice,
    // Disimpan supaya hasil ini bisa direproduksi persis di kemudian hari.
    // Tanpa ini lebar rentang harga (yang berasal dari kode_demand) tidak bisa
    // dihitung ulang — persis masalah yang bikin data taksasi lama tidak reproducible.
    kodeDemand,
    score_total: mathResult.score_total,
    kelas_final: mathResult.kelas_final,
    harga_min: mathResult.harga_min,
    harga_max: mathResult.harga_max,
    harga_setelah_kondisi: mathResult.harga_setelah_kondisi,
    deduksi_total: mathResult.deduksi_total,
    midpoint: mathResult.midpoint,
    flag_review_mesin: mathResult.flag_review_mesin,
    override_applied: mathResult.override_applied,
    km_per_year: mathResult.kmPerYear,
    componentBreakdown: mathResult.componentBreakdown,
    categoryScores: mathResult.categoryScores,
    categoryRetentions: mathResult.categoryRetentions,
    projected_score_after_repair: mathResult.projected_score_after_repair,
    projected_grade_after_repair: mathResult.projected_grade_after_repair,
    projected_midpoint_after_repair: mathResult.projected_midpoint_after_repair,
    repairEstimatesData: Object.fromEntries(
      Object.entries(repairEstimates).map(([k, v]) => [
        k,
        {
          jobLabel: v.jobLabel,
          frtHours: v.frtHours,
          hourlyRate: v.hourlyRate,
          grossLaborCost: v.grossLaborCost,
          discount30: v.discount30,
          netLaborCost: v.netLaborCost,
          partCode: v.partCode,
          partName: v.partName,
          partCost: v.partCost,
          totalCustomerCost: v.totalCustomerCost,
          valuationGain: v.valuationGain,
        },
      ]),
    ),

    // Estimasi yang dipakai pipeline admin (kolom Estimasi Min/Max)
    estimateLow: mathResult.harga_min,
    estimateHigh: mathResult.harga_max,

    // Jejak re-appraisal
    reappraisedAt: historyEntry.at,
    reappraisedBy: historyEntry.by,
    reappraisedByRole: historyEntry.role,
    reappraisalCount: (Number(row.reappraisalCount) || 0) + 1,
    reappraisalHistory,
  }

  if (serviceHistory.length) patch.serviceHistory = serviceHistory

  if (aiResponse) {
    patch.rekomendasi_ai = aiResponse
    patch.totalBonusValue = aiResponse.total_bonus_modifikasi_rp || 0
    patch.rekomendasi_ai_stale = false
  } else {
    // Narasi lama tidak lagi cocok dengan angka baru — tandai supaya modal bisa
    // memberi peringatan, jangan tampilkan seolah-olah masih valid.
    patch.rekomendasi_ai_stale = true
  }

  return { patch, mathResult, aiResponse, before, after, aiError }
}
