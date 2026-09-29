// Salinan dari toyota-dealer-web-app/src/lib/sparepartMaster.js
// Mesin taksasi harus identik di kedua aplikasi agar hasil Re-Appraisal pada
// dashboard admin konsisten dengan taksasi yang dilihat customer.
// Perubahan di satu sisi wajib diikutkan ke sisi lain.
// Perbedaan yang diizinkan hanya path import Firebase.
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase.js';

/**
 * Service to query Firestore collection 'sparepart_master' for official Hasjrat Toyota Genuine Parts.
 */

export async function fetchSparepartCandidatesForJob(jobType, vehicleModel = '', customTerms = []) {
  const keywordsMap = {
    battery: {
      terms: ['BATTERY', 'AKI', 'ACCU', '34B19', '46B24', '55D23', '80D26', '105D31'],
      codePrefixes: ['28800', '28800-'],
    },
    tuneup: {
      terms: ['FILTER', 'BUSI', 'TUNE', 'OPI', '04152', '90915', '17801', '90919'],
      codePrefixes: ['04152', '90915', '17801', '90919'],
    },
    ac: {
      terms: ['FREON', 'CABIN', 'AC', 'AIR CON', '87139', '88310'],
      codePrefixes: ['87139', '88310'],
    },
    interior: {
      terms: ['CABIN', 'CLEANER', 'DISINFECTANT', 'CARE', '08870'],
      codePrefixes: ['08870'],
    },
    transmisi: {
      terms: ['TRANSMISI', 'ATF', 'CVT', 'FLUID', 'OBL', '35330', '08886'],
      codePrefixes: ['35330', '08886'],
    },
    suspensi: {
      terms: ['BUSHING', 'SHOCK', 'SUSPENSION', 'ARM', 'BEARING', '48510', '48068', '48069'],
      codePrefixes: ['48510', '48068', '48069'],
    },
    tire: {
      terms: ['BAN', 'TIRE', 'WHEEL', '42611'],
      codePrefixes: ['42611'],
    },
    body: {
      terms: ['PASTE', 'CAT', 'TOUCH UP', '04002', '08866'],
      codePrefixes: ['04002', '08866'],
    },
  };

  const defaultConfig = keywordsMap[jobType] || {
    terms: [jobType.toUpperCase()],
    codePrefixes: [],
  };

  const termsToSearch = Array.isArray(customTerms) && customTerms.length > 0
    ? customTerms.map(t => String(t).toUpperCase().trim()).filter(Boolean)
    : defaultConfig.terms;

  try {
    const colRef = collection(db, 'sparepart_master');
    const candidates = [];
    const seenCodes = new Set();

    // 1. Prefix query on kode_parts
    for (const prefix of defaultConfig.codePrefixes) {
      if (candidates.length >= 12) break;
      const qPrefix = query(
        colRef,
        where('kode_parts', '>=', prefix),
        where('kode_parts', '<=', prefix + '\uf8ff'),
        limit(20)
      );
      const snap = await getDocs(qPrefix).catch(() => null);
      if (snap && !snap.empty) {
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const kode = String(data.kode_parts || '').toUpperCase();
          if (kode && !seenCodes.has(kode)) {
            seenCodes.add(kode);
            candidates.push({
              kode_parts: data.kode_parts,
              nama_parts: String(data.nama_parts || '').trim(),
              harga_satuan: Number(data.harga_satuan || 0),
            });
          }
        });
      }
    }

    if (candidates.length > 0) {
      console.log(`🤖 [AI Agentic Firestore Lookup] Found ${candidates.length} candidate documents in 'sparepart_master' for '${jobType}':`, candidates);
      return candidates.slice(0, 15);
    }

    // 2. Fallback sweep search matching AI terms
    const qSweep = query(colRef, limit(500));
    const snapSweep = await getDocs(qSweep).catch(() => null);
    if (snapSweep && !snapSweep.empty) {
      snapSweep.forEach((docSnap) => {
        const data = docSnap.data();
        const nama = String(data.nama_parts || '').toUpperCase();
        const kode = String(data.kode_parts || '').toUpperCase();

        const isMatch = termsToSearch.some(
          (term) => nama.includes(term) || kode.includes(term)
        );

        if (isMatch && !seenCodes.has(kode)) {
          seenCodes.add(kode);
          candidates.push({
            kode_parts: data.kode_parts,
            nama_parts: String(data.nama_parts || '').trim(),
            harga_satuan: Number(data.harga_satuan || 0),
          });
        }
      });
    }

    if (candidates.length > 0) {
      console.log(`🤖 [AI Agentic Firestore Lookup] Found ${candidates.length} candidates by term sweep for '${jobType}':`, candidates);
      return candidates.slice(0, 15);
    }
  } catch (error) {
    console.warn(`Error querying sparepart_master for ${jobType}:`, error);
  }

  return [];
}

