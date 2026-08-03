import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Sama seperti toyota-dealer-web-app: proxy Service History ke backend Hasjrat
    // saat dev untuk bypass CORS. Dipakai fitur Re-Appraisal.
    proxy: {
      '/api/external': {
        target: 'https://cr-report-backend-production.up.railway.app',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
