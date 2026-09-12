/**
 * Teléfono normalizado para un enlace wa.me.
 *
 * Mismo criterio que la web: el número puede venir con lada de país o sin ella
 * (788 clientes la tienen guardada y 119 no), así que limpiar solo los signos
 * no basta — hay que dejar siempre 52 + 10 dígitos. Si no encaja en ninguno de
 * los formatos conocidos se devuelve tal cual, sin inventarle lada.
 */
export const waPhone = (raw?: string | null): string => {
  const digitos = String(raw || '').replace(/\D/g, '');
  if (!digitos) return '';
  let n = digitos;
  if (n.length === 13 && n.startsWith('521')) n = n.slice(3);
  else if (n.length === 12 && n.startsWith('52')) n = n.slice(2);
  else if (n.length === 11 && n.startsWith('1')) n = n.slice(1);
  return n.length === 10 ? `52${n}` : digitos;
};
