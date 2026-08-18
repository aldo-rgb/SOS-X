import { Pool, PoolClient } from 'pg';

/**
 * A qué servicio pertenece una orden de pago, y a qué tabla van sus ids.
 *
 * pobox_payments.package_ids guarda ids CRUDOS de tres tablas distintas —
 * packages, dhl_shipments y maritime_orders— y esos ids COLISIONAN entre sí.
 * El id 472 existe en las tres. Sin saber el servicio de la orden es imposible
 * saber a cuál aplicar el pago, y cada consumidor que lo dedujo por su cuenta
 * terminó marcando la guía de otro cliente (TKT-2026-2113: un depósito de DHL
 * marcó pagados dos paquetes aéreos de un tercero).
 *
 * pobox_payments.service_type resuelve esto de raíz: la orden dice a qué
 * servicio pertenece. Las órdenes creadas antes de la columna la tienen en NULL,
 * así que se conservan los respaldos históricos para no romperlas.
 */

type Db = Pool | PoolClient;

export type ServiceKey = 'AA_DHL' | 'SEA_CHN_MX' | 'AIR_CHN_MX' | 'POBOX_USA' | 'TDI_EXPRESS';

/** Normaliza los múltiples alias que usa cada módulo a una sola clave. */
export const normalizeServiceType = (raw: any): ServiceKey | null => {
    if (!raw) return null;
    const s = String(raw).trim().toUpperCase();
    if (['AA_DHL', 'DHL', 'MX_CEDIS', 'DHL_LIBERACION'].includes(s)) return 'AA_DHL';
    if (['SEA_CHN_MX', 'MARITIME', 'CHINA_SEA', 'FCL', 'MARITIMO', 'FCL_CHN_MX'].includes(s)) return 'SEA_CHN_MX';
    if (['AIR_CHN_MX', 'CHINA_AIR', 'AEREO', 'AIR'].includes(s)) return 'AIR_CHN_MX';
    if (['POBOX_USA', 'PO_BOX', 'USA_POBOX'].includes(s)) return 'POBOX_USA';
    if (['TDI_EXPRESS'].includes(s)) return 'TDI_EXPRESS';
    return null;
};

/**
 * Resuelve el servicio de una orden. Orden de confianza:
 *   1. pobox_payments.service_type      — lo declara la propia orden
 *   2. advisor_payment_orders.service_type_cfg — lo eligió el asesor
 *   3. openpay_webhook_logs.service_type       — autoritativo del cobro
 * NUNCA se deduce de packages: esa es justo la fuente que miente cuando el id
 * colisiona. Devuelve null si no se puede determinar — quien llame debe tratar
 * eso como "no tocar nada", no como "asumir packages".
 */
export const resolveOrderService = async (
    db: Db,
    opts: { poboxPaymentId?: number | null; paymentReference?: string | null }
): Promise<ServiceKey | null> => {
    const { poboxPaymentId, paymentReference } = opts;

    if (poboxPaymentId) {
        const r = await db.query(
            `SELECT pp.service_type, apo.service_type_cfg
               FROM pobox_payments pp
               LEFT JOIN advisor_payment_orders apo ON apo.pobox_payment_id = pp.id
              WHERE pp.id = $1
              ORDER BY apo.id DESC LIMIT 1`,
            [poboxPaymentId]
        );
        const svc = normalizeServiceType(r.rows[0]?.service_type)
                 || normalizeServiceType(r.rows[0]?.service_type_cfg);
        if (svc) return svc;
    }

    if (paymentReference) {
        const r = await db.query(
            `SELECT service_type FROM openpay_webhook_logs
              WHERE transaction_id = $1 AND service_type IS NOT NULL
              ORDER BY id DESC LIMIT 1`,
            [paymentReference]
        );
        const svc = normalizeServiceType(r.rows[0]?.service_type);
        if (svc) return svc;
    }

    return null;
};

/**
 * Reparte los ids de una orden en la tabla que les corresponde. Es la única
 * forma correcta de interpretar package_ids: sin el servicio, un id es
 * ambiguo entre tres tablas.
 *
 * `service` null ⇒ los tres arreglos vacíos: quien llame no debe escribir nada.
 */
export const classifyOrderIds = (
    service: ServiceKey | null,
    packageIds: number[]
): { pkgIds: number[]; dhlIds: number[]; marIds: number[] } => {
    const ids = (packageIds || []).map(Number).filter((n) => Number.isFinite(n));
    if (!service || ids.length === 0) return { pkgIds: [], dhlIds: [], marIds: [] };
    if (service === 'AA_DHL') return { pkgIds: [], dhlIds: ids, marIds: [] };
    if (service === 'SEA_CHN_MX') return { pkgIds: [], dhlIds: [], marIds: ids };
    return { pkgIds: ids, dhlIds: [], marIds: [] };
};
