import { Request, Response } from 'express';
import { pool } from './db';
import axios from 'axios';
import {
  getPaypalCredentials,
  getPaypalApiUrl,
  PayPalCredentials,
} from './services/paypalConfig';
import {
  evaluatePaypalCapture,
  buildPaypalErrorResponse,
} from './services/paypalErrors';

// ============ CONFIGURACIÓN DE PAYPAL ============
// Las credenciales viven en fiscal_emitters (multi-empresa). Solo usamos
// COST_PER_KG desde env para consolidaciones aéreas legacy.

// Tarifa por Kilo (configurable)
const COST_PER_KG = parseFloat(process.env.COST_PER_KG || '15.00');

// ============ FUNCIÓN AUXILIAR: Obtener Token de PayPal ============
const getPayPalToken = async (credentials: PayPalCredentials): Promise<string> => {
    const apiUrl = getPaypalApiUrl(credentials);
    const auth = Buffer.from(`${credentials.clientId}:${credentials.secret}`).toString('base64');

    const response = await axios.post(
        `${apiUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    return response.data.access_token;
};

// ============ CALCULAR COSTO DE ENVÍO ============
export const calculateShippingCost = (weightKg: number): number => {
    return Math.round(weightKg * COST_PER_KG * 100) / 100;
};

// ============ 1. CREAR ORDEN DE PAGO (Genera el link de cobro) ============
export const createPaymentOrder = async (req: Request, res: Response): Promise<any> => {
    try {
        const { consolidationId } = req.body;
        const authUser = (req as any).user;
        const authUserId = Number(authUser?.userId || 0);
        const authRole = String(authUser?.role || '').toLowerCase();
        const isClient = ['client', 'customer', 'usuario', 'user', ''].includes(authRole);

        if (!authUserId) return res.status(401).json({ error: 'No autenticado' });
        if (!consolidationId) {
            return res.status(400).json({ error: 'consolidationId es requerido' });
        }

        // A. Obtener datos de la consolidación (incluye user_id para ownership)
        const orderCheck = await pool.query(
            'SELECT id, total_weight, payment_status, user_id FROM consolidations WHERE id = $1',
            [consolidationId]
        );

        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const consolidation = orderCheck.rows[0];

        // IDOR guard: cliente solo paga sus propias consolidaciones.
        if (isClient && Number(consolidation.user_id) !== authUserId) {
            return res.status(403).json({ error: 'No autorizado para esta consolidación' });
        }

        // Verificar si ya está pagada
        if (consolidation.payment_status === 'paid') {
            return res.status(400).json({ error: 'Esta orden ya fue pagada' });
        }

        // B. Calcular cuánto debe pagar
        const weight = parseFloat(consolidation.total_weight) || 0;
        const totalAmount = calculateShippingCost(weight).toFixed(2);

        // C. Obtener credenciales (consolidaciones aéreas → servicio 'aereo')
        let credentials: PayPalCredentials;
        try {
            credentials = await getPaypalCredentials('aereo');
        } catch (credErr: any) {
            console.error('❌ PayPal no configurado:', credErr.message);
            return res.status(500).json({ error: 'PayPal no configurado para consolidaciones aéreas' });
        }

        const token = await getPayPalToken(credentials);
        const PAYPAL_API = getPaypalApiUrl(credentials);

        // D. Crear orden en PayPal
        const order = await axios.post(
            `${PAYPAL_API}/v2/checkout/orders`,
            {
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: `ETX-${consolidationId}`,
                    amount: { 
                        currency_code: 'USD', 
                        value: totalAmount 
                    },
                    description: `Envío EntregaX #${consolidationId} (${weight}kg)`
                }],
                application_context: {
                    brand_name: 'EntregaX',
                    landing_page: 'LOGIN',
                    user_action: 'PAY_NOW',
                    return_url: `${process.env.FRONTEND_URL || 'https://entregax.app'}/payment/success`,
                    cancel_url: `${process.env.FRONTEND_URL || 'https://entregax.app'}/payment/cancel`
                }
            },
            {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // E. Guardar el costo calculado y paypal_order_id en BD
        await pool.query(
            'UPDATE consolidations SET shipping_cost = $1, paypal_order_id = $2 WHERE id = $3',
            [totalAmount, order.data.id, consolidationId]
        );

        // F. Obtener el link de aprobación
        const approveLink = order.data.links.find((link: any) => link.rel === 'approve')?.href;

        if (!approveLink) {
            return res.status(500).json({ error: 'No se pudo obtener el link de pago' });
        }

        console.log(`💳 Orden de pago creada: ${order.data.id} - $${totalAmount} USD`);

        res.json({ 
            success: true,
            approvalUrl: approveLink, 
            orderId: order.data.id,
            amount: totalAmount,
            currency: 'USD'
        });

    } catch (error: any) {
        console.error('Error al crear pago PayPal:', error.response?.data || error.message);
        res.status(500).json({ error: 'Error al crear orden de pago' });
    }
};

