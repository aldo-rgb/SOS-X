/**
 * ¿Este servicio admite que la guía salga POR COBRAR?
 *
 * En carga aérea China la entrega nacional ya está adentro del flete aéreo: el
 * precio por kilo que paga el cliente incluye el tramo de Paquete Express desde
 * CDMX hasta su puerta. Por eso las dos pantallas que cotizan aéreo descuentan
 * esa paquetería a $0 y la marcan "✓ INCLUIDO", y por eso la app trae escrito,
 * desde que existe, que "Por Cobrar" NO aplica a china_air.
 *
 * Aun así salían por cobrar. La regla estaba escrita UNA sola vez, en la
 * pantalla de la app, y comparando contra `shipment_type === 'china_air'` — un
 * valor que esa guía nunca trae: `getMyPackages` manda `shipment_type: 'air'`
 * para TODA la tabla `packages`, y 'air' significa PO Box USA en este código.
 * La guardia nunca se cumplía, el portal web no la tenía, el catálogo mapea las
 * tres paqueterías de por cobrar a `china_air` y el backend no revisaba nada.
 *
 * Lo que eso le cuesta al cliente: paga el tramo nacional dentro del flete
 * aéreo y lo vuelve a pagar en la puerta. Medido el 18-nov-2026: 137 guías
 * aéreas salieron por cobrar (126 de ellas en noviembre), de 6 clientes; 125 ya
 * estaban entregadas a la paquetería. Es el TKT-2026-3713.
 *
 * De 58 de esas guías ni siquiera se eligió con cuál paquetería: la app guarda
 * con `selectedCollect || 'pqtx_cod'`, así que al no escoger ninguna decidía
 * Paquete Express Por Cobrar sola y grababa el nombre literal "Por cobrar".
 *
 * Aquí queda la regla una sola vez, por SERVICIO y no por pantalla. Esto no
 * reescribe ninguna guía: aplica de aquí en adelante.
 */

/**
 * Servicios donde la última milla ya viene pagada dentro del flete y por lo
 * tanto NO puede cobrarse otra vez al entregar.
 *
 * OJO con 'air': en este código 'air' es PO Box USA (el `shipment_type` que
 * manda `getMyPackages`), NO aéreo China. No agregarlo aquí.
 *
 * TDI Express (`tdi_express`) sí admite por cobrar y por eso no está en la
 * lista: su flete no incluye el tramo nacional.
 */
const SERVICIOS_CON_ULTIMA_MILLA_INCLUIDA = new Set([
  'china_air',
  'air_chn_mx',
  'tdi_aereo',
  'aereo',
]);

const norm = (s: string | null | undefined): string =>
  String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

/** ¿Es una guía de carga aérea China (en cualquiera de sus nombres)? */
export function esAereoChina(servicio: string | null | undefined): boolean {
  return SERVICIOS_CON_ULTIMA_MILLA_INCLUIDA.has(norm(servicio));
}

/** ¿Este servicio admite envío por cobrar? */
export function admitePorCobrar(servicio: string | null | undefined): boolean {
  return !esAereoChina(servicio);
}

/**
 * Lo que se le dice a quien intenta guardarla por cobrar. Lo lee el cliente en
 * su portal y el asesor en el suyo, así que dice el porqué y qué sí puede
 * elegir, no solo que no se puede.
 */
export const MOTIVO_SIN_POR_COBRAR =
  'En carga aérea China la entrega nacional ya va incluida en el flete aéreo que pagas por kilo. '
  + 'Si la guía sale por cobrar, ese mismo tramo se cobra otra vez al entregar. '
  + 'Elige Paquete Express (va incluido, sin costo extra), EntregaX Local o una paquetería prepagada.';

/**
 * Quita del catálogo las paqueterías de por cobrar cuando el servicio no las
 * admite. Se le pasan los renglones tal cual salen de `carrier_service_options`.
 */
export function filtrarPorCobrar<T extends { allows_collect?: any }>(
  servicio: string | null | undefined,
  filas: T[],
): T[] {
  if (admitePorCobrar(servicio)) return filas;
  return filas.filter((r) => r.allows_collect !== true);
}
