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

// Inicializar Sentry antes de cualquier render (no-op si no hay DSN)
initSentry()

const PrivacyPolicyRedirect = () => {
  window.location.replace('https://sos-x-production.up.railway.app/legal/privacy-policy');
  return null;
};

const AccountDeletionRedirect = () => {
  window.location.replace('https://sos-x-production.up.railway.app/eliminar-cuenta');
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
