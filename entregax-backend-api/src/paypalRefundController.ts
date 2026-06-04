/**
 * Reembolsos PayPal — emite y registra refunds vía
 * `POST /v2/payments/captures/{capture_id}/refund`.
 *
 * Solo usuarios con rol director o superior pueden emitir reembolsos.
 * Cada refund se persiste en `paypal_refunds` para auditoría.
 */

import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from './db';
import { AuthRequest } from './authController';
import {
    getPaypalCredentials,
    getPaypalApiUrl,
    PayPalCredentials,
} from './services/paypalConfig';

const getPayPalToken = async (credentials: PayPalCredentials): Promise<string> => {
    const apiUrl = getPaypalApiUrl(credentials);
    const auth = Buffer.from(`${credentials.clientId}:${credentials.secret}`).toString('base64');
    const r = await axios.post(
        `${apiUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }
    );
    return r.data.access_token;
};

/**
 * POST /api/payments/paypal/refund
 * Body: { captureId: string, amount?: number, currency?: string, reason?: string, noteToPayer?: string }
 *
 * Si `amount` no se pasa, hace refund total. Si se pasa, hace refund parcial.
 */
export const refundPayPalCapture = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = Number(req.user?.userId || 0);
        if (!userId) return res.status(401).json({ error: 'No autenticado' });

        const { captureId, amount, currency, reason, noteToPayer } = req.body || {};

        if (!captureId || typeof captureId !== 'string') {
            return res.status(400).json({ error: 'captureId es requerido' });
        }

        // Buscar el intent que produjo este capture (si existe) para conocer
        // emitter_id, currency, etc.
        const intentRes = await pool.query(
            `SELECT id, paypal_order_id, currency, amount, emitter_id, service_type
               FROM paypal_payment_intents
              WHERE capture_id = $1
              LIMIT 1`,
            [captureId]
        );
        const intent = intentRes.rows[0] || null;

        // Validación: refund parcial no puede ser mayor al monto original.
        if (intent && amount != null) {
            const total = parseFloat(intent.amount);
            if (Number(amount) > total + 0.01) {
                return res.status(400).json({
                    error: `Monto de reembolso (${amount}) excede el monto cobrado (${total})`,
                });
            }
        }

        // Resolver credenciales — preferir la empresa del intent.
        let credentials: PayPalCredentials;
        try {
            credentials = await getPaypalCredentials(intent?.service_type || undefined);
        } catch (credErr: any) {
            return res.status(500).json({ error: 'PayPal no configurado', detail: credErr.message });
        }

        const token = await getPayPalToken(credentials);
        const apiUrl = getPaypalApiUrl(credentials);

        const refundCurrency = currency || intent?.currency || 'MXN';
        const body: any = {};
        if (amount != null) {
            body.amount = { value: Number(amount).toFixed(2), currency_code: refundCurrency };
        }
        if (noteToPayer) body.note_to_payer = String(noteToPayer).slice(0, 255);
        if (reason) body.invoice_id = String(reason).slice(0, 64); // PayPal acepta invoice_id como referencia

        // Idempotencia: PayPal recomienda PayPal-Request-Id único por intento.
        const requestId = `etx-refund-${captureId}-${Date.now()}`;

        // Persistir refund pending antes de llamar a PayPal (para tener constancia
        // si la red falla a mitad).
        const pre = await pool.query(
            `INSERT INTO paypal_refunds (
                capture_id, paypal_order_id, intent_id, amount, currency,
                reason, note_to_payer, status, issued_by_user_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
             RETURNING id`,
            [
                captureId,
                intent?.paypal_order_id || null,
                intent?.id || null,
                amount != null ? Number(amount) : (intent ? parseFloat(intent.amount) : 0),
                refundCurrency,
                reason || null,
                noteToPayer || null,
                userId,
            ]
        );
        const refundRowId = pre.rows[0].id;

        let paypalResp: any;
        try {
            paypalResp = await axios.post(
                `${apiUrl}/v2/payments/captures/${captureId}/refund`,
                body,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'PayPal-Request-Id': requestId,
                        'Prefer': 'return=representation',
                    },
                }
            );
        } catch (httpErr: any) {
            const detail = httpErr.response?.data || { message: httpErr.message };
            await pool.query(
                `UPDATE paypal_refunds
                    SET status = 'failed', raw_response = $1::jsonb, updated_at = NOW()
                  WHERE id = $2`,
                [JSON.stringify(detail), refundRowId]
            );
            console.error('❌ PayPal refund error:', detail);
            return res.status(httpErr.response?.status || 500).json({
                success: false,
                error: detail?.message || 'Error reembolsando en PayPal',
                details: detail?.details || null,
            });
        }

        const refundId = paypalResp.data?.id;
        const refundStatus = String(paypalResp.data?.status || '').toUpperCase();
        const ok = refundStatus === 'COMPLETED' || refundStatus === 'PENDING';

        await pool.query(
            `UPDATE paypal_refunds
                SET refund_id = $1,
                    status = $2,
                    raw_response = $3::jsonb,
                    updated_at = NOW()
              WHERE id = $4`,
            [refundId, ok ? refundStatus.toLowerCase() : 'failed', JSON.stringify(paypalResp.data), refundRowId]
        );

        // Si refund total fue COMPLETED, revertir paquetes y registro de cobranza.
        if (refundStatus === 'COMPLETED' && intent) {
            const refundAmount = parseFloat(paypalResp.data?.amount?.value || '0');
            const intentAmount = parseFloat(intent.amount);
            const isFullRefund = Math.abs(refundAmount - intentAmount) <= 0.01;

            if (isFullRefund) {
                // Marcar paquetes como no pagados nuevamente
                const pkgIds = await pool.query(
                    `SELECT (jsonb_array_elements_text(package_ids))::int AS id
                       FROM paypal_payment_intents WHERE id = $1`,
                    [intent.id]
                );
                const ids = pkgIds.rows.map((r: any) => Number(r.id));
                if (ids.length) {
                    await pool.query(
                        `UPDATE packages
                            SET payment_status = 'refunded',
                                monto_pagado = 0,
                                saldo_pendiente = COALESCE(saldo_pendiente, 0) + $1,
                                costing_paid = FALSE,
                                client_paid = FALSE
                          WHERE id = ANY($2)`,
                        [refundAmount, ids]
                    );
                }

                // Marcar logs de cobranza como reembolsados
                await pool.query(
                    `UPDATE openpay_webhook_logs
                        SET estatus_procesamiento = 'reembolsado'
                      WHERE transaction_id = $1`,
                    [captureId]
                ).catch(() => {});

                // Marcar pobox_payments si aplica
                await pool.query(
                    `UPDATE pobox_payments
                        SET status = 'refunded'
                      WHERE external_transaction_id = $1`,
                    [captureId]
                ).catch(() => {});
            }
        }

        return res.json({
            success: ok,
            refundId,
            status: refundStatus,
            amount: paypalResp.data?.amount?.value,
            currency: paypalResp.data?.amount?.currency_code,
        });
    } catch (error: any) {
        console.error('❌ Error refundPayPalCapture:', error.message);
        res.status(500).json({ error: 'Error procesando reembolso' });
    }
};

/**
 * GET /api/payments/paypal/refunds?captureId=...
 * Lista refunds emitidos (audit). Acceso director+.
 */
export const listPayPalRefunds = async (req: Request, res: Response): Promise<any> => {
    try {
        const captureId = String((req.query as any).captureId || '').trim();
        const limit = Math.min(parseInt(String((req.query as any).limit || '50'), 10) || 50, 200);

        const params: any[] = [];
        let where = '';
        if (captureId) {
            params.push(captureId);
            where = ` WHERE capture_id = $${params.length} `;
        }
        const r = await pool.query(
            `SELECT id, capture_id, refund_id, paypal_order_id, intent_id,
                    amount, currency, reason, status, issued_by_user_id,
                    created_at, updated_at
               FROM paypal_refunds
               ${where}
               ORDER BY id DESC
               LIMIT ${limit}`,
            params
        );
        res.json({ refunds: r.rows });
    } catch (err: any) {
        console.error('listPayPalRefunds error:', err.message);
        res.status(500).json({ error: 'Error al listar reembolsos' });
    }
};
