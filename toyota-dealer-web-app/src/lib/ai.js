import { formatRp } from './appraisalUtils.js';

/**
 * AI Narrative & Recommendation Engine — Hasjrat Toyota Tendean
 *
 * Arsitektur:
 * - Semua KALKULASI HARGA dilakukan oleh calculation.js (deterministik)
 * - AI bertugas MENJELASKAN hasil kalkulasi, menyusun narasi,
 *   dan memberikan rekomendasi perbaikan berbasis data biaya real flatRateMaster.
 * - Whisper-1 mentranskripsi audio suara mesin → AI mengklasifikasikan.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — AI sebagai Senior Appraiser NARRATOR, bukan kalkulator
// ─────────────────────────────────────────────────────────────────────────────

const APPRAISER_NARRATOR_PROMPT = `Anda adalah Senior Vehicle Appraiser & Konsultan Resmi Hasjrat Toyota Tendean.

PERAN ANDA:
Anda BUKAN kalkulator. Semua angka harga sudah dihitung secara matematis oleh sistem kami menggunakan Matriks Resmi Hasjrat Toyota Tendean. 
Tugas Anda adalah:
1. Menjelaskan hasil kalkulasi dan memberikan RANGKUMAN (summary) kepada customer dengan bahasa profesional, hangat, komunikatif, dan mudah dipahami.
2. Menyampaikan dengan tegas & sopan dalam penjelasan Anda bahwa hasil penilaian ini adalah ESTIMASI PERKIRAAN AWAL berbasis isian data pelanggan dan HARUS DIVERIFIKASI DENGAN PEMERIKSAAN FISIK LANGSUNG OLEH TIM HASJRAT TOYOTA TENDEAN.
3. Menyusun rincian deduksi per komponen (mengapa harga turun, berapa, apa alasannya).
4. Memberikan rekomendasi perbaikan yang REALISTIS berdasarkan biaya jasa & sparepart genuine Toyota yang sudah diberikan.
5. Menghitung proyeksi harga setelah semua perbaikan, menggunakan angka yang diberikan sistem.
6. Menyampaikan saran dengan empati — customer harus merasa terbantu, bukan dijudge.

LARANGAN KERAS:
- JANGAN menyebut kata "Otozentrum", "HAU", "GPT", "OpenAI", atau "algoritma". HANYA gunakan nama "Hasjrat Toyota Tendean".
- JANGAN mengubah angka harga yang sudah diberikan sistem (midpoint, harga_min, harga_max).
- JANGAN mengubah angka jumlah_deduksi_rp — gunakan PERSIS dari data yang diberikan sistem.
- JANGAN mengubah kenaikan_nilai_taksasi_rp — gunakan PERSIS angka kenaikan_nilai_if_repaired yang diberikan sistem.
- JANGAN mengubah grade_setelah_rekondisi_penuh dan harga_setelah_rekondisi_penuh — gunakan dari data sistem.

PANDUAN GRADE RESMI HASJRAT TOYOTA TENDEAN:
- GRADE A: Semua komponen Grade A. Mobil istimewa, seperti baru.
- GRADE B: Minimal sebagian komponen A/B. Ada perbaikan minor ringan.  
- GRADE C: Salah satu dari Body/Interior/Mesin/Odometer ditemukan Grade C.
- GRADE D: Salah satu dari Body/Mesin/Odometer Grade D. Perlu kajian serius.
- GRADE F: Laka berat/banjir/surat bermasalah → TIDAK AMBIL (sudah ditolak sistem).

ODOMETER = PERMANENT: Odometer (KM kendaraan) TIDAK DAPAT diperbaiki. Deduksi dari odometer adalah PERMANEN.
Komponen REPAIRABLE: Eksterior, Interior, Mesin, AC, Kelistrikan, Transmisi, Suspensi — semuanya dapat diperbaiki di bengkel resmi.

BIAYA PERBAIKAN — PRIORITAS SUMBER DATA:
1. Jika flatRateMaster sudah menyediakan biaya pekerjaan → gunakan data tersebut.
2. Jika flatRateMaster TIDAK ADA untuk komponen tertentu (misalnya Transmisi, Suspensi) →
   ESTIMASI dari pengetahuan Anda tentang harga servis Toyota resmi di Indonesia.
   Gunakan format: "biaya_sumber": "estimasi_AI" untuk membedakannya.
   Berikan estimasi yang REALISTIS (bukan zero, bukan terlalu jauh dari harga pasar).

ANALISIS MODIFIKASI & AKSESORIS TAMBAHAN:
Jika customer mengisi Catatan Modifikasi / Aksesoris Tambahan (misalnya ganti velg racing, audio JBL, headunit Android, jok kulit, kaca film V-Kool, dll.), Anda HARUS menganalisis dan memberikan estimasi penambahan nilai taksasi yang realistis (dalam Rp dan persentase %).
Jika tidak ada catatan modifikasi yang diisi, kembalikan bonus_modifikasi_ai sebagai array kosong [].

FORMAT OUTPUT JSON VALID — WAJIB DIIKUTI PERSIS:
{
  "ringkasan": "Rangkuman menyeluruh (3-4 kalimat) yang memberikan gambaran utuh dari seluruh hasil output: sebutkan tipe kendaraan, tingkat kesehatan (%) dan grade, kisaran harga penawaran vs harga pasaran mulus, ringkasan singkat kondisi fisik/mesin yang perlu perhatian, serta potensi kenaikan nilai taksasi jika dilakukan perbaikan di Bengkel Hasjrat Toyota Tendean. Tegaskan bahwa angka ini adalah estimasi awal berbasis data isian yang akan difinalisasi saat inspeksi fisik langsung oleh tim Hasjrat Toyota Tendean.",
  "deskripsi_grade": "Label grade dalam 1 kalimat, contoh: Mobil Grade B — Kondisi Baik, Siap Pakai",
  "penjelasan_harga_harapan": "Komentar bijak terkait ekspektasi harga customer vs penawaran kami (jika ada)",
  "deduksi_per_item": [
    {
      "item": "Nama komponen",
      "kondisi_customer": "Apa yang dipilih customer",
      "alasan_deduksi": "Penjelasan 1 kalimat mengapa harga turun karena komponen ini",
      "dampak_grade_komponen": "Grade komponen ini (A/B/C/D)",
      "jumlah_deduksi_rp": 0,
      "is_permanent": false
    }
  ],
  "rekomendasi_perbaikan": [
    {
      "komponen": "Nama komponen",
      "kondisi_saat_ini": "Kondisi sekarang",
      "aksi": "Nama pekerjaan spesifik (misal: Servis Transmisi Oli ATF & Filter, Ganti Bushing Arm Suspensi)",
      "biaya_jasa_gross_rp": 0,
      "diskon_jasa_rp": 0,
      "biaya_jasa_net_rp": 0,
      "kode_parts": "Kode part resmi terpilih dari kandidat Firestore (contoh: 28800-YZZZ2)",
      "nama_parts": "Nama part resmi terpilih dari kandidat Firestore",
      "biaya_parts_rp": 0,
      "total_biaya_customer_rp": 0,
      "kenaikan_nilai_taksasi_rp": 0,
      "grade_komponen_sesudah": "A",
      "biaya_sumber": "sparepart_master atau flatrate_master atau estimasi_AI",
      "alasan_edukatif": "Penjelasan 2-3 kalimat yang logis, mendalam, dan edukatif kenapa komponen ini HARUS diganti/diperbaiki berdasarkan kondisi kendaraan customer (merk, model, tahun) dan dampaknya terhadap keamanan, kinerja, serta kenaikan nilai jual kendaraan di Hasjrat Toyota."
    }
  ],
  "bonus_modifikasi_ai": [
    {
      "item": "Nama modifikasi / aksesoris tambahan",
      "estimasi_nilai_tambah_rp": 0,
      "persentase_tambah": 0,
      "alasan": "Penjelasan 1 kalimat manfaat penambahan nilai taksasi ini"
    }
  ],
  "grade_setelah_rekondisi_penuh": "A/B/C",
  "harga_setelah_rekondisi_penuh": 0,
  "total_investasi_rekondisi_rp": 0,
  "total_kenaikan_nilai_rp": 0,
  "roi_narasi": "1 kalimat ROI, contoh: Investasi Rp X menghasilkan kenaikan nilai taksasi Rp Y",
  "saran_bengkel": "Rekomendasi ramah dari AI mengenai opsi perbaikan untuk menaikkan harga taksasi. Jelaskan dengan bahasa awam yang mudah dipahami bahwa data biaya jasa & sparepart dihitung berdasarkan standar resmi Hasjrat Toyota Tendean (dengan promo Diskon 30% Jasa).",
  "catatan_kritis": null
}`

// ─────────────────────────────────────────────────────────────────────────────
// HTTP HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function callChatCompletion(messages, model = 'gpt-4o', temperature = 0.3) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) throw new Error('VITE_OPENAI_API_KEY is not configured');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function transcribeAudio(base64Data, mimeType = 'audio/mp3') {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey || !base64Data) return '';

  try {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('webm') ? 'webm' : 'mp3';
    const blob = new Blob([byteArray], { type: mimeType });
    const file = new File([blob], `audio.${ext}`, { type: mimeType });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      return data.text || '';
    }
  } catch (err) {
    console.warn('Whisper transcription error:', err);
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildNarratorPrompt({
  mathResult, repairEstimates,
  merk, model, tipe, year, color, plateNumber, transmission,
  bodyCondition, banCondition, interiorCondition,
  mesinCondition, transmisiCondition, suspensiCondition,
  acCondition, starterCondition,
  soundAnalysis, userSoundDescription,
  serviceHistoryContext,
  expectLowPrice, sellingPoints,
  dokumenKurang, bulanTelatPajak,
  newCarModel, salesName,
}) {
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID');

  // Ringkasan angka kalkulasi
  const mathSummary = `
[HASIL KALKULASI MATEMATIS RESMI — TIDAK BOLEH DIUBAH]
- Kendaraan        : ${merk} ${model} ${tipe} ${year} (${color}) | Plat: ${plateNumber}
- Transmisi        : ${transmission}
- Harga Pasaran Mulus (Grade A)  : Rp ${fmt(mathResult.base_price)}
- Moving Code      : ${mathResult.kodeDemand || 'FM'} (Demand Market)
- Score Total      : ${(mathResult.score_total * 100).toFixed(1)}%
- Grade Akhir      : ${mathResult.kelas_final}
- Midpoint Penawaran     : Rp ${fmt(mathResult.midpoint)}
- Range Penawaran        : Rp ${fmt(mathResult.harga_min)} – Rp ${fmt(mathResult.harga_max)}
- KM Rata-rata / Tahun   : ${fmt(mathResult.kmPerYear)} km/tahun (Usia kendaraan: ${mathResult.vehicleAge} tahun)
- Odometer Grade   : ${mathResult.odoGrade} — ${mathResult.odoLabel}

[PROYEKSI SETELAH SEMUA KOMPONEN REPAIRABLE DIPERBAIKI — SUDAH DIHITUNG SISTEM]
- Grade Proyeksi   : ${mathResult.projected_grade_after_repair}
- Midpoint Proyeksi: Rp ${fmt(mathResult.projected_midpoint_after_repair)}
- CATATAN: Odometer PERMANEN, tidak termasuk dalam proyeksi perbaikan.
`;

  // Breakdown komponen dengan deduksi AKTUAL proporsional
  const componentText = (mathResult.componentBreakdown || []).map((c) => {
    if (c.is_bonus) {
      return `  • ${c.komponen}: ${c.kondisi} → BONUS +2% (KM rendah, nilai naik)`;
    }
    const permStr = c.is_permanent ? ' [PERMANENT — TIDAK BISA DIPERBAIKI]' : ' [REPAIRABLE]';
    const deduksiStr = c.deduksi_rp_actual > 0
      ? `Deduksi Aktual: Rp ${fmt(c.deduksi_rp_actual)} | Kenaikan jika diperbaiki: Rp ${fmt(c.kenaikan_nilai_if_repaired || 0)}`
      : 'Tidak ada deduksi';
    return `  • ${c.komponen}${permStr}: kondisi "${c.kondisi}" → Grade ${c.grade} (retensi ${(c.retensi * 100).toFixed(0)}%) → ${deduksiStr}`;
  }).join('\n');

  // Biaya perbaikan dari flatRateMaster & sparepart_master Firestore
  const flatRateCovered = Object.keys(repairEstimates || {});
  const repairText = Object.entries(repairEstimates || {}).map(([jobType, est]) => {
    let candidateText = '';
    if (Array.isArray(est.sparepartCandidates) && est.sparepartCandidates.length > 0) {
      candidateText = `\n      DAFTAR KANDIDAT SPAREPART DARI FIRESTORE (PILIH 1 YANG PALING PAS UNTUK MOBIL CUSTOMER Ini):\n` +
        est.sparepartCandidates.map(c => `        * Kode: "${c.kode_parts}" | Nama: "${c.nama_parts}" | Harga: Rp ${fmt(c.harga_satuan)}`).join('\n');
    } else {
      candidateText = `\n      Part Default: Kode "${est.partCode}" | Nama: "${est.partName}" | Harga: Rp ${fmt(est.partCost)}`;
    }

    return `  • [Pekerjaan ${jobType.toUpperCase()}] ${est.jobLabel}
      Jasa Gross   : Rp ${fmt(est.grossLaborCost)} (FRT ${est.frtHours} jam × Rp ${fmt(est.hourlyRate)}/jam)
      Diskon 30%   : -Rp ${fmt(est.discount30)}
      Jasa Net     : Rp ${fmt(est.netLaborCost)}${candidateText}
      Kenaikan Nilai Taksasi (FIXED): Rp ${fmt(est.valuationGain)}`;
  }).join('\n\n');

  // Komponen yang belum ada di flatRateMaster
  const defectiveComponents = (mathResult.componentBreakdown || [])
    .filter(c => !c.is_bonus && !c.is_permanent && c.deduksi_rp_actual > 0)
    .map(c => c.komponen);

  const missingRepairComponents = defectiveComponents.filter(komponen => {
    // Map komponen ke jobType
    const kompLower = komponen.toLowerCase();
    if (kompLower.includes('transmisi') && !flatRateCovered.includes('transmisi')) return true;
    if (kompLower.includes('suspensi') && !flatRateCovered.includes('suspensi')) return true;
    if (kompLower.includes('eksterior') && !flatRateCovered.includes('body')) return true;
    return false;
  });

  const missingText = missingRepairComponents.length > 0
    ? `\n[KOMPONEN YANG PERLU ANDA ESTIMASI BIAYANYA DARI PENGETAHUAN TOYOTA]
${missingRepairComponents.map(k => {
  const c = (mathResult.componentBreakdown || []).find(x => x.komponen === k);
  return `  • ${k}: kondisi "${c?.kondisi || ''}", kenaikan_nilai_taksasi_rp HARUS = Rp ${fmt(c?.kenaikan_nilai_if_repaired || 0)}`;
}).join('\n')}
Berikan estimasi biaya jasa+parts yang realistis (Bengkel Resmi Toyota Indonesia), diskon 30% untuk jasa.`
    : '';

  // Dokumen deduksi detail
  const dokumenText = (mathResult.dokumenDeduksiDetail || []).map(
    (d) => `  • ${d.dokumen}: -Rp ${fmt(d.jumlah)}`
  ).join('\n') || '  • Semua dokumen lengkap';

  // Riwayat servis
  const historyText = serviceHistoryContext
    ? `\n[RIWAYAT SERVIS RESMI HASJRAT TOYOTA]\n${serviceHistoryContext}`
    : '';

  // Suara mesin
  const soundText = soundAnalysis
    ? `AI Deteksi Suara Mesin: ${String(soundAnalysis.classification || '').toUpperCase()}`
    : userSoundDescription
    ? `Keterangan Suara Customer: "${userSoundDescription}"`
    : '';

  // Harga harapan customer
  const expectText = expectLowPrice
    ? `Ekspektasi Harga Customer: Rp ${fmt(Number(String(expectLowPrice).replace(/[^\d]/g, '')))}`
    : 'Ekspektasi harga: tidak diisi';

  return `${mathSummary}

[INPUTAN KONDISI CUSTOMER VERBATIM]
1. Body/Eksterior : "${bodyCondition}" | Ban: "${banCondition}"
2. Interior       : "${interiorCondition}"
3. Mesin          : "${mesinCondition}" | AC: "${acCondition}" | Starter: "${starterCondition}"
4. Transmisi      : "${transmisiCondition}"
5. Suspensi       : "${suspensiCondition}"
6. Odometer Total : ${fmt(mathResult.kmTotal || 0)} km (${fmt(mathResult.kmPerYear)} km/tahun, ${mathResult.vehicleAge} tahun) [PERMANENT]
7. Pajak          : ${bulanTelatPajak > 0 ? `Telat ${bulanTelatPajak} bulan` : 'Aktif'}
8. Dokumen Kurang : ${dokumenKurang.length ? dokumenKurang.join(', ') : 'Lengkap'}
9. Catatan Tambahan: ${sellingPoints || 'Tidak ada'}
${expectText}
${newCarModel ? `Mobil Baru Diincar: ${newCarModel}` : ''}
${salesName   ? `Referral Sales: ${salesName}`      : ''}
${soundText}

[BREAKDOWN DEDUKSI PER KOMPONEN — AKTUAL PROPORSIONAL (WAJIB DIPAKAI)]
${componentText}

[DETAIL DEDUKSI DOKUMEN & PAJAK]
${dokumenText}

[DATA BIAYA PERBAIKAN & KANDIDAT SPAREPART FIRESTORE]
${repairText || '  Semua komponen dalam kondisi baik.'}
${missingText}
${historyText}

INSTRUKSI PENTING:
1. deduksi_per_item: isi setiap komponen yang punya deduksi_rp_actual > 0. Gunakan jumlah dari BREAKDOWN di atas.
2. rekomendasi_perbaikan: isi SEMUA komponen repairable yang bermasalah.
   - PENTING (KANDIDAT SPAREPART FIRESTORE): Dari daftar kandidat sparepart Firestore yang diberikan untuk setiap komponen, ANALISA & PILIH 1 part yang PALING COCOK untuk kendaraan ${merk} ${model} (${year}). Isikan \`kode_parts\`, \`nama_parts\`, dan \`biaya_parts_rp\` persis dari kandidat yang Anda pilih.
   - PENTING (PENJELASAN LOGIS & EDUKATIF): Tuliskan \`alasan_edukatif\` 2-3 kalimat yang mendalam, logis, dan komunikatif bagi customer. Jelaskan mengapa perbaikan/pergantian part ini sangat perlu dilakukan berdasarkan gejala/kondisi mobil saat ini, dampaknya bagi keawetan & keselamatan, serta kenaikan nilai jual kembali di Hasjrat Toyota Tendean.
   - \`biaya_jasa_net_rp\` = gunakan Jasa Net dari data di atas.
   - \`total_biaya_customer_rp\` = \`biaya_jasa_net_rp\` + \`biaya_parts_rp\`.
   - \`kenaikan_nilai_taksasi_rp\` = \`kenaikan_nilai_if_repaired\` dari BREAKDOWN (JANGAN UBAH).
3. grade_setelah_rekondisi_penuh = "${mathResult.projected_grade_after_repair}" (JANGAN UBAH).
4. harga_setelah_rekondisi_penuh = ${mathResult.projected_midpoint_after_repair} (JANGAN UBAH).
5. total_kenaikan_nilai_rp = sum dari kenaikan_nilai_taksasi_rp semua komponen repairable.
6. Narasi dalam Bahasa Indonesia yang profesional, edukatif, dan hangat.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AI Narrative Engine — Menerima hasil math + data repair + inputan customer.
 * Mengembalikan narasi, deduksi_per_item, rekomendasi_perbaikan, proyeksi post-rekondisi.
 *
 * @param {object} params
 * @param {object} params.mathResult          - Output dari buildAppraisalFromConditions()
 * @param {object} params.repairEstimates     - Output dari getDetailedEstimateForRepair() per jobType
 * @param {string} params.merk / model / tipe / year / color / plateNumber / transmission
 * @param {string} params.bodyCondition / banCondition / interiorCondition / ...
 * @param {object|null} params.soundAnalysis
 * @param {string} params.userSoundDescription
 * @param {string} params.serviceHistoryContext
 * @param {string} params.expectLowPrice
 * @param {string} params.sellingPoints
 * @param {string[]} params.dokumenKurang
 * @param {number} params.bulanTelatPajak
 * @param {string} params.newCarModel
 * @param {string} params.salesName
 */
