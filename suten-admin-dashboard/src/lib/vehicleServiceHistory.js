// Salinan dari toyota-dealer-web-app/src/lib/vehicleServiceHistory.js
// Mesin taksasi harus identik di kedua aplikasi agar hasil Re-Appraisal pada
// dashboard admin konsisten dengan taksasi yang dilihat customer.
// Perubahan di satu sisi wajib diikutkan ke sisi lain.
// Perbedaan yang diizinkan hanya path import Firebase.
/**
 * Fetch official Toyota service history (GR & BP) by police number (nopol).
 * Hits external Hasjrat Toyota Backend API via Vite Proxy (bypasses browser CORS).
 */
export async function fetchVehicleServiceHistory(nopolRaw) {
  if (!nopolRaw) return { history: [], contextText: '', skippedDate: null };

  const cleanNopol = String(nopolRaw).replace(/\s+/g, '').toUpperCase();
  const rawApiUrl = import.meta.env.VITE_EXTERNAL_VEHICLE_HISTORY_API_URL || '';
  const apiKey = import.meta.env.VITE_EXTERNAL_VEHICLE_HISTORY_API_KEY || '';

  if (!rawApiUrl || !apiKey || !cleanNopol) {
    return { history: [], contextText: '', skippedDate: null };
  }

  // Convert full domain URL to relative URL when running locally to utilize Vite proxy
  let effectiveUrl = rawApiUrl;
  if (effectiveUrl.includes('cr-report-backend-production.up.railway.app')) {
    effectiveUrl = effectiveUrl.replace('https://cr-report-backend-production.up.railway.app', '');
  }

  try {
    const res = await fetch(`${effectiveUrl}?police_no=${encodeURIComponent(cleanNopol)}`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!res.ok) {
      console.warn('Service History HTTP Status:', res.status);
      return { history: [], contextText: '', skippedDate: null };
    }

    const json = await res.json();
    const apiData = json.data || [];

    // Flatten operations
    const flatData = [];
    apiData.forEach((wo) => {
      const woDate = wo.wo_date || '';
      const cabang = wo.cabang || '';
      const km = wo.kilometer || 0;
      if (wo.operations && wo.operations.length > 0) {
        wo.operations.forEach((op) => {
          flatData.push({
            id: `${woDate}-${op.operation_code || Math.random()}`,
            tanggal_service: woDate,
            nama_cabang: cabang,
            kode_job: op.operation_code || '-',
            nama_job: op.operation_desc || '-',
            kategori_job: op.operation_type || 'GR',
            km: km,
          });
        });
      } else {
        flatData.push({
          id: `${woDate}-${Math.random()}`,
          tanggal_service: woDate,
          nama_cabang: cabang,
          kode_job: '-',
          nama_job: '-',
          kategori_job: 'GR',
          km: km,
        });
      }
    });

    // Sort descending by date
    flatData.sort((a, b) => new Date(b.tanggal_service).getTime() - new Date(a.tanggal_service).getTime());

    // Skip latest date dynamically (matching UI convention)
    let filteredHistory = flatData;
    let skippedDate = null;
    if (flatData.length > 0) {
      skippedDate = flatData[0].tanggal_service;
      filteredHistory = flatData.filter((item) => item.tanggal_service !== skippedDate);
    }

    // Build context string for AI prompt
    let contextText = '';
    if (filteredHistory.length > 0) {
      contextText = filteredHistory
        .slice(0, 5)
        .map(
          (item) =>
            `* Tanggal: ${item.tanggal_service}, Cabang: ${item.nama_cabang}, Pekerjaan: ${item.nama_job}, Kategori: ${item.kategori_job}, KM: ${item.km}`
        )
        .join('\n');
    }

    return {
      history: filteredHistory,
      contextText,
      skippedDate,
    };
  } catch (err) {
    console.warn('Vehicle Service History fetch warning:', err);
    return { history: [], contextText: '', skippedDate: null };
  }
}
