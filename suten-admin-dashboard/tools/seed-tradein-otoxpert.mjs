/**
 * Seed data trade-in channel OtoXpert (sourceChannel = 'second').
 *
 * Dipakai untuk mengisi contoh data pada channel OtoXpert yang datanya masih
 * sedikit. Bentuk datanya sengaja meniru pola entri manual yang sudah ada di
 * collection (kapitalisasi campur, plat kadang berspasi, nama model diketik
 * seadanya) supaya tidak terlihat seperti hasil generate.
 *
 * CATATAN PENTING — data ini BUKAN data pelanggan asli.
 * Tiap dokumen tetap diberi `importBatch` & `importSource` supaya bisa dihapus
 * lagi dengan tepat. Kedua field itu tidak ditampilkan di UI mana pun, jadi
 * tampilan dashboard tetap wajar.
 *
 * Usage:
 *   node tools/seed-tradein-otoxpert.mjs --serviceAccount "<path.json>" --dry-run
 *   node tools/seed-tradein-otoxpert.mjs --serviceAccount "<path.json>" --commit
 *
 * Flags:
 *   --count <n>   jumlah baris (default 8)
 *   --seed <n>    seed RNG, ganti untuk dapat kombinasi lain (default 20260803)
 *   --batch "<s>" label importBatch (default OTOXPERT-SEED-<tanggal>)
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getArg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const hasFlag = (n) => process.argv.includes(`--${n}`)

// RNG deterministik (mulberry32) — hasilnya acak tapi bisa diulang.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const serviceAccountPath = getArg('serviceAccount')
const count = Number(getArg('count', 8)) || 8
const seed = Number(getArg('seed', 20260803)) || 20260803
const commit = hasFlag('commit')
const dryRun = !commit

if (!serviceAccountPath) {
  console.error('Wajib: --serviceAccount <path.json>')
  process.exit(1)
}
const absSa = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.join(__dirname, '..', serviceAccountPath)
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(absSa, 'utf8'))) })
const db = admin.firestore()

const importBatch = String(
  getArg('batch', `OTOXPERT-SEED-${new Date().toISOString().slice(0, 10)}`),
)

// ── Bahan ────────────────────────────────────────────────────────────────────
// Nama depan & marga khas Minahasa / Sulawesi Utara.
const FIRST = [
  'Recky', 'Vanny', 'Chrisye', 'Jeandry', 'Meilani', 'Rivaldo', 'Gladys', 'Ferdinand',
  'Olivia', 'Yudha', 'Priscilia', 'Reynaldo', 'Marchelia', 'Denny', 'Sintia', 'Gerald',
  'Tesalonika', 'Rendy', 'Chindy', 'Jefri', 'Angelia', 'Boy', 'Feronika', 'Steven',
]
const LAST = [
  'Rondonuwu', 'Mandagi', 'Sompotan', 'Waworuntu', 'Tinangon', 'Karamoy', 'Supit',
  'Gerungan', 'Pandeirot', 'Lasut', 'Kumaat', 'Sigar', 'Kaligis', 'Angkouw', 'Manueke',
  'Pinontoan', 'Rotinsulu', 'Lolowang', 'Momuat', 'Wagey', 'Kojongian', 'Tuerah',
  'Sepang', 'Paat',
]

// Unit bekas yang wajar beredar di Manado. Nama model sengaja ditulis seperti
// diketik orang: singkat, campur, kadang tanpa merk.
const UNITS = [
  { model: 'Avanza G 1.3', merk: 'Toyota', tr: 'Manual', yr: [2013, 2019], harga: [95, 145] },
  { model: 'Calya G AT', merk: 'Toyota', tr: 'Matic', yr: [2016, 2022], harga: [95, 140] },
  { model: 'Agya 1.2 G', merk: 'Toyota', tr: 'Manual', yr: [2017, 2023], harga: [90, 135] },
  { model: 'Rush S GR 1.5', merk: 'Toyota', tr: 'Matic', yr: [2018, 2022], harga: [175, 235] },
  { model: 'Sigra R deluxe', merk: 'Daihatsu', tr: 'Manual', yr: [2016, 2022], harga: [85, 130] },
  { model: 'Xenia 1.3 X', merk: 'Daihatsu', tr: 'Manual', yr: [2014, 2020], harga: [95, 150] },
  { model: 'Terios X deluxe', merk: 'Daihatsu', tr: 'Matic', yr: [2016, 2021], harga: [145, 195] },
  { model: 'Brio satya E', merk: 'Honda', tr: 'Manual', yr: [2017, 2022], harga: [110, 150] },
  { model: 'Mobilio E cvt', merk: 'Honda', tr: 'Matic', yr: [2015, 2020], harga: [120, 165] },
  { model: 'Ertiga GL', merk: 'Suzuki', tr: 'Manual', yr: [2015, 2021], harga: [110, 160] },
  { model: 'Xpander ultimate', merk: 'Mitsubishi', tr: 'Matic', yr: [2018, 2022], harga: [175, 225] },
  { model: 'Innova reborn G', merk: 'Toyota', tr: 'Manual', yr: [2016, 2020], harga: [235, 310] },
]

// Warna ditulis apa adanya seperti entri manual — termasuk yang tidak baku.
const COLORS = [
  'Putih', 'Silver', 'Hitam', 'Silver metalic', 'Abu abu', 'Merah', 'Putih mutiara',
  'Abu-abu metalik', 'Hitam metalik', 'Coklat',
]
const NEW_CARS = [
  'Avanza', 'Veloz', 'Calya', 'Agya', 'Rush', 'Raize', 'Innova Zenix', 'Yaris Cross',
  'Avanza veloz', 'Rush GR', 'Calya G',
]
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const WA_PREFIX = ['812', '813', '821', '822', '823', '852', '853', '895', '896', '811']
const NOTES = [
  '', '', '', 'unit masih bagus, minus lecet halus',
  'nego di tempat', 'nunggu kabar dari owner', '', 'pajak baru diperpanjang',
]
const PLATE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const between = (r, a, b) => a + Math.floor(r() * (b - a + 1))
const dot = (n) => n.toLocaleString('id-ID')

/**
 * Ambil dari tumpukan yang sudah dikocok, bukan undi ulang tiap kali.
 *
 * Pengundian bebas gampang menghasilkan kluster yang justru terlihat palsu —
 * pada percobaan pertama satu warna keluar 5 dari 8 baris. Dengan cara ini tiap
 * nilai habis dulu sebelum daftarnya diisi ulang, jadi sebarannya wajar.
 */
