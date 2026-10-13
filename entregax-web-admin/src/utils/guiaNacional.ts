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

  // Paquete Express pide la guía en la RUTA, no como parámetro. Con
  // `?guia=...` el sitio abre, pero con el buscador vacío: es un Nuxt con
  // rutas por archivo, así que /rastreo/:guia es la que trae el dato y
  // /rastreo?guia= cae en el índice y lo ignora. Juan lo probó en su navegador
  // y reportó las dos (tarea 751); con curl no se distingue, porque el
  // servidor devuelve el mismo HTML —196,006 bytes— para las dos.
  if (esPaqueteExpress(paqueteria)) return { numero, url: `https://www.paquetexpress.com.mx/rastreo/${q}` };
  if (n.includes('estafeta')) return { numero, url: `https://www.estafeta.com/Herramientas/Rastreo?wayBill=${q}` };
  if (n.includes('fedex')) return { numero, url: `https://www.fedex.com/fedextrack/?trknbr=${q}` };
  if (n.includes('dhl')) return { numero, url: `https://www.dhl.com/mx-es/home/tracking.html?tracking-id=${q}` };
  if (n.includes('ups')) return { numero, url: `https://www.ups.com/track?tracknum=${q}` };
  return { numero, url: null };
};

/**
 * El nombre de la paquetería como se le enseña a una persona.
 *
 * En la base el mismo transportista viene escrito de cuatro formas —
 * "PAQUETE EXPRESS" (1,555 guías), "paquete_express" (824), "Paquete Express"
 * (210) y "pqtx_cod" (35)— y el botón de rastreo las pintaba tal cual, así que
 * a 824 clientes les decía "Rastrear en paquete_express".
 */
export const nombreDePaqueteria = (paqueteria: unknown): string => {
  const n = normalizarPaqueteria(paqueteria);
  if (!n) return 'la paquetería';
  if (esPaqueteExpress(paqueteria)) return 'Paquete Express';
  if (n.includes('estafeta')) return 'Estafeta';
  if (n.includes('fedex')) return 'FedEx';
  if (n.includes('dhl')) return 'DHL';
  if (n.includes('ups')) return 'UPS';
  // Lo demás se capitaliza palabra por palabra: "entrega local" → "Entrega Local".
  return n.replace(/\b[a-záéíóúñ]/g, (c) => c.toUpperCase());
};
