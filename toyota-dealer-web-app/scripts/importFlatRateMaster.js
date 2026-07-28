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

async function importFlatRateMaster() {
  const jsonPath = 'D:\\OW - Workspace\\Project Code\\kaizen\\FlateRate_master.json';

  console.log(`📖 Membaca file master data FlatRate: ${jsonPath}`);
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ File tidak ditemukan di ${jsonPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(jsonPath, 'utf8');
  const items = JSON.parse(rawData);

  console.log(`🔧 Total data FlatRate ditemukan di JSON: ${items.length} data.`);

  const colRef = collection(db, 'flatrate_master');
  const BATCH_SIZE = 450; // Max batch write limit in Firestore is 500
  let count = 0;
  let batch = writeBatch(db);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    const category = String(item['CATEGORY'] || '').trim().toUpperCase();
    const namaBasemodel = String(item['NAMA_BASEMODEL'] || '').trim().toUpperCase();
    const kodeBasemodel = String(item['KODE_BASEMODEL'] || '').trim().toUpperCase();
    const namaJob = String(item['NAMA_JOB'] || '').trim();
    const flatrate = Number(item['FLATRATE'] || 0);
    const productionFlatrate = Number(item['PRODUCTION_FLATRATE'] || 0);
    const hourlyRate = Number(item['HOURLY_RATE'] || 0);
    const laborCost = Math.round(flatrate * hourlyRate);

    const docData = {
      category,
      nama_basemodel: namaBasemodel,
      kode_basemodel: kodeBasemodel,
      nama_job: namaJob,
      flatrate,
      production_flatrate: productionFlatrate,
      hourly_rate: hourlyRate,
      labor_cost: laborCost,
      updatedAt: new Date().toISOString(),
    };

    const newDocRef = doc(colRef);
    batch.set(newDocRef, docData);
    count++;

    if (count % BATCH_SIZE === 0 || i === items.length - 1) {
      console.log(`⏳ Menyimpan batch (${count}/${items.length})...`);
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  console.log(`✅ BERHASIL! ${count} data FlatRate master berhasil disimpan ke Firestore collection 'flatrate_master'.`);
  process.exit(0);
}

importFlatRateMaster().catch((err) => {
  console.error('❌ Error saat mengimport data FlatRate master:', err);
  process.exit(1);
});