function dealer(r, arr) {
  let deck = []
  return () => {
    if (!deck.length) {
      deck = [...arr]
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1))
        ;[deck[i], deck[j]] = [deck[j], deck[i]]
      }
    }
    return deck.pop()
  }
}

async function main() {
  // Hindari bentrok dengan data yang sudah ada.
  const [idxSnap, reqSnap] = await Promise.all([
    db.collection('tradein_plate_index').get(),
    db.collection('tradein_requests').get(),
  ])
  const takenPlates = new Set(idxSnap.docs.map((d) => d.id))
  const takenWa = new Set()
  const takenNames = new Set()
  reqSnap.forEach((d) => {
    const r = d.data()
    const wa = String(r.customerWaKey || '').replace(/\D/g, '')
    if (wa) takenWa.add(wa)
    const n = String(r.customerName || '').toUpperCase().replace(/\s+/g, ' ').trim()
    if (n) takenNames.add(n)
  })

  const r = rng(seed)
  const rows = []
  const usedNames = new Set()

  // Semua nilai yang mudah terlihat berulang diambil dari tumpukan terkocok.
  const dealFirst = dealer(r, FIRST)
  const dealLast = dealer(r, LAST)
  const dealColor = dealer(r, COLORS)
  const dealUnit = dealer(r, UNITS)
  const dealNewCar = dealer(r, NEW_CARS)
  const dealNote = dealer(r, NOTES)

  let guard = 0
  while (rows.length < count && guard++ < 500) {
    const nama = `${dealFirst()} ${dealLast()}`
    const namaKey = nama.toUpperCase()
    if (takenNames.has(namaKey) || usedNames.has(namaKey)) continue
    usedNames.add(namaKey)

    // Plat DB + 4 digit + 2 huruf, dipastikan belum terpakai.
    let plateKey = ''
    do {
      plateKey = `DB${between(r, 1000, 9999)}${pick(r, PLATE_LETTERS.split(''))}${pick(r, PLATE_LETTERS.split(''))}`
    } while (takenPlates.has(plateKey))
    takenPlates.add(plateKey)
    // Sebagian ditulis berspasi, sebagian tidak — seperti entri manual yang ada.
    const plateNumber =
      r() < 0.45 ? `${plateKey.slice(0, 2)} ${plateKey.slice(2, 6)} ${plateKey.slice(6)}` : plateKey

    // WA unik.
    let wa = ''
    do {
      wa = `62${pick(r, WA_PREFIX)}${String(between(r, 10000000, 99999999))}`
    } while (takenWa.has(wa))
    takenWa.add(wa)

    const u = dealUnit()
    const year = between(r, u.yr[0], u.yr[1])
    const umur = Math.max(1, 2026 - year)
    const km = Math.round((umur * between(r, 9000, 19000)) / 100) * 100

    // Harga: turun mengikuti umur unit, lalu dibulatkan ke jutaan.
    const spanTahun = u.yr[1] - u.yr[0] || 1
    const posisi = (year - u.yr[0]) / spanTahun
    const midJuta = Math.round(u.harga[0] + posisi * (u.harga[1] - u.harga[0]))
    const expectJuta = midJuta + between(r, 3, 12)
    const estLow = (midJuta - between(r, 4, 10)) * 1_000_000
    const estHigh = (midJuta + between(r, 2, 8)) * 1_000_000

    // Tanggal acak Juni–Juli 2026, jam kerja, detik 00 (mengikuti data yang ada).
    const bulan = r() < 0.5 ? 5 : 6 // 5=Juni, 6=Juli
    const tgl = between(r, 1, bulan === 5 ? 30 : 31)
    const jam = between(r, 8, 16)
    const menit = between(r, 0, 59)
    const createdAt = new Date(2026, bulan, tgl, jam, menit, 0)

    rows.push({
      customerUid: '',
      customerWaKey: wa,
      customerPhone: wa,
      customerName: nama,
      merk: u.merk,
      merkModel: u.model,
      transmission: u.tr,
      carType: `${u.model} ${u.tr}`,
      year: String(year),
      color: dealColor(),
      km: dot(km),
      stnkMonth: pick(r, BULAN),
      bpkbStatus: 'Tersedia',
      plateNumber,
      plateKey,
      expectLowPrice: dot(expectJuta * 1_000_000),
      newCarModel: dealNewCar(),
      salesName: '',
      estimateLow: estLow,
      estimateHigh: estHigh,
      estimateNotes: dealNote(),
      fixedPrice: null,
      cancelReason: '',
      adminStage: 'contacted',
      status: 'contacted',
      sourceChannel: 'second',
      acquisitionChannel: 'second',
      importSource: 'seed-otoxpert',
      importBatch,
      _createdAt: createdAt,
    })
  }

  console.log('=============================================')
  console.log(`Mode        : ${dryRun ? 'DRY-RUN (tidak menulis)' : 'COMMIT'}`)
  console.log(`Batch       : ${importBatch}`)
  console.log(`Seed RNG    : ${seed}`)
  console.log(`Jumlah baris: ${rows.length}`)
  console.log('=============================================\n')
  for (const p of rows) {
    console.log(
      `${p.customerName.padEnd(24)} | ${p.plateNumber.padEnd(12)} | ${`${p.merkModel} ${p.year}`.padEnd(26)} | ` +
      `${p.color.padEnd(17)} | KM ${String(p.km).padStart(7)} | ${p.customerWaKey} | ` +
      `est ${dot(p.estimateLow / 1e6)}–${dot(p.estimateHigh / 1e6)}jt | ${p._createdAt.toLocaleString('id-ID')}`,
    )
  }

  if (dryRun) {
    console.log('\nDRY-RUN selesai. Jalankan ulang dengan --commit untuk menulis.')
    process.exit(0)
  }

  let ok = 0
  let failed = 0
  for (const p of rows) {
    const { _createdAt, ...doc } = p
    const createdAt = admin.firestore.Timestamp.fromDate(_createdAt)
    const reqRef = db.collection('tradein_requests').doc()
    const idxRef = db.collection('tradein_plate_index').doc(p.plateKey)
    try {
      await db.runTransaction(async (tx) => {
        const s = await tx.get(idxRef)
        if (s.exists) throw new Error(`Duplicate plateKey: ${p.plateKey}`)
        tx.set(reqRef, { ...doc, createdAt })
        tx.set(idxRef, {
          plateKey: p.plateKey,
          requestId: reqRef.id,
          customerWaKey: p.customerWaKey,
          customerUid: '',
          createdAt,
        })
      })
      ok++
      console.log(`✅ ${reqRef.id}  ${p.customerName} - ${p.plateNumber}`)
    } catch (e) {
      failed++
      console.error(`❌ ${p.customerName}: ${e?.message || e}`)
    }
  }
  console.log(`\nDONE. OK=${ok}, Failed=${failed}`)
  process.exit(0)
}

await main()
