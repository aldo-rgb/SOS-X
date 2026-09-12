/**
 * Teléfono normalizado para un enlace wa.me.
 *
 * Los botones de WhatsApp armaban el enlace como `wa.me/52${phone}` sin mirar
 * si el teléfono YA traía el 52. De los clientes con teléfono, 788 lo tienen
 * guardado con lada de país y 119 sin ella, así que el mismo botón funcionaba
 * con unos y con otros devolvía "el número no es válido" (tarea 578: el asesor
 * no pudo mandar el recordatorio de instrucciones a S3731, cuyo teléfono está
 * guardado como 525513595909 → wa.me/52525513595909).
 *
 * Acepta los cuatro formatos que hay en la base y siempre devuelve 52 + 10
 * dígitos. Si el número no encaja en ninguno, se devuelve tal cual llegó en
 * lugar de inventarle una lada.
 */
export const waPhone = (raw?: string | null): string => {
  const digitos = String(raw || '').replace(/\D/g, '');
  if (!digitos) return '';

  let n = digitos;
  if (n.length === 13 && n.startsWith('521')) n = n.slice(3);   // 521 + 10 (formato viejo de móvil)
  else if (n.length === 12 && n.startsWith('52')) n = n.slice(2); // 52 + 10
  else if (n.length === 11 && n.startsWith('1')) n = n.slice(1);  // 1 + 10

  return n.length === 10 ? `52${n}` : digitos;
};

/** Enlace completo a wa.me, con texto opcional ya codificado. */
export const waLink = (raw?: string | null, texto?: string): string => {
  const tel = waPhone(raw);
  return texto ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : `https://wa.me/${tel}`;
};
