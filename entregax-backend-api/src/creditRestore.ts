import { Pool, PoolClient } from 'pg';
import { normalizeServiceForCredit } from './poboxPaymentController';

/**
 * Restauración del crédito por servicio al liquidar una orden pagada a crédito.
 *
 * El crédito NO vive en users.used_credit (ese es el global, casi siempre en 0)
 * sino en user_service_credits, una fila por (user_id, service): 'po_box',
 * 'aereo', 'maritimo', 'dhl_liberacion'. Para devolverle el crédito al cliente
 * hay que saber a QUÉ servicio pertenece la orden.
 *
 * El error clásico es deducirlo de packages.service_type usando los package_ids
 * de la orden. No funciona para DHL: ahí los package_ids apuntan a
 * dhl_shipments, y esos ids COLISIONAN con los de packages. O no encuentra nada
 * (y el crédito no se restaura nunca), o encuentra un paquete ajeno y restaura
 * el crédito del servicio equivocado. Por eso el servicio se resuelve primero
 * desde las fuentes autoritativas de la orden.
 */

type Db = Pool | PoolClient;

/**
 * Resuelve la clave de servicio de crédito de una orden, en orden de confianza:
 *   1. advisor_payment_orders.service_type_cfg  (lo eligió el asesor al crearla)
 *   2. openpay_webhook_logs.service_type        (autoritativo del cobro)
 *   3. packages.service_type                    (último recurso; miente en DHL)
 */
export const resolveCreditService = async (
    db: Db,
    opts: { poboxPaymentId?: number | null; paymentReference?: string | null; packageIds?: number[] }
): Promise<string | null> => {
    const { poboxPaymentId, paymentReference, packageIds } = opts;

    if (poboxPaymentId) {
        const r = await db.query(
            `SELECT service_type_cfg FROM advisor_payment_orders
              WHERE pobox_payment_id = $1 AND service_type_cfg IS NOT NULL
              ORDER BY id DESC LIMIT 1`,
            [poboxPaymentId]
        );
        const svc = normalizeServiceForCredit(r.rows[0]?.service_type_cfg);
        if (svc) return svc;
    }

    if (paymentReference) {
        const r = await db.query(
            `SELECT service_type FROM openpay_webhook_logs
              WHERE transaction_id = $1 AND service_type IS NOT NULL
              ORDER BY id DESC LIMIT 1`,
            [paymentReference]
        );
        const svc = normalizeServiceForCredit(r.rows[0]?.service_type);
        if (svc) return svc;
    }

    const ids = (packageIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    if (ids.length > 0) {
        const r = await db.query(
            `SELECT service_type FROM packages WHERE id = ANY($1) AND service_type IS NOT NULL LIMIT 1`,
            [ids]
        );
        const svc = normalizeServiceForCredit(r.rows[0]?.service_type);
        if (svc) return svc;
    }

    return null;
};

/**
 * Devuelve `amount` al crédito del servicio. Si no se pudo resolver el servicio
 * NO se toca el crédito global: restar de users.used_credit (normalmente 0) haría
 * que la restauración se pierda en silencio y el cliente quede sin crédito, que
 * es exactamente la falla que se está corrigiendo. Se registra en log para que
 * sea visible en vez de desaparecer.
 */
export const restoreServiceCredit = async (
    db: Db,
    opts: {
        userId: number;
        amount: number;
        service: string | null;
        orderRef?: string | number | null;
    }
): Promise<{ restored: boolean; service: string | null }> => {
    const { userId, amount, service, orderRef } = opts;
    if (!userId || !(amount > 0)) return { restored: false, service };

    if (service) {
        const r = await db.query(
            `UPDATE user_service_credits
                SET used_credit = GREATEST(0, COALESCE(used_credit, 0) - $1),
                    is_blocked = CASE WHEN GREATEST(0, COALESCE(used_credit, 0) - $1) <= 0 THEN FALSE ELSE is_blocked END,
                    updated_at = NOW()
              WHERE user_id = $2 AND service = $3`,
            [amount, userId, service]
        );
        if ((r.rowCount || 0) > 0) return { restored: true, service };
    }

    // Sin fila por servicio: usar el crédito global solo si el cliente NO opera
    // con créditos por servicio (si los tiene, el global no es donde vive su saldo).
    const porServicio = await db.query(
        `SELECT 1 FROM user_service_credits WHERE user_id = $1 LIMIT 1`,
        [userId]
    );
    if (porServicio.rowCount === 0) {
        await db.query(
            `UPDATE users
                SET used_credit = GREATEST(0, COALESCE(used_credit, 0) - $1),
                    is_credit_blocked = CASE WHEN GREATEST(0, COALESCE(used_credit, 0) - $1) <= 0 THEN FALSE ELSE is_credit_blocked END
              WHERE id = $2`,
            [amount, userId]
        );
        return { restored: true, service: null };
    }

    console.error(
        `🚨 [restoreServiceCredit] No se pudo devolver $${amount} de crédito al usuario ${userId}` +
        `${orderRef ? ` (orden ${orderRef})` : ''}: servicio no resuelto (${service ?? 'null'}) ` +
        `y el cliente sí tiene créditos por servicio. El crédito queda retenido — revisar la orden.`
    );
    return { restored: false, service };
};
