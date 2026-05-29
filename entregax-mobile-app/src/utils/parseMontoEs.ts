// Parser robusto para montos en es-MX. Maneja:
//   "1360"      → 1360
//   "1,360"     → 1360   (coma como separador de miles)
//   "1.360"     → 1360   (punto como separador de miles, 3 dígitos)
//   "1360.50"   → 1360.5 (punto como decimal)
//   "1,360.50"  → 1360.5
//   "1.360,50"  → 1360.5
// Bug original: Number("1.360".replace(',', '.')) = 1.36 cuando el usuario
// usa el punto como separador de miles (uso común en MX).
export const parseMontoEs = (raw: string, forceDotDecimal = false): number => {
  if (!raw) return NaN;
  let t = String(raw).trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!t) return NaN;
  if (forceDotDecimal) {
    // Modo escáner / formato DHL: el "." siempre es decimal,
    // las "," se eliminan como separadores de miles.
    return parseFloat(t.replace(/,/g, ''));
  }
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decAt = Math.max(lastDot, lastComma);
    t = t.slice(0, decAt).replace(/[.,]/g, '') + '.' + t.slice(decAt + 1).replace(/[.,]/g, '');
  } else if (lastComma >= 0) {
    const after = t.slice(lastComma + 1);
    t = (after.length === 3 && (t.match(/,/g) || []).length === 1)
      ? t.replace(/,/g, '')
      : t.replace(/,/g, '.');
  } else if (lastDot >= 0) {
    const after = t.slice(lastDot + 1);
    if (after.length === 3 && (t.match(/\./g) || []).length === 1) {
      t = t.replace(/\./g, '');
    }
  }
  return parseFloat(t);
};
