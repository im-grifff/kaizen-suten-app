const WA = {
  nomor_sales: '6285712345678',
  nomor_inspeksi: '6285712349999',
  nomor_SA: '6285712350000',
}

export const demoCars = [
  {
    id: 'avanza-1-5',
    namaMobil: 'Avanza 1.5 G',
    otr: 221500000,
    imageLabel: 'Avanza',
  },
  {
    id: 'agya-1-2',
    namaMobil: 'Agya 1.2 TRD',
    otr: 160900000,
    imageLabel: 'Agya',
  },
  {
    id: 'innova-zenix',
    namaMobil: 'Innova Zenix 2.0',
    otr: 529900000,
    imageLabel: 'Innova',
  },
  {
    id: 'raize-1-2',
    namaMobil: 'Raize 1.2 Turbo',
    otr: 271900000,
    imageLabel: 'Raize',
  },
]

export function formatIdr(amount) {
  const n = Number(amount || 0)
  return new Intl.NumberFormat('id-ID').format(n)
}

/** Katalog Tshop (demo) — spare part, oli, ban */
export const tshopProducts = [
  {
    id: 'sp-1',
    name: 'Kampas rem depan (set)',
    category: 'spare_part',
    price: 520000,
  },
  {
    id: 'sp-2',
    name: 'Filter udara',
    category: 'spare_part',
    price: 185000,
  },
  {
    id: 'oil-1',
    name: 'Oli mesin 0W-20 (4L)',
    category: 'oli',
    price: 395000,
  },
  {
    id: 'oil-2',
    name: 'Oli transmisi ATF WS (4L)',
    category: 'oli',
    price: 445000,
  },
  {
    id: 'tire-1',
    name: 'Ban 205/55 R16 (1 pcs)',
    category: 'ban',
    price: 1150000,
  },
  {
    id: 'tire-2',
    name: 'Ban 215/60 R17 (1 pcs)',
    category: 'ban',
    price: 1380000,
  },
]

export const tshopCategoryLabels = {
  spare_part: 'Spare Part',
  oli: 'Oli',
  ban: 'Ban',
}

export function getDemoUserSnapshot(phoneE164) {
  const userId = phoneE164
  return {
    userId,
    owner: {
      namaPemilik: 'Budi Santoso',
      alamat: 'Jl. Mawar No. 12, Jakarta',
    },
    vehicle: {
      modelMobil: 'Toyota Raize 1.2 Turbo',
      noPolisi: 'B1234ABC',
      noMesin: 'MTR-0987-XYZ',
      /** PNG di folder public — bisa diganti */
      vehicleImageUrl: '/car-home.png',
    },
    insurancePolis: {
      jenisPolis: 'Comprehensive (All Risk)',
      masaBerlaku: '2026-01-01 s/d 2027-01-01',
      cakupan:
        'Cakupan penuh untuk kerusakan akibat kecelakaan, termasuk TLO (demo).',
    },
    serviceData: {
      nextServiceDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 18)
        .toISOString()
        .slice(0, 10),
    },
    serviceHistory: [
      {
        id: 'svc-1',
        tanggal: '2025-11-02',
        deskripsi: 'Ganti oli & filter',
        rekomendasi: 'Cek kampas rem & rotasi ban',
        status: 'Selesai',
      },
      {
        id: 'svc-2',
        tanggal: '2025-08-17',
        deskripsi: 'Tune up & pengecekan rem',
        rekomendasi: 'Ganti kampas rem (jika tipis) & cuci AC',
        status: 'Selesai',
      },
    ],
    waNumbers: WA,
    promoBanners: [
      {
        id: 'promo-1',
        title: 'Promo DP Ringan',
        subtitle: 'Bebas pilih tenor, proses cepat',
      },
      {
        id: 'promo-2',
        title: 'Servis Hemat',
        subtitle: 'Cek gratis dan potongan sparepart',
      },
      {
        id: 'promo-3',
        title: 'Trade-in Bonus',
        subtitle: 'Tukar tambah unit lama, proses inspeksi mudah',
      },
    ],
  }
}

