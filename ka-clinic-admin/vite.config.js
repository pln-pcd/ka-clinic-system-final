import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { devApiPlugin } from './devApiPlugin.js'

// updated at: 2026-09-15
export default defineConfig({
  // devApiPlugin serves /api/* in dev only (apply: 'serve'). On Vercel the
  // real serverless runtime handles those routes and the plugin is inert.
  plugins: [react(), devApiPlugin()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/jspdf-autotable') || id.includes('node_modules/html2canvas')) {
            return 'vendor-pdf';
          }
          if (id.includes('node_modules/firebase/')) {
            return 'vendor-firebase';
          }
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-lucide';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
        }
      }
    }
  }
})

