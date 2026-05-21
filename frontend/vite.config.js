import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BACKEND_HOST = 'localhost' locally, 'backend' in Docker
const BACKEND_HOST = process.env.BACKEND_HOST || 'localhost'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3003,
    host: '0.0.0.0',
    proxy: {
      '/api': `http://${BACKEND_HOST}:8000`,
      '/ws': { target: `ws://${BACKEND_HOST}:8000`, ws: true },
    },
  },
})
