/**
 * El precio por kilo que le toca a un cliente en una ruta aérea.
 *
 * Dos cosas que antes no se podían decir, y por eso la operación terminaba
 * parchando guía por guía con ajustes manuales —que es lo que rompía los saldos
 * (tareas 1070, 1081, 1086, 1092):
 *
 * 1. EL ACUERDO MANDA SOBRE LA DESCRIPCIÓN. El tipo de carga (Logo, Genérico,
 *    Flat) salía de lo que escribe China en la descripción: la regla busca
 *    "logo", "鞋", "zapato". Un cliente con trato FLAT que manda zapatos caía
 *    siempre en Logo, así que su tarifa Flat no se alcanzaba nunca. De las
 *    14,667 guías aéreas del sistema: 9,848 Logo, 4,259 Genérico, 518 Start Up
 *    y CERO Flat. Con `tipo_forzado`, el acuerdo gana.
 *
 * 2. SE GUARDA LA REGLA, NO SU RESULTADO. Los niveles A/B/C son un descuento
 *    sobre la tarifa general, pero se guardaba el número ya calculado. El costo
 *    de la ruta se movió cuatro veces en un mes (9.80 → 9.50 → 9.40 → 11.50 →
 *    11.90) y el número guardado se quedaba quieto, así que el descuento pactado
 *    se convertía en otra cosa sin que nadie lo tocara. Con `nivel`, el precio
 *    se calcula al momento y sigue al costo solo.
 *
 * El margen de cada tipo no vive en ninguna tabla: está metido en la tarifa
 * general (Logo = costo + $9, Genérico + $8, Flat + $7), que la pantalla de
 * administración recalcula cuando cambia el costo. Por eso aquí se parte de la
 * tarifa general y no se vuelve a sumar el margen: así un margen editado a mano
 * también se respeta.
 */

import { pool } from './db';

type Db = { query: (sql: string, params?: any[]) => Promise<any> };

/** Cuánto baja cada nivel sobre la tarifa general, en USD por kilo. */
export const DESCUENTO_POR_NIVEL: Record<string, number> = { A: 0, B: 1, C: 2 };

export interface TarifaResuelta {
  /** Tipo con el que se va a cobrar. Puede no ser el que sugirió la descripción. */
  tipo: string;
  pricePerKg: number;
  /** ¿Salió de un acuerdo con el cliente, o de la tarifa general? */
  esDeCliente: boolean;
  /** Para el log: de dónde salió el número. */
  origen: string;
}

const num = (v: any): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Tarifa general vigente de una ruta y un tipo. */
async function tarifaGeneral(db: Db, routeId: number, tipo: string): Promise<number> {
  const r = await db.query(
    `SELECT price_per_kg FROM air_tariffs
      WHERE route_id = $1 AND tariff_type = $2 AND is_active = true LIMIT 1`,
    [routeId, tipo],
  );
  return num(r.rows[0]?.price_per_kg);
}

/**
 * Resuelve tipo y precio para un cliente.
 *
 * @param tipoSugerido El que salió de la descripción de la mercancía.
 * @returns El tipo con el que se cobra y su precio. Nunca lanza: ante cualquier
 *          problema devuelve la tarifa general, que es como funcionaba antes.
 */
export async function resolverTarifaDeCliente(
  db: Db,
  opts: { userId?: number | null; boxId?: string | null; routeId: number | null; tipoSugerido: string },
): Promise<TarifaResuelta> {
  const tipoSugerido = opts.tipoSugerido || 'G';
  const vacio: TarifaResuelta = { tipo: tipoSugerido, pricePerKg: 0, esDeCliente: false, origen: 'sin ruta' };
  if (!opts.routeId) return vacio;

  try {
    // El cliente puede existir como usuario, como cliente del sistema anterior,
    // o como los dos. Se buscan las dos llaves con el mismo casillero.
    let legacyId: number | null = null;
    let box = (opts.boxId || '').trim();
    if (!box && opts.userId) {
      const u = await db.query(`SELECT box_id FROM users WHERE id = $1`, [opts.userId]);
      box = String(u.rows[0]?.box_id || '').trim();
    }
    let userId = opts.userId ?? null;
    if (box) {
      const lc = await db.query(
        `SELECT id FROM legacy_clients WHERE UPPER(box_id) = UPPER($1) LIMIT 1`, [box]);
      legacyId = lc.rows[0]?.id ?? null;
      // Y al reves: si solo vino el casillero, se busca tambien el usuario. Un
      // cliente puede estar en una tabla, en la otra o en las dos, y el acuerdo
      // tiene que encontrarse por cualquiera de las dos puertas.
      if (!userId) {
        const u = await db.query(
          `SELECT id FROM users WHERE UPPER(box_id) = UPPER($1) LIMIT 1`, [box]);
        userId = u.rows[0]?.id ?? null;
      }
    }

    const reglas = await db.query(
      `SELECT tariff_type, price_per_kg, nivel, COALESCE(tipo_forzado, FALSE) AS tipo_forzado
         FROM air_client_tariffs
        WHERE route_id = $3 AND is_active = true
          AND ( ($1::int IS NOT NULL AND user_id = $1::int)
             OR ($2::int IS NOT NULL AND legacy_client_id = $2::int) )
        ORDER BY (user_id = $1::int) DESC`,
      [userId, legacyId, opts.routeId],
    );

    // 1) ¿El acuerdo manda sobre el tipo que sugirió la descripción?
    const forzada = reglas.rows.find((r: any) => r.tipo_forzado === true);
    const tipo = forzada ? String(forzada.tariff_type) : tipoSugerido;

    // 2) La regla de ese tipo
    const regla = reglas.rows.find((r: any) => String(r.tariff_type) === tipo);
    const general = await tarifaGeneral(db, opts.routeId, tipo);

    if (regla) {
      const nivel = String(regla.nivel || '').toUpperCase();
      if (nivel && nivel in DESCUENTO_POR_NIVEL) {
        const precio = +(general - DESCUENTO_POR_NIVEL[nivel]!).toFixed(2);
        if (precio > 0) {
          return {
            tipo, pricePerKg: precio, esDeCliente: true,
            origen: `nivel ${nivel} del cliente (general ${general.toFixed(2)} - ${DESCUENTO_POR_NIVEL[nivel]})`
              + (forzada ? `, tipo ${tipo} forzado por el acuerdo` : ''),
          };
        }
      }
      // Sin nivel: precio fijo pactado, como se guardaba antes.
      const fijo = num(regla.price_per_kg);
      if (fijo > 0) {
        return {
          tipo, pricePerKg: fijo, esDeCliente: true,
          origen: 'precio fijo del cliente' + (forzada ? `, tipo ${tipo} forzado por el acuerdo` : ''),
        };
      }
    }

    // 3) Sin acuerdo: la tarifa general del tipo que toque.
    return { tipo, pricePerKg: general, esDeCliente: false, origen: 'tarifa general' };
  } catch (e: any) {
    console.error('[tarifa-cliente] no pude resolver la tarifa:', e?.message);
    return vacio;
  }
}

/** Atajo con el pool por omisión. */
export const resolverTarifa = (
  opts: { userId?: number | null; boxId?: string | null; routeId: number | null; tipoSugerido: string },
) => resolverTarifaDeCliente(pool, opts);
