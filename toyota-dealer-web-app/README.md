# SUTEN (React + Vite)

**SUTEN** — TOYOTA TENDEAN MANADO. Mobile-first web app dengan:

- React Router (`react-router-dom`)
- Auth context (Context API)
- **Tshop**: keranjang spare part / oli / ban, konfirmasi pembelian (tanggal ambil + centang yakin) → order tersimpan (demo: `localStorage`, siap diganti Firestore untuk Dashboard admin)
- **Asuransi**: Extend Insurance dengan skema + konfirmasi serupa → request tersimpan (demo: `localStorage`)
- Draft demo mode (tanpa Firebase) atau Firebase Phone Auth + Firestore nanti

## Run locally

```bash
cd toyota-dealer-web-app
npm install
npm run dev
```

## Draft demo mode

Tanpa env Firebase, OTP disimulasi (kode 4 digit, contoh `1234`). Data user & katalog demo di `src/demo/demoData.js`.

Order parts & request asuransi (demo) tersimpan di browser:

- `localStorage` key `siteman_orders_parts`
- `localStorage` key `siteman_orders_insurance_extend`

## Real Firebase mode

Isi `VITE_FIREBASE_*` di `.env` dan `VITE_DEMO_MODE=false`. Lihat `.env.example`.
