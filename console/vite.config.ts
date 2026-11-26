import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Where the harness runs in dev (python -m optimus_harness). Change if you use another PORT.
const HARNESS = 'http://127.0.0.1:8787'

// `--mode single` inlines everything into one HTML file for sharing previews.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  // Dev: forward API calls to the harness (python -m optimus_harness), so no CORS setup is needed.
  server: {
    proxy: {
      '/api': { target: HARNESS, changeOrigin: true },
      '/healthz': { target: HARNESS, changeOrigin: true },
    },
  },
}))
