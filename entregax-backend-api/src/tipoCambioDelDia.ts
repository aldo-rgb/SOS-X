/**
 * El tipo de cambio del dia en que la guia se recibio en China.
 *
 * La casa cotiza el aereo con el tipo de cambio del DIA DE RECEPCION en China,
 * no con el de hoy: una guia recibida el 10 de noviembre se cobra al tipo de
 * cambio de ese dia (tarea 1086). Hasta ahora eso se hacia a mano, lote por
 * lote, y por eso las cotizaciones salian con el vigente.
 *
 * Faltaba de donde sacarlo: `exchange_rate_config` solo guarda el de HOY, y
 * `exchange_rate_history` solo escribe cuando alguien edita la configuracion a
 * mano —27 filas, la ultima de junio—. Asi que aqui se lleva un renglon por dia
 * y por servicio, que escribe el mismo cron que refresca el tipo de cambio.
 *
 * La fecha de recepcion no vive en ninguna columna: viaja dentro del numero de
 * guia, que es como la casa ya lo lee ("el lote del 09.11.26"). AIR20261110773
 * es del 10 de noviembre de 2026.
 */

type Db = { query: (sql: string, params?: any[]) => Promise<any> };

/** Dias hacia atras que se aceptan cuando un dia no tiene registro propio. */
const DIAS_DE_GRACIA = 7;

/**
 * Deja escrito el tipo de cambio de hoy, uno por servicio. Se llama desde el
 * cron; correrlo varias veces al dia solo actualiza el renglon del dia.
 */
export async function registrarTcDelDia(db: Db): Promise<number> {
  try {
    const r = await db.query(
      `INSERT INTO tipo_cambio_diario (fecha, servicio, tc_api, sobreprecio, tc_final, fuente, updated_at)
       SELECT CURRENT_DATE, servicio, ultimo_tc_api, sobreprecio,
              COALESCE(tipo_cambio_final,
                       COALESCE(tipo_cambio_manual, ultimo_tc_api, 0) + COALESCE(sobreprecio, 0)),
              'cron', NOW()
         FROM exchange_rate_config
        WHERE estado = TRUE
          AND COALESCE(tipo_cambio_final,
                       COALESCE(tipo_cambio_manual, ultimo_tc_api, 0) + COALESCE(sobreprecio, 0)) > 0
       ON CONFLICT (fecha, servicio) DO UPDATE
          SET tc_api = EXCLUDED.tc_api, sobreprecio = EXCLUDED.sobreprecio,
              tc_final = EXCLUDED.tc_final, fuente = EXCLUDED.fuente, updated_at = NOW()`,
    );
    return r.rowCount || 0;
  } catch (e: any) {
    console.warn('[tc-diario] no pude registrar el tipo de cambio de hoy:', e?.message);
    return 0;
  }
}

/**
 * El tipo de cambio de un servicio en una fecha. Si ese dia no tiene registro
 * —un domingo, o un dia anterior a que esto empezara a guardarse— se usa el
 * ultimo anterior dentro de la semana. 0 si no hay ninguno: entonces el que
 * llama se queda con lo que hacia antes, que es el vigente.
 */
export async function tcDelDia(db: Db, servicio: string, fecha: Date | string | null): Promise<number> {
  if (!fecha) return 0;
  try {
    const r = await db.query(
      `SELECT tc_final FROM tipo_cambio_diario
        WHERE servicio = $1 AND fecha <= $2::date AND fecha >= $2::date - $3::int
        ORDER BY fecha DESC LIMIT 1`,
      [servicio, fecha, DIAS_DE_GRACIA],
    );
    return parseFloat(r.rows[0]?.tc_final) || 0;
  } catch (e: any) {
    console.warn('[tc-diario] no pude leer el tipo de cambio de', fecha, '-', e?.message);
    return 0;
  }
}

/**
 * La fecha de recepcion en China que trae el numero de guia aerea.
 * `AIR20261110773-001` → 2026-11-10. null si el numero no la trae.
 */
export function fechaDeRecepcionChina(tracking: string | null | undefined): string | null {
  const m = String(tracking || '').match(/^AIR(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, anio, mes, dia] = m;
  const n = { anio: Number(anio), mes: Number(mes), dia: Number(dia) };
  // Un numero que no es una fecha —y los hay, con otros formatos— no se fuerza.
  if (n.anio < 2024 || n.anio > 2100 || n.mes < 1 || n.mes > 12 || n.dia < 1 || n.dia > 31) return null;
  return `${anio}-${mes}-${dia}`;
}
