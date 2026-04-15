# SUTEN Admin Dashboard

Admin dashboard for SUTEN with 3 roles:

- `root`: Master Admin (all access)
- `supervisor`: CRUD Customers + Pricelist
- `aftersales`: CRUD Customers + Tshop
- `tradein`: view Trade In requests and respond via WhatsApp

## Run locally

```bash
cd suten-admin-dashboard
cp .env.example .env
# fill VITE_FIREBASE_* from your Firebase project settings
npm install
npm run dev
```

## Firebase setup notes

- Create admin users in **Firebase Auth** (Email/Password recommended).
- Assign a role using **custom claims** (claim key `role`).
- Firestore rules starter file is in `firebase/firestore.rules`.

### Set role (custom claims)

1) In Firebase Console, create a **Service Account** key JSON:
- Project settings → Service accounts → **Generate new private key**

2) Save it into this repo (example): `suten-admin-dashboard/serviceAccountKey.json` (do not commit it)

3) Run:

```bash
node tools/set-claims.mjs --serviceAccount "./serviceAccountKey.json" --email "griffinmumu02@gmail.com" --role root
```

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
