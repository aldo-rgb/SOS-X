/**
 * Webhook PayPal — recibe eventos asíncronos y verifica su firma vía
 * `POST /v1/notifications/verify-webhook-signature`.
 *
 * Eventos que procesamos:
 *   - PAYMENT.CAPTURE.COMPLETED  → confirma cobro (idempotente con callback)
 *   - PAYMENT.CAPTURE.DENIED     → marcar intent como failed
 *   - PAYMENT.CAPTURE.REFUNDED   → revertir paquetes a refunded
 *   - PAYMENT.CAPTURE.REVERSED   → idem refunded
 *   - CUSTOMER.DISPUTE.CREATED   → alerta de chargeback
 *
 * Cada empresa fiscal tiene su propio `paypal_webhook_id`; verificamos
 * contra el primer emitter cuyo webhook_id reciba la firma. Si ninguno
 * verifica → rechazamos el evento.
 */

import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from './db';
import { decryptIfEncrypted } from './services/cryptoVault';
import { getPaypalApiUrl, PayPalCredentials } from './services/paypalConfig';

interface FiscalEmitterRow {
    id: number;
    alias: string;
    paypal_client_id: string;
    paypal_secret: string;
    paypal_sandbox: boolean;
    paypal_webhook_id: string | null;
}

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
 * Llama a la API de PayPal para verificar la firma del webhook contra un
 * webhook_id específico de la empresa fiscal.
 */
const verifyWebhookSignatureForEmitter = async (
    emitter: FiscalEmitterRow,
    headers: Record<string, string>,
    rawBodyJson: string
): Promise<boolean> => {
    if (!emitter.paypal_webhook_id) return false;
    const credentials: PayPalCredentials = {
        clientId: emitter.paypal_client_id,
        secret: decryptIfEncrypted(emitter.paypal_secret),
        isSandbox: emitter.paypal_sandbox !== false,
        emitterId: emitter.id,
        empresaName: emitter.alias,
        webhookId: emitter.paypal_webhook_id,
    };
    const token = await getPayPalToken(credentials);
    const apiUrl = getPaypalApiUrl(credentials);

    // El body debe ser un objeto JSON parseado (no string) para PayPal.
    const webhookEvent = JSON.parse(rawBodyJson);

    const verifyRes = await axios.post(
        `${apiUrl}/v1/notifications/verify-webhook-signature`,
        {
            auth_algo: headers['paypal-auth-algo'],
            cert_url: headers['paypal-cert-url'],
            transmission_id: headers['paypal-transmission-id'],
            transmission_sig: headers['paypal-transmission-sig'],
            transmission_time: headers['paypal-transmission-time'],
            webhook_id: emitter.paypal_webhook_id,
            webhook_event: webhookEvent,
        },
        {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        }
    );

    return String(verifyRes.data?.verification_status || '').toUpperCase() === 'SUCCESS';
};

/**
 * POST /api/payments/paypal/webhook
 * Endpoint público (sin auth). Verifica firma con cada emisor que tenga
 * webhook_id; si ninguno verifica, descarta el evento.
 */
