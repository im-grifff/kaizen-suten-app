// ⚠️ MIRROR dari toyota-dealer-web-app/src/lib/vehicleMasterLookup.js
// Mesin taksasi HARUS identik di kedua app, kalau tidak hasil Re-Appraisal admin
// akan beda dari taksasi asli customer. Ubah di sini = wajib ubah di sana juga.
// Satu-satunya perbedaan yang diizinkan: path import firebase.
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase.js';

export async function lookupBasePrice(merk = '', model = '', varian = '', transmisi = 'Matic', tahun = '2020') {
  const normMerk = String(merk).trim().toUpperCase();
  const normModel = String(model).trim().toUpperCase();
  const normVarian = String(varian).trim().toUpperCase();
  const normTransmisi = String(transmisi).trim().toUpperCase();
  const numYear = Number(tahun) || 2020;

  // Build comprehensive alias dictionary to map UI carCatalog inputs to Vehicle_master.json model names
  const searchModels = [normModel];
  const aliases = {
    'XPANDER': ['EXPANDER', 'XPANDER'],
    'XPANDER CROSS': ['EXPANDER CROSS', 'EXPANDER', 'XPANDER CROSS', 'XPANDER'],
    'EXPANDER': ['EXPANDER', 'XPANDER'],
    'INNOVA REBORN': ['INNOVA', 'KIJANG INNOVA', 'INNOVA REBORN'],
    'KIJANG INNOVA ZENIX': ['INNOVA ZENIX', 'INNOVA', 'KIJANG INNOVA', 'ZENIX'],
    'YARIS CROSS': ['YARIS CROSS', 'YARIS'],
    'COROLLA CROSS': ['COROLLA CROSS', 'COROLLA'],
    'COROLLA ALTIS': ['COROLLA ALTIS', 'ALTIS', 'COROLLA'],
    'GRAN MAX': ['GRANMAX', 'GRAN MAX', 'GRAND MAX'],
    'GRAN_MAX': ['GRANMAX', 'GRAN MAX', 'GRAND MAX'],
    'CRV': ['CRV', 'CR-V'],
    'CR-V': ['CRV', 'CR-V'],
    'HRV': ['HRV', 'HR-V'],
    'HR-V': ['HRV', 'HR-V'],
    'BRV': ['BRV', 'BR-V'],
    'BR-V': ['BRV', 'BR-V'],
    'WRV': ['WRV', 'WR-V'],
    'WR-V': ['WRV', 'WR-V'],
    'PAJERO SPORT': ['PAJERO SPORT', 'PAJERO'],
    'PAJERO_SPORT': ['PAJERO SPORT', 'PAJERO'],
    'S-PRESSO': ['SPRESSO', 'S-PRESSO', 'S PRESSO'],
    'XL7': ['XL7', 'XL-7'],
    'AIR EV': ['AIR EV', 'AIR-EV', 'AIREV'],
    'AIR_EV': ['AIR EV', 'AIR-EV', 'AIREV'],
    'GRAND I10': ['GRAND I10', 'I10'],
    'SANTA FE': ['SANTA FE', 'SANTAFE'],
    'SANTA_FE': ['SANTA FE', 'SANTAFE'],
  };

  if (aliases[normModel]) {
    aliases[normModel].forEach((m) => {
      if (!searchModels.includes(m)) searchModels.push(m);
    });
  }

  // Automatic hyphen/underscore/space variation generator for 100% catalog coverage
  const altSpace = normModel.replace(/[_\-]/g, ' ').trim();
  const altNoSpace = normModel.replace(/[\s_\-]/g, '').trim();
  const altHyphen = normModel.replace(/[\s_]/g, '-').trim();
  [altSpace, altNoSpace, altHyphen].forEach((m) => {
    if (m && !searchModels.includes(m)) searchModels.push(m);
  });

  try {
    const colRef = collection(db, 'vehicle_master');
    const q = query(
      colRef,
      where('model', 'in', searchModels.slice(0, 10)),
      limit(50)
    );

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      let bestDoc = null;
      let bestScore = -1;

      for (const d of snapshot.docs) {
        const data = d.data();
        let score = 0;

        // 1. Tahun Match (max 40 pts)
        const dYear = Number(data.tahun || 0);
        const yearDiff = Math.abs(dYear - numYear);
        if (yearDiff === 0) score += 40;
        else if (yearDiff === 1) score += 25;
        else if (yearDiff === 2) score += 10;

        // 2. Transmisi Match (max 25 pts)
        const dTrans = String(data.transmisi || '').toUpperCase();
        const dVarian = String(data.varian || '').toUpperCase();

        const isManualInput = normTransmisi === 'MANUAL' || normTransmisi === 'MT' || normTransmisi === 'M/T';
        const isMaticInput = normTransmisi === 'MATIC' || normTransmisi === 'AT' || normTransmisi === 'A/T' || normTransmisi === 'CVT' || normTransmisi === 'OTOMATIS';

        const isDocManual = dTrans === 'MT' || dTrans === 'MANUAL' || dTrans.includes('M/T') || dVarian.includes('M/T') || dVarian.includes(' MT');
        const isDocMatic = dTrans === 'AT' || dTrans === 'MATIC' || dTrans === 'CVT' || dTrans.includes('A/T') || dVarian.includes('A/T') || dVarian.includes(' AT') || dVarian.includes('CVT');

        if ((isManualInput && isDocManual) || (isMaticInput && isDocMatic)) {
          score += 25;
        }

        // 3. Varian / Tipe Match (max 45 pts)
        if (normVarian && dVarian) {
          if (dVarian === normVarian) {
            score += 45;
          } else if (dVarian.includes(normVarian) || normVarian.includes(dVarian)) {
            score += 35;
          } else {
            const dWords = dVarian.split(/[\s\/]+/);
            const iWords = normVarian.split(/[\s\/]+/);
            const overlap = dWords.filter((w) => w && iWords.includes(w)).length;
            score += overlap * 10;
          }
        } else {
          score += 15; // default if no variant specified
        }

        if (score > bestScore) {
          bestScore = score;
          bestDoc = data;
        }
      }

      if (bestDoc && bestDoc.harga_dasar && bestDoc.harga_dasar > 0) {
        let basePrice = Number(bestDoc.harga_dasar);
        const docYear = Number(bestDoc.tahun || numYear);
        const yearGap = numYear - docYear; // e.g. 2021 - 2016 = +5 years

        // Jika ada perbedaan tahun antara data database & input user, sesuaikan 5% per tahun
        if (yearGap !== 0) {
          basePrice = Math.round(basePrice * Math.pow(1.05, yearGap));
        }

        return {
          base_price: basePrice,
          kode_demand: bestDoc.kode_demand || 'FM',
          matched_variant: bestDoc.varian || normVarian,
          matched_year: docYear,
          year_gap: yearGap,
        };
      }
    }
  } catch (err) {
    console.warn('vehicle_master Firestore query bypassed, fallback to segment lookup:', err);
  }

  // Smart Fallback Base Prices based on model segment
  let basePrice = 160000000;
  if (normModel.includes('AGYA') || normModel.includes('CALYA') || normModel.includes('AYLA') || normModel.includes('SIGRA')) {
    basePrice = 110000000;
  } else if (normModel.includes('AVANZA') || normModel.includes('XENIA') || normModel.includes('RUSH') || normModel.includes('TERIOS') || normModel.includes('BRIO')) {
    basePrice = 165000000;
  } else if (normModel.includes('EXPANDER') || normModel.includes('XPANDER') || normModel.includes('INNOVA') || normModel.includes('HR-V') || normModel.includes('HRV') || normModel.includes('FORTUNER')) {
    basePrice = 220000000;
  } else if (normModel.includes('ALPHARD') || normModel.includes('VELLFIRE') || normModel.includes('VOXY')) {
    basePrice = 750000000;
  }

  // Adjust for age (depreciation 4% per year from 2026)
  const age = Math.max(0, 2026 - numYear);
  const adjustedPrice = Math.round(basePrice * Math.pow(0.95, age));

  return {
    base_price: adjustedPrice,
    kode_demand: 'FM',
  };
}
