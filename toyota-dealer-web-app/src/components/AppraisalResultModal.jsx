import { useMemo } from 'react';
import { formatRp } from '../lib/appraisalUtils.js';
import { PrintButton } from './PrintButton.jsx';
import { pipelineLabel } from '../utils/tradeinCustomerStatus.js';
import { getDetailedEstimateForRepair } from '../lib/flatRateMaster.js';

function cleanPartName(name) {
  if (!name) return 'Sparepart Original Toyota';
  return String(name)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b(LCGC|ECONOMY|STANDARD|MEDIUM LUXURY|LUXURY)\b/gi, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function AppraisalResultModal({ result, onClose, onRequestInspection }) {
  if (!result) return null;

  // Property Mappings
  const merk = result.merk || 'Toyota';
  const model = result.model || 'Kendaraan';
  const varian = result.varian || result.tipe || '';
  const tahun = result.tahun || result.year || '';
  const nopol = result.nopol || result.plateNumber || '';
  const transmisi = result.transmisi || result.transmission || 'Matic';
  const customerName = result.customerName || result.customerDisplayName || 'Pelanggan Toyota';

  const {
    id = 'HT-882D',
    expectLowPrice,
    newCarModel,
    color,
    salesName,
    kelas_final = 'B',
    score_total = 0.85,
    bulan_telat_pajak = 0,
    dokumen_kurang = [],
    rekomendasi_ai = {},
    flag_review_mesin = false,
    override_applied = false,
    serviceHistory = [],
    troubles = [],
    selectedBonuses = [],
    totalBonusValue = 0,
    createdAt,
  } = result;

  const analisaSuaraMesin = result.analisa_suara_mesin || result.analisaSuaraMesin || null;
  const user_sound_description = result.user_sound_description || result.userSoundDescription || '';

  // Prices calculation
  const base_price = result.base_price || 150000000;
  const harga_min = result.harga_min || Math.round(base_price * 0.75);
  const harga_max = result.harga_max || Math.round(base_price * 0.90);
  const harga_setelah_kondisi = result.harga_setelah_kondisi || Math.round(base_price * (score_total || 0.85));
  const midpoint = result.midpoint || Math.round((harga_min + harga_max) / 2);

  const categoryScores = result.categoryScores || {
    exterior: 85,
    interior: 85,
    mesin: 85,
    transmisi: 100,
    suspensi: 100,
  };

  const ekspektasiHarga = useMemo(() => {
    if (!expectLowPrice) return null;
    const num = Number(String(expectLowPrice).replace(/[^\d]/g, ''));
    return isNaN(num) || num <= 0 ? null : num;
  }, [expectLowPrice]);

  const totalDendaPajak = bulan_telat_pajak > 0 && base_price > 0
    ? (bulan_telat_pajak * (base_price * 0.018)) / 12
    : 0;

  const listDokumenKurangDetail = useMemo(() => {
    return (dokumen_kurang || []).map((doc) => {
      let val = 1000000;
      if (doc === 'BPKB') val = Math.round(harga_setelah_kondisi * 0.35);
      else if (doc === 'STNK') val = 2000000;
      else if (doc === 'KTP sesuai') val = Math.round(base_price * 0.015);
      else if (doc === 'Faktur') val = 1000000;
      return { name: doc, value: val };
    });
  }, [dokumen_kurang, harga_setelah_kondisi, base_price]);

  const totalDokumenDeduction = useMemo(() => {
    let docSum = listDokumenKurangDetail.reduce((acc, d) => acc + d.value, 0);
    return docSum + Math.round(totalDendaPajak);
  }, [listDokumenKurangDetail, totalDendaPajak]);

  const netDeductionNeeded = Math.max(0, base_price - midpoint - totalDokumenDeduction);

  // Workshop Repair Costs (FRT Labor + Genuine Parts with Diskon 30% Trade-In)
  const { improvementsList, totalJasaGross, totalJasaDiscount, totalJasaNet, totalSparepart, totalNetCost, totalGain } = useMemo(() => {
    const list = [];
    const body = result.bodyCondition || '';
    const interior = result.interiorCondition || '';
    const mesin = result.mesinCondition || '';
    const ac = result.acCondition || '';
    const starter = result.starterCondition || '';
    const carModelName = result.model || result.merk || 'Toyota';
    const compBreak = Array.isArray(result.componentBreakdown) ? result.componentBreakdown : [];

    // Helper: look up kenaikan_nilai_if_repaired from componentBreakdown by component label
    const getKenaikan = (komponen) => {
      const c = compBreak.find(x =>
        typeof x.komponen === 'string' && x.komponen.toLowerCase().includes(komponen.toLowerCase())
      );
      return c?.kenaikan_nilai_if_repaired || 0;
    };

    let accumJasaGross = 0;
    let accumJasaDiscount = 0;
    let accumJasaNet = 0;
    let accumSparepart = 0;
    let accumNet = 0;
    let accumGain = 0;

    const aiRecs = Array.isArray(result.rekomendasi_perbaikan) ? result.rekomendasi_perbaikan : [];

    const addRepairItem = (jobType, conditionDesc, overrideGain = null) => {
      const est = getDetailedEstimateForRepair(carModelName, jobType);
      const gain = overrideGain !== null ? overrideGain : est.valuationGain;

      // Find matching AI recommendation item
      const aiMatch = aiRecs.find((r) => {
        const k = String(r.komponen || '').toLowerCase();
        const a = String(r.aksi || '').toLowerCase();
        const jt = jobType.toLowerCase();
        return k.includes(jt) || a.includes(jt) || (jt === 'battery' && (k.includes('starter') || k.includes('aki')));
      }) || aiRecs.find(r => !r._used);

      if (aiMatch) aiMatch._used = true;

      const partCode = aiMatch?.kode_parts || est.partCode;
      const partName = aiMatch?.nama_parts || est.partName;
      const partCost = Number(aiMatch?.biaya_parts_rp) > 0 ? Number(aiMatch.biaya_parts_rp) : est.partCost;
      const netLaborCost = Number(aiMatch?.biaya_jasa_net_rp) > 0 ? Number(aiMatch.biaya_jasa_net_rp) : est.netLaborCost;
      const grossLaborCost = Number(aiMatch?.biaya_jasa_gross_rp) > 0 ? Number(aiMatch.biaya_jasa_gross_rp) : est.grossLaborCost;
      const discount30 = Number(aiMatch?.diskon_jasa_rp) > 0 ? Number(aiMatch.diskon_jasa_rp) : est.discount30;
      const totalCustomerCost = netLaborCost + partCost;
      const alasanEdukatif = aiMatch?.alasan_edukatif || aiMatch?.catatan || '';

      const item = {
        icon: est.icon,
        label: `${est.jobLabel} (${conditionDesc})`,
        frtHours: est.frtHours,
        hourlyRate: est.hourlyRate,
        category: est.category,
        grossLaborCost,
        discount30,
        netLaborCost,
        jobType,
        partCode,
        partName,
        partCost,
        totalCustomerCost,
        gain,
        alasanEdukatif,
        biayaSumber: aiMatch?.biaya_sumber || 'sparepart_master',
      };
      list.push(item);
      accumJasaGross += grossLaborCost;
      accumJasaDiscount += discount30;
      accumJasaNet += netLaborCost;
      accumSparepart += partCost;
      accumNet += totalCustomerCost;
      accumGain += gain;
    };

    const transmisi = result.transmisiCondition || result.transmisi || '';
    const suspensi = result.suspensiCondition || result.suspensi || '';

    const ban = result.banCondition || result.ban || '';

    if (body.includes('baret') || body.includes('laka')) {
      addRepairItem('body', body, getKenaikan('eksterior'));
    }
    if (ban && (ban === 'aus' || ban === 'velg_baret')) {
      const bodyHasGain = body.includes('baret') || body.includes('laka');
      addRepairItem('tire', ban === 'aus' ? 'ban aus / ganti baru' : 'velg baret / balancing', bodyHasGain ? 0 : getKenaikan('eksterior'));
    }
    if (interior === 'kurang rapi' || interior === 'tidak layak') {
      addRepairItem('interior', interior, getKenaikan('interior'));
    }
    const mesinHasGain = mesin === 'ada gejala' || mesin === 'bermasalah' || (analisaSuaraMesin && analisaSuaraMesin.classification === 'kasar');
    if (mesinHasGain) {
      addRepairItem('tuneup', mesin || 'suara kasar', getKenaikan('mesin utama'));
    }
    if (ac === 'butuh service ringan' || ac === 'mati/tidak berfungsi') {
      addRepairItem('ac', ac, getKenaikan('kelistrikan'));
    }
    if (starter === 'lambat/aki lemah' || starter === 'kasar/dinamo bermasalah') {
      const acHasGain = ac === 'butuh service ringan' || ac === 'mati/tidak berfungsi';
      addRepairItem('battery', starter, acHasGain ? 0 : getKenaikan('kelistrikan'));
    }
    if (transmisi && transmisi !== 'halus' && transmisi !== 'normal') {
      addRepairItem('transmisi', transmisi, getKenaikan('transmisi'));
    }
    if (suspensi && suspensi !== 'empuk' && suspensi !== 'normal') {
      addRepairItem('suspensi', suspensi, getKenaikan('suspensi'));
    }

    return {
      improvementsList: list,
      totalJasaGross: accumJasaGross,
      totalJasaDiscount: accumJasaDiscount,
      totalJasaNet: accumJasaNet,
      totalSparepart: accumSparepart,
      totalNetCost: accumNet,
      totalGain: accumGain,
    };
  }, [result.bodyCondition, result.interiorCondition, result.mesinCondition, result.acCondition, result.starterCondition, result.model, result.merk, result.componentBreakdown, analisaSuaraMesin]);

  // Depreciation deduction lines aligned 100% mathematically with midpoint and repair gains
  const { deduksiKondisiMesin, deduksiOdometer, deduksiDepresiasiTahunPasar } = useMemo(() => {
    const kond = totalGain; // 100% synchronized with repair items valuation gain (1.5x of repair cost)
    const odoRatio = 0.35;
    let odo = Math.round(base_price * (1 - (score_total || 0.85)) * odoRatio);
    if (odo <= 0 && netDeductionNeeded > kond) {
      odo = Math.round((netDeductionNeeded - kond) * 0.35);
    }
    const pasar = Math.max(0, netDeductionNeeded - kond - odo);
    return {
      deduksiKondisiMesin: kond,
      deduksiOdometer: odo,
      deduksiDepresiasiTahunPasar: pasar,
    };
  }, [base_price, midpoint, netDeductionNeeded, totalGain, score_total]);

  // Calculation of Upgraded Grade & Reconditioned Offer Range
  const { upgradedGrade, repairedOfferMidpoint, repairedOfferMin, repairedOfferMax, totalUpgradedGain } = useMemo(() => {
    const projectedGrade = result.projected_grade_after_repair || result.rekomendasi_ai?.grade_setelah_rekondisi_penuh || 'A';
    
    // Pakai midpoint dari proyeksi sistem (atau midpoint saat ini + kenaikan repairs)
    const calcMidpoint = result.projected_midpoint_after_repair || (midpoint + totalGain);

    // Pakai demand_width yang sama dengan penawaran utama (implied dari harga_min/harga_max)
    const baseWidth = midpoint > 0 ? (harga_max - harga_min) / (2 * midpoint) : 0.10;
    const impliedWidth = Math.max(baseWidth, 0.10);
    const min = Math.round(calcMidpoint * (1 - impliedWidth));
    const max = Math.min(base_price, Math.round(calcMidpoint * (1 + impliedWidth)));

    return {
      upgradedGrade: projectedGrade,
      repairedOfferMidpoint: calcMidpoint,
      repairedOfferMin: min,
      repairedOfferMax: max,
      totalUpgradedGain: totalGain,
    };
  }, [result.projected_grade_after_repair, result.projected_midpoint_after_repair, result.rekomendasi_ai, midpoint, totalGain, harga_min, harga_max]);

  const hasServiceRecords = serviceHistory && serviceHistory.length > 0;

  const dateFormatted = useMemo(() => {
    let d = new Date();
    if (createdAt) {
      if (createdAt.toDate) d = createdAt.toDate();
      else if (typeof createdAt === 'number') d = new Date(createdAt);
      else {
        const str = String(createdAt).replace(' at ', ' ').replace(' UTC+8', '');
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) d = parsed;
        else {
          const direct = new Date(createdAt);
          if (!isNaN(direct.getTime())) d = direct;
        }
      }
    }
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [createdAt]);

  const currentStatusLabel = pipelineLabel(result);

  // WhatsApp URLs
  const troubleSummaryText = troubles.length > 0 ? troubles.map((t) => t.description.toLowerCase()).join(', ') : 'baret minor bodi, suara mesin normal';
  const waBookingServiceUrl = `https://wa.me/6281234567890?text=Halo%20Bengkel%20Hasjrat%20Toyota%20Tendean,%20saya%20ingin%20booking%20service%20perbaikan%20diskon%2030%25%20program%20trade-in%20(${encodeURIComponent(troubleSummaryText)})%20untuk%20mobil%20${encodeURIComponent(merk)}%20${encodeURIComponent(model)}%20(${encodeURIComponent(nopol)}).`;
  const waBookingTradeinUrl = `https://wa.me/6281234567890?text=Halo%20Hasjrat%20Toyota,%20saya%20ingin%20Trade-In%20mobil%20${encodeURIComponent(merk)}%20${encodeURIComponent(model)}%20${encodeURIComponent(varian)}%20(${encodeURIComponent(nopol)}).%20Estimasi%20appraisal:%20${encodeURIComponent(formatRp(harga_min))}%20-%20${encodeURIComponent(formatRp(harga_max))}.`;

  const gradeTitle = result.deskripsi_grade || (kelas_final === 'A'
    ? 'Mobil Istimewa (Sangat Terawat & Seperti Baru)'
    : kelas_final === 'B'
    ? 'Mobil Bagus & Siap Pakai (Perbaikan Sangat Minim)'
    : kelas_final === 'C'
    ? 'Mobil Cukup Baik (Perlu Sedikit Servis)'
    : 'Mobil Perlu Perbaikan Menyeluruh');

  const expComparisonText = useMemo(() => {
    if (result.penjelasan_harga_harapan) return result.penjelasan_harga_harapan;
    if (!ekspektasiHarga) return 'Harga harapan belum diisi.';
    if (ekspektasiHarga >= harga_min && ekspektasiHarga <= harga_max) {
      return '👍 Kabar Baik! Harga Penawaran Hasjrat Toyota pas sesuai dengan harapan Anda.';
    }
    if (ekspektasiHarga < harga_min) {
      return '🎉 Luar Biasa! Penawaran Hasjrat Toyota LEBIH TINGGI dari harga harapan Anda!';
    }
    return '💡 Penawaran Hasjrat Toyota di bawah harga harapan Anda karena terdapat beberapa catatan perbaikan fisik & mekanis.';
  }, [result.penjelasan_harga_harapan, ekspektasiHarga, harga_min, harga_max]);

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      style={{ overflowY: 'auto', padding: '16px 8px', zIndex: 9999 }}
    >
      <div
        className="modalCard"
        style={{
          maxWidth: 920,
          width: '100%',
          margin: '0 auto',
          background: '#0d1322',
          color: '#f8fafc',
          borderRadius: 20,
          padding: 24,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Top Control Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
            Status Pengajuan: <strong style={{ color: '#38bdf8', marginLeft: 4 }}>{currentStatusLabel}</strong>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {onRequestInspection && (
              <button
                type="button"
                className="btn btn--small btn--primary"
                style={{ fontSize: 11, padding: '6px 12px' }}
                onClick={() => {
                  onRequestInspection(result);
                  if (onClose) onClose();
                }}
              >
                🎯 Minta Pemeriksaan Fisik Sekarang
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost"
              style={{ padding: '4px 10px', fontSize: 12, borderRadius: 8 }}
              onClick={onClose}
            >
              ✕ Tutup
            </button>
          </div>
        </div>

        {/* PRINTABLE REPORT DOCUMENT START */}
        <div className="printableReportDoc" style={{ background: '#ffffff', color: '#0f172a', borderRadius: 16, padding: 24 }}>
          
          {/* HEADER SECTION */}
          <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.05em', color: '#0f172a' }}>
                  HASJRAT TOYOTA TENDEAN PRE-APPRAISAL
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#2563eb', letterSpacing: '0.05em' }}>
                  HASJRAT TOYOTA TENDEAN CERTIFIED
                </div>
              </div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: 6, color: '#475569' }}>
                NO. SERTIFIKAT: {String(id).slice(0, 8).toUpperCase()}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>MERK / TIPE MOBIL</div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>{merk} {model} {varian}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>TAHUN & TRANSMISI</div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>{tahun || '2020'} / {transmisi}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>NOMOR POLISI (PLAT)</div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>{nopol || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>NAMA PEMILIK</div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>{customerName}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>TANGGAL PENILAIAN</div>
                <div style={{ fontWeight: 800, color: '#2563eb' }}>{dateFormatted}</div>
              </div>
            </div>
          </div>

          {/* GRID ROW 1: KONDISI FISIK & GRADING (LEFT) VS BOOKING SERVIS & DEPRESIASI (RIGHT) */}
          <div className="slideGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
            
            {/* LEFT BLOCK: KONDISI FISIK & GRADING */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              
              {/* Kondisi Fisik Circle */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>KONDISI KESELURUHAN</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: '50%', border: '6px solid #2563eb', color: '#1e40af', fontWeight: 900, fontSize: 18, margin: '0 auto' }}>
                  {Math.round((score_total || 0.85) * 100)}%
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#1e40af', marginTop: 4 }}>TINGKAT KESIHATAN MOBIL</div>
              </div>

              {/* Grading Hasil */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>KATEGORISASI (GRADE)</div>
                <div style={{ display: 'inline-block', fontSize: 26, fontWeight: 900, padding: '4px 20px', borderRadius: 10, background: kelas_final === 'A' ? '#059669' : kelas_final === 'B' ? '#2563eb' : kelas_final === 'C' ? '#d97706' : '#dc2626', color: '#ffffff', marginBottom: 6 }}>
                  GRADE {kelas_final}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  {gradeTitle}
                </div>
              </div>
            </div>

            {/* RIGHT BLOCK: REKOMENDASI BOOKING SERVIS & DEPRESIASI */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              
              {/* Rekomendasi Booking Servis Alert */}
              <div style={{ background: '#fffbeb', border: '1px solid #fef08a', borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 4 }}>
                  <span>✨</span> REKOMENDASI OPSI PERBAIKAN (ESTIMASI AI)
                </div>
                <p style={{ fontSize: 11.5, color: '#78350f', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                  {result.saran_bengkel || 'Berdasarkan analisis AI, kendaraan Anda berada dalam kondisi terawat. Jika Anda ingin menaikkan nilai taksasi, beberapa opsi perbaikan di bawah dapat dilakukan di Bengkel Resmi Hasjrat Toyota Tendean (estimasi biaya jasa & sparepart resmi, plus promo Diskon 30% Jasa Mekanik):'}
                </p>
                <a
                  href={waBookingServiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: '#059669',
                    color: '#ffffff',
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  💬 Chat WhatsApp Bengkel Hasjrat Toyota Tendean
                </a>
              </div>

              {/* Tabel Penyusutan Harga Rinci */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#334155', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>📉</span> Mengapa Harga Mobil Anda Berada di Angka Ini? (Rincian Penyusutan)
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                      <td style={{ padding: '5px 0', color: '#0f172a', fontWeight: 800 }}>
                        Harga Pasaran Mobil Mulus (Kondisi A)
                        {result.demandNote && (
                          <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '1px 6px', borderRadius: 4 }}>
                            {result.demandNote}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 900, color: '#0f172a' }}>
                        {formatRp(result.effectiveBasePrice || base_price)}
                      </td>
                    </tr>

                    {/* Component-based Proportional Deductions */}
                    {Array.isArray(result.componentBreakdown) && result.componentBreakdown.length > 0 ? (
                      result.componentBreakdown.map((item, idx) => {
                        if (item.is_bonus && item.retensi > 1.0) {
                          const bonusRp = Math.round(base_price * (item.retensi - 1.0));
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '4px 0', color: '#047857', fontWeight: 700 }}>
                                ✨ Bonus Kilometer Irit ({item.kondisi})
                              </td>
                              <td style={{ padding: '4px 0', textAlign: 'right', color: '#047857', fontWeight: 700 }}>
                                +{formatRp(bonusRp)}
                              </td>
                            </tr>
                          );
                        }
                        const ded = item.deduksi_rp_actual ?? item.deduksi_rp ?? 0;
                        if (ded <= 0) return null;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '4px 0', color: '#475569' }}>
                              Potongan {item.komponen} ({item.kondisi})
                              {item.is_permanent && (
                                <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: '#6b21a8', background: '#f3e8ff', padding: '1px 6px', borderRadius: 4 }}>
                                  [FAKTOR PERMANEN]
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '4px 0', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                              -{formatRp(ded)}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <>
                        {deduksiOdometer > 0 && (
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '4px 0', color: '#475569' }}>
                              Potongan Jarak Tempuh (KM & Odometer)
                              <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: '#6b21a8', background: '#f3e8ff', padding: '1px 5px', borderRadius: 4 }}>
                                [PERMANENT]
                              </span>
                            </td>
                            <td style={{ padding: '4px 0', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>-{formatRp(deduksiOdometer)}</td>
                          </tr>
                        )}
                        {deduksiKondisiMesin > 0 && (
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '4px 0', color: '#475569' }}>Potongan Penyesuaian Fisik & Mesin</td>
                            <td style={{ padding: '4px 0', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>-{formatRp(deduksiKondisiMesin)}</td>
                          </tr>
                        )}
                      </>
                    )}

                    {totalDendaPajak > 0 && (
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '4px 0', color: '#475569' }}>Potongan Pajak Mati ({bulan_telat_pajak} Bulan)</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>-{formatRp(Math.round(totalDendaPajak))}</td>
                      </tr>
                    )}

                    {listDokumenKurangDetail.map((d) => (
                      <tr key={d.name} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '4px 0', color: '#475569' }}>Potongan Kelengkapan Surat ({d.name})</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>-{formatRp(d.value)}</td>
                      </tr>
                    ))}

                    <tr style={{ fontWeight: 900, color: '#1e40af', borderTop: '2px solid #2563eb' }}>
                      <td style={{ padding: '8px 0 0 0', fontSize: 12 }}>Harga Penawaran Bersih Hasjrat Toyota (Siap Dibayar)</td>
                      <td style={{ padding: '8px 0 0 0', textAlign: 'right', fontSize: 14, color: '#1e40af' }}>{formatRp(midpoint)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
          </div>

          {/* ROW 2: PRICE COMPARISON CARD */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>💵</span> PERBANDINGAN HARGA: HARAPAN ANDA vs PENAWARAN HASJRAT TOYOTA
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>HARGA HARAPAN ANDA</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                  {ekspektasiHarga ? formatRp(ekspektasiHarga) : 'Tidak diisi'}
                </div>
              </div>

              <div style={{ background: '#dbeafe', border: '2px solid #2563eb', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>PENAWARAN HASJRAT TOYOTA</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#1e40af', marginTop: 2 }}>
                  {formatRp(harga_min)} – {formatRp(harga_max)}
                </div>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>HARGA PASARAN MULUS (A)</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                  {formatRp(base_price)}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11.5, color: '#0369a1', background: '#e0f2fe', padding: '8px 12px', borderRadius: 8, fontWeight: 600 }}>
              {expComparisonText}
            </div>
          </div>

          {/* ROW 2.5: ESTIMASI VALUASI MODIFIKASI & AKSESORIS TAMBAHAN AI */}
          {Array.isArray(rekomendasi_ai?.bonus_modifikasi_ai) && rekomendasi_ai.bonus_modifikasi_ai.length > 0 && (
            <div style={{ background: '#052e16', border: '1px solid #15803d', borderRadius: 16, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>💎</span> VALUASI MODIFIKASI &amp; AKSESORIS TAMBAHAN (+{formatRp(rekomendasi_ai.total_bonus_modifikasi_rp || 0)})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rekomendasi_ai.bonus_modifikasi_ai.map((b, i) => (
                  <div key={i} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e', padding: '8px 12px', borderRadius: 10, fontSize: 11.5, color: '#ecfdf5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 800, color: '#86efac' }}>{b.item}</span>
                      {b.alasan && <div style={{ fontSize: 10.5, color: '#a7f3d0', marginTop: 2 }}>{b.alasan}</div>}
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 900, color: '#4ade80', fontSize: 12.5 }}>
                      +{formatRp(b.estimasi_nilai_tambah_rp)} {b.persentase_tambah ? `(+${b.persentase_tambah}%)` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ROW 3: CATATAN KONDISI MOBIL ANDA SAAT INI */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔍</span> Catatan Hasil Inspeksi Kondisi Mobil Saat Ini
            </div>

            {troubles.length === 0 ? (
              <div style={{ padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                ✅ Mobil Anda dalam kondisi sangat mulus dan sehat tanpa catatan kerusakan.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginBottom: 10 }}>
                {troubles.map((tr, idx) => (
                  <div key={idx} style={{ padding: 12, background: tr.type === 'critical' ? '#fef2f2' : '#fffbeb', border: `1px solid ${tr.type === 'critical' ? '#fecaca' : '#fef08a'}`, borderRadius: 10, fontSize: 11.5, color: tr.type === 'critical' ? '#991b1b' : '#92400e' }}>
                    <div style={{ fontWeight: 800, fontSize: 10.5, textTransform: 'uppercase', color: tr.type === 'critical' ? '#dc2626' : '#b45309', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>{tr.type === 'critical' ? '🚨' : '⚠️'}</span> {tr.category}
                    </div>
                    <div style={{ fontWeight: 600 }}>{tr.description}</div>
                  </div>
                ))}
              </div>
            )}

            {analisaSuaraMesin && (
              <div style={{ padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, fontSize: 11.5, color: '#1e40af' }}>
                <div style={{ fontWeight: 800, fontSize: 10.5, textTransform: 'uppercase', color: '#1d4ed8', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>🔊</span> ANALISIS SUARA MESIN
                </div>
                <div>
                  Status Suara Mesin: <strong>{String(analisaSuaraMesin.classification || '').toLowerCase() === 'kasar' ? 'KASAR (Perlu Perhatian)' : String(analisaSuaraMesin.classification || '').toLowerCase() === 'sedang' ? 'NORMAL (Pemakaian Harian)' : 'HALUS (Normal)'}</strong> — {analisaSuaraMesin.detail || 'Suara mesin terdeteksi normal.'}
                </div>
              </div>
            )}
          </div>

          {/* PAGE 2 / ROW 4: REKOMENDASI SERVICE ADVISOR & BIAYA SERVIS BENGKEL */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
            
            {/* LEFT: RIWAYAT SERVICE RESMI */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📑</span> Catatan Perawatan Resmi di Hasjrat Toyota
              </div>

              {!hasServiceRecords ? (
                <div style={{ padding: 16, border: '1px dashed #cbd5e1', borderRadius: 10, fontSize: 11.5, color: '#64748b', textAlign: 'center' }}>
                  Belum ada catatan servis resmi di jaringan Hasjrat Toyota untuk plat nomor ini.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                    <thead>
                      <tr style={{ background: '#e2e8f0', color: '#334155', textAlign: 'left' }}>
                        <th style={{ padding: '6px' }}>TANGGAL</th>
                        <th style={{ padding: '6px' }}>BENGKEL</th>
                        <th style={{ padding: '6px' }}>PERAWATAN</th>
                        <th style={{ padding: '6px', textAlign: 'center' }}>JENIS</th>
                        <th style={{ padding: '6px', textAlign: 'right' }}>KM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceHistory.slice(0, 10).map((item, i) => (
                        <tr key={item.id || i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px', fontWeight: 600 }}>{item.tanggal_service}</td>
                          <td style={{ padding: '6px' }}>{item.nama_cabang}</td>
                          <td style={{ padding: '6px' }}>{item.nama_job}</td>
                          <td style={{ padding: '6px', textAlign: 'center' }}>
                            <span style={{ background: item.kategori_job === 'GR' ? '#dbeafe' : '#fef3c7', color: item.kategori_job === 'GR' ? '#1e40af' : '#92400e', padding: '2px 6px', borderRadius: 6, fontWeight: 700, fontSize: 9 }}>
                              {item.kategori_job}
                            </span>
                          </td>
                          <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>
                            {item.km ? item.km.toLocaleString('id-ID') : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* RIGHT: DUA BLOK TERPISAH (1. RINCIAN BIAYA SERVIS & PARTS | 2. POTENSI KENAIKAN HARGA TAKSASI) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              {/* BLOK 1: RINCIAN BIAYA SERVIS & PARTS BENGKEL RESMI */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🛠️</span> RINCIAN BIAYA SERVIS &amp; PARTS BENGKEL RESMI
                </div>
                <div style={{ fontSize: 10.5, color: '#059669', fontWeight: 700, background: '#ecfdf5', padding: '4px 8px', borderRadius: 6, marginBottom: 10, display: 'inline-block' }}>
                  🎁 Promo Trade-In: Diskon 30% Jasa Pekerjaan Mekanik Bengkel Hasjrat Toyota!
                </div>

                {improvementsList.length === 0 ? (
                  <div style={{ padding: 10, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 11.5, color: '#15803d', fontWeight: 600 }}>
                    ✨ Mobil Anda sangat mulus! Tidak ada perbaikan yang perlu dilakukan.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {improvementsList.map((item, idx) => (
                      <div key={idx} style={{ padding: 12, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 11.5 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{item.icon}</span> <span>{item.label}</span>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, color: '#475569' }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: '2px 0', textAlign: 'left', color: '#64748b' }}>
                                  ⚙️ Jasa Mekanik ({item.frtHours} Jam @ {formatRp(item.hourlyRate)}/jam):
                                </td>
                                <td style={{ padding: '2px 0', textAlign: 'right', whiteSpace: 'nowrap', color: '#64748b' }}>
                                  {formatRp(item.grossLaborCost)}
                                </td>
                              </tr>
                              <tr>
                                <td style={{ padding: '2px 0', textAlign: 'left', color: '#dc2626', fontWeight: 600 }}>
                                  🎁 Diskon 30% Jasa Trade-In:
                                </td>
                                <td style={{ padding: '2px 0', textAlign: 'right', whiteSpace: 'nowrap', color: '#dc2626', fontWeight: 600 }}>
                                  -{formatRp(item.discount30)}
                                </td>
                              </tr>
                              <tr>
                                <td style={{ padding: '2px 0', textAlign: 'left', color: '#047857', fontWeight: 700 }}>
                                  🛠️ Jasa Bersih (Setelah Diskon):
                                </td>
                                <td style={{ padding: '2px 0', textAlign: 'right', whiteSpace: 'nowrap', color: '#047857', fontWeight: 700 }}>
                                  {formatRp(item.netLaborCost)}
                                </td>
                              </tr>
                              <tr>
                                <td style={{ padding: '2px 0', textAlign: 'left', color: '#0f172a' }}>
                                  🔧 Sparepart Genuine: <strong>{cleanPartName(item.partName)}</strong>
                                </td>
                                <td style={{ padding: '2px 0', textAlign: 'right', whiteSpace: 'nowrap', color: '#0f172a', fontWeight: 700 }}>
                                  {formatRp(item.partCost)}
                                </td>
                              </tr>
                              <tr style={{ borderTop: '1px dashed #cbd5e1' }}>
                                <td style={{ padding: '6px 0 2px 0', textAlign: 'left', fontWeight: 800, color: '#0f172a' }}>
                                  Total Biaya Servis Pekerjaan Ini:
                                </td>
                                <td style={{ padding: '6px 0 2px 0', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 900, color: '#1e40af', fontSize: 12 }}>
                                  {formatRp(item.totalCustomerCost)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div style={{ background: '#f0f9ff', borderLeft: '3px solid #0284c7', padding: '8px 10px', borderRadius: '0 8px 8px 0', marginTop: 8, fontSize: 11, color: '#0369a1', lineHeight: 1.45 }}>
                          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            <span>💡</span> Analisis &amp; Manfaat Teknis (by AI):
                          </div>
                          <div>
                            {item.alasanEdukatif && item.alasanEdukatif.trim().length > 10
                              ? item.alasanEdukatif
                              : (function(jt) {
                                  const s = String(jt || '').toLowerCase();
                                  if (s.includes('body')) return 'Poles & touch-up bodi menghilangkan baret minor, melindungi permukaan cat asli pabrikan dari karat/oksidasi, serta menjaga estetika kilau tampilan fisik kendaraan.';
                                  if (s.includes('tire') || s.includes('ban')) return 'Penggantian ban aus dengan Genuine Tire menjamin daya cengkeram (grip) pengereman tetap optimal di kondisi basah/kering, menjaga kenyamanan, dan mencegah risiko ban meledak.';
                                  if (s.includes('interior')) return 'Treatment & cabin disinfectant membersihkan kotoran, menghilangkan bakteri & bau tak sedap di kabin, sehingga kualitas udara & kenyamanan ruang kemudi kembali seperti baru.';
                                  if (s.includes('battery') || s.includes('aki')) return 'Penggantian Aki Genuine memastikan tegangan sistem starter & kelistrikan mobil selalu stabil (sekali starter nyala) serta mencegah kelistrikan mogok di jalan.';
                                  if (s.includes('tuneup') || s.includes('mesin')) return 'Servis tune-up & pembersihan ruang bakar memulihkan efisiensi bahan bakar, menghilangkan getaran mesin, dan memastikan performa mesin tetap responsif & bertenaga.';
                                  if (s.includes('ac')) return 'Pembersihan sistem AC mengembalikan hembusan udara dingin yang sejuk, menyaring alergen/debu kabin, dan memperpanjang umur kerja kompresor AC.';
                                  if (s.includes('transmisi')) return 'Servis cairan & filter transmisi menjamin perpindahan gigi tetap halus, presisi, serta mencegah keausan komponen kopling/kampas transmisi.';
                                  if (s.includes('suspensi')) return 'Penggantian komponen kaki-kaki menghilangkan bunyi gluduk saat melewati jalan berlubang, memulihkan kenyamanan banting suspensi, dan menjaga keawetan ban.';
                                  return 'Penggantian dengan Genuine Parts resmi mengembalikan performa kendaraan ke standar pabrikan dan meningkatkan nilai jual kembali secara maksimal.';
                                })(item.jobType || item.category)}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Ringkasan Total Biaya Bengkel */}
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 10, padding: '12px 14px', marginTop: 4 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: '2px 0', textAlign: 'left', color: '#64748b' }}>
                              Total Jasa Mekanik (Normal):
                            </td>
                            <td style={{ padding: '2px 0', textAlign: 'right', whiteSpace: 'nowrap', color: '#64748b', textDecoration: 'line-through' }}>
                              {formatRp(totalJasaGross)}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '2px 0', textAlign: 'left', color: '#dc2626', fontWeight: 700 }}>
                              Total Hemat Diskon 30% Jasa:
                            </td>
                            <td style={{ padding: '2px 0', textAlign: 'right', whiteSpace: 'nowrap', color: '#dc2626', fontWeight: 700 }}>
                              -{formatRp(totalJasaDiscount)}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '2px 0', textAlign: 'left', color: '#047857', fontWeight: 700 }}>
                              Total Jasa Bersih (Setelah Diskon Jasa):
                            </td>
                            <td style={{ padding: '2px 0', textAlign: 'right', whiteSpace: 'nowrap', color: '#047857', fontWeight: 700 }}>
                              {formatRp(totalJasaNet)}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '2px 0', textAlign: 'left', color: '#475569' }}>
                              Total Spareparts Genuine / Original:
                            </td>
                            <td style={{ padding: '2px 0', textAlign: 'right', whiteSpace: 'nowrap', color: '#0f172a', fontWeight: 700 }}>
                              {formatRp(totalSparepart)}
                            </td>
                          </tr>
                          <tr style={{ borderTop: '2px solid #0f172a' }}>
                            <td style={{ padding: '8px 0 2px 0', textAlign: 'left', fontWeight: 900, color: '#0f172a', fontSize: 11.5 }}>
                              TOTAL BIAYA BENGKEL YANG DIBAYAR:
                            </td>
                            <td style={{ padding: '8px 0 2px 0', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 900, color: '#1e40af', fontSize: 14 }}>
                              {formatRp(totalNetCost)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* BLOK 2: POTENSI KENAIKAN HARGA TAKSASI & PENAWARAN BARU (TERPISAH) */}
              {improvementsList.length > 0 && (
                <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', border: '1px solid #86efac', borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#065f46', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>📈</span> POTENSI KENAIKAN HARGA TAKSASI PASCA REKONDISI
                  </div>
                  <p style={{ fontSize: 11, color: '#047857', margin: '0 0 10px 0' }}>
                    Dengan melakukan servis di Bengkel Resmi Hasjrat Toyota, potongan cacat komponen dipulihkan penuh sehingga nilai taksasi kendaraan Anda naik:
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {improvementsList.filter(item => item.gain > 0).map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, background: '#ffffff', padding: '6px 10px', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                        <span style={{ color: '#0f172a', fontWeight: 700 }}>Pengembalian Potongan {item.label.split('(')[0]}:</span>
                        <strong style={{ color: '#047857' }}>+{formatRp(item.gain)}</strong>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid #86efac', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                      <span style={{ color: '#065f46', fontWeight: 800 }}>Total Potensi Kenaikan Nilai Taksasi:</span>
                      <strong style={{ color: '#047857', fontSize: 14 }}>+{formatRp(totalUpgradedGain)}</strong>
                    </div>

                    <div style={{ borderTop: '2px solid #059669', paddingTop: 8, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#065f46', textTransform: 'uppercase' }}>ESTIMASI PENAWARAN BARU PASCA REKONDISI BENGKEL RESMI</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: '#047857', marginTop: 2 }}>
                          {formatRp(repairedOfferMin)} – {formatRp(repairedOfferMax)}
                        </div>
                      </div>
                      <div style={{ background: '#059669', color: '#ffffff', fontWeight: 800, fontSize: 10.5, padding: '4px 10px', borderRadius: 8 }}>
                        HASJRAT CERTIFIED
                      </div>
                    </div>

                    {totalUpgradedGain > totalNetCost && (
                      <div style={{ fontSize: 10.5, color: '#047857', marginTop: 8, background: '#dcfce7', padding: '6px 8px', borderRadius: 6, fontWeight: 700, textAlign: 'center' }}>
                        💡 Keuntungan Bersih Nilai Taksasi: +{formatRp(totalUpgradedGain - totalNetCost)} lebih tinggi dibanding biaya servis!
                      </div>
                    )}

                    <div style={{ background: '#f0fdf4', borderLeft: '3px solid #059669', padding: '8px 10px', borderRadius: '0 8px 8px 0', marginTop: 8, fontSize: 11, color: '#065f46', lineHeight: 1.45 }}>
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                        <span>💡</span> Catatan Transparan &amp; Analisis Nilai (by AI):
                      </div>
                      <div>
                        Pengembalian nilai taksasi di atas murni dihitung dari komponen fisik yang dapat diperbaiki di Bengkel Resmi (bodi, interior, mesin, kelistrikan &amp; kaki-kaki). Penyesuaian akibat faktor pergerakan pasar serta jarak tempuh kilometer (Odometer) bersifat permanen dan tetap dipertahankan secara transparan.
                        <br />
                        ✨ <strong>Kabar Baik:</strong> Nilai penawaran final bahkan <u>berpotensi bisa lebih tinggi dari estimasi ini</u> setelah dilakukan inspeksi &amp; pemeriksaan fisik langsung oleh tim teknisi Hasjrat Toyota Tendean!
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Evaluasi AI Advisor & Summary */}
              <div className="no-print-break" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e40af', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>💬</span> SUMMARY &amp; PENJELASAN AI
                </div>
                <p style={{ fontSize: 11.5, color: '#1e3a8a', lineHeight: 1.6, margin: 0 }}>
                  "{`Berdasarkan evaluasi menyeluruh data kendaraan ${merk} ${model} (${tahun}), unit Anda memiliki tingkat kesehatan ${Math.round((score_total || 0.85) * 100)}% (Grade ${kelas_final}) dengan estimasi penawaran harga bersih ${formatRp(harga_min)} – ${formatRp(harga_max)} dari harga pasaran mulus ${formatRp(base_price)}.${totalUpgradedGain > 0 ? ` Melakukan opsi perbaikan senilai ${formatRp(totalNetCost)} di Bengkel Resmi Hasjrat Toyota Tendean berpotensi menaikkan nilai taksasi hingga +${formatRp(totalUpgradedGain)}.` : ''} Penilaian ini merupakan estimasi perkiraan awal berdasarkan data isian Anda dan akan difinalisasi melalui pemeriksaan fisik langsung oleh tim teknisi Hasjrat Toyota Tendean.`}"
                </p>
              </div>

              {/* Catatan Penting Disclaimer */}
              <div className="no-print-break" style={{ background: '#fff9eb', border: '1px solid #fef08a', borderRadius: 14, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>📢</span> CATATAN PENTING &amp; KETENTUAN PENAWARAN
                </div>
                <p style={{ fontSize: 10.5, color: '#78350f', margin: 0, lineHeight: 1.5 }}>
                  Penilaian ini adalah <strong>estimasi perkiraan awal</strong> berdasarkan isian data Anda. Harga pasti dan final akan ditentukan setelah <strong>pemeriksaan dan inspeksi fisik langsung</strong> oleh tim teknisi Hasjrat Toyota Tendean di Bengkel Resmi.
                </p>
              </div>

              {/* DIGITAL APPROVAL STAMP FOR PRINT/PDF */}
              <div className="no-print-break" style={{ marginTop: 14, paddingTop: 12, borderTop: '2px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 10, color: '#475569' }}>
                <div style={{ maxWidth: 320 }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', fontSize: 9.5 }}>BENGKEL RESMI HASJRAT TOYOTA TENDEAN</div>
                  <div>Jl. Pierre Tendean (Boulevard), Manado, Sulawesi Utara</div>
                  <div style={{ marginTop: 3, fontSize: 8.5, color: '#64748b' }}>
                    Dokumen pra-penilaian ini diterbitkan secara digital oleh Sistem Pre-Appraisal Hasjrat Toyota. Validitas penawaran final memerlukan inspeksi fisik langsung.
                  </div>
                </div>

                <div style={{ textAlign: 'center', minWidth: 170 }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: '#64748b', marginBottom: 20 }}>
                    TIM APPRAISER &amp; SERVICE ADVISOR
                  </div>
                  <div style={{ borderBottom: '1.5px solid #0f172a', fontWeight: 800, color: '#0f172a', paddingBottom: 2 }}>
                    HASJRAT TOYOTA TENDEAN
                  </div>
                  <div style={{ fontSize: 8.5, color: '#2563eb', fontWeight: 700, marginTop: 2 }}>
                    ✓ DIGITALLY CERTIFIED
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
        {/* PRINTABLE REPORT DOCUMENT END */}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          <a
            href={waBookingTradeinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--primary"
            style={{ textDecoration: 'none', textAlign: 'center', padding: '12px 18px', fontSize: 13, fontWeight: 700 }}
          >
            📞 Hubungi Sales / Tukar Tambah Sekarang (WhatsApp)
          </a>

          <PrintButton />
        </div>

      </div>
    </div>
  );
}
