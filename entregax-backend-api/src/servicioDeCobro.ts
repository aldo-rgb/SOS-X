// ============================================================================
// DE QUÉ SERVICIO ES ESTA ORDEN DE PAGO (tarea 1035)
// ============================================================================
// Las órdenes de pago guardan en `package_ids` los ids de lo que se está
// cobrando. Pero ese id no siempre es de la tabla `packages`: una orden de DHL
// Monterrey guarda ids de `dhl_shipments`, y una marítima de `maritime_orders`.
// Las tres tablas tienen su propio contador, así que el mismo número existe en
// las tres apuntando a cosas distintas de personas distintas.
//
// Quien resolvía el servicio buscaba SOLO en `packages`, y sin mirar de quién
// era el paquete. Un cobro de DHL por $3,686.29 traía el id 1933; en `packages`
// el 1933 es un paquete de China Aéreo de OTRO cliente, así que la orden quedó
// clasificada como aérea. Y como Aéreo China tiene los pagos apagados en
// Ajustes, el candado rechazó el cobro: el cliente no pudo pagar su guía de DHL
// porque un servicio que no estaba usando está desactivado. El 12 de noviembre
// había cuatro órdenes abiertas en esa situación, por $102,035.14 en total.
//
// Aquí se resuelve como lo haría una persona: se busca el id en la tabla de
// cada servicio, siempre acotado AL DUEÑO de la orden, y si no aparece en
// ninguna se usa el servicio que la propia orden trae guardado.
//
// Si aun así no se puede saber, se devuelve null y NO se adivina. Un servicio
// inventado no solo manda el dinero al emisor equivocado: también puede activar
// el candado de un servicio apagado y frenar un cobro legítimo, que es
// justamente lo que pasó.
// ============================================================================

import { pool } from './db';
import { ServiceType } from './services/openpayConfig';

/** service_type como se guarda en la BD → la llave que usan los cobros. */
const A_SERVICIO: Record<string, ServiceType> = {
  POBOX_USA: 'po_box',
  usa_pobox: 'po_box',
  AIR_CHN_MX: 'aereo',
  china_air: 'aereo',
  SEA_CHN_MX: 'maritimo',
  china_sea: 'maritimo',
  maritime: 'maritimo',
  AA_DHL: 'dhl_liberacion',
  dhl: 'dhl_liberacion',
  TDI_EXPRESS: 'terrestre_nacional',
  tdi_express: 'terrestre_nacional',
  national: 'terrestre_nacional',
};

export interface ServicioResuelto {
  /** null = no se pudo saber. Quien llama NO debe adivinar. */
  servicio: ServiceType | null;
  /** El service_type tal como se guarda en pobox_payments. */
  serviceTypeDb: string | null;
  /** De dónde salió, para el log: packages | dhl | maritimo | orden | nada. */
  origen: string;
}

const NADA: ServicioResuelto = { servicio: null, serviceTypeDb: null, origen: 'nada' };

export async function resolverServicioDeCobro(opts: {
  userId?: number | null | undefined;
  ids?: Array<number | string> | null | undefined;
  paymentOrderId?: number | string | null | undefined;
  paymentReference?: string | null | undefined;
}): Promise<ServicioResuelto> {
  const ids = (opts.ids || [])
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  const userId = Number(opts.userId) || null;

  try {
    // 1) Los ids, en la tabla de cada servicio y SIEMPRE del dueño de la orden.
    //    El filtro por dueño es lo que impide confundirse con el mismo número
    //    en otra tabla: un id ajeno nunca es el de esta orden.
    if (ids.length > 0 && userId) {
      const p = await pool.query(
        `SELECT service_type FROM packages
          WHERE id = ANY($1::int[]) AND user_id = $2 AND service_type IS NOT NULL
          LIMIT 1`,
        [ids, userId]
      );
      if (p.rows[0]?.service_type) {
        const db = String(p.rows[0].service_type);
        return { servicio: A_SERVICIO[db] || null, serviceTypeDb: db, origen: 'packages' };
      }

      const d = await pool.query(
        `SELECT 1 FROM dhl_shipments WHERE id = ANY($1::int[]) AND user_id = $2 LIMIT 1`,
        [ids, userId]
      );
      if (d.rows.length) {
        return { servicio: 'dhl_liberacion', serviceTypeDb: 'AA_DHL', origen: 'dhl' };
      }

      const m = await pool.query(
        `SELECT 1 FROM maritime_orders WHERE id = ANY($1::int[]) AND user_id = $2 LIMIT 1`,
        [ids, userId]
      );
      if (m.rows.length) {
        return { servicio: 'maritimo', serviceTypeDb: 'SEA_CHN_MX', origen: 'maritimo' };
      }
    }

    // 2) Lo que la orden trae guardado. Va después de los ids porque el
    //    service_type de la orden se escribió en su momento y puede estar mal
    //    —de hecho así se creó este caso—, mientras que los ids son el cobro
    //    real.
    const ordenId = Number(opts.paymentOrderId) || null;
    const ref = String(opts.paymentReference || '').trim();
    if (ordenId || ref) {
      const o = await pool.query(
        `SELECT service_type FROM pobox_payments
          WHERE ($1::int IS NOT NULL AND id = $1::int)
             OR ($2 <> '' AND payment_reference = $2)
          LIMIT 1`,
        [ordenId, ref]
      );
      const db = o.rows[0]?.service_type ? String(o.rows[0].service_type) : null;
      if (db) return { servicio: A_SERVICIO[db] || null, serviceTypeDb: db, origen: 'orden' };
    }
  } catch (e: any) {
    console.warn('[servicio-de-cobro] no se pudo resolver:', e?.message);
  }

  return { ...NADA };
}