// ============ 2. CAPTURAR PAGO (Confirmar que pagó) ============
export const capturePaymentOrder = async (req: Request, res: Response): Promise<any> => {
    try {
        const { paypalOrderId, consolidationId } = req.body;
        const authUser = (req as any).user;
        const authUserId = Number(authUser?.userId || 0);
        const authRole = String(authUser?.role || '').toLowerCase();
        const isClient = ['client', 'customer', 'usuario', 'user', ''].includes(authRole);

        if (!authUserId) return res.status(401).json({ error: 'No autenticado' });
        if (!paypalOrderId || !consolidationId) {
            return res.status(400).json({ error: 'paypalOrderId y consolidationId son requeridos' });
        }

        // IDOR guard: cliente solo captura pagos de sus propias consolidaciones.
        if (isClient) {
            const own = await pool.query(
                'SELECT user_id FROM consolidations WHERE id = $1',
                [consolidationId]
            );
            if (own.rows.length === 0) return res.status(404).json({ error: 'Consolidación no encontrada' });
            if (Number(own.rows[0].user_id) !== authUserId) {
                return res.status(403).json({ error: 'No autorizado para esta consolidación' });
            }
        }

        // Idempotencia: si la consolidación ya está paid, no recapturar
        const stCheck = await pool.query(
            "SELECT payment_status FROM consolidations WHERE id = $1",
            [consolidationId]
        );
        if (stCheck.rows[0]?.payment_status === 'paid') {
            return res.json({
                success: true,
                idempotent: true,
                status: 'success',
                message: 'Esta orden ya estaba pagada',
            });
        }

        // A. Obtener credenciales + token de PayPal
        let credentials: PayPalCredentials;
        try {
            credentials = await getPaypalCredentials('aereo');
        } catch (credErr: any) {
            return res.status(500).json({ error: 'PayPal no configurado para consolidaciones aéreas' });
        }
        const token = await getPayPalToken(credentials);
        const PAYPAL_API = getPaypalApiUrl(credentials);

        // B. Capturar el pago en PayPal — tolerando 422 para mapear el error
        let capture: any;
        try {
            capture = await axios.post(
                `${PAYPAL_API}/v2/checkout/orders/${paypalOrderId}/capture`,
                {},
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } catch (httpErr: any) {
            const check = evaluatePaypalCapture(undefined, httpErr);
            console.error(`❌ PayPal capture HTTP error [${check.rawCode}]: ${check.rawDescription || httpErr.message}`);
            if (check.mapped?.action === 'already_paid') {
                await pool.query(
                    "UPDATE consolidations SET payment_status = 'paid', updated_at = NOW() WHERE id = $1 AND payment_status <> 'paid'",
                    [consolidationId]
                );
                return res.json({ success: true, idempotent: true, status: 'success' });
            }
            const resp = buildPaypalErrorResponse(check);
            return res.status(resp.status).json(resp.body);
        }

        const check = evaluatePaypalCapture(capture.data);
        console.log(`💰 Captura de pago: ${check.orderStatus}/${check.captureStatus || 'n/a'}`);

        // C. Verificar si el pago fue exitoso
        if (check.ok) {
            // D. Actualizar BD a PAGADO (idempotente)
            await pool.query(
                "UPDATE consolidations SET payment_status = 'paid', updated_at = NOW() WHERE id = $1 AND payment_status <> 'paid'",
                [consolidationId]
            );

            // E. Obtener detalles del pago
            const captureDetails = capture.data.purchase_units[0]?.payments?.captures[0];

            res.json({ 
                success: true,
                status: 'success', 
                message: 'Pago completado exitosamente',
                transactionId: captureDetails?.id,
                amount: captureDetails?.amount?.value,
                currency: captureDetails?.amount?.currency_code
            });

        } else {
            const resp = buildPaypalErrorResponse(check);
            res.status(resp.status).json(resp.body);
        }

    } catch (error: any) {
        console.error('Error al capturar pago:', error.message);
        res.status(500).json({ error: 'Error al capturar el pago' });
    }
};

// ============ 3. OBTENER ESTADO DE PAGO ============
export const getPaymentStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { consolidationId } = req.params;
        const authUser = (req as any).user;
        const authUserId = Number(authUser?.userId || 0);
        const authRole = String(authUser?.role || '').toLowerCase();
        const isClient = ['client', 'customer', 'usuario', 'user', ''].includes(authRole);

        if (!authUserId) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        const result = await pool.query(
            `SELECT id, shipping_cost, payment_status, paypal_order_id, total_weight, user_id
             FROM consolidations WHERE id = $1`,
            [consolidationId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Consolidación no encontrada' });
        }

        const consolidation = result.rows[0];
        // IDOR guard: cliente solo puede consultar sus propias consolidaciones.
        if (isClient && Number(consolidation.user_id) !== authUserId) {
            return res.status(403).json({ error: 'No autorizado para esta consolidación' });
        }
        const weight = parseFloat(consolidation.total_weight) || 0;
        const shippingCost = consolidation.shipping_cost 
            ? parseFloat(consolidation.shipping_cost) 
            : calculateShippingCost(weight);

        res.json({
            consolidationId: consolidation.id,
            weight: weight,
            shippingCost: shippingCost,
            costPerKg: COST_PER_KG,
            paymentStatus: consolidation.payment_status,
            paypalOrderId: consolidation.paypal_order_id,
            isPaid: consolidation.payment_status === 'paid'
        });

    } catch (error) {
        console.error('Error al obtener estado de pago:', error);
        res.status(500).json({ error: 'Error al obtener estado de pago' });
    }
};
