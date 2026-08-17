import { Pool, PoolClient } from 'pg';

/**
 * Agrupación de envíos DHL multicaja.
 *
 * Un envío DHL de varias cajas vive como VARIAS filas en dhl_shipments que
 * comparten el mismo secondary_tracking (la guía madre); cada fila lleva su
 * propia guía JJD en inbound_tracking. Las órdenes de pago, en cambio, suelen
 * referenciar UNA sola de esas filas.
 *
 * Por eso cualquier acción a nivel envío (marcar pagado, marcar etiqueta
 * impresa) tiene que expandirse a todas las cajas del grupo. Cuando no se hace,
 * la orden aparece pagada pero la guía sigue "Pendiente" en piso y no se le
 * puede dar salida — que es justo lo que reportó CEDIS MTY.
 *
 * OJO con el criterio: agrupar SOLO por secondary_tracking no es seguro. En
 * producción existe al menos un secondary_tracking compartido por dos clientes
 * distintos, y propagar ahí marcaría pagada la caja de un tercero. Por eso el
 * grupo exige además el mismo user_id.
 */

type Db = Pool | PoolClient;

/**
 * Devuelve los ids de TODAS las cajas del envío al que pertenecen los ids dados
 * (incluidos los originales). Un id sin secondary_tracking se devuelve solo.
 */
export const expandDhlGroupIds = async (db: Db, ids: number[]): Promise<number[]> => {
    const seed = (ids || []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    if (seed.length === 0) return [];

    const r = await db.query(
        `SELECT DISTINCT s.id
           FROM dhl_shipments s
          WHERE s.id = ANY($1::int[])
             OR EXISTS (
                  SELECT 1
                    FROM dhl_shipments seed
                   WHERE seed.id = ANY($1::int[])
                     AND COALESCE(seed.secondary_tracking, '') <> ''
                     AND seed.secondary_tracking = s.secondary_tracking
                     -- mismo cliente: hay secondary_tracking repetidos entre clientes
                     AND seed.user_id IS NOT DISTINCT FROM s.user_id
             )`,
        [seed]
    );
    return r.rows.map((x: any) => Number(x.id));
};

/**
 * Marca como pagadas todas las cajas del envío. `onlyUnpaid` conserva el
 * comportamiento de las rutas que no querían pisar un pago previo.
 * Devuelve los ids realmente afectados (el grupo completo).
 */
export const markDhlGroupPaid = async (
    db: Db,
    ids: number[],
    opts: { onlyUnpaid?: boolean } = {}
): Promise<number[]> => {
    const all = await expandDhlGroupIds(db, ids);
    if (all.length === 0) return [];

    await db.query(
        `UPDATE dhl_shipments
            SET paid_at = CURRENT_TIMESTAMP,
                cost_payment_status = 'paid',
                monto_pagado = COALESCE(total_cost_mxn, saldo_pendiente, 0),
                saldo_pendiente = 0
          WHERE id = ANY($1::int[])
            ${opts.onlyUnpaid ? 'AND paid_at IS NULL' : ''}`,
        [all]
    );
    return all;
};
