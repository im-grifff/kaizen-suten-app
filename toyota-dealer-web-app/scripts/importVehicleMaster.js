import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env natively
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
  console.error('Error: Kredensial Firebase di .env belum diisi dengan benar.');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function importVehicles() {
  const jsonPath = 'D:\\OW - Workspace\\Project Code\\kaizen\\Vehicle_master.json';

  console.log(`📖 Membaca file master data: ${jsonPath}`);
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ File tidak ditemukan di ${jsonPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(jsonPath, 'utf8');
  const vehicles = JSON.parse(rawData);

  console.log(`🚗 Total kendaraan ditemukan di JSON: ${vehicles.length} data.`);

  const colRef = collection(db, 'vehicle_master');
  const BATCH_SIZE = 450; // Max batch write limit in Firestore is 500
  let count = 0;
  let batch = writeBatch(db);

  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];

    // Normalize transmisi to standard 'Manual' or 'Matic'
    let transmisiNorm = v['Transmisi'] || '';
    if (transmisiNorm.toUpperCase() === 'MT' || transmisiNorm.toUpperCase() === 'MANUAL') {
      transmisiNorm = 'Manual';
    } else if (transmisiNorm.toUpperCase() === 'AT' || transmisiNorm.toUpperCase() === 'MATIC') {
      transmisiNorm = 'Matic';
    }

    const docData = {
      merk: String(v['Merk Mobil'] || '').trim().toUpperCase(),
      model: String(v['Nama Mobil'] || '').trim().toUpperCase(),
      varian: String(v['Tipe Mobil'] || '').trim(),
      jenis_mesin: v['Jenis Mesin'] || null,
      transmisi: transmisiNorm,
      tahun: Number(v['Tahun Kendaraan'] || 0),
      harga_dasar: Number(v['Harga Mobil Bekas'] || 0),
      kode_demand: String(v['Moving Code'] || 'FM').trim().toUpperCase(),
      updatedAt: new Date().toISOString(),
    };

    const newDocRef = doc(colRef);
    batch.set(newDocRef, docData);
    count++;

    if (count % BATCH_SIZE === 0 || i === vehicles.length - 1) {
      console.log(`⏳ Menyimpan batch (${count}/${vehicles.length})...`);
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  console.log(`✅ BERHASIL! ${count} data vehicle_master berhasil disimpan ke Firestore collection 'vehicle_master'.`);
  process.exit(0);
}

importVehicles().catch((err) => {
  console.error('❌ Error saat mengimport data:', err);
  process.exit(1);
});
