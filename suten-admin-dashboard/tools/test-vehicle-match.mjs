/**
 * Uji pencocokan unit ke vehicle_master (vehicleMatch.js).
 *
 * Jalankan: node tools/test-vehicle-match.mjs
 * Tidak menyentuh Firestore sama sekali, jadi tidak memakan kuota baca.
 *
 * Data di bawah adalah baris NYATA yang disalin dari koleksi vehicle_master,
 * kecuali dua baris yang ditandai SINTETIS (dipakai untuk menguji perbaikan
 * lintas-merk Xpander Cross vs CROSS/Datsun).
 */
import { bestInYear, merkConflict, modelScore } from '../src/lib/vehicleMatch.js'

// Baris NYATA yang sudah terbaca dari produksi di sesi ini (disalin apa adanya),
// ditambah SATU baris sintetis (ditandai) untuk menguji perbaikan Xpander.
const R = (merk,model,varian,transmisi,tahun,harga,demand='MM') => ({merk,model,varian,transmisi,tahun,harga_dasar:harga,kode_demand:demand})

const avanza2022 = [
  R('TOYOTA','ALL NEW AVANZA','1.5 G M/T','Manual',2022,185000000),
  R('TOYOTA','ALL NEW AVANZA','VELOZ 1.5 M/T','Manual',2022,206000000),
  R('TOYOTA','ALL NEW AVANZA','VELOZ 1.5 Q CVT','CVT',2022,225000000),
  R('TOYOTA','ALL NEW AVANZA','1.5 G CVT','CVT',2022,198000000),
  R('TOYOTA','ALL NEW AVANZA','1.5 G CVT TSS','CVT',2022,205000000),
  R('TOYOTA','ALL NEW AVANZA','VELOZ 1.5 Q CVT TSS','CVT',2022,240000000),
  R('TOYOTA','ALL NEW AVANZA','1.3 E CVT','CVT',2022,182000000),
  R('TOYOTA','ALL NEW AVANZA','1.3 E M/T','Manual',2022,158000000),
]
const rush2020 = [
  R('TOYOTA','RUSH','1.5 S A/T TRD','Matic',2020,205000000),
  R('TOYOTA','RUSH','1.5 S M/T TRD','Manual',2020,196000000),
]
const y2020mix = [
  ...rush2020,
  R('DATSUN','CROSS','CVT','CVT',2020,102000000),           // nyata
]
const y2021mix = [
  R('DATSUN','CROSS','CVT','CVT',2021,110000000),            // SINTETIS
  R('MITSUBISHI','XPANDER CROSS','1.5 PREMIUM A/T','Matic',2021,255000000), // SINTETIS
]

let ok=0,bad=0
const cek=(nama,dapat,harap)=>{ const p=dapat===harap; if(p)ok++; else bad++; console.log(`  ${p?'OK  ':'GAGAL'} ${nama.padEnd(46)} -> ${dapat}${p?'':'  (harap '+harap+')'}`) }
const pick=(rows,c)=>{const b=bestInYear(rows,c); return b?`${b.model} | ${b.varian} | ${b.harga_dasar}`:'null'}

console.log('=== trim & transmisi harus dibedakan (Avanza 2022) ===')
cek('input "E M/T"',      pick(avanza2022,{merk:'Toyota',model:'Avanza',varian:'E M/T',transmisi:'Manual'}), 'ALL NEW AVANZA | 1.3 E M/T | 158000000')
cek('input "E CVT"',      pick(avanza2022,{merk:'Toyota',model:'Avanza',varian:'E CVT',transmisi:'Matic'}),  'ALL NEW AVANZA | 1.3 E CVT | 182000000')
cek('input "G M/T"',      pick(avanza2022,{merk:'Toyota',model:'Avanza',varian:'G M/T',transmisi:'Manual'}), 'ALL NEW AVANZA | 1.5 G M/T | 185000000')
cek('input "G CVT"',      pick(avanza2022,{merk:'Toyota',model:'Avanza',varian:'G CVT',transmisi:'Matic'}),  'ALL NEW AVANZA | 1.5 G CVT | 198000000')
cek('input "Veloz Q CVT"',pick(avanza2022,{merk:'Toyota',model:'Avanza',varian:'Veloz Q CVT',transmisi:'Matic'}),'ALL NEW AVANZA | VELOZ 1.5 Q CVT | 225000000')

console.log('\n=== nama model tidak lengkap tetap ketemu ===')
cek('model "Avanza" -> ALL NEW AVANZA', pick(avanza2022,{merk:'Toyota',model:'Avanza',varian:'G CVT',transmisi:'Matic'}),'ALL NEW AVANZA | 1.5 G CVT | 198000000')

console.log('\n=== tidak boleh menyeberang merk (bug CROSS/Datsun) ===')
cek('Xpander Cross (Mitsubishi) 2021', pick(y2021mix,{merk:'Mitsubishi',model:'Xpander Cross',varian:'Premium A/T',transmisi:'Matic'}),'XPANDER CROSS | 1.5 PREMIUM A/T | 255000000')
cek('Yaris Cross (Toyota) vs CROSS Datsun', pick(y2020mix,{merk:'Toyota',model:'Yaris Cross',varian:'S CVT',transmisi:'Matic'}),'null')
cek('merkConflict Mitsubishi vs DATSUN', merkConflict('Mitsubishi','DATSUN'), true)
cek('merkConflict Toyota vs TOYOTA', merkConflict('Toyota','TOYOTA'), false)
cek('merkConflict kosong vs DATSUN', merkConflict('','DATSUN'), false)

console.log('\n=== tidak regresi: Rush TRD 2020 tetap benar ===')
cek('Rush TRD Sportivo A/T 2020', pick(y2020mix,{merk:'Toyota',model:'Rush',varian:'TRD Sportivo A/T',transmisi:'Matic'}),'RUSH | 1.5 S A/T TRD | 205000000')

console.log('\n=== alias penulisan ===')
cek('modelScore Xpander vs EXPANDER', modelScore('Xpander','EXPANDER'), 100)
cek('modelScore HR-V vs HRV', modelScore('HR-V','HRV'), 100)
cek('modelScore Gran Max vs GRANMAX', modelScore('Gran Max','GRANMAX'), 100)

console.log(`\nLULUS: ${ok}  GAGAL: ${bad}`)
process.exit(bad?1:0)
