import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy Service History ke backend Hasjrat (Railway) saat dev, untuk bypass CORS.
    proxy: {
      '/api/external': {
        target: 'https://cr-report-backend-production.up.railway.app',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
