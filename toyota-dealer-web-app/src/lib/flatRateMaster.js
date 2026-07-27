import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase/firebase.js';
import { getLaborRateForModel } from './workshopLaborRates.js';

/**
 * Pre-indexed Hasjrat Toyota Genuine Parts catalog mapping for maintenance jobs,
 * scaled by vehicle category segment.
 */
export const HASJRAT_MAINTENANCE_PARTS_CATALOG = {
  battery: [
    { category: 'LCGC', kode_parts: '28800-YZZZ1', nama_parts: 'BATTERY MF 34B19R (AGYA/CALYA)', harga_satuan: 685000 },
    { category: 'Economy', kode_parts: '28800-YZZZ2', nama_parts: 'BATTERY MF 46B24R (AVANZA/RUSH/RAIZE)', harga_satuan: 890000 },
    { category: 'Standard', kode_parts: '28800-YZZZ3', nama_parts: 'BATTERY MF 55D23L (INNOVA/YARIS/ZENIX)', harga_satuan: 1150000 },
    { category: 'Medium Luxury', kode_parts: '28800-YZZZ4', nama_parts: 'BATTERY MF 80D26L (FORTUNER/VOXY/ALTIS)', harga_satuan: 1650000 },
    { category: 'Luxury', kode_parts: '28800-YZZZ5', nama_parts: 'BATTERY MF 105D31L (ALPHARD/LAND CRUISER)', harga_satuan: 2450000 },
  ],
  tuneup: [
    { category: 'LCGC', kode_parts: '04152-YZZA6', nama_parts: 'FILTER OLI, BUSI & TUNE-UP KIT LCGC', harga_satuan: 380000 },
    { category: 'Economy', kode_parts: '90915-YZZE1', nama_parts: 'FILTER OLI, BUSI & TUNE-UP KIT ECONOMY', harga_satuan: 580000 },
    { category: 'Standard', kode_parts: '90915-YZZE2', nama_parts: 'FILTER OLI, BUSI & TUNE-UP KIT STANDARD', harga_satuan: 880000 },
    { category: 'Medium Luxury', kode_parts: '04152-YZZA1', nama_parts: 'FILTER OLI, BUSI & TUNE-UP KIT MEDIUM LUXURY', harga_satuan: 1250000 },
    { category: 'Luxury', kode_parts: '04152-YZZA4', nama_parts: 'FILTER OLI, BUSI IRIDIUM & TUNE-UP KIT LUXURY', harga_satuan: 2100000 },
  ],
  body: [
    { category: 'LCGC', kode_parts: '04002-PASTE1', nama_parts: 'MATERIAL PASTE & CAT TOUCH UP LCGC', harga_satuan: 210000 },
    { category: 'Economy', kode_parts: '04002-PASTE2', nama_parts: 'MATERIAL PASTE & CAT TOUCH UP ECONOMY', harga_satuan: 315000 },
    { category: 'Standard', kode_parts: '04002-PASTE3', nama_parts: 'MATERIAL PASTE & CAT TOUCH UP STANDARD', harga_satuan: 420000 },
    { category: 'Medium Luxury', kode_parts: '04002-PASTE4', nama_parts: 'MATERIAL PASTE & CAT TOUCH UP MEDIUM LUXURY', harga_satuan: 630000 },
    { category: 'Luxury', kode_parts: '04002-PASTE5', nama_parts: 'MATERIAL PASTE & CAT TOUCH UP LUXURY', harga_satuan: 950000 },
  ],
  ac: [
    { category: 'LCGC', kode_parts: '87139-YZZ08', nama_parts: 'FREON R134A & FILTER CABIN AC LCGC', harga_satuan: 220000 },
    { category: 'Economy', kode_parts: '87139-YZZ16', nama_parts: 'FREON R134A & FILTER CABIN AC ECONOMY', harga_satuan: 275000 },
    { category: 'Standard', kode_parts: '87139-YZZ30', nama_parts: 'FREON R134A & FILTER CABIN AC STANDARD', harga_satuan: 375000 },
    { category: 'Medium Luxury', kode_parts: '87139-58010', nama_parts: 'FREON R134A & FILTER CABIN AC MEDIUM LUXURY', harga_satuan: 525000 },
    { category: 'Luxury', kode_parts: '87139-58020', nama_parts: 'FREON R1234YF & FILTER CABIN AC LUXURY', harga_satuan: 850000 },
  ],
  interior: [
    { category: 'LCGC', kode_parts: '08870-CARE1', nama_parts: 'TOYOTA GENUINE CABIN CLEANER & DISINFECTANT LCGC', harga_satuan: 160000 },
    { category: 'Economy', kode_parts: '08870-CARE2', nama_parts: 'TOYOTA GENUINE CABIN CLEANER & DISINFECTANT ECONOMY', harga_satuan: 220000 },
    { category: 'Standard', kode_parts: '08870-CARE3', nama_parts: 'TOYOTA GENUINE CABIN CLEANER & DISINFECTANT STANDARD', harga_satuan: 320000 },
    { category: 'Medium Luxury', kode_parts: '08870-CARE4', nama_parts: 'TOYOTA GENUINE CABIN CLEANER & DISINFECTANT MEDIUM LUXURY', harga_satuan: 470000 },
    { category: 'Luxury', kode_parts: '08870-CARE5', nama_parts: 'TOYOTA GENUINE CABIN CLEANER & LEATHER CARE LUXURY', harga_satuan: 780000 },
  ],
  transmisi: [
    { category: 'LCGC', kode_parts: '35330-W001', nama_parts: 'OLI TRANSMISI & FILTER FLUID LCGC', harga_satuan: 450000 },
    { category: 'Economy', kode_parts: '35330-W002', nama_parts: 'OLI TRANSMISI & FILTER FLUID ECONOMY', harga_satuan: 650000 },
    { category: 'Standard', kode_parts: '35330-W003', nama_parts: 'OLI TRANSMISI ATF/MTF & FILTER FLUID STANDARD', harga_satuan: 850000 },
    { category: 'Medium Luxury', kode_parts: '35330-W004', nama_parts: 'OLI TRANSMISI CVT/ATF & FILTER SET MEDIUM LUXURY', harga_satuan: 1250000 },
    { category: 'Luxury', kode_parts: '35330-W005', nama_parts: 'OLI TRANSMISI WS/CVT & REPAIR KIT LUXURY', harga_satuan: 1950000 },
  ],
  suspensi: [
    { category: 'LCGC', kode_parts: '48510-W001', nama_parts: 'BUSHING ARM & SUSPENSION REPAIR KIT LCGC', harga_satuan: 480000 },
    { category: 'Economy', kode_parts: '48510-W002', nama_parts: 'BUSHING ARM & SUSPENSION REPAIR KIT ECONOMY', harga_satuan: 680000 },
    { category: 'Standard', kode_parts: '48510-W003', nama_parts: 'BUSHING ARM & SHOCK ABSORBER KIT STANDARD', harga_satuan: 950000 },
    { category: 'Medium Luxury', kode_parts: '48510-W004', nama_parts: 'BUSHING ARM & SHOCK ABSORBER KIT MEDIUM LUXURY', harga_satuan: 1450000 },
    { category: 'Luxury', kode_parts: '48510-W005', nama_parts: 'AIR SUSPENSION / SHOCK ABSORBER REPAIR KIT LUXURY', harga_satuan: 2850000 },
  ],
  tire: [
    { category: 'LCGC', kode_parts: '42611-TIRE1', nama_parts: 'BAN ORIGINAL TOYOTA 175/65 R14 (2 PCS)', harga_satuan: 960000 },
    { category: 'Economy', kode_parts: '42611-TIRE2', nama_parts: 'BAN ORIGINAL TOYOTA 185/65 R15 (2 PCS)', harga_satuan: 1300000 },
    { category: 'Standard', kode_parts: '42611-TIRE3', nama_parts: 'BAN ORIGINAL TOYOTA 215/60 R17 (2 PCS)', harga_satuan: 1840000 },
    { category: 'Medium Luxury', kode_parts: '42611-TIRE4', nama_parts: 'BAN ORIGINAL TOYOTA 225/50 R18 (2 PCS)', harga_satuan: 2900000 },
    { category: 'Luxury', kode_parts: '42611-TIRE5', nama_parts: 'BAN ORIGINAL TOYOTA 235/55 R19 (2 PCS)', harga_satuan: 4400000 },
  ],
};

