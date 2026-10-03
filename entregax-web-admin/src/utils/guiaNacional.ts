/**
 * La guía nacional como la ve una persona: legible, copiable y rastreable.
 *
 * Nació de la tarea 751. Juan Segura: "el número de guía mostrado tiene dígitos
 * de más y al copiar y pegar no puedes buscar la guía". Mostrábamos
 * MTY01WE6538715001001 y la que rastrea es MTY01WE6538715: los seis dígitos
 * finales son el número de caja/pieza, no parte del folio.
 *
 * Había además un botón "Rastrear en…" que para Paquete Express casi nunca
 * salía. Comparaba con `includes('paquete express')` —con espacio— y en la base
 * la clave real es `paquete_express`, `pqtx_cod` o `ptx`: 840 guías vivas se
 * quedaban sin botón. El texto se normaliza antes de comparar, igual que ya se
 * hace en el módulo de etiquetado.
 */

/** Minúsculas, guiones y guiones bajos a espacios. `paquete_express` → `paquete express`. */
export const normalizarPaqueteria = (valor: unknown): string =>
  String(valor || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * El folio de Paquete Express sin el sufijo de caja.
 *
 * Se guarda como folio (14) + pieza (6): 'MTY01WE6538715' + '001001'. Para
 * mostrar y para rastrear va solo el folio. Es el mismo recorte que hace
 * `shortPqtxTracking` en el backend (packageController.ts); si uno cambia, el
 * otro también. Cualquier otra cosa se devuelve tal cual: no se adivina.
 */
export const guiaCortaPqtx = (tracking: unknown): string => {
  const t = String(tracking || '').trim();
  const m = t.match(/^(MTY\d{2}[A-Z]{2}\d{7})\d{6}$/i);
  return m && m[1] ? m[1].toUpperCase() : t;
};

/** ¿Es Paquete Express? Cubre las claves que de verdad existen en la base. */
export const esPaqueteExpress = (paqueteria: unknown): boolean => {
  const n = normalizarPaqueteria(paqueteria);
  return n.includes('paquete express') || n.includes('paqueteexpress')
    || n.includes('paquetexpress') || n.includes('pqtx') || n === 'ptx';
};

/**
 * Lo que hay que enseñar de una guía nacional: el número legible y, si la
 * paquetería tiene rastreo público, a dónde lleva.
 *
 * Devuelve `url: null` cuando la entrega es nuestra (EntregaX Local, eVISA) o
 * la paquetería no publica rastreo: ahí no hay nada que abrir y un enlace roto
 * es peor que ningún enlace.
 */
export const guiaNacionalVisible = (
  paqueteria: unknown,
  tracking: unknown,
): { numero: string; url: string | null } => {
  const numero = esPaqueteExpress(paqueteria) ? guiaCortaPqtx(tracking) : String(tracking || '').trim();
  if (!numero) return { numero: '', url: null };
  const n = normalizarPaqueteria(paqueteria);
  const q = encodeURIComponent(numero);

  // El .com redirige al .com.mx; se usa el destino final para no gastar un salto.
  if (esPaqueteExpress(paqueteria)) return { numero, url: `https://www.paquetexpress.com.mx/rastreo?guia=${q}` };
  if (n.includes('estafeta')) return { numero, url: `https://www.estafeta.com/Herramientas/Rastreo?wayBill=${q}` };
  if (n.includes('fedex')) return { numero, url: `https://www.fedex.com/fedextrack/?trknbr=${q}` };
  if (n.includes('dhl')) return { numero, url: `https://www.dhl.com/mx-es/home/tracking.html?tracking-id=${q}` };
  if (n.includes('ups')) return { numero, url: `https://www.ups.com/track?tracknum=${q}` };
  return { numero, url: null };
};
