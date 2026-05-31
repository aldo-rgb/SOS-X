import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
// Hardening de seguridad para producción:
// - Drop de console.* y debugger en build de producción (evita filtrar tokens, IDs y datos de cliente)
// - sourcemap: false (no expone código fuente original en prod)
// - Code splitting de vendors (mejor caching y reduce surface por chunk)
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Polyfills de Node (crypto, buffer, stream, etc.) requeridos por
    // @syncfy/authentication-widget (usa node:crypto internamente).
    nodePolyfills({
      include: ['crypto', 'buffer', 'stream', 'util', 'process'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  esbuild: {
    // Solo eliminar debugger y console.log/info/debug. Mantener warn/error
    // para poder diagnosticar issues en producción.
    drop: mode === 'production' ? ['debugger'] : [],
    pure:
      mode === 'production'
        ? ['console.log', 'console.info', 'console.debug']
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
