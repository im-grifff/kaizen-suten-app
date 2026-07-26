import fs from 'fs';
import path from 'path';

const jsonPath = 'D:\\OW - Workspace\\Project Code\\kaizen\\Parts_master.json';
const raw = fs.readFileSync(jsonPath, 'utf8');
const parts = JSON.parse(raw);

const keywords = ['BATTERY', 'ACCU', 'FILTER', 'BUSI', 'SPARK', 'OIL', 'CAT', 'FREON', 'CLEANER', 'PAD'];
const found = {};

parts.forEach((p) => {
  const name = String(p['Nama Parts'] || '').trim().toUpperCase();
  const code = String(p['Kode parts'] || '').trim().toUpperCase();
  const price = Number(p['Harga Satuan'] || 0);

  keywords.forEach((kw) => {
    if (name.includes(kw)) {
      if (!found[kw]) found[kw] = [];
      if (found[kw].length < 5) {
        found[kw].push({ code, name, price });
      }
    }
  });
});

console.log(JSON.stringify(found, null, 2));
