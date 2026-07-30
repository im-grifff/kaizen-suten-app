/**
 * Katalog kendaraan untuk saran (autocomplete) di form Trade In.
 * Struktur 3 tingkat: Merk -> Model -> [Tipe].
 *
 * Ini hanya SARAN — field tetap menerima ketikan bebas, jadi katalog tidak perlu
 * lengkap 100%. Fokus lengkap di Toyota (brand dealer); merk lain berisi model umum
 * yang sering muncul sebagai unit trade-in.
 */
export const CAR_CATALOG = {
  Toyota: {
    Agya: ['E M/T', 'E A/T', 'G M/T', 'G A/T', 'G CVT', 'GR M/T', 'GR CVT', 'TRD M/T', 'TRD A/T'],
    Calya: ['E M/T', 'E A/T', 'G M/T', 'G A/T'],
    Avanza: ['E M/T', 'E A/T', 'G M/T', 'G A/T', 'G CVT', 'Veloz M/T', 'Veloz A/T'],
    Veloz: ['Q CVT', 'Q CVT TSS'],
    Rush: ['G M/T', 'G A/T', 'G LUX M/T', 'G LUX A/T', 'S M/T', 'S A/T', 'S GR Sport A/T', 'TRD Sportivo M/T', 'TRD Sportivo A/T'],
    Raize: ['G M/T', 'G A/T', 'GR Sport', 'GR Sport TSS'],
    'Yaris': ['E M/T', 'E A/T', 'G M/T', 'G A/T', 'S GR Sport'],
    'Yaris Cross': ['S HEV', 'S CVT', 'GR Sport HEV'],
    Vios: ['E M/T', 'E A/T', 'G A/T'],
    'Corolla Altis': ['V A/T', 'HEV A/T'],
    'Corolla Cross': ['G A/T', 'HEV A/T'],
    Innova: ['G M/T', 'G A/T', 'V M/T', 'V A/T', 'Venturer A/T'],
    'Innova Reborn': ['G M/T', 'G A/T', 'V A/T', 'Q A/T'],
    'Kijang Innova Zenix': ['G M/T', 'G HEV', 'V HEV', 'Q HEV'],
    Fortuner: ['G M/T', 'G A/T', 'VRZ A/T', 'GR Sport A/T'],
    Hilux: ['Single Cabin M/T', 'Double Cabin G M/T', 'Double Cabin V A/T', 'Rangga'],
    Rangga: ['Std', 'Std Pack'],
    Sienta: ['V M/T', 'V A/T', 'Q CVT'],
    Alphard: ['G A/T', 'X A/T', 'HEV'],
    Voxy: ['CVT'],
    Hiace: ['Commuter', 'Premio'],
    Etios: ['E M/T', 'G M/T', 'Valco M/T'],
  },
  Daihatsu: {
    Ayla: ['1.0 D M/T', '1.0 M M/T', '1.2 R M/T', '1.2 R A/T', '1.2 X M/T', '1.2 X A/T'],
    Sigra: ['D M/T', 'M M/T', 'X M/T', 'X A/T', 'R M/T', 'R A/T'],
    Xenia: ['M M/T', 'X M/T', 'X A/T', 'R M/T', 'R A/T'],
    Terios: ['X M/T', 'X A/T', 'R M/T', 'R A/T'],
    Rocky: ['M M/T', 'R A/T', 'R ADS A/T'],
    Sirion: ['M/T', 'A/T'],
    Gran_Max: ['Pick Up', 'Blind Van', 'Minibus'],
    Luxio: ['D', 'M', 'X'],
  },
  Honda: {
    Brio: ['Satya S M/T', 'Satya E M/T', 'Satya E CVT', 'RS M/T', 'RS CVT'],
    Jazz: ['S M/T', 'S A/T', 'RS M/T', 'RS CVT'],
    Mobilio: ['S M/T', 'E M/T', 'E CVT', 'RS CVT'],
    'BR-V': ['S M/T', 'E M/T', 'E CVT', 'Prestige CVT'],
    'HR-V': ['S CVT', 'E CVT', 'SE CVT', 'RS Turbo'],
    'CR-V': ['2.0 A/T', '1.5 Turbo', 'RS'],
    City: ['E A/T', 'RS CVT', 'Hatchback RS'],
    Civic: ['1.5 Turbo', 'RS'],
    WRV: ['E CVT', 'RS CVT'],
  },
  Suzuki: {
    Ertiga: ['GA M/T', 'GL M/T', 'GL A/T', 'GX M/T', 'GX A/T', 'Sport'],
    'XL7': ['Zeta M/T', 'Zeta A/T', 'Beta A/T', 'Alpha A/T'],
    Baleno: ['M/T', 'A/T'],
    Ignis: ['GL M/T', 'GX A/T'],
    'S-Presso': ['M/T', 'A/T'],
    Carry: ['Pick Up', 'Blind Van'],
    APV: ['GE', 'GX', 'Arena'],
  },
  Mitsubishi: {
    Xpander: ['GLS M/T', 'Exceed M/T', 'Exceed A/T', 'Sport M/T', 'Sport A/T', 'Ultimate A/T'],
    'Xpander Cross': ['M/T', 'A/T', 'Premium A/T'],
    'Pajero Sport': ['GLX M/T', 'Exceed A/T', 'Dakar A/T', 'Dakar Ultimate'],
    Triton: ['GLX M/T', 'Exceed A/T'],
    Mirage: ['GLS M/T', 'GLS A/T', 'Exceed'],
  },
  Nissan: { 'Grand Livina': ['SV', 'XV', 'Highway Star'], Livina: ['E', 'EL', 'VE', 'VL'], March: ['M/T', 'A/T'], 'X-Trail': ['2.0', '2.5'] },
  Datsun: { GO: ['T', 'T Active'], 'GO+': ['Panca T', 'Panca T Active'], Cross: ['M/T', 'CVT'] },
  Isuzu: { Panther: ['LS', 'LM', 'Grand Touring'], 'D-Max': ['Single Cabin', 'Double Cabin'], MU_X: ['4x2', '4x4'] },
  Wuling: { Confero: ['S', 'S ACT'], Cortez: ['C', 'L', 'CT'], Almaz: ['RS', 'Exclusive'], Air_ev: ['Standard', 'Long Range'] },
  Hyundai: { 'Grand i10': [], Stargazer: ['Trend', 'Prime'], Creta: ['Trend', 'Style', 'Prime'], Santa_Fe: [] },
  Kia: { Picanto: [], Rio: [], Seltos: [], Carnival: [] },
  BYD: { Atto3: [], Dolphin: [], Seal: [] },
  Lainnya: {},
}

