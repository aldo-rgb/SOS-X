import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import './i18n'
import App from './App.tsx'
import FirmaAbandonoPage from './pages/FirmaAbandonoPage.tsx'
import TutorialesPage from './pages/TutorialesPage.tsx'
import CotizadorPublico from './pages/CotizadorPublico.tsx'

if (import.meta.env.PROD) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Ruta pública para firma de abandono */}
        <Route path="/firma-abandono/:token" element={<FirmaAbandonoPage />} />
        {/* Ruta pública para tutoriales */}
        <Route path="/tutoriales" element={<TutorialesPage />} />
        {/* Ruta pública para cotizador */}
        <Route path="/cotizador" element={<CotizadorPublico />} />
        {/* App principal */}
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
