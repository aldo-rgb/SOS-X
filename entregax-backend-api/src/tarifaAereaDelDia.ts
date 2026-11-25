/**
 * La tarifa general aérea que estaba vigente el día en que la guía se recibió
 * en China.
 *
 * LA CASA COTIZA CON LA TARIFA DEL DÍA DE RECEPCIÓN, no con la de hoy. Eso ya
 * está resuelto para el tipo de cambio (tarea 1086) y la fecha se saca del
 * mismo lugar: viaja dentro del número de guía, que es como la casa ya lo lee
 * —"el lote del 13.11.26"—. Para el precio por kilo no estaba: se leía
 * `air_tariffs`, que solo guarda la vigente.
 *
 * Por qué importa tanto. El manifiesto del MAWB no se carga el día que la carga
 * entra a la bodega de China: tarda de 2 a 7 días, y el costeo pasa cuando se
 * carga. El costo de la ruta se mueve cada semana, y entre el 17 y el 24 de
 * noviembre de 2026 subió de $9.40 a $12.50 por kilo. Medido el 24-nov-2026
 * sobre las guías aéreas costeadas en noviembre, contando solo el efecto de la
 * fecha: 82 guías de 21 clientes se cobraron con una tarifa posterior a la de
 * su propio lote, $6,018.16 USD de más —el lote del 13 de noviembre se coteó
 * el 19 a $20.90 cuando su día valía $18.40 (tarea 1115)—. En contra solo hay
 * $373.30 USD, de lotes de finales de octubre en que el costo bajó.
 *
 * De dónde sale la tarifa de una fecha, en este orden:
 *
 *  1. `air_tariff_history`, que se escribe desde hoy cada vez que la operación
 *     guarda el tarifario. Es la única fuente que no se reconstruye.
 *  2. Si esa fecha es anterior al historial, se RECONSTRUYE: el costo de la
 *     ruta que estaba vigente ese día (`air_route_price_history`, completo
 *     desde marzo) más el margen de hoy. El margen no vive en ninguna tabla
 *     —está metido en la tarifa general, Logo = costo + $9, Genérico + $8,
 *     Flat + $7— así que se saca de la resta entre el tarifario y el costo
 *     vigentes. Reproduce exactamente los $18.40 del 13 de noviembre.
 *  3. Si no se puede ninguna de las dos, la vigente: lo que se hacía antes.
 *
 * No se rellena el historial hacia atrás con lo reconstruido: un número
 * derivado no se guarda como si alguien lo hubiera teclado.
 */

type Db = { query: (sql: string, params?: any[]) => Promise<any> };

const num = (v: any): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

export interface TarifaDelDia {
  precio: number;
  /** Para el log y la pantalla: de dónde salió el número. */
  origen: string;
}

/**
 * Deja escrito un renglón del tarifario. Se llama cuando la operación guarda
 * el tarifario de una ruta, solo si el precio de ese tipo cambió.
 */
export async function registrarTarifaEnHistorial(
  db: Db,
  routeId: number,
  tipo: string,
  precio: number,
  quien: number | null,
  notas?: string | null,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO air_tariff_history (route_id, tariff_type, price_per_kg, changed_by, changed_at, notes)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [routeId, tipo, precio, quien, notas || null],
    );
  } catch (e: any) {
    // Que no se pueda guardar el historial no debe tumbar el guardado del
    // tarifario: la pantalla seguiría funcionando como antes.
    console.warn('[tarifa-del-dia] no pude guardar el historial del tarifario:', e?.message);
  }
}

/** La tarifa general vigente hoy, que es el último recurso. */
async function tarifaVigente(db: Db, routeId: number, tipo: string): Promise<number> {
  const r = await db.query(
    `SELECT price_per_kg FROM air_tariffs
      WHERE route_id = $1 AND tariff_type = $2 AND is_active = true LIMIT 1`,
    [routeId, tipo],
  );
  return num(r.rows[0]?.price_per_kg);
}

/**
 * La tarifa general de una ruta y un tipo en una fecha.
 *
 * @param fecha 'YYYY-MM-DD'. Si viene vacía devuelve la vigente, igual que antes.
 */
export async function tarifaGeneralDelDia(
  db: Db,
  routeId: number | null,
  tipo: string,
  fecha: string | null,
): Promise<TarifaDelDia> {
  if (!routeId || !tipo) return { precio: 0, origen: 'sin ruta' };
  const vigente = await tarifaVigente(db, routeId, tipo);
  if (!fecha) return { precio: vigente, origen: 'tarifario vigente' };

  try {
    // 1) El tarifario tal como estaba ese día.
    const h = await db.query(
      `SELECT price_per_kg, to_char(changed_at, 'YYYY-MM-DD') AS dia
         FROM air_tariff_history
        WHERE route_id = $1 AND tariff_type = $2 AND changed_at::date <= $3::date
        ORDER BY changed_at DESC LIMIT 1`,
      [routeId, tipo, fecha],
    );
    const delHistorial = num(h.rows[0]?.price_per_kg);
    if (delHistorial > 0) {
      return {
        precio: delHistorial,
        origen: `tarifario del ${h.rows[0].dia}`,
      };
    }

    // 2) Reconstruida: el costo de la ruta de ese día + el margen de hoy.
    const c = await db.query(
      `SELECT cost_per_kg_usd, to_char(changed_at, 'YYYY-MM-DD') AS dia
         FROM air_route_price_history
        WHERE route_id = $1 AND changed_at::date <= $2::date
        ORDER BY changed_at DESC LIMIT 1`,
      [routeId, fecha],
    );
    const costoDeEseDia = num(c.rows[0]?.cost_per_kg_usd);
    const r = await db.query(`SELECT cost_per_kg_usd FROM air_routes WHERE id = $1`, [routeId]);
    const costoDeHoy = num(r.rows[0]?.cost_per_kg_usd);
    if (costoDeEseDia > 0 && costoDeHoy > 0 && vigente > 0) {
      const margen = +(vigente - costoDeHoy).toFixed(2);
      const precio = +(costoDeEseDia + margen).toFixed(2);
      if (precio > 0) {
        return {
          precio,
          origen: `costo de la ruta del ${c.rows[0].dia}`
            + ` ($${costoDeEseDia.toFixed(2)}) + margen ${tipo} ($${margen.toFixed(2)})`,
        };
      }
    }
  } catch (e: any) {
    console.warn('[tarifa-del-dia] no pude leer la tarifa de', fecha, '-', e?.message);
  }

  // 3) Como antes.
  return { precio: vigente, origen: 'tarifario vigente' };
}
