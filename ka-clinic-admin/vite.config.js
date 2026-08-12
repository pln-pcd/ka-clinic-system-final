import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { devApiPlugin } from './devApiPlugin.js'

export default defineConfig({
  // devApiPlugin serves /api/* in dev only (apply: 'serve'). On Vercel the
  // real serverless runtime handles those routes and the plugin is inert.
  plugins: [react(), devApiPlugin()],
  server: {
    port: 5173,
    host: true
  }
})