export function getGenuinePartForJob(categoryName = 'Standard', jobType = 'battery') {
  const list = HASJRAT_MAINTENANCE_PARTS_CATALOG[jobType] || HASJRAT_MAINTENANCE_PARTS_CATALOG.battery;
  const matched = list.find((item) => item.category === categoryName) || list[2];
  return matched;
}

/**
 * Calculate comprehensive FRT labor & Genuine Spareparts estimation for a repair item.
 * @param {string} modelName - e.g. "Yaris", "Avanza", "Alphard"
 * @param {'battery' | 'tuneup' | 'body' | 'ac' | 'interior' | 'transmisi' | 'suspensi' | 'tire'} jobType
 */
export function getDetailedEstimateForRepair(modelName, jobType) {
  const { category, hourlyRate } = getLaborRateForModel(modelName);

  let frtHours = 0.5;
  let jobLabel = '';
  let icon = '🔧';

  if (jobType === 'battery') {
    frtHours = 0.5;
    jobLabel = 'Ganti Aki Baru Genuine Toyota & Charging Test';
    icon = '⚡';
  } else if (jobType === 'tuneup') {
    frtHours = 1.5;
    jobLabel = 'Servis Tune-Up Mesin, Filter Oli & Busi';
    icon = '⚙️';
  } else if (jobType === 'body') {
    frtHours = 2.0;
    jobLabel = 'Poles Body & Perbaikan Cat Minor';
    icon = '🖌️';
  } else if (jobType === 'ac') {
    frtHours = 1.0;
    jobLabel = 'Servis AC, Isi Freon & Filter Cabin';
    icon = '❄️';
  } else if (jobType === 'interior') {
    frtHours = 1.0;
    jobLabel = 'Pembersihan Kabin & Treatment Interior';
    icon = '🪑';
  } else if (jobType === 'transmisi') {
    frtHours = 2.0;
    jobLabel = 'Servis Transmisi, Flush Oli ATF/MTF & Filter';
    icon = '⚙️';
  } else if (jobType === 'suspensi') {
    frtHours = 2.0;
    jobLabel = 'Servis Kaki-Kaki & Ganti Bushing Arm Suspensi';
    icon = '🔩';
  } else if (jobType === 'tire') {
    frtHours = 1.0;
    jobLabel = 'Ganti Ban Original Toyota & Spooring Balancing';
    icon = '🛞';
  }

  const grossLaborCost = Math.round(hourlyRate * frtHours);
  const discount30 = Math.round(grossLaborCost * 0.30);
  const netLaborCost = grossLaborCost - discount30;

  const genuinePart = getGenuinePartForJob(category, jobType);
  const partCost = genuinePart.harga_satuan;

  const totalCustomerCost = netLaborCost + partCost;
  const valuationGain = Math.round(totalCustomerCost * 1.5);

  return {
    category,
    jobType,
    jobLabel,
    icon,
    frtHours,
    hourlyRate,
    grossLaborCost,
    discount30,
    netLaborCost,
    partCode: genuinePart.kode_parts,
    partName: genuinePart.nama_parts,
    partCost,
    totalCustomerCost,
    valuationGain,
  };
}

