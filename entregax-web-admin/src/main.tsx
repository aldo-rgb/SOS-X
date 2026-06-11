import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import './i18n'
import { initSentry, SentryErrorBoundary } from './sentry'
import App from './App.tsx'
import FirmaAbandonoPage from './pages/FirmaAbandonoPage.tsx'
import TutorialesPage from './pages/TutorialesPage.tsx'
import CotizadorPublico from './pages/CotizadorPublico.tsx'

// Shim para "global is not defined" requerido por @syncfy/authentication-widget en Vite
if (typeof (window as any).global === 'undefined') {
  (window as any).global = window;
}

// ── AUTO-RELOAD ON STALE CHUNK ───────────────────────────────────────────────
// Cuando publicamos un nuevo deploy en Vercel, los nombres de los chunks
// cambian (hash-based). Si el navegador tiene cacheado el index.html viejo,
// pedirá un chunk con hash que ya no existe → Vercel sirve index.html →
// Chrome lanza "Failed to load module script: Expected JS-Wasm…" y la pantalla
// queda en blanco. Detectamos el error UNA vez y forzamos un reload limpio.
// Sólo en producción para no interferir con HMR de Vite en dev.
if (import.meta.env.PROD) {
  const RELOAD_FLAG = 'entregax_chunk_reload_once';
  const isChunkError = (msg?: string) =>
    !!msg && (
      msg.includes('Failed to load module script') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module')
    );

  const safeReload = () => {
    // Evita loops si el reload tampoco arregla nada.
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, '1');
    // Pequeño delay para que Sentry alcance a enviar el error antes del reload.
    setTimeout(() => window.location.reload(), 50);
  };

  window.addEventListener('error', (e) => {
    if (isChunkError(e.message)) safeReload();
  });
  window.addEventListener('unhandledrejection', (e) => {
    const msg = (e.reason && (e.reason.message || String(e.reason))) || '';
    if (isChunkError(msg)) safeReload();
  });

  // Si llegamos al render sin error, limpiar el flag para que en el próximo
  // deploy roto el reload vuelva a estar disponible.
  setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 5000);
}

// Inicializar Sentry antes de cualquier render (no-op si no hay DSN)
initSentry()

const PrivacyPolicyRedirect = () => {
  window.location.replace('https://api.entregax.app/legal/privacy-policy');
  return null;
};

const AccountDeletionRedirect = () => {
  window.location.replace('https://api.entregax.app/eliminar-cuenta');
  return null;
};

if (import.meta.env.PROD) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SentryErrorBoundary fallback={<div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h2>Ocurrió un error</h2>
      <p>Hemos sido notificados. Recarga la página o intenta de nuevo en unos minutos.</p>
    </div>}>
    <BrowserRouter>
      <Routes>
        {/* Ruta pública para firma de abandono */}
        <Route path="/firma-abandono/:token" element={<FirmaAbandonoPage />} />
        {/* Ruta pública para tutoriales */}
        <Route path="/tutoriales" element={<TutorialesPage />} />
        {/* Ruta pública para cotizador */}
        <Route path="/cotizador" element={<CotizadorPublico />} />
        {/* Política de privacidad - redirige al backend */}
        <Route path="/privacy-policy" element={<PrivacyPolicyRedirect />} />
        {/* Eliminación de cuenta (Google Play / App Store) - redirige al backend */}
        <Route path="/eliminar-cuenta" element={<AccountDeletionRedirect />} />
        <Route path="/account-deletion" element={<AccountDeletionRedirect />} />
        {/* App principal */}
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
    </SentryErrorBoundary>
  </StrictMode>,
)
