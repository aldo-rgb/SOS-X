import { Request, Response } from 'express';
import { pool } from './db';
import axios from 'axios';

// ============ CONFIGURACIÓN DE PAYPAL ============
// En producción, usar variables de entorno (.env)
const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID || 'TU_CLIENT_ID_DE_SANDBOX';
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || 'TU_SECRET_KEY_DE_SANDBOX';
const PAYPAL_API = process.env.PAYPAL_API_URL || 'https://api-m.sandbox.paypal.com'; // Sandbox para pruebas

// Tarifa por Kilo (configurable)
const COST_PER_KG = parseFloat(process.env.COST_PER_KG || '15.00');

// ============ FUNCIÓN AUXILIAR: Obtener Token de PayPal ============
const getPayPalToken = async (): Promise<string> => {
    const auth = Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString('base64');
    
    const response = await axios.post(
        `${PAYPAL_API}/v1/oauth2/token`, 
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

        if (!consolidationId) {
            return res.status(400).json({ error: 'consolidationId es requerido' });
        }

        // A. Obtener datos de la consolidación
        const orderCheck = await pool.query(
            'SELECT id, total_weight, payment_status FROM consolidations WHERE id = $1',
            [consolidationId]
        );

        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const consolidation = orderCheck.rows[0];

        // Verificar si ya está pagada
        if (consolidation.payment_status === 'paid') {
            return res.status(400).json({ error: 'Esta orden ya fue pagada' });
        }

        // B. Calcular cuánto debe pagar
        const weight = parseFloat(consolidation.total_weight) || 0;
        const totalAmount = calculateShippingCost(weight).toFixed(2);

        // C. Obtener token de PayPal
        const token = await getPayPalToken();

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
                    return_url: 'https://entregax.com/payment/success',
                    cancel_url: 'https://entregax.com/payment/cancel'
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

        if (!paypalOrderId || !consolidationId) {
            return res.status(400).json({ error: 'paypalOrderId y consolidationId son requeridos' });
        }

        // A. Obtener token de PayPal
        const token = await getPayPalToken();

        // B. Capturar el pago en PayPal
        const capture = await axios.post(
            `${PAYPAL_API}/v2/checkout/orders/${paypalOrderId}/capture`,
            {},
            {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`💰 Captura de pago: ${capture.data.status}`);

        // C. Verificar si el pago fue exitoso
        if (capture.data.status === 'COMPLETED') {
            // D. Actualizar BD a PAGADO
            await pool.query(
                "UPDATE consolidations SET payment_status = 'paid', updated_at = NOW() WHERE id = $1",
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
            res.status(400).json({ 
                success: false,
                error: 'El pago no se completó',
                status: capture.data.status 
            });
        }

    } catch (error: any) {
        console.error('Error al capturar pago:', error.response?.data || error.message);
        
        // Manejar error específico de PayPal
        if (error.response?.data?.details) {
            return res.status(400).json({ 
                error: 'Error de PayPal',
                details: error.response.data.details 
            });
        }
        
        res.status(500).json({ error: 'Error al capturar el pago' });
    }
};

// ============ 3. OBTENER ESTADO DE PAGO ============
export const getPaymentStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { consolidationId } = req.params;

        const result = await pool.query(
            `SELECT id, shipping_cost, payment_status, paypal_order_id, total_weight 
             FROM consolidations WHERE id = $1`,
            [consolidationId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Consolidación no encontrada' });
        }

        const consolidation = result.rows[0];
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
