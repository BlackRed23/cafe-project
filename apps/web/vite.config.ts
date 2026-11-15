import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), { name: 'mock-offline-fonts', transformIndexHtml(html) {
    const provider = process.env.VITE_DATA_PROVIDER ?? loadEnv(mode, process.cwd(), 'VITE_').VITE_DATA_PROVIDER;
    return provider === 'mock' ? html.replace(/<link\b[^>]*https:\/\/fonts\.(googleapis|gstatic)\.com[^>]*>/g, '') : html;
  } }],
  server: {
    proxy: {
      '/api/mock': { target: 'http://127.0.0.1:5100', changeOrigin: true },
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      }
    }
  }
}))