/**
 * Lookup FlatRate job from Firestore by model name and job keyword.
 */
export async function lookupFlatRateJob(modelName, jobKeyword) {
  if (!modelName || !jobKeyword) return null;

  try {
    const cleanModel = String(modelName).trim().toUpperCase();
    const colRef = collection(db, 'flatrate_master');
    const q = query(colRef, where('nama_basemodel', '==', cleanModel), limit(50));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const keywordLower = jobKeyword.toLowerCase();
      let matchedDoc = null;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.nama_job && data.nama_job.toLowerCase().includes(keywordLower)) {
          matchedDoc = data;
        }
      });

      if (matchedDoc) {
        return {
          category: matchedDoc.category,
          nama_job: matchedDoc.nama_job,
          flatrate: matchedDoc.flatrate,
          hourly_rate: matchedDoc.hourly_rate,
          labor_cost: matchedDoc.labor_cost || Math.round(matchedDoc.flatrate * matchedDoc.hourly_rate),
        };
      }
    }

    const { category, hourlyRate } = getLaborRateForModel(cleanModel);
    const fallbackFlatRate = 0.5;
    return {
      category,
      nama_job: jobKeyword,
      flatrate: fallbackFlatRate,
      hourly_rate: hourlyRate,
      labor_cost: Math.round(hourlyRate * fallbackFlatRate),
    };
  } catch (error) {
    console.warn('Error querying flatrate_master:', error);
    const { category, hourlyRate } = getLaborRateForModel(modelName);
    return {
      category,
      nama_job: jobKeyword,
      flatrate: 0.5,
      hourly_rate: hourlyRate,
      labor_cost: Math.round(hourlyRate * 0.5),
    };
  }
}
