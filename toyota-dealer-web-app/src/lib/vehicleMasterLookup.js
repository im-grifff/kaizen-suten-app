import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase/firebase.js';

export async function lookupBasePrice(merk = '', model = '', varian = '', transmisi = 'Matic', tahun = '2020') {
  const normMerk = String(merk).trim().toUpperCase();
  const normModel = String(model).trim().toUpperCase();
  const numYear = Number(tahun) || 2020;

  try {
    const colRef = collection(db, 'vehicle_master');
    const q = query(
      colRef,
      where('model', '==', normModel),
      limit(10)
    );

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      let matchedDoc = snapshot.docs[0].data();

      // Find closest year match
      let closestDiff = 99;
      for (const d of snapshot.docs) {
        const data = d.data();
        const diff = Math.abs((data.tahun || numYear) - numYear);
        if (diff < closestDiff) {
          closestDiff = diff;
          matchedDoc = data;
        }
      }

      if (matchedDoc.harga_dasar && matchedDoc.harga_dasar > 0) {
        return {
          base_price: matchedDoc.harga_dasar,
          kode_demand: matchedDoc.kode_demand || 'FM',
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
  } else if (normModel.includes('INNOVA') || normModel.includes('HR-V') || normModel.includes('FORTUNER')) {
    basePrice = 280000000;
  } else if (normModel.includes('ALPHARD') || normModel.includes('VELLFIRE') || normModel.includes('VOXY')) {
    basePrice = 750000000;
  }

  // Adjust for age (depreciation 4% per year from 2024)
  const age = Math.max(0, 2026 - numYear);
  const adjustedPrice = Math.round(basePrice * Math.pow(0.92, age));

  return {
    base_price: adjustedPrice,
    kode_demand: 'FM',
  };
}
