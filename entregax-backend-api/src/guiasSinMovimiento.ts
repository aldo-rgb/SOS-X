// ─────────────────────────────────────────────────────────────────────────────
//  Guías sin movimiento
// ─────────────────────────────────────────────────────────────────────────────
//
//  El sistema no tiene ningún evento que CIERRE una guía por sí solo. El último
//  estado que la operación escribe sola es el momento en que la caja se le
//  entrega a la paquetería nacional ('shipped'); la entrega al cliente ocurre
//  del otro lado del mostrador de la paquetería y nunca regresa. Lo mismo pasa
//  con las que se quedan 'in_transit' o 'received_cdmx': si nadie vuelve a
//  escanear la caja, el registro se queda ahí para siempre.
//
//  Medido el 17-nov-2026 contra la base viva: 9,804 guías no entregadas, de las
//  cuales 7,340 llevan más de 30 días en el mismo estado, 5,798 más de 60 y
//  4,185 más de 90, repartidas en 286 clientes. El tránsito aéreo normal es de
//  3.9 días (mediana) y 11 días en el percentil 90, así que una guía con 60
//  días en 'in_transit' no es una caja en el aire: es un registro abandonado.
//  De hecho 827 de esas 1,187 aéreas estancadas viajaron en un MAWB cuyas otras
//  cajas YA se recibieron en CDMX — el avión aterrizó, el registro no se movió.
//
//  Este módulo NO cambia ningún registro y NO cierra nada: solo pone número a
//  la antigüedad para que el asesor y los tableros puedan separar "en tránsito"
//  de "sin movimiento desde hace meses". Decidir si esas guías se cierran, y
//  con qué regla, es una decisión de negocio, no de código (tarea 1037).
//
//  Todo vive aquí a propósito: si mañana cambia el umbral o la definición, se
//  toca un solo archivo y los dos tableros lo heredan.

/** Días en el mismo estado a partir de los cuales una guía se considera sin movimiento. */
export const DIAS_SIN_MOVIMIENTO = 30;

/**
 * Estados del historial que SÍ cuentan como movimiento de la caja.
 * 'costo_corregido' y cualquier otro evento administrativo no mueven la caja,
 * así que no deben hacer parecer fresca una guía que no se ha movido.
 */
const ESTADOS_DE_MOVIMIENTO = [
  'received', 'received_china', 'in_transit', 'customs', 'reempacado',
  'received_mty', 'received_cdmx', 'received_gdl', 'received_qro',
  'received_pue', 'received_tij', 'received_mid', 'received_cun',
  'received_leo', 'received_hgo', 'received_cc',
  'ready_pickup', 'shipped', 'dispatched_national', 'out_for_delivery',
  'delivered', 'returned_to_warehouse', 'lost', 'sent', 'processing',
];

const EN_LISTA = ESTADOS_DE_MOVIMIENTO.map(s => `'${s}'`).join(',');

/**
 * Fecha del último movimiento real de la guía. Si no hay historial de
 * movimiento se cae a updated_at y de ahí a created_at, nunca a NULL.
 *
 * @param alias alias de la tabla `packages` en la consulta (normalmente 'p').
 */
export const sqlUltimoMovimiento = (alias = 'p') => `
  COALESCE(
    (SELECT MAX(h.created_at) FROM package_history h
      WHERE h.package_id = ${alias}.id
        AND h.status::text IN (${EN_LISTA})),
    ${alias}.updated_at,
    ${alias}.created_at
  )`;

/**
 * Días enteros que la guía lleva sin moverse. Usa el índice
 * idx_package_history_package_id_created_at, así que sale barato por página
 * (medido: 164 ms para 2,000 guías; las páginas del panel son de 50).
 */
export const sqlDiasSinMovimiento = (alias = 'p') => `
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - ${sqlUltimoMovimiento(alias)})) / 86400))::int`;

/**
 * Condición para filtrar las guías sin movimiento. Una guía entregada o
 * perdida ya terminó su ciclo: no está "estancada", está cerrada.
 */
export const sqlEsSinMovimiento = (alias = 'p', dias = DIAS_SIN_MOVIMIENTO) => `
  (${alias}.status::text NOT IN ('delivered','lost')
   AND ${sqlUltimoMovimiento(alias)} < NOW() - INTERVAL '${Number(dias) || DIAS_SIN_MOVIMIENTO} days')`;

/**
 * La misma condición pero sobre el resultado ya combinado del panel del asesor,
 * donde la columna `dias_sin_movimiento` ya viene calculada. Los carriles que
 * no tienen historial de estados (marítimo, DHL) traen NULL y quedan fuera
 * solos, sin necesidad de enumerarlos.
 */
export const sqlSinMovimientoCombinado = (dias = DIAS_SIN_MOVIMIENTO) =>
  `dias_sin_movimiento >= ${Number(dias) || DIAS_SIN_MOVIMIENTO} AND status NOT IN ('delivered','lost')`;