const norm = (s) => String(s || '').trim().toLowerCase()

/** Daftar semua merk (untuk dropdown Merk). */
export function brandOptions() {
  return Object.keys(CAR_CATALOG).map((b) => b.replace(/_/g, ' '))
}

function findBrandKey(merk) {
  const n = norm(merk)
  if (!n) return null
  return Object.keys(CAR_CATALOG).find((b) => norm(b.replace(/_/g, ' ')) === n) || null
}

function findModelKey(brandKey, model) {
  if (!brandKey) return null
  const models = CAR_CATALOG[brandKey] || {}
  const n = norm(model)
  if (!n) return null
  return Object.keys(models).find((m) => norm(m.replace(/_/g, ' ')) === n) || null
}

/** Model untuk sebuah merk (dropdown Model tersaring per Merk). */
export function modelOptions(merk) {
  const brandKey = findBrandKey(merk)
  if (!brandKey) return []
  return Object.keys(CAR_CATALOG[brandKey] || {}).map((m) => m.replace(/_/g, ' '))
}

/** Tipe untuk sebuah merk+model (dropdown Tipe tersaring per Merk+Model). */
export function typeOptions(merk, model) {
  const brandKey = findBrandKey(merk)
  const modelKey = findModelKey(brandKey, model)
  if (!brandKey || !modelKey) return []
  const types = CAR_CATALOG[brandKey][modelKey]
  return Array.isArray(types) ? types.slice() : []
}
