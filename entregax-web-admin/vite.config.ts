import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Hardening de seguridad para producción:
// - Drop de console.* y debugger en build de producción (evita filtrar tokens, IDs y datos de cliente)
// - sourcemap: false (no expone código fuente original en prod)
// - Code splitting de vendors (mejor caching y reduce surface por chunk)
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    pure:
      mode === 'production'
        ? ['console.log', 'console.info', 'console.debug', 'console.warn']
        : [],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'mui-core': ['@mui/material', '@mui/system'],
          'mui-icons': ['@mui/icons-material'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
}))
