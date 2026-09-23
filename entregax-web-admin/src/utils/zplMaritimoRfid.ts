/**
 * Etiqueta RFID 4x2" para MARÍTIMO CHINA. Exclusiva de este módulo.
 *
 * Por qué un archivo aparte y no `zplPrint.ts`: ese genera 4x6 y lo usan PO Box
 * y China Aéreo, que ya funcionan. Aquí el tamaño es otro, el contenido es otro
 * y además se graba el chip, así que tocar el de allá sólo podía romper lo que
 * ya sirve.
 *
 * El RFID no existe en la impresión por HTML: grabar el chip sólo se puede
 * mandando ZPL directo a la impresora, por eso marítimo pasa a ZPL cuando el
 * modo RFID está encendido. El layout es el mismo 4x2 que ya se imprimía en
 * papel, para que el operador vea la etiqueta de siempre.
 */

/** 4" x 2" a 203 dpi. */
const ANCHO_DOTS = 812;
const ALTO_DOTS = 406;

/**
 * Franja reservada para el inlay (el chip y su antena).
 *
 * Imprimir encima del inlay deja el código de barras manchado y el calor del
 * cabezal puede dañar el chip, así que esa banda se deja libre. El valor de
 * abajo asume el inlay centrado a lo alto, que es lo habitual en 4x2; si las
 * etiquetas lo traen en otro lado se ajusta aquí y en ningún otro lugar.
 */
const INLAY_Y = 150;
const INLAY_ALTO = 70;

export type EtiquetaMaritima = {
  /** Id de la orden en maritime_orders. Es lo que hace único al EPC. */
  ordenId: number;
  /** Guía de la caja, ej. LOG25CNMX01823-0001. */
  tracking: string;
  /** Guía del embarque sin el número de caja. */
  ordersn: string;
  boxNumber: number;
  totalBoxes: number;
  /** Marca de embarque del cliente. */
  shippingMark: string;
  /** Los dígitos grandes que el operador lee de lejos. */
  referenceDigits: string;
};

const limpiar = (s: string) => String(s || '').replace(/[\^~]/g, ' ');

/**
 * EPC de 96 bits (24 hex) para una caja marítima.
 *
 * Se arma con datos, no con un consecutivo, para que sea reversible: leyendo el
 * chip se sabe qué orden y qué caja es aunque la lectura llegue por fuera del
 * sistema, y reimprimir una etiqueta da el mismo EPC en vez de duplicar el tag.
 *
 *   E5        marca EntregaX
 *   01        servicio marítimo China
 *   8 hex     id de la orden
 *   4 hex     número de caja
 *   8 hex     reservado
 */
export function epcDeCaja(ordenId: number, boxNumber: number): string {
  const orden = Math.max(0, Math.floor(ordenId)).toString(16).toUpperCase().padStart(8, '0').slice(-8);
  const caja = Math.max(0, Math.floor(boxNumber)).toString(16).toUpperCase().padStart(4, '0').slice(-4);
  return `E501${orden}${caja}00000000`;
}

/** Lo contrario de `epcDeCaja`: de un EPC leído, a qué caja es. */
export function cajaDeEpc(epc: string): { ordenId: number; boxNumber: number } | null {
  const hex = String(epc || '').trim().toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 24 || !hex.startsWith('E501')) return null;
  const ordenId = parseInt(hex.slice(4, 12), 16);
  const boxNumber = parseInt(hex.slice(12, 16), 16);
  if (!Number.isFinite(ordenId) || !Number.isFinite(boxNumber) || ordenId <= 0) return null;
  return { ordenId, boxNumber };
}

/**
 * ZPL de una etiqueta 4x2 con el chip grabado.
 *
 * `^RS8` pone la impresora en Gen2 y `^RFW,H` escribe el EPC en hexadecimal.
 * Los tres reintentos y el `Y` final hacen que, si un tag sale malo, la ZT411
 * lo marque como VOID y repita en el siguiente: es preferible perder una
 * etiqueta a que una caja viaje con un chip vacío que nadie detecta hasta la
 * bodega.
 */
export function zplEtiquetaMaritima(e: EtiquetaMaritima, conChip: boolean = true): string {
  const epc = epcDeCaja(e.ordenId, e.boxNumber);
  const tracking = limpiar(e.tracking);
  const trackingSinGuiones = tracking.replace(/-/g, '');
  const marca = limpiar(e.shippingMark) || '—';
  const refDigits = limpiar(e.referenceDigits);
  const cajaDe = `${e.boxNumber}/${e.totalBoxes}`;

  // Sin el módulo RFID instalado, la ZT411 no puede grabar: mandarle ^RFW le
  // hace reportar error y puede dejar el trabajo a medias. Por eso los comandos
  // del chip sólo van cuando de verdad hay con qué escribirlo; el resto de la
  // etiqueta sale igual, con su franja de inlay respetada, así el diseño se
  // prueba hoy y el día que llegue el módulo no cambia nada de lo impreso.
  const bloqueRfid = conChip
    ? `^RS8,,,3,Y\n^RFW,H^FD${epc}^FS\n`
    : '';

  return `^XA
^PW${ANCHO_DOTS}
^LL${ALTO_DOTS}
^LH0,0
^CI28

${bloqueRfid}
^FO20,18^A0N,26,26^FDMARITIMO^FS
^FO190,8^A0N,46,46^FD${refDigits}^FS
^FO640,12^A0N,44,44^FD${cajaDe}^FS

^FO20,64^A0N,60,60^FD${marca}^FS

^FO60,${INLAY_Y + INLAY_ALTO + 10}^BY2,3,70^BCN,70,N,N,N^FD${trackingSinGuiones}^FS
^FO20,${INLAY_Y + INLAY_ALTO + 92}^A0N,28,28^FD${tracking}^FS

${conChip ? `^FO560,${INLAY_Y + INLAY_ALTO + 88}^A0N,20,20^FDRFID ${epc.slice(0, 4)}..${epc.slice(-4)}^FS` : ''}

^XZ`;
}

/**
 * Sólo graba el chip y no imprime nada. Sirve para probar el lector sin gastar
 * etiquetas buenas, o para recuperar una etiqueta cuyo tag salió VOID.
 */
export function zplSoloGrabarChip(ordenId: number, boxNumber: number): string {
  return `^XA
^RS8,,,3,Y
^RFW,H^FD${epcDeCaja(ordenId, boxNumber)}^FS
^XZ`;
}
