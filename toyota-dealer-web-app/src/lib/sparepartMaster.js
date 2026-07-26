import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase/firebase.js';

/**
 * Service to query Firestore collection 'sparepart_master' for official Hasjrat Toyota Genuine Parts.
 */

/**
 * Lookup genuine sparepart from Firestore by keyword.
 * @param {string} searchKeyword - e.g. "BATTERY", "FILTER OLI", "BUSI"
 * @returns {Promise<{ kode_parts: string, nama_parts: string, harga_satuan: number } | null>}
 */
export async function lookupSparepart(searchKeyword) {
  if (!searchKeyword) return null;

  try {
    const cleanKeyword = String(searchKeyword).trim().toUpperCase();
    const colRef = collection(db, 'sparepart_master');
    const q = query(colRef, limit(100));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      let matched = null;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.nama_parts && data.nama_parts.toUpperCase().includes(cleanKeyword)) {
          matched = data;
        }
      });

      if (matched) {
        return {
          kode_parts: matched.kode_parts,
          nama_parts: matched.nama_parts,
          harga_satuan: matched.harga_satuan,
        };
      }
    }

    return null;
  } catch (error) {
    console.warn('Error querying sparepart_master:', error);
    return null;
  }
}
