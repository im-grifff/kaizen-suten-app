import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../state/AuthContext.jsx';
import { createTradeinRequest, listenTradeinRequestsForWa, DuplicatePlateError, isPlateAlreadyUsed } from '../../firestore/tradeinRequests.js';
import { buildAppraisalFromConditions } from '../../lib/calculation.js';
import { generateRecommendation, analyzeEngineSound } from '../../lib/ai.js';
import { fetchVehicleServiceHistory } from '../../lib/vehicleServiceHistory.js';
import { DOKUMEN_LIST, formatRp } from '../../lib/appraisalUtils.js';
import { getDetailedEstimateForRepair, getDynamicRepairEstimatesAsync } from '../../lib/flatRateMaster.js';
import { brandOptions, modelOptions, typeOptions } from '../../data/carCatalog.js';
import { lookupBasePrice } from '../../lib/vehicleMasterLookup.js';
import { AppraisalResultModal } from '../../components/AppraisalResultModal.jsx';
import { ComboBox } from '../../components/ComboBox.jsx';
import { getChannelOrDefault } from '../../utils/channel.js';
import { pipelineLabel } from '../../utils/tradeinCustomerStatus.js';

const DEMO_TRADEIN_KEY = 'oto_demo_tradein_v1';

function normalizePlate(raw = '') {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function formatThousands(valStr = '') {
  const digits = valStr.replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

function loadDemoHistory(waKey) {
  try {
    const raw = localStorage.getItem(DEMO_TRADEIN_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all[waKey] || [];
  } catch {
    return [];
  }
}

function saveDemoHistory(waKey, rows) {
  try {
    const raw = localStorage.getItem(DEMO_TRADEIN_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[waKey] = rows;
    localStorage.setItem(DEMO_TRADEIN_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function formatTs(ts) {
  if (ts?.toDate) return ts.toDate().toLocaleString('id-ID');
  if (typeof ts === 'string') return ts;
  return new Date(ts).toLocaleString('id-ID');
}

/** Turunkan transmisi (Manual/Matic) dari string Tipe. Default Matic jika tak terdeteksi. */
function deriveTransmission(tipe) {
  const s = String(tipe || '').toUpperCase();
  if (/\bM\/?T\b|MANUAL/.test(s)) return 'Manual';
  if (/\bA\/?T\b|\bCVT\b|MATIC|OTOMATIS|\bHEV\b|\bEV\b/.test(s)) return 'Matic';
  return 'Matic';
}

export const SELLING_BONUS_ITEMS = [
  { id: 'kunci_serep', label: '🔑 Kunci Serep Lengkap (+Rp 500.000)', value: 500000 },
  { id: 'buku_servis', label: '📜 Buku Servis & Manual Book Lengkap (+Rp 500.000)', value: 500000 },
  { id: 'kaca_film', label: '🛡️ Kaca Film Premium V-Kool / 3M (+Rp 1.000.000)', value: 1000000 },
  { id: 'head_unit_dashcam', label: '📹 Head Unit Android / Dashcam (+Rp 1.000.000)', value: 1000000 },
  { id: 'jok_kulit', label: '🪑 Jok Kulit Premium / Seat Cover (+Rp 1.000.000)', value: 1000000 },
];

export function TradeInPage() {
  const { authUser, customerWaKey, customerDisplayName, demoMode } = useAuth();

  const [step, setStep] = useState(0); // Steps 0 - 4

  // Step 0 Fields
  const [merk, setMerk] = useState('Toyota');
  const [model, setModel] = useState('');
  const [tipe, setTipe] = useState('');
  // Transmisi diturunkan dari Tipe (mis. "G A/T" -> Matic, "G M/T" -> Manual).
  const transmission = useMemo(() => deriveTransmission(tipe), [tipe]);
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [expectLowPrice, setExpectLowPrice] = useState('');
  const [newCarModel, setNewCarModel] = useState('');
  const [salesName, setSalesName] = useState('');

  // Step 1 Fields (Body, Interior, Suspensi & Ban)
  const [bodyCondition, setBodyCondition] = useState('full original');
  const [interiorCondition, setInteriorCondition] = useState('original');
  const [suspensiCondition, setSuspensiCondition] = useState('normal');
  const [banCondition, setBanCondition] = useState('tebal');

  // Step 2 Fields (Mesin, Transmisi, AC, Starter, Suara & Deskripsi)
  const [mesinCondition, setMesinCondition] = useState('normal');
  const [transmisiCondition, setTransmisiCondition] = useState('normal');
  const [acCondition, setAcCondition] = useState('normal');
  const [starterCondition, setStarterCondition] = useState('halus');
  const [userSoundDescription, setUserSoundDescription] = useState('');
  const [videoBase64, setVideoBase64] = useState('');
  const [videoMimeType, setVideoMimeType] = useState('');
  const [videoFileName, setVideoFileName] = useState('');

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  // Step 3 Fields (Selling Points Checkboxes, Selling Points Text & Odometer)
  const [selectedBonuses, setSelectedBonuses] = useState([]);
  const [sellingPoints, setSellingPoints] = useState('');
  const [km, setKm] = useState('');

  // Step 4 Fields (Pajak, Dokumen & Deklarasi Kejujuran)
  const [statusPajak, setStatusPajak] = useState('Aktif');
  const [bulanTelatPajak, setBulanTelatPajak] = useState(0);
  const [dokumenKurang, setDokumenKurang] = useState([]);
  const [isHonestConfirmed, setIsHonestConfirmed] = useState(false);

  // Results & Submission States
  const [rows, setRows] = useState([]);
  const [listErr, setListErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingStep, setLoadingStep] = useState(1);
  const [doneMsg, setDoneMsg] = useState('');
  const [calcError, setCalcError] = useState('');
  const [requestingId, setRequestingId] = useState('');
  const [duplicatePlate, setDuplicatePlate] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);

  const refreshDemo = useCallback(() => {
    if (demoMode && customerWaKey) setRows(loadDemoHistory(customerWaKey));
  }, [demoMode, customerWaKey]);

  useEffect(() => {
    refreshDemo();
  }, [refreshDemo]);

  useEffect(() => {
    if (demoMode || !customerWaKey) return undefined;
    const unsub = listenTradeinRequestsForWa(customerWaKey, {
      onData: (r) => {
        setListErr('');
        setRows(r);
      },
      onError: (e) => setListErr(e?.message || 'Gagal memuat riwayat'),
    });
    return () => unsub?.();
  }, [demoMode, customerWaKey]);

  const brandsList = useMemo(() => brandOptions(), []);
  const modelSuggestions = useMemo(() => modelOptions(merk), [merk]);
  const typeSuggestions = useMemo(() => typeOptions(merk, model), [merk, model]);
  const merkModel = useMemo(
    () => [merk, model, tipe].map((s) => s.trim()).filter(Boolean).join(' '),
    [merk, model, tipe]
  );

  // Cascade: ganti Merk -> reset Model & Tipe; ganti Model -> reset Tipe.
  const onMerkChange = useCallback((v) => {
    setMerk(v);
    setModel('');
    setTipe('');
  }, []);
  const onModelChange = useCallback((v) => {
    setModel(v);
    setTipe('');
  }, []);

  // Step 0 validation
  const canProceedStep0 = useMemo(() => {
    return (
      merk.trim().length >= 2 &&
      model.trim().length >= 1 &&
      String(year).trim().length >= 4 &&
      color.trim().length >= 1 &&
      normalizePlate(plateNumber).length >= 4
    );
  }, [merk, model, year, color, plateNumber]);

  // Audio file handler
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert('Ukuran file maksimal 15MB');
      return;
    }
    setVideoFileName(file.name);
    setVideoMimeType(file.type || 'audio/mp3');

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result;
      if (typeof base64 === 'string') {
        const matches = base64.match(/^data:(.*);base64,(.*)$/);
        setVideoBase64(matches ? matches[2] : base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
        setVideoFileName(`rekaman-mesin-${Date.now()}.mp3`);
        setVideoMimeType('audio/mp3');

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result;
          if (typeof base64data === 'string') {
            const base64Clean = base64data.split(',')[1];
            setVideoBase64(base64Clean);
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 9) {
            stopRecording();
            return 10;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      alert('Tidak dapat mengaktifkan mikrofon. Izinkan akses mikrofon di browser.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const toggleBonus = (bonusId) => {
    setSelectedBonuses((prev) =>
      prev.includes(bonusId) ? prev.filter((id) => id !== bonusId) : [...prev, bonusId]
    );
  };

  const toggleDokumen = (docName) => {
    setDokumenKurang((prev) =>
      prev.includes(docName) ? prev.filter((d) => d !== docName) : [...prev, docName]
    );
  };

  async function onSubmitAppraisal(e) {
    e.preventDefault();
    if (submitting) return;

    if (!isHonestConfirmed) {
      alert('Mohon centang kotak deklarasi kejujuran data kondisi kendaraan di atas sebelum menghitung taksasi.');
      return;
    }

    // ── HARD STOP: Grade F — Laka Berat / Banjir ──────────────────────────
    if (bodyCondition === 'laka berat') {
      setCalcError(
        '⛔ Unit ex Laka Berat / Banjir / Surat Bermasalah tidak dapat diproses (Grade F — Tidak Ambil sesuai Panduan Resmi Hasjrat Toyota Tendean). Silakan kunjungi cabang terdekat untuk inspeksi fisik langsung.'
      );
      return;
    }

    setSubmitting(true);
    setLoadingStep(1);
    setDoneMsg('');
    setCalcError('');
    setDuplicatePlate('');

    try {
      const plateRaw = normalizePlate(plateNumber);
      const plateKey = plateRaw;
      const kmNum    = Number(String(km).replace(/[^\d]/g, '')) || 0;
      const vehicleYear = parseInt(String(year).trim()) || new Date().getFullYear() - 5;

      // Anti-spam: cegah taksasi ganda untuk plat yang sama (sebelum panggilan AI yang mahal).
      if (demoMode) {
        const existing = loadDemoHistory(customerWaKey).find(
          (rr) => normalizePlate(rr.plateKey || rr.plateNumber || '') === plateKey,
        );
        if (existing) {
          setDuplicatePlate(plateRaw);
          return;
        }
      } else if (plateKey) {
        const alreadyUsed = await isPlateAlreadyUsed(plateRaw);
        if (alreadyUsed) {
          setDuplicatePlate(plateRaw);
          return;
        }
      }

      // ── STEP 1: Riwayat servis resmi ──────────────────────────────────────
      let serviceHistory = [];
      let serviceHistoryContext = '';
      try {
        const historyRes = await fetchVehicleServiceHistory(plateRaw);
        serviceHistory = historyRes.history || [];
        serviceHistoryContext = historyRes.contextText || '';
      } catch (err) {
        console.warn('Vehicle Service History fetch bypassed:', err);
      }

      setLoadingStep(2);
      // ── STEP 2: Analisis suara mesin (Whisper-1 + GPT-4o) ────────────────
      let soundAnalysis = null;
      if (videoBase64) {
        soundAnalysis = await analyzeEngineSound(videoBase64, videoMimeType);
      }

      setLoadingStep(3);
      // ── STEP 3: Lookup harga dasar dari vehicle_master Firestore ─────────
      const { base_price: basePrice, kode_demand: kodeDemand } = await lookupBasePrice(
        merk, model, tipe, transmission, year
      );

      // ── STEP 4: WARNING Grade D — KM sangat tinggi (>40rb/tahun) ─────────
      const vehicleAge = Math.max(1, new Date().getFullYear() - vehicleYear);
      const kmPerYear  = Math.round(kmNum / vehicleAge);
      if (kmPerYear > 40000) {
        const lanjut = window.confirm(
          `⚠️ Perhatian: KM rata-rata ${kmPerYear.toLocaleString('id-ID')} km/tahun termasuk kategori SANGAT TINGGI (Grade D).\n\n` +
          `Sesuai Panduan Resmi, harga taksasi maksimal hanya 30–50% dari harga pasaran mulus.\n\n` +
          `Lanjutkan perhitungan?`
        );
        if (!lanjut) {
          setSubmitting(false);
          return;
        }
      }

      setLoadingStep(4);
      // ── STEP 5: Kalkulasi matematis deterministik (satu sumber kebenaran) ─
      const mathResult = buildAppraisalFromConditions({
        bodyCondition,
        banCondition,
        interiorCondition,
        mesinCondition,
        transmisiCondition,
        suspensiCondition,
        acCondition,
        starterCondition,
        soundClassification: soundAnalysis?.classification || null,
        kmTotal:     kmNum,
        vehicleYear,
        basePrice,
        kodeDemand,
        bulanTelatPajak: statusPajak === 'Lewat' ? Number(bulanTelatPajak) : 0,
        dokumenKurang,
      });

      // Simpan kmTotal & kodeDemand di mathResult untuk prompt AI
      mathResult.kmTotal    = kmNum;
      mathResult.base_price = basePrice;
      mathResult.kodeDemand = kodeDemand;

      // ── STEP 6: Dynamic Lookup & Pre-kalkulasi biaya perbaikan dari Firestore ─────────
      // Hanya komponen yang bermasalah — jasa & part di-lookup async dari Firestore
      const jobTypesNeededMap = {
        body: bodyCondition !== 'full original' && bodyCondition !== 'baret minor',
        interior: interiorCondition !== 'original',
        tuneup: mesinCondition !== 'normal' || soundAnalysis?.classification === 'kasar',
        ac: acCondition !== 'normal',
        battery: starterCondition !== 'halus',
        transmisi: transmisiCondition !== 'halus' && transmisiCondition !== 'normal',
        suspensi: suspensiCondition !== 'empuk' && suspensiCondition !== 'normal',
        tire: banCondition !== 'tebal' && banCondition !== 'normal',
      };

      const repairEstimates = await getDynamicRepairEstimatesAsync(model || merk, jobTypesNeededMap);

      // ── STEP 7: AI Narrator — narasi + rekomendasi + proyeksi post-rekondisi
      const aiResponse = await generateRecommendation({
        mathResult,
        repairEstimates,
        merk:         merk.trim(),
        model:        model.trim(),
        tipe:         tipe.trim(),
        year:         String(vehicleYear),
        color:        color.trim(),
        plateNumber:  plateRaw,
        transmission,
        bodyCondition,
        banCondition,
        interiorCondition,
        mesinCondition,
        transmisiCondition,
        suspensiCondition,
        acCondition,
        starterCondition,
        soundAnalysis,
        userSoundDescription,
        serviceHistoryContext,
        expectLowPrice: expectLowPrice ? String(expectLowPrice).trim() : '',
        sellingPoints,
        dokumenKurang,
        bulanTelatPajak: statusPajak === 'Lewat' ? Number(bulanTelatPajak) : 0,
        newCarModel: newCarModel.trim(),
        salesName:   salesName.trim(),
      });

      // ── Troubles list (untuk modal UI) ────────────────────────────────────
      const troublesList = [];
      if (bodyCondition === 'laka sedang' || bodyCondition === 'laka ringan') {
        troublesList.push({ category: 'EXTERIOR', description: `Body ${bodyCondition}`, type: 'warning' });
      } else if (bodyCondition === 'baret besar' || bodyCondition === 'baret minor') {
        troublesList.push({ category: 'EXTERIOR', description: `Kondisi cat/body: ${bodyCondition}`, type: 'warning' });
      }
      if (banCondition === 'aus')        troublesList.push({ category: 'EXTERIOR & BAN', description: 'Ban aus / perlu ganti baru', type: 'warning' });
      if (banCondition === 'velg_baret') troublesList.push({ category: 'EXTERIOR & BAN', description: 'Velg terdapat baret curb', type: 'warning' });
      if (interiorCondition === 'tidak layak') troublesList.push({ category: 'INTERIOR', description: 'Interior tidak layak / modifikasi non-ori', type: 'warning' });
      if (interiorCondition === 'kurang rapi')  troublesList.push({ category: 'INTERIOR', description: 'Interior kurang rapi / butuh perawatan', type: 'warning' });
      if (mesinCondition === 'bermasalah') troublesList.push({ category: 'MESIN', description: 'Komponen mesin bermasalah', type: 'critical' });
      if (mesinCondition === 'ada gejala') troublesList.push({ category: 'MESIN', description: 'Mesin ada gejala ringan', type: 'warning' });
      if (transmisiCondition === 'bermasalah')    troublesList.push({ category: 'TRANSMISI', description: 'Hentakan kasar / selip transmisi', type: 'critical' });
      if (transmisiCondition === 'perlu_perhatian') troublesList.push({ category: 'TRANSMISI', description: 'Transmisi perlu perhatian', type: 'warning' });
      if (suspensiCondition === 'gluduk' || suspensiCondition === 'bushing_aus') troublesList.push({ category: 'SUSPENSI', description: 'Bunyi gluduk / bushing aus', type: 'warning' });
      if (suspensiCondition === 'shock_bocor') troublesList.push({ category: 'SUSPENSI', description: 'Shockbreaker merembes / bocor', type: 'warning' });
      if (acCondition === 'mati/tidak berfungsi') troublesList.push({ category: 'AC', description: 'AC mati / tidak berfungsi', type: 'critical' });
      if (acCondition === 'butuh service ringan') troublesList.push({ category: 'AC', description: 'AC kurang dingin', type: 'warning' });
      if (starterCondition === 'kasar/dinamo bermasalah') troublesList.push({ category: 'KELISTRIKAN', description: 'Starter kasar / dinamo bermasalah', type: 'warning' });
      if (starterCondition === 'lambat/aki lemah')        troublesList.push({ category: 'KELISTRIKAN', description: 'Starter lambat / aki lemah', type: 'warning' });
      if (soundAnalysis?.classification === 'kasar') troublesList.push({ category: 'MESIN (AUDIO AI)', description: `Suara mesin kasar: ${soundAnalysis.detail}`, type: 'critical' });

      // ── Payload untuk Firestore / Demo ────────────────────────────────────
      const payload = {
        customerUid:   authUser?.uid || '',
        customerWaKey,
        customerPhone: customerWaKey,
        customerName:  customerDisplayName || 'Customer',
        merk:          merk.trim(),
        model:         model.trim(),
        tipe:          tipe.trim(),
        merkModel:     merkModel.trim(),
        transmission,
        year:          String(vehicleYear),
        color:         color.trim(),
        plateNumber:   plateRaw,
        plateKey,
        expectLowPrice: expectLowPrice ? String(expectLowPrice).trim() : '',
        newCarModel:   newCarModel.trim(),
        salesName:     salesName.trim(),
        sourceChannel: getChannelOrDefault(),

        // Hasil kalkulasi matematis
        base_price:            basePrice,
        score_total:           mathResult.score_total,
        kelas_final:           mathResult.kelas_final,
        harga_min:             mathResult.harga_min,
        harga_max:             mathResult.harga_max,
        harga_setelah_kondisi: mathResult.harga_setelah_kondisi,
        deduksi_total:         mathResult.deduksi_total,
        midpoint:              mathResult.midpoint,
        flag_review_mesin:     mathResult.flag_review_mesin,
        override_applied:      mathResult.override_applied,
        km_per_year:           mathResult.kmPerYear,

        // Inputan kondisi customer
        bodyCondition,
        interiorCondition,
        suspensiCondition,
        banCondition,
        mesinCondition,
        transmisiCondition,
        acCondition,
        starterCondition,
        user_sound_description: userSoundDescription,
        analisa_suara_mesin:    soundAnalysis,
        selectedBonuses:        [],
        totalBonusValue:        aiResponse?.total_bonus_modifikasi_rp || 0,
        sellingPoints,
        km:            kmNum,
        statusPajak,
        bulan_telat_pajak: statusPajak === 'Lewat' ? Number(bulanTelatPajak) : 0,
        dokumen_kurang:    dokumenKurang,
        isHonestConfirmed: true,

        // Narasi & rekomendasi dari AI
        rekomendasi_ai: aiResponse,

        // Data breakdown komponen (untuk modal)
        componentBreakdown: mathResult.componentBreakdown,
        categoryScores:     mathResult.categoryScores,
        categoryRetentions: mathResult.categoryRetentions,
        repairEstimatesData: Object.fromEntries(
          Object.entries(repairEstimates).map(([k, v]) => [k, {
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
          }])
        ),

        serviceHistory,
        troubles:   troublesList,
        createdAt:  new Date().toISOString(),
      };

      if (demoMode) {
        const id  = `demo-${Date.now()}`;
        const row = { id, ...payload, adminStage: 'new', status: 'new' };
        const next = [row, ...loadDemoHistory(customerWaKey)];
        saveDemoHistory(customerWaKey, next);
        setRows(next);
        setSelectedResult(row);
      } else {
        const docRef = await createTradeinRequest(payload);
        setSelectedResult({ id: docRef.id, ...payload });
      }

      setDoneMsg('Taksasi Appraisal Berhasil Dihitung!');
    } catch (err) {
      console.error('Appraisal Submission Error:', err);
      if (err instanceof DuplicatePlateError) {
        setDuplicatePlate(err.plate || plateNumber);
      } else {
        setCalcError(err?.message || String(err) || 'Terjadi kesalahan sistem saat menghitung taksasi.');
      }
    } finally {
      setSubmitting(false);
      setLoadingStep(1);
    }
  }

  async function onRequestInspection(row) {
    if (!row?.id) return;
    setDoneMsg('');
    setRequestingId(row.id);
    try {
      if (demoMode) {
        const current = loadDemoHistory(customerWaKey);
        const next = current.map((r) =>
          r.id === row.id
            ? {
                ...r,
                adminStage: 'contacted',
                status: 'contacted',
                customerRequestedInspectionAt: new Date().toISOString(),
              }
            : r
        );
        saveDemoHistory(customerWaKey, next);
        setRows(next);
        setSelectedResult((prev) => (prev?.id === row.id ? { ...prev, adminStage: 'contacted', status: 'contacted' } : prev));
      }
      setDoneMsg('🎯 Terima kasih! Permintaan inspeksi fisik telah kami terima. Sales representative Hasjrat Toyota akan segera menghubungi Anda.');
    } catch (e) {
      alert(e?.message || 'Gagal mengirimkan permintaan');
    } finally {
      setRequestingId('');
    }
  }

  return (
    <div className="tradeinContainer">
      {/* Modal Result */}
      {selectedResult && (
        <AppraisalResultModal
          result={selectedResult}
          onClose={() => setSelectedResult(null)}
          onRequestInspection={onRequestInspection}
        />
      )}

      {/* Header Banner */}
      <section className="tradeinHeader" style={{ background: 'linear-gradient(135deg, #0d1322 0%, #1e293b 100%)', padding: '24px 20px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ background: '#2563eb', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            HASJRAT TOYOTA TENDEAN TRADE-IN APPRAISAL
          </span>
          <h1 className="h1" style={{ color: '#fff', fontSize: 24, fontWeight: 900, marginTop: 10, marginBottom: 6 }}>
            Hitung Estimasi Harga Tukar Tambah Mobil Anda
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
            Dapatkan taksasi harga transparan dalam hitungan detik dengan analisis sensor audio AI &amp; data resmi Hasjrat Toyota.
          </p>
        </div>
      </section>

      {/* STEPPER NAV */}
      <div className="stepper" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, background: '#0f172a', padding: 12, borderRadius: 14, border: '1px solid rgba(255,255,255,0.05)' }}>
        {['1. Data Mobil', '2. Kondisi Fisik', '3. Mesin & AC', '4. Odometer', '5. Dokumen'].map((label, idx) => (
          <div key={idx} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, color: step === idx ? '#38bdf8' : '#64748b' }}>
            <div style={{ display: 'inline-block', width: 22, height: 22, borderRadius: '50%', background: step === idx ? '#0284c7' : '#1e293b', color: '#fff', lineHeight: '22px', marginBottom: 4 }}>
              {idx + 1}
            </div>
            <div>{label}</div>
          </div>
        ))}
      </div>

      {/* FULL RESPONSIVE FORM CARD */}
      <div className="card" style={{ background: '#0d1322', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', width: '100%' }}>
        <form onSubmit={onSubmitAppraisal}>
          {/* STEP 0: DATA MOBIL */}
          {step === 0 && (
            <>
              <h2 className="h2" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Informasi Kendaraan Anda</h2>
              <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 20 }}>Isi data utama kendaraan yang ingin Anda tukar tambah.</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                <div>
                  <label className="label" htmlFor="merkInput">Merk Mobil</label>
                  <ComboBox
                    id="merkInput"
                    value={merk}
                    onChange={onMerkChange}
                    options={brandsList}
                    placeholder="Pilih Merek Mobil"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="modelInput">Model Mobil</label>
                  <ComboBox
                    id="modelInput"
                    value={model}
                    onChange={onModelChange}
                    options={modelSuggestions}
                    placeholder="Pilih Model Mobil"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="tipeInput">Varian / Tipe</label>
                  <ComboBox
                    id="tipeInput"
                    value={tipe}
                    onChange={setTipe}
                    options={typeSuggestions}
                    placeholder="Pilih Tipe Mobil"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="yearInput">Tahun Pembuatan</label>
                  <input
                    id="yearInput"
                    className="input"
                    placeholder="Contoh: 2020"
                    maxLength={4}
                    value={year}
                    onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, ''))}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="colorInput">Warna Mobil</label>
                  <input
                    id="colorInput"
                    className="input"
                    placeholder="Contoh: Putih / Hitam"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="plateInput">Nomor Polisi (Plat)</label>
                  <input
                    id="plateInput"
                    className="input"
                    placeholder="Contoh: DB 1234 RR"
                    value={plateNumber}
                    onChange={(e) => setPlateNumber(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="newCarInput">Mobil Toyota Baru Yang Diincar <span className="muted small">(opsional)</span></label>
                  <input
                    id="newCarInput"
                    className="input"
                    placeholder="Contoh: Innova Zenix / Yaris Cross / Hilux Rangga"
                    value={newCarModel}
                    onChange={(e) => setNewCarModel(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="salesInput">Nama Sales / Kode Referral Hasjrat <span className="muted small">(opsional)</span></label>
                  <input
                    id="salesInput"
                    className="input"
                    placeholder="Contoh: Budi (Sales Tendean)"
                    value={salesName}
                    onChange={(e) => setSalesName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="expInput">Ekspektasi Harga Jual <span className="muted small">(opsional)</span></label>
                  <input
                    id="expInput"
                    className="input"
                    placeholder="Contoh: 150.000.000"
                    value={expectLowPrice}
                    onChange={(e) => setExpectLowPrice(formatThousands(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ marginTop: 24, textAlign: 'right' }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!canProceedStep0}
                  onClick={() => setStep(1)}
                  style={{ padding: '10px 24px', fontSize: 13, fontWeight: 700 }}
                >
                  Selanjutnya: Kondisi Fisik &rarr;
                </button>
              </div>
            </>
          )}

          {/* STEP 1: BODY, INTERIOR, SUSPENSI & BAN */}
          {step === 1 && (
            <>
              <h2 className="h2" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Kondisi Fisik &amp; Kaki-Kaki</h2>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
                <div>
                  <label className="label" htmlFor="bodyCond">Kondisi Cat &amp; Body (Eksterior)</label>
                  <select id="bodyCond" className="input" value={bodyCondition} onChange={(e) => setBodyCondition(e.target.value)}>
                    <option value="full original">Full Original / Mulus</option>
                    <option value="baret minor">Lecet Minor / Baret Tipis</option>
                    <option value="baret besar">Lecet Besar &gt;10%</option>
                    <option value="laka ringan">Bekas Laka Ringan</option>
                    <option value="laka sedang">Bekas Laka Sedang</option>
                    <option value="laka berat">Bekas Laka Berat / Banjir</option>
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor="intCond">Kebersihan Interior &amp; Kabin</label>
                  <select id="intCond" className="input" value={interiorCondition} onChange={(e) => setInteriorCondition(e.target.value)}>
                    <option value="original">Full Original &amp; Bersih</option>
                    <option value="kurang rapi">Kurang Rapi / Perlu Perawatan</option>
                    <option value="tidak layak">Modifikasi / Tidak Layak</option>
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor="suspCond">Kondisi Kaki-Kaki &amp; Suspensi</label>
                  <select id="suspCond" className="input" value={suspensiCondition} onChange={(e) => setSuspensiCondition(e.target.value)}>
                    <option value="normal">Senyap &amp; Normal Prima (Siap Pakai)</option>
                    <option value="gluduk">Ada Bunyi Gluduk-Gluduk saat Lewat Berlubang</option>
                    <option value="bushing_aus">Bushing Arm / Tierod Aus</option>
                    <option value="shock_bocor">Shockbreaker Merembes / Bocor</option>
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor="banCond">Kondisi Ban &amp; Velg</label>
                  <select id="banCond" className="input" value={banCondition} onChange={(e) => setBanCondition(e.target.value)}>
                    <option value="tebal">Ban Masih Tebal (&gt;80%) &amp; Velg Mulus</option>
                    <option value="aus">Ban Aus / Perlu Ganti Baru</option>
                    <option value="velg_baret">Velg Terdapat Baret Curb</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button className="btn" type="button" onClick={() => setStep(0)}>
                  &larr; Kembali
                </button>
                <button className="btn btn--primary" type="button" style={{ flex: 1 }} onClick={() => setStep(2)}>
                  Selanjutnya: Mesin &amp; AC &rarr;
                </button>
              </div>
            </>
          )}

          {/* STEP 2: MESIN, TRANSMISI & AC */}
          {step === 2 && (
            <>
              <h2 className="h2" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Kondisi Mesin, Transmisi &amp; Sensor Audio</h2>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
                <div>
                  <label className="label" htmlFor="mesCond">Kondisi Performa Mesin</label>
                  <select id="mesCond" className="input" value={mesinCondition} onChange={(e) => setMesinCondition(e.target.value)}>
                    <option value="normal">Mesin Normal &amp; Bertenaga</option>
                    <option value="ada gejala">Ada Gejala Ringan / Kurang Bertenaga</option>
                    <option value="bermasalah">Bermasalah / Rusak</option>
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor="transCond">Perpindahan Transmisi &amp; Kopling</label>
                  <select id="transCond" className="input" value={transmisiCondition} onChange={(e) => setTransmisiCondition(e.target.value)}>
                    <option value="normal">Perpindahan Gigi Halus &amp; Responsif</option>
                    <option value="perlu_perhatian">Kopling Agak Berat / Selip Ringan</option>
                    <option value="bermasalah">Perpindahan Gigi Hentakan Kasar / Delay</option>
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor="acCond">Kondisi AC</label>
                  <select id="acCond" className="input" value={acCondition} onChange={(e) => setAcCondition(e.target.value)}>
                    <option value="normal">Dingin &amp; Normal</option>
                    <option value="butuh service ringan">Kurang Dingin / Butuh Service</option>
                    <option value="mati/tidak berfungsi">Mati / Tidak Berfungsi</option>
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor="startCond">Kondisi Starter (Aki / Battery)</label>
                  <select id="startCond" className="input" value={starterCondition} onChange={(e) => setStarterCondition(e.target.value)}>
                    <option value="halus">Starter Halus &amp; Cepat</option>
                    <option value="lambat/aki lemah">Starter Lambat / Aki Lemah</option>
                    <option value="kasar/dinamo bermasalah">Starter Kasar / Dinamo Bermasalah</option>
                  </select>
                </div>
              </div>

              <label className="label" htmlFor="soundDesc" style={{ marginTop: 16 }}>
                Deskripsi Suara Mesin Menurut Anda <span className="muted small">(opsional)</span>
              </label>
              <input
                id="soundDesc"
                className="input"
                placeholder="Contoh: Bunyi halus, tapi agak berdecit saat pagi"
                value={userSoundDescription}
                onChange={(e) => setUserSoundDescription(e.target.value)}
              />

              {/* Direct Mic Recorder / Upload File */}
              <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.03)', border: '1px border-dashed var(--border)', borderRadius: 14, padding: 14 }}>
                <label className="label">Analisis Sensor Suara Mesin AI (Rekam max 10s)</label>
                <p className="muted small" style={{ marginBottom: 10 }}>
                  Rekam langsung suara mesin atau unggah file audio/video (.mp3/.wav/.mp4)
                </p>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!isRecording ? (
                    <button type="button" className="btn btn--small btn--primary" onClick={startRecording}>
                      🎙️ Rekam Suara Mesin
                    </button>
                  ) : (
                    <button type="button" className="btn btn--small" style={{ background: '#dc2626', color: '#fff' }} onClick={stopRecording}>
                      ⏹️ Berhenti Merekam ({recordingSeconds}s / 10s)
                    </button>
                  )}

                  <label className="btn btn--small btn--ghost" style={{ cursor: 'pointer' }}>
                    📁 Unggah File Audio/Video
                    <input type="file" accept="audio/*,video/*" onChange={handleFileChange} style={{ display: 'none' }} />
                  </label>
                </div>

                {videoFileName && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#10b981', fontWeight: 600 }}>
                    ✓ File siap dianalisis: {videoFileName}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button className="btn" type="button" onClick={() => setStep(1)}>
                  &larr; Kembali
                </button>
                <button className="btn btn--primary" type="button" style={{ flex: 1 }} onClick={() => setStep(3)}>
                  Selanjutnya: Odometer &rarr;
                </button>
              </div>
            </>
          )}

          {/* STEP 3: CATATAN MODIFIKASI & ODOMETER */}
          {step === 3 && (
            <>
              <h2 className="h2" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Odometer &amp; Modifikasi Tambahan</h2>
              <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>
                Masukkan jarak tempuh kilometer dan catat modifikasi / aksesoris tambahan yang dimiliki kendaraan Anda.
              </p>

              <label className="label" htmlFor="km">
                Kilometer (Odometer) Saat Ini <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="km"
                className="input"
                placeholder="45.000"
                inputMode="numeric"
                value={km}
                onChange={(e) => setKm(formatThousands(e.target.value))}
              />

              <label className="label" htmlFor="sp" style={{ marginTop: 14 }}>
                💎 Catatan Modifikasi &amp; Kelengkapan Aksesoris Tambahan <span className="muted small">(opsional)</span>
              </label>
              <textarea
                id="sp"
                className="input"
                rows={3}
                placeholder="Contoh: Sudah ganti Velg Racing Ring 18, Audio System JBL, Kunci Serep Lengkap, Kaca Film V-Kool, Jok Kulit MBtech"
                value={sellingPoints}
                onChange={(e) => setSellingPoints(e.target.value)}
              />
              <p style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>
                ✨ Tim AI kami akan menganalisis modifikasi/aksesoris di atas untuk memberikan potensi penambahan harga taksasi!
              </p>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button className="btn" type="button" onClick={() => setStep(2)}>
                  &larr; Kembali
                </button>
                <button className="btn btn--primary" type="button" style={{ flex: 1 }} onClick={() => setStep(4)}>
                  Selanjutnya: Dokumen &rarr;
                </button>
              </div>
            </>
          )}

          {/* STEP 4: PAJAK, DOKUMEN & DEKLARASI KEJUJURAN */}
          {step === 4 && (
            <>
              <h2 className="h2" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Status Pajak &amp; Kelengkapan Dokumen</h2>

              <label className="label" htmlFor="pajakInput" style={{ marginTop: 14 }}>Status Pajak STNK</label>
              <select id="pajakInput" className="input" value={statusPajak} onChange={(e) => setStatusPajak(e.target.value)}>
                <option value="Aktif">Pajak Hidup / Aktif</option>
                <option value="Lewat">Pajak Mati / Lewat Bln</option>
              </select>

              {statusPajak === 'Lewat' && (
                <div style={{ marginTop: 10 }}>
                  <label className="label" htmlFor="blnInput">Jumlah Bulan Telat Pajak</label>
                  <input
                    id="blnInput"
                    className="input"
                    type="number"
                    min={1}
                    placeholder="Contoh: 6"
                    value={bulanTelatPajak}
                    onChange={(e) => setBulanTelatPajak(e.target.value)}
                  />
                </div>
              )}

              <label className="label" style={{ marginTop: 16 }}>Dokumen Yang Tidak Ada / Hilang (Centang jika hilang)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 8 }}>
                {DOKUMEN_LIST.map((doc) => (
                  <label key={doc} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={dokumenKurang.includes(doc)}
                      onChange={() => toggleDokumen(doc)}
                    />
                    <span>Hilang {doc}</span>
                  </label>
                ))}
              </div>

              {/* MANDATORY HONESTY DECLARATION CHECKBOX */}
              <div style={{ marginTop: 20, background: 'rgba(37, 99, 235, 0.15)', border: '1px solid #3b82f6', borderRadius: 14, padding: 16 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', color: '#f8fafc', fontSize: 12, fontWeight: 600, lineHeight: 1.6 }}>
                  <input
                    type="checkbox"
                    required
                    checked={isHonestConfirmed}
                    onChange={(e) => setIsHonestConfirmed(e.target.checked)}
                    style={{ marginTop: 3, width: 18, height: 18, accentColor: '#2563eb', cursor: 'pointer' }}
                  />
                  <span>
                    Saya menyatakan dengan sesungguhnya bahwa seluruh data kondisi fisik, mesin, dan kelengkapan dokumen kendaraan yang saya isi adalah <strong style={{ color: '#60a5fa' }}>BENAR dan SEJUJUR-JUJURNYA</strong>. Saya memahami bahwa estimasi ini akan diverifikasi kembali saat inspeksi fisik langsung di Bengkel Resmi Hasjrat Toyota.
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button className="btn" type="button" onClick={() => setStep(3)}>
                  &larr; Kembali
                </button>
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    fontSize: 15,
                    fontWeight: 900,
                    cursor: submitting ? 'wait' : 'pointer',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    boxShadow: '0 10px 25px rgba(37,99,235,0.4)',
                  }}
                >
                  {submitting ? '⏳ MENGKALKULASI TAKSASI AI...' : '🎯 HITUNG TAKSASI SEKARANG!'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>

      {/* FULLSCREEN ANIMATED AI LOADING MODAL OVERLAY */}
      {submitting && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(11, 15, 25, 0.88)',
            backdropFilter: 'blur(12px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: '100%',
              background: '#0f172a',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: 24,
              padding: 32,
              textAlign: 'center',
              boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 40px rgba(37,99,235,0.2)',
              color: '#ffffff',
            }}
          >
            {/* Animated Pulsing Icon */}
            <div style={{ position: 'relative', width: 90, height: 90, margin: '0 auto 20px auto' }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '4px solid rgba(59, 130, 246, 0.15)',
                  borderTopColor: '#3b82f6',
                  borderRightColor: '#2563eb',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 12,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  boxShadow: '0 0 20px rgba(37,99,235,0.5)',
                }}
              >
                🤖
              </div>
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', margin: '0 0 6px 0', letterSpacing: '0.02em' }}>
              MENGKALKULASI TAKSASI AI...
            </h3>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 20px 0' }}>
              AI Master Valuation Engine Hasjrat Toyota
            </p>

            {/* Dynamic Processing Status Steps */}
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 14, padding: 14, fontSize: 12, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: loadingStep >= 1 ? '#60a5fa' : '#64748b', fontWeight: loadingStep === 1 ? 700 : 400 }}>
                <span>{loadingStep > 1 ? '✅' : loadingStep === 1 ? '⏳' : '⚪'}</span>
                <span>1. Memeriksa Data Master &amp; Riwayat Servis Hasjrat...</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: loadingStep >= 2 ? '#60a5fa' : '#64748b', fontWeight: loadingStep === 2 ? 700 : 400 }}>
                <span>{loadingStep > 2 ? '✅' : loadingStep === 2 ? '⏳' : '⚪'}</span>
                <span>2. Menganalisis Suara Mesin dengan Audio AI...</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: loadingStep >= 3 ? '#60a5fa' : '#64748b', fontWeight: loadingStep === 3 ? 700 : 400 }}>
                <span>{loadingStep > 3 ? '✅' : loadingStep === 3 ? '⏳' : '⚪'}</span>
                <span>3. Memproses Evaluasi AI Master Valuation Engine...</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: loadingStep >= 4 ? '#60a5fa' : '#64748b', fontWeight: loadingStep === 4 ? 700 : 400 }}>
                <span>{loadingStep >= 4 ? '⏳' : '⚪'}</span>
                <span>4. Mengkalkulasi Matriks Grade &amp; Potensi Upgrade...</span>
              </div>
            </div>

            <div style={{ fontSize: 11, color: '#64748b' }}>
              Mohon tunggu beberapa detik, jangan tutup atau refresh halaman ini.
            </div>
          </div>
        </div>
      )}

      {/* CALCULATION ERROR BANNER */}
      {calcError && (
        <div style={{ marginTop: 16, padding: 16, background: '#450a0a', border: '2px solid #ef4444', color: '#fca5a5', borderRadius: 14, fontSize: 13, fontWeight: 700 }}>
          <div style={{ color: '#f87171', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚠️</span> TERJADI KESALAHAN SISTEM SAAT MENGKALKULASI TAKSASI:
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#ffffff', background: 'rgba(0,0,0,0.4)', padding: 10, borderRadius: 8, marginTop: 4, overflowX: 'auto' }}>
            {calcError}
          </div>
        </div>
      )}

      {/* MODAL: PLAT SUDAH TERDAFTAR (anti-duplikat / anti-spam submit) */}
      {duplicatePlate && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDuplicatePlate('')
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: '100%',
              background: '#0d1322',
              color: '#f8fafc',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 18,
              padding: 22,
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Plat sudah terdaftar</div>
            <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.5 }}>
              Mobil dengan plat nomor <strong style={{ color: '#fff' }}>{duplicatePlate}</strong> sudah pernah diajukan
              taksasi. Satu mobil cukup diajukan sekali — silakan cek riwayat pengajuan di bawah.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setDuplicatePlate('')}
                style={{ padding: '10px 18px' }}
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESULT NOTIFICATION BANNER */}
      {doneMsg && (
        <div style={{ marginTop: 16, padding: 14, background: '#064e3b', border: '1px solid #10b981', color: '#a7f3d0', borderRadius: 12, fontSize: 13, fontWeight: 700 }}>
          {doneMsg}
        </div>
      )}

      {/* RIWAYAT PENGAJUAN TRADE-IN SEBELUMNYA */}
      <div className="card" style={{ marginTop: 28, background: '#0d1322', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', width: '100%' }}>
        <h2 className="h2" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Riwayat Pengajuan Trade-In Anda</h2>
        <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>Daftar taksasi yang pernah Anda ajukan menggunakan nomor WhatsApp ini.</p>

        {listErr && (
          <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{listErr}</div>
        )}

        {rows.length === 0 ? (
          <div style={{ padding: 24, border: '1px dashed #334155', borderRadius: 14, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
            Belum ada riwayat pengajuan trade-in. Silakan isi form di atas untuk mengajukan taksasi pertama Anda.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#f8fafc' }}>
              <thead>
                <tr style={{ background: '#1e293b', textAlign: 'left', color: '#94a3b8' }}>
                  <th style={{ padding: '12px' }}>TANGGAL</th>
                  <th style={{ padding: '12px' }}>KENDARAAN</th>
                  <th style={{ padding: '12px' }}>PLAT</th>
                  <th style={{ padding: '12px' }}>ESTIMASI HARGA</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>GRADE</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>STATUS</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>AKSI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '12px', color: '#94a3b8' }}>{formatTs(row.createdAt)}</td>
                    <td style={{ padding: '12px', fontWeight: 700 }}>{row.merkModel || `${row.merk} ${row.model}`}</td>
                    <td style={{ padding: '12px', fontFamily: 'monospace' }}>{row.plateNumber || '-'}</td>
                    <td style={{ padding: '12px', color: '#60a5fa', fontWeight: 800 }}>
                      {formatRp(row.harga_min)} – {formatRp(row.harga_max)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ background: row.kelas_final === 'A' ? '#059669' : row.kelas_final === 'B' ? '#2563eb' : '#d97706', color: '#fff', padding: '3px 10px', borderRadius: 8, fontWeight: 800, fontSize: 11 }}>
                        GRADE {row.kelas_final}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>{pipelineLabel(row)}</span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn--small btn--primary"
                        style={{ fontSize: 11, padding: '6px 12px' }}
                        onClick={() => setSelectedResult(row)}
                      >
                        📄 Lihat Hasil Taksasi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RENDER APPRAISAL RESULT MODAL */}
      {selectedResult && (
        <AppraisalResultModal
          result={selectedResult}
          onClose={() => setSelectedResult(null)}
          onRequestInspection={onRequestInspection}
          requestingId={requestingId}
        />
      )}
    </div>
  );
}