export const handlePayPalWebhook = async (req: Request, res: Response): Promise<any> => {
    const headers: Record<string, string> = {};
    Object.entries(req.headers).forEach(([k, v]) => {
        const val = Array.isArray(v) ? v[0] : v;
        headers[k.toLowerCase()] = val == null ? '' : String(val);
    });

    const rawBody: string = (req as any).rawBody?.toString('utf8') || JSON.stringify(req.body || {});
    let payload: any;
    try {
        payload = req.body && Object.keys(req.body).length ? req.body : JSON.parse(rawBody);
    } catch {
        console.error('❌ PayPal webhook: body no es JSON');
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    const eventId = String(payload?.id || '').trim();
    const eventType = String(payload?.event_type || '').trim();
    const resource = payload?.resource || {};
    const resourceType = String(payload?.resource_type || '').trim();
    const resourceId = String(resource?.id || '').trim();

    if (!eventId || !eventType) {
        return res.status(400).json({ error: 'Missing event id/type' });
    }

    // Idempotencia: registrar evento (UNIQUE en paypal_event_id).
    try {
        await pool.query(
            `INSERT INTO paypal_webhook_events (
                paypal_event_id, event_type, resource_type, resource_id,
                payload, headers
             ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
             ON CONFLICT (paypal_event_id) DO NOTHING`,
            [eventId, eventType, resourceType, resourceId, JSON.stringify(payload), JSON.stringify(headers)]
        );
    } catch (logErr: any) {
        console.error('❌ No se pudo registrar paypal_webhook_event:', logErr.message);
    }

    // Verificar firma con cada emisor que tenga webhook_id configurado.
    const emittersRes = await pool.query(
        `SELECT id, alias, paypal_client_id, paypal_secret, paypal_sandbox, paypal_webhook_id
           FROM fiscal_emitters
          WHERE paypal_configured = TRUE
            AND paypal_webhook_id IS NOT NULL
            AND paypal_webhook_id <> ''
            AND COALESCE(is_active, true) = TRUE`
    );

    if (!emittersRes.rows.length) {
        console.warn('⚠️ PayPal webhook recibido pero ningún emisor tiene webhook_id configurado.');
        return res.status(200).json({ received: true, verified: false });
    }

    let verifiedEmitterId: number | null = null;
    for (const emitter of emittersRes.rows as FiscalEmitterRow[]) {
        try {
            const ok = await verifyWebhookSignatureForEmitter(emitter, headers, rawBody);
            if (ok) {
                verifiedEmitterId = emitter.id;
                break;
            }
        } catch (verErr: any) {
            console.warn(`⚠️ Verificación falló con emisor ${emitter.alias}:`, verErr.response?.data || verErr.message);
        }
    }

    if (!verifiedEmitterId) {
        console.error(`❌ PayPal webhook ${eventId} (${eventType}): firma NO verificada por ningún emisor`);
        await pool.query(
            `UPDATE paypal_webhook_events SET error = $1 WHERE paypal_event_id = $2`,
            ['SIGNATURE_NOT_VERIFIED', eventId]
        ).catch(() => {});
        // Importante: 200 OK para evitar reintentos masivos de PayPal con
        // eventos que claramente no son nuestros.
        return res.status(200).json({ received: true, verified: false });
    }

    await pool.query(
        `UPDATE paypal_webhook_events SET verified = TRUE WHERE paypal_event_id = $1`,
        [eventId]
    ).catch(() => {});

    console.log(`✅ PayPal webhook ${eventType} verificado (emisor=${verifiedEmitterId}) — resource=${resourceId}`);

    // Procesar según tipo.
    try {
        switch (eventType) {
            case 'PAYMENT.CAPTURE.COMPLETED': {
                // Caso normal: ya el callback lo procesó. Reforzamos idempotente.
                if (resource?.custom_id || resource?.invoice_id) {
                    // Si tenemos refs, marcar el intent en BD si no lo está.
                    await pool.query(
                        `UPDATE paypal_payment_intents
                            SET status = 'captured', capture_id = $1, captured_at = COALESCE(captured_at, NOW()), updated_at = NOW()
                          WHERE capture_id IS NULL AND payment_ref = $2 AND status <> 'captured'`,
                        [resourceId, String(resource.invoice_id || resource.custom_id)]
                    ).catch(() => {});
                }
                break;
            }
            case 'PAYMENT.CAPTURE.DENIED': {
                await pool.query(
                    `UPDATE paypal_payment_intents
                        SET status = 'failed',
                            failure_code = 'CAPTURE_DENIED',
                            failure_detail = $1,
                            updated_at = NOW()
                      WHERE capture_id = $2 OR paypal_order_id = $3`,
                    [
                        JSON.stringify(resource?.status_details || {}),
                        resourceId,
                        resource?.supplementary_data?.related_ids?.order_id || null,
                    ]
                );
                break;
            }
            case 'PAYMENT.CAPTURE.REFUNDED':
            case 'PAYMENT.CAPTURE.REVERSED': {
                // resource es el refund/reversal; capture_id viene en links/related_ids.
                const captureId =
                    resource?.invoice_id
                    || resource?.supplementary_data?.related_ids?.capture_id
                    || (resource?.links || []).find((l: any) => l.rel === 'up')?.href?.split('/').pop()
                    || null;
                if (captureId) {
                    // Marcar paquetes como reembolsados
                    const intentRes = await pool.query(
                        `SELECT id, package_ids FROM paypal_payment_intents WHERE capture_id = $1`,
                        [captureId]
                    );
                    if (intentRes.rows.length) {
                        const pkgIds = (Array.isArray(intentRes.rows[0].package_ids)
                            ? intentRes.rows[0].package_ids
                            : JSON.parse(intentRes.rows[0].package_ids || '[]')
                        ).map((n: any) => Number(n));
                        if (pkgIds.length) {
                            await pool.query(
                                `UPDATE packages
                                    SET payment_status = 'refunded',
                                        client_paid = FALSE,
                                        costing_paid = FALSE
                                  WHERE id = ANY($1)`,
                                [pkgIds]
                            );
                        }
                    }
                    await pool.query(
                        `UPDATE openpay_webhook_logs SET estatus_procesamiento = 'reembolsado' WHERE transaction_id = $1`,
                        [captureId]
                    ).catch(() => {});
                }
                break;
            }
            case 'CUSTOMER.DISPUTE.CREATED':
            case 'CUSTOMER.DISPUTE.UPDATED': {
                // Solo log + alerta. Operaciones puede revisar.
                console.warn(`🚨 PayPal dispute ${eventType}:`, JSON.stringify(resource).slice(0, 500));
                break;
            }
            default:
                console.log(`ℹ️ PayPal webhook ${eventType} ignorado (no se procesa).`);
        }

        await pool.query(
            `UPDATE paypal_webhook_events
                SET processed = TRUE, processed_at = NOW()
              WHERE paypal_event_id = $1`,
            [eventId]
        ).catch(() => {});
    } catch (procErr: any) {
        console.error(`❌ Error procesando webhook ${eventType}:`, procErr.message);
        await pool.query(
            `UPDATE paypal_webhook_events SET error = $1 WHERE paypal_event_id = $2`,
            [procErr.message, eventId]
        ).catch(() => {});
    }

    return res.status(200).json({ received: true, verified: true });
};
