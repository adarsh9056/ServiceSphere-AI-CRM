import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Listen on all interfaces so CI (Playwright using 127.0.0.1) can reach the dev server.
    host: true,
    port: 5173,
    proxy: {
      '/graphql': {
        target: process.env.VITE_PROXY_API || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_PROXY_API || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
