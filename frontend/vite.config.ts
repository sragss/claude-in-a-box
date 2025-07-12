import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.VITE_DEV_PORT || '5173'),
    host: true,
    proxy: {
      // API routes
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false
      },
      // WebSocket proxy routes
      '/proxy': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        ws: true // Enable WebSocket proxying
      },
      // Test routes
      '/test': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false
      }
    }
  }
})