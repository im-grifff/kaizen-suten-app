import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy Service History ke backend Hasjrat (Railway) saat dev, untuk bypass CORS.
    // Di produksi/preview, proxy setara diatur lewat rewrite di vercel.json.
    proxy: {
      '/api/external/vehicle-history': {
        target: 'https://cr-report-backend-production.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
