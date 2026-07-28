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

async function importSparepartMaster() {
  const jsonPath = 'D:\\OW - Workspace\\Project Code\\kaizen\\Parts_master.json';

  console.log(`📖 Membaca file master data Sparepart: ${jsonPath}`);
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ File tidak ditemukan di ${jsonPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(jsonPath, 'utf8');
  const items = JSON.parse(rawData);

  // Optional parameters: startIndex & limitCount
  // Contoh setengah data: node scripts/importSparepartMaster.js 0 5000
  const startIndex = Number(process.argv[2] || 0);
  const limitCount = process.argv[3] ? Number(process.argv[3]) : null;
  const endIndex = limitCount ? Math.min(items.length, startIndex + limitCount) : items.length;

  console.log(`🔧 Total data Sparepart ditemukan di JSON: ${items.length} data.`);
  if (limitCount) {
    console.log(`🎯 Mode Impor Parsial: Memproses ${limitCount} data (Indeks ${startIndex} sampai ${endIndex - 1})...`);
  } else if (startIndex > 0) {
    console.log(`⏩ Melanjutkan impor dari data indeks ke-${startIndex} sampai selesai...`);
  }

  const colRef = collection(db, 'sparepart_master');
  const BATCH_SIZE = 450;
  let count = 0;
  let batch = writeBatch(db);

  for (let i = startIndex; i < endIndex; i++) {
    const item = items[i];

    const kodeParts = String(item['Kode parts'] || '').trim().toUpperCase();
    const namaParts = String(item['Nama Parts'] || '').trim();
    const hargaSatuan = Number(item['Harga Satuan'] || 0);

    if (!kodeParts || !namaParts) continue;

    const docData = {
      kode_parts: kodeParts,
      nama_parts: namaParts,
      harga_satuan: hargaSatuan,
      updatedAt: new Date().toISOString(),
    };

    // Gunakan kode_parts sebagai ID dokumen (ganti '/' dengan '_' agar ID Firestore valid)
    const docId = kodeParts.replace(/\//g, '_');
    const newDocRef = doc(colRef, docId);
    batch.set(newDocRef, docData, { merge: true });
    count++;

    if (count % BATCH_SIZE === 0 || i === endIndex - 1) {
      const currentIdx = i + 1;
      try {
        console.log(`⏳ Menyimpan batch (${startIndex + count}/${items.length})... (Data s.d. indeks ${currentIdx})`);
        await batch.commit();
        batch = writeBatch(db);
        // Delay 200ms agar tidak terkena rate-limit burst
        await new Promise((res) => setTimeout(res, 200));
      } catch (err) {
        console.error(`\n❌ TERHENTI pada indeks ke-${currentIdx} karena error:`, err.message);
        console.log(`\n👉 Untuk melanjutkan data yang belum terupload, jalankan perintah ini besok (setelah kuota reset):`);
        console.log(`\x1b[36mnode scripts/importSparepartMaster.js ${currentIdx}\x1b[0m\n`);
        process.exit(1);
      }
    }
  }

  console.log(`✅ BERHASIL! Total ${count} data Sparepart master berhasil disimpan ke Firestore collection 'sparepart_master'.`);
  process.exit(0);
}

importSparepartMaster().catch((err) => {
  console.error('❌ Error saat mengimport data Sparepart master:', err);
  process.exit(1);
});