export async function generateRecommendation(params) {
  const { mathResult } = params;

  try {
    const userPrompt = buildNarratorPrompt(params);

    const messages = [
      { role: 'system', content: APPRAISER_NARRATOR_PROMPT },
      { role: 'user',   content: userPrompt },
    ];

    const rawText = await callChatCompletion(messages, 'gpt-4o', 0.3);
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    const bonusModifikasi = Array.isArray(parsed.bonus_modifikasi_ai) ? parsed.bonus_modifikasi_ai : [];
    const totalBonusModifikasi = bonusModifikasi.reduce((sum, item) => sum + (Number(item.estimasi_nilai_tambah_rp) || 0), 0);

    // Apply modification bonus to prices
    const finalMidpoint = mathResult.midpoint + totalBonusModifikasi;
    const finalHargaMin = mathResult.harga_min + totalBonusModifikasi;
    const finalHargaMax = mathResult.harga_max + totalBonusModifikasi;
    const finalHargaKondisi = mathResult.harga_setelah_kondisi + totalBonusModifikasi;

    return {
      // Narasi dari AI
      ringkasan:               parsed.ringkasan               || '',
      deskripsi_grade:         parsed.deskripsi_grade         || '',
      penjelasan_harga_harapan: parsed.penjelasan_harga_harapan || '',
      saran_bengkel:           parsed.saran_bengkel           || '',
      catatan_kritis:          parsed.catatan_kritis          || null,
      roi_narasi:              parsed.roi_narasi              || '',

      // Itemized dari AI (narasi per komponen, angka dari mathResult)
      deduksi_per_item:       Array.isArray(parsed.deduksi_per_item) ? parsed.deduksi_per_item : [],
      rekomendasi_perbaikan:  Array.isArray(parsed.rekomendasi_perbaikan) ? parsed.rekomendasi_perbaikan : [],
      bonus_modifikasi_ai:    bonusModifikasi,
      total_bonus_modifikasi_rp: totalBonusModifikasi,

      // Proyeksi post-rekondisi
      grade_setelah_rekondisi_penuh:  mathResult.projected_grade_after_repair || parsed.grade_setelah_rekondisi_penuh || mathResult.kelas_final,
      harga_setelah_rekondisi_penuh:  (mathResult.projected_midpoint_after_repair || mathResult.midpoint) + totalBonusModifikasi,
      total_investasi_rekondisi_rp: Number(parsed.total_investasi_rekondisi_rp) || 0,
      total_kenaikan_nilai_rp:      Number(parsed.total_kenaikan_nilai_rp)      || 0,

      // Harga dari calculation.js (+ bonus modifikasi AI)
      score_total:          mathResult.score_total,
      kelas_final:          mathResult.kelas_final,
      harga_setelah_kondisi: finalHargaKondisi,
      deduksi_total:        mathResult.deduksi_total,
      midpoint:             finalMidpoint,
      harga_min:            finalHargaMin,
      harga_max:            finalHargaMax,

      // Backward compat fields
      deduksi_mesin_suara:     Math.round((mathResult.deduksi_total || 0) * 0.65),
      deduksi_odometer_servis: Math.round((mathResult.deduksi_total || 0) * 0.35),
    };
  } catch (error) {
    console.warn('AI narrator error, using fallback:', error);
    return fallbackNarration(mathResult, params.repairEstimates || {}, params);
  }
}

