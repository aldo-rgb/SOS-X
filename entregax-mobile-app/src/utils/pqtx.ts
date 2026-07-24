// Guía CORTA de Paquete Express (PQTX) para MOSTRAR al cliente.
// El national_tracking se guarda como folio (14) + sufijo de caja/pieza (6):
//   'MTY01WE6018254001001' → se muestra 'MTY01WE6018254'.
// Solo para presentación; no cambia el valor operativo (etiqueta física).
export const shortPqtxGuide = (t?: string | null): string => {
  if (!t) return '';
  const m = String(t).trim().match(/^(MTY\d{2}[A-Z]{2}\d{7})\d{6}$/i);
  return m && m[1] ? m[1].toUpperCase() : String(t);
};