/**
 * Audio Engine Sound Analysis via Whisper-1 + GPT-4o.
 * Dipanggil di TradeInPage SEBELUM buildAppraisalFromConditions.
 */
export async function analyzeEngineSound(base64Data, mimeType = 'audio/mp3') {
  if (!base64Data) {
    return {
      classification: 'halus',
      detail: 'Suara mesin terdeteksi normal.',
    };
  }

  try {
    const audioTranscript = await transcribeAudio(base64Data, mimeType);
    const cleanText = (audioTranscript || '').trim();
    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

    // Skip over-analysis if audio transcription is minimal/background noise (e.g. "You", "Thank you", single words)
    if (wordCount < 3 && !/knock|bunyi|kasar|asap|ngotot|rusak/i.test(cleanText)) {
      return {
        classification: 'halus',
        detail: 'Suara mesin terdeteksi normal.',
      };
    }

    const promptText = `Analisis transkripsi suara mesin berikut:
"${cleanText}"

Klasifikasikan ke salah satu: "halus", "sedang", atau "kasar".
Jawab singkat tanpa spekulasi berlebihan.

Output JSON:
{ "classification": "halus", "detail": "Suara mesin terdeteksi normal." }`;

    const messages = [
      { role: 'system', content: 'Anda adalah Senior Vehicle Appraiser Hasjrat Toyota.' },
      { role: 'user',   content: promptText },
    ];

    const rawText = await callChatCompletion(messages, 'gpt-4o', 0.2);
    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    let soundClass = String(parsed.classification || '').toLowerCase();
    if (!['halus', 'sedang', 'kasar'].includes(soundClass)) soundClass = 'halus';

    const simpleDetail = soundClass === 'kasar'
      ? 'Suara mesin terdeteksi kasar (perlu pemeriksaan langsung).'
      : soundClass === 'sedang'
      ? 'Suara mesin wajar pemakaian harian.'
      : 'Suara mesin terdeteksi normal.';

    return {
      classification: soundClass,
      detail: simpleDetail,
    };
  } catch (error) {
    console.warn('OpenAI audio evaluation error:', error);
    return {
      classification: 'halus',
      detail: 'Suara mesin terdeteksi normal.',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK — Jika GPT-4o gagal
// ─────────────────────────────────────────────────────────────────────────────

function fallbackNarration(mathResult, repairEstimates = {}, params = {}) {
  const { kelas_final, score_total, midpoint, harga_min, harga_max, base_price = 0 } = mathResult;
  const merk = params.merk || '';
  const model = params.model || '';
  const year = params.year || '';

  const totalRepairCost  = Object.values(repairEstimates).reduce((s, e) => s + (e.totalCustomerCost || 0), 0);
  const totalValueGain   = Object.values(repairEstimates).reduce((s, e) => s + (e.valuationGain   || 0), 0);

  const gradeMap = {
    A: 'Mobil Istimewa — Sangat Terawat & Seperti Baru',
    B: 'Mobil Bagus & Siap Pakai — Perbaikan Sangat Minim',
    C: 'Mobil Cukup Baik — Perlu Sedikit Rekondisi',
    D: 'Mobil Perlu Perbaikan Menyeluruh — Kajian Lebih Lanjut Diperlukan',
  };

  const condPercent = Math.round(score_total * 100);
  const repairText = totalValueGain > 0
    ? ` Melakukan opsi perbaikan senilai ${formatRp(totalRepairCost)} di Bengkel Resmi Hasjrat Toyota Tendean berpotensi menaikkan nilai taksasi hingga +${formatRp(totalValueGain)}.`
    : ' Kondisi kendaraan secara umum sangat baik.';

  return {
    ringkasan: `Berdasarkan evaluasi menyeluruh data kendaraan ${merk} ${model} (${year}), unit Anda memiliki tingkat kesehatan ${condPercent}% (Grade ${kelas_final}) dengan estimasi penawaran harga bersih ${formatRp(harga_min)} – ${formatRp(harga_max)} dari harga pasaran mulus ${formatRp(base_price)}.${repairText} Penilaian ini merupakan estimasi perkiraan awal berdasarkan data isian Anda dan akan difinalisasi melalui pemeriksaan fisik langsung oleh tim teknisi Hasjrat Toyota Tendean.`,
    deskripsi_grade: gradeMap[kelas_final] || `Grade ${kelas_final}`,
    penjelasan_harga_harapan: 'Penawaran kami dihitung berdasarkan standar resmi Hasjrat Toyota Tendean.',
    saran_bengkel: totalRepairCost > 0
      ? `Berdasarkan analisis AI, kendaraan Anda terawat dengan baik. Untuk menaikkan nilai tukar tambah, Anda dapat mempertimbangkan opsi perbaikan di bawah di Bengkel Resmi Hasjrat Toyota Tendean (estimasi biaya menggunakan data jasa & sparepart resmi, plus promo Diskon 30% Jasa Mekanik).`
      : 'Berdasarkan analisis AI, kendaraan Anda dalam kondisi sangat baik dan siap diinspeksi langsung oleh tim Hasjrat Toyota Tendean.',
    catatan_kritis: score_total < 0.65 ? 'Terdapat catatan perbaikan yang memerlukan perhatian serius.' : null,
    roi_narasi: totalRepairCost > 0
      ? `Investasi Rp ${totalRepairCost.toLocaleString('id-ID')} dapat meningkatkan nilai kendaraan hingga Rp ${totalValueGain.toLocaleString('id-ID')}.`
      : '',
    deduksi_per_item:      [],
    rekomendasi_perbaikan: [],
    grade_setelah_rekondisi_penuh: kelas_final === 'C' ? 'B' : kelas_final === 'D' ? 'C' : kelas_final,
    harga_setelah_rekondisi_penuh: midpoint + totalValueGain,
    total_investasi_rekondisi_rp:  totalRepairCost,
    total_kenaikan_nilai_rp:       totalValueGain,
    score_total:          mathResult.score_total,
    kelas_final:          mathResult.kelas_final,
    harga_setelah_kondisi: mathResult.harga_setelah_kondisi,
    deduksi_total:        mathResult.deduksi_total,
    midpoint:             mathResult.midpoint,
    harga_min:            mathResult.harga_min,
    harga_max:            mathResult.harga_max,
    deduksi_mesin_suara:     Math.round((mathResult.deduksi_total || 0) * 0.65),
    deduksi_odometer_servis: Math.round((mathResult.deduksi_total || 0) * 0.35),
  };
}
