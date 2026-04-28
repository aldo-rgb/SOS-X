import { Request, Response } from 'express';
import { pool } from './db';
import axios from 'axios';
import crypto from 'crypto';
import { getOpenpayCredentials, ServiceType } from './services/openpayConfig';
import { createInvoice } from './fiscalController';
import { generateCommissionsForPackages } from './commissionService';

// ============================================
// POBOX PAYMENT CONTROLLER - MULTISUCURSAL
// Pagos para paquetes de PO Box USA
// Integrado con:
// - OpenPay Multi-Empresa (tarjeta y SPEI)
// - Caja Chica (efectivo)
// - Dashboard de Cobranza
// ============================================

interface AuthRequest extends Request {
  user?: {
    userId: number;
    id?: number;
    name?: string;
    role?: string;
    branch_id?: number;
  };
}

// ============ URLS BASE OPENPAY ============
const OPENPAY_SANDBOX_URL = 'https://sandbox-api.openpay.mx/v1';
const OPENPAY_PROD_URL = 'https://api.openpay.mx/v1';

// ============ CONFIGURACIÓN DE PAYPAL DESDE BD ============
interface PayPalCredentials {
    clientId: string;
    secret: string;
    isSandbox: boolean;
    empresaName: string;
}

// Obtener credenciales de PayPal desde la BD
const getPaypalCredentials = async (): Promise<PayPalCredentials> => {
    // Buscar cualquier empresa con PayPal configurado
    const query = await pool.query(`
        SELECT id, alias, paypal_client_id, paypal_secret, paypal_sandbox
        FROM fiscal_emitters
        WHERE paypal_configured = true
        AND paypal_client_id IS NOT NULL 
        AND paypal_client_id != ''
        LIMIT 1
    `);

    if (query.rows.length > 0) {
        const row = query.rows[0];
        console.log(`🔑 PayPal credentials from DB -> ${row.alias}`);
        return {
            clientId: row.paypal_client_id,
            secret: row.paypal_secret,
            isSandbox: row.paypal_sandbox !== false,
            empresaName: row.alias
        };
    }

    throw new Error('No hay credenciales de PayPal configuradas en ninguna empresa');
};

// Obtener Token de PayPal usando credenciales de la BD
const getPayPalToken = async (credentials: PayPalCredentials): Promise<string> => {
    const apiUrl = credentials.isSandbox 
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';
    
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

// Generar referencia única para pago (máximo 8 caracteres alfanuméricos)
const generatePaymentReference = (prefix: string = 'PB'): string => {
    // Usar últimos 4 dígitos del timestamp + 4 caracteres random = 8 caracteres
    const timestamp = (Date.now() % 10000).toString().padStart(4, '0');
    const random = crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 caracteres hex
    return `${prefix}-${timestamp}${random}`;
};

// Verificar si alguno de los paquetes ya está en una orden de pago pendiente
const checkDuplicatePackagesInOrders = async (packageIds: number[], userId: number): Promise<{ hasDuplicates: boolean; duplicates: { packageId: number; reference: string }[] }> => {
    const result = await pool.query(`
        SELECT pp.payment_reference, pkg_id::int as package_id
        FROM pobox_payments pp,
             jsonb_array_elements(pp.package_ids) AS pkg_id
        WHERE pp.user_id = $1
          AND pp.status IN ('pending', 'pending_payment')
          AND pkg_id::int = ANY($2)
    `, [userId, packageIds]);
    
    const duplicates = result.rows.map((r: any) => ({ packageId: r.package_id, reference: r.payment_reference }));
    return { hasDuplicates: duplicates.length > 0, duplicates };
};

// ============================================
// 1. CREAR PAGO PAYPAL PARA POBOX
// ============================================
export const createPoboxPaypalPayment = async (req: Request, res: Response): Promise<any> => {
    try {
        const { packageIds, userId, totalAmount, currency = 'USD', requireInvoice, fiscalData } = req.body;

        if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
            return res.status(400).json({ error: 'packageIds es requerido y debe ser un array' });
        }

        if (!totalAmount || totalAmount <= 0) {
            return res.status(400).json({ error: 'totalAmount es requerido y debe ser mayor a 0' });
        }

        // Si requiere factura, validar datos fiscales
        if (requireInvoice) {
            if (!fiscalData || !fiscalData.razon_social || !fiscalData.rfc || !fiscalData.codigo_postal || !fiscalData.regimen_fiscal) {
                return res.status(400).json({ 
                    error: 'Datos fiscales incompletos',
                    message: 'Para solicitar factura, debes proporcionar: razón social, RFC, código postal y régimen fiscal'
                });
            }
            
            // Guardar/actualizar datos fiscales del usuario
            await pool.query(`
                UPDATE users SET
                    fiscal_razon_social = $1,
                    fiscal_rfc = $2,
                    fiscal_codigo_postal = $3,
                    fiscal_regimen_fiscal = $4,
                    fiscal_uso_cfdi = $5
                WHERE id = $6
            `, [
                fiscalData.razon_social,
                fiscalData.rfc.toUpperCase(),
                fiscalData.codigo_postal,
                fiscalData.regimen_fiscal,
                fiscalData.uso_cfdi || 'G03',
                userId
            ]);
        }

        // Verificar que los paquetes existen y pertenecen al usuario
        // Paquetes PO Box USA: service_type NULL o vacío, excluir FCL/maritime/china_air/dhl
        const packagesCheck = await pool.query(
            `SELECT id, tracking_internal, status, service_type
             FROM packages 
             WHERE id = ANY($1) AND user_id = $2 
             AND (service_type IS NULL OR service_type NOT IN ('fcl', 'maritime', 'china_air', 'dhl'))`,
            [packageIds, userId]
        );

        if (packagesCheck.rows.length !== packageIds.length) {
            return res.status(400).json({ error: 'Algunos paquetes no existen o no pertenecen al usuario' });
        }

        // Verificar que ningún paquete esté ya en una orden de pago pendiente
        const dupCheck = await checkDuplicatePackagesInOrders(packageIds, userId);
        if (dupCheck.hasDuplicates) {
            const refs = [...new Set(dupCheck.duplicates.map(d => d.reference))].join(', ');
            return res.status(400).json({ 
                error: 'Paquetes ya en orden de pago',
                message: `Algunos paquetes ya están en una orden de pago pendiente (${refs}). Cancela o paga esa orden primero.`,
                duplicates: dupCheck.duplicates
            });
        }

        // Crear registro de pago en base de datos
        const paymentRef = generatePaymentReference('PP');
        
        const paymentResult = await pool.query(`
            INSERT INTO pobox_payments (
                user_id, package_ids, amount, currency, payment_method, 
                payment_reference, status, requiere_factura, created_at
            ) VALUES ($1, $2, $3, $4, 'paypal', $5, 'pending', $6, CURRENT_TIMESTAMP)
            RETURNING id
        `, [userId, JSON.stringify(packageIds), totalAmount, currency, paymentRef, requireInvoice || false]);

        const paymentId = paymentResult.rows[0].id;

        // Obtener credenciales de PayPal desde la BD
        let credentials: PayPalCredentials;
        try {
            credentials = await getPaypalCredentials();
        } catch (credError: any) {
            console.error('Error obteniendo credenciales PayPal:', credError.message);
            return res.status(500).json({ 
                error: 'PayPal no configurado para este servicio',
                details: credError.message 
            });
        }

        // Obtener token de PayPal
        const token = await getPayPalToken(credentials);
        
        // URL de API según ambiente
        const paypalApiUrl = credentials.isSandbox 
            ? 'https://api-m.sandbox.paypal.com'
            : 'https://api-m.paypal.com';

        // Crear orden en PayPal
        const order = await axios.post(
            `${paypalApiUrl}/v2/checkout/orders`,
            {
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: paymentRef,
                    amount: { 
                        currency_code: currency, 
                        value: totalAmount.toFixed(2)
                    },
                    description: `PO Box USA - ${packageIds.length} paquete(s)`
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

        // Actualizar registro con paypal_order_id
        await pool.query(
            'UPDATE pobox_payments SET external_order_id = $1 WHERE id = $2',
            [order.data.id, paymentId]
        );

        // Obtener URL de aprobación
        const approveLink = order.data.links.find((link: any) => link.rel === 'approve')?.href;

        if (!approveLink) {
            return res.status(500).json({ error: 'No se pudo obtener el link de pago' });
        }

        console.log(`💳 PO Box PayPal orden creada: ${order.data.id} - $${totalAmount} ${currency}`);

        res.json({ 
            success: true,
            approvalUrl: approveLink,
            paymentId: paymentId,
            orderId: order.data.id,
            reference: paymentRef,
            amount: totalAmount,
            currency: currency
        });

    } catch (error: any) {
        console.error('Error creando pago PayPal PO Box:', error.response?.data || error.message);
        res.status(500).json({ error: 'Error al crear orden de pago' });
    }
};

// ============================================
// 2. CAPTURAR PAGO PAYPAL PARA POBOX
// ============================================
export const capturePoboxPaypalPayment = async (req: Request, res: Response): Promise<any> => {
    try {
        const { paypalOrderId, paymentId } = req.body;

        if (!paypalOrderId) {
            return res.status(400).json({ error: 'paypalOrderId es requerido' });
        }

        // Obtener credenciales de PayPal desde la BD
        let credentials: PayPalCredentials;
        try {
            credentials = await getPaypalCredentials();
        } catch (credError: any) {
            console.error('Error obteniendo credenciales PayPal:', credError.message);
            return res.status(500).json({ 
                error: 'PayPal no configurado',
                details: credError.message 
            });
        }

        // Obtener token de PayPal
        const token = await getPayPalToken(credentials);
        
        // URL de API según ambiente
        const paypalApiUrl = credentials.isSandbox 
            ? 'https://api-m.sandbox.paypal.com'
            : 'https://api-m.paypal.com';

        // Capturar el pago en PayPal
        const capture = await axios.post(
            `${paypalApiUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
            {},
            {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`💰 PO Box PayPal captura: ${capture.data.status}`);

        if (capture.data.status === 'COMPLETED') {
            const captureDetails = capture.data.purchase_units[0]?.payments?.captures[0];

            // Obtener el pago de la BD incluyendo requiere_factura
            const paymentResult = await pool.query(
                'SELECT id, user_id, package_ids, amount, requiere_factura FROM pobox_payments WHERE external_order_id = $1',
                [paypalOrderId]
            );

            if (paymentResult.rows.length > 0) {
                const payment = paymentResult.rows[0];
                
                // Actualizar estado del pago
                await pool.query(`
                    UPDATE pobox_payments SET 
                        status = 'completed',
                        external_transaction_id = $1,
                        paid_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [captureDetails?.id, payment.id]);

                // Actualizar estado de los paquetes
                const packageIds = typeof payment.package_ids === 'string' 
                    ? JSON.parse(payment.package_ids) 
                    : payment.package_ids;

                await pool.query(`
                    UPDATE packages SET 
                        payment_status = 'paid',
                        monto_pagado = COALESCE(monto_pagado, 0) + $1,
                        saldo_pendiente = 0,
                        costing_paid = TRUE,
                        client_paid = TRUE,
                        costing_paid_at = CURRENT_TIMESTAMP
                    WHERE id = ANY($2) OR master_id = ANY($2)
                `, [payment.amount, packageIds]);

                // Registrar en openpay_webhook_logs para el dashboard de cobranza
                await pool.query(`
                    INSERT INTO openpay_webhook_logs (
                        transaction_id, monto_recibido, monto_neto, concepto,
                        fecha_pago, estatus_procesamiento, user_id, tipo_pago, service_type
                    ) VALUES ($1, $2, $2, $3, CURRENT_TIMESTAMP, 'procesado', $4, 'paypal', 'POBOX_USA')
                `, [
                    captureDetails?.id,
                    payment.amount,
                    `Pago PO Box PayPal - ${packageIds.length} paquete(s)`,
                    payment.user_id
                ]);

                console.log(`✅ Paquetes ${packageIds.join(', ')} marcados como pagados`);

                // Generar comisiones para paquetes pagados via PayPal
                generateCommissionsForPackages(packageIds).catch(err =>
                    console.error('Error generando comisiones (PayPal PO Box):', err)
                );

                // 🧾 FACTURACIÓN AUTOMÁTICA si requiere_factura = true
                if (payment.requiere_factura) {
                    console.log(`🧾 Generando factura automática para pago PayPal ${payment.id}...`);
                    try {
                        const invoiceResult = await createInvoice({
                            paymentId: captureDetails?.id || paypalOrderId,
                            paymentType: 'paypal',
                            userId: payment.user_id,
                            amount: parseFloat(payment.amount),
                            currency: 'USD',
                            paymentMethod: 'paypal',
                            description: `Servicio PO Box USA - ${packageIds.length} paquete(s)`,
                            packageIds: packageIds,
                            serviceType: 'po_box'
                        });

                        if (invoiceResult.success) {
                            // Actualizar el registro de pago con datos de factura
                            await pool.query(`
                                UPDATE pobox_payments SET
                                    facturada = TRUE,
                                    factura_uuid = $1,
                                    factura_created_at = CURRENT_TIMESTAMP
                                WHERE id = $2
                            `, [invoiceResult.uuid, payment.id]);
                            
                            console.log(`✅ Factura generada: ${invoiceResult.uuid}`);
                        } else {
                            // Guardar error para reintento posterior
                            await pool.query(`
                                UPDATE pobox_payments SET factura_error = $1 WHERE id = $2
                            `, [invoiceResult.error, payment.id]);
                            
                            console.error(`❌ Error generando factura: ${invoiceResult.error}`);
                        }
                    } catch (invoiceError: any) {
                        console.error(`❌ Excepción generando factura:`, invoiceError.message);
                        await pool.query(`
                            UPDATE pobox_payments SET factura_error = $1 WHERE id = $2
                        `, [invoiceError.message, payment.id]);
                    }
                }
            }

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
        console.error('Error capturando pago PayPal:', error.response?.data || error.message);
        
        if (error.response?.data?.details) {
            return res.status(400).json({ 
                error: 'Error de PayPal',
                details: error.response.data.details 
            });
        }
        
        res.status(500).json({ error: 'Error al capturar el pago' });
    }
};

// ============================================
// 3. CREAR PAGO OPENPAY (TARJETA) - MULTISUCURSAL
// Usa credenciales de la empresa asignada al servicio po_box
// ============================================
export const createPoboxOpenpayPayment = async (req: Request, res: Response): Promise<any> => {
    try {
        const { packageIds, userId, totalAmount, currency = 'MXN', requireInvoice, fiscalData } = req.body;

        if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
            return res.status(400).json({ error: 'packageIds es requerido y debe ser un array' });
        }

        if (!totalAmount || totalAmount <= 0) {
            return res.status(400).json({ error: 'totalAmount es requerido y debe ser mayor a 0' });
        }

        // Si requiere factura, validar datos fiscales
        if (requireInvoice) {
            if (!fiscalData || !fiscalData.razon_social || !fiscalData.rfc || !fiscalData.codigo_postal || !fiscalData.regimen_fiscal) {
                return res.status(400).json({ 
                    error: 'Datos fiscales incompletos',
                    message: 'Para solicitar factura, debes proporcionar: razón social, RFC, código postal y régimen fiscal'
                });
            }
            
            // Guardar/actualizar datos fiscales del usuario
            await pool.query(`
                UPDATE users SET
                    fiscal_razon_social = $1,
                    fiscal_rfc = $2,
                    fiscal_codigo_postal = $3,
                    fiscal_regimen_fiscal = $4,
                    fiscal_uso_cfdi = $5
                WHERE id = $6
            `, [
                fiscalData.razon_social,
                fiscalData.rfc.toUpperCase(),
                fiscalData.codigo_postal,
                fiscalData.regimen_fiscal,
                fiscalData.uso_cfdi || 'G03',
                userId
            ]);
        }

        // Verificar que los paquetes existen y pertenecen al usuario
        // Paquetes PO Box USA: service_type NULL o vacío, excluir FCL/maritime/china_air/dhl
        const packagesCheck = await pool.query(
            `SELECT id, tracking_internal, status, service_type
             FROM packages 
             WHERE id = ANY($1) AND user_id = $2 
             AND (service_type IS NULL OR service_type NOT IN ('fcl', 'maritime', 'china_air', 'dhl'))`,
            [packageIds, userId]
        );

        if (packagesCheck.rows.length !== packageIds.length) {
            return res.status(400).json({ error: 'Algunos paquetes no existen o no pertenecen al usuario' });
        }

        // Verificar que ningún paquete esté ya en una orden de pago pendiente
        const dupCheck = await checkDuplicatePackagesInOrders(packageIds, userId);
        if (dupCheck.hasDuplicates) {
            const refs = [...new Set(dupCheck.duplicates.map(d => d.reference))].join(', ');
            return res.status(400).json({ 
                error: 'Paquetes ya en orden de pago',
                message: `Algunos paquetes ya están en una orden de pago pendiente (${refs}). Cancela o paga esa orden primero.`,
                duplicates: dupCheck.duplicates
            });
        }

        // Obtener datos del usuario
        const userResult = await pool.query(
            'SELECT id, full_name, email, phone FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const user = userResult.rows[0];
        const paymentRef = generatePaymentReference('OP');

        // Obtener credenciales de OpenPay para el servicio po_box (multi-empresa)
        let credentials;
        try {
            credentials = await getOpenpayCredentials('po_box' as ServiceType);
        } catch (credError: any) {
            console.error('Error obteniendo credenciales OpenPay:', credError.message);
            return res.status(500).json({ 
                error: 'OpenPay no configurado para este servicio',
                details: credError.message 
            });
        }

        const openpayBaseUrl = credentials.isSandbox ? OPENPAY_SANDBOX_URL : OPENPAY_PROD_URL;
        // Usar API de charges con redirect en lugar de checkouts
        const openpayUrl = `${openpayBaseUrl}/${credentials.merchantId}/charges`;

        // Crear registro de pago en base de datos
        const paymentResult = await pool.query(`
            INSERT INTO pobox_payments (
                user_id, package_ids, amount, currency, payment_method, 
                payment_reference, status, requiere_factura, created_at
            ) VALUES ($1, $2, $3, $4, 'openpay_card', $5, 'pending', $6, CURRENT_TIMESTAMP)
            RETURNING id
        `, [userId, JSON.stringify(packageIds), totalAmount, currency, paymentRef, requireInvoice || false]);

        const paymentId = paymentResult.rows[0].id;

        // Crear cargo con redireccionamiento en OpenPay
        // NOTA: OpenPay no acepta caracteres especiales en description (paréntesis, etc.)
        const packageCount = packageIds.length;
        const cleanDescription = `Pago PO Box USA ${packageCount} ${packageCount === 1 ? 'paquete' : 'paquetes'}`;
        
        // Usar API de charges con confirm: false para redireccionamiento
        const chargeData = {
            method: 'card',
            amount: totalAmount,
            currency: currency,
            description: cleanDescription,
            order_id: paymentRef,
            confirm: false,
            send_email: false,
            redirect_url: `${process.env.API_URL || 'https://api.entregax.com'}/webhooks/pobox/openpay/callback?paymentId=${paymentId}`,
            customer: {
                name: user.full_name?.split(' ')[0] || 'Cliente',
                last_name: user.full_name?.split(' ').slice(1).join(' ') || 'EntregaX',
                email: user.email || `cliente${userId}@entregax.com`,
                phone_number: user.phone?.replace(/\D/g, '').slice(-10) || '0000000000'
            }
        };

        const openpayResponse = await axios.post(openpayUrl, chargeData, {
            auth: {
                username: credentials.privateKey,
                password: ''
            }
        });

        // Actualizar registro con external_order_id (transaction id de OpenPay)
        await pool.query(
            'UPDATE pobox_payments SET external_order_id = $1 WHERE id = $2',
            [openpayResponse.data.id, paymentId]
        );

        // La URL de pago viene en payment_method.url para cargos con redirect
        const paymentUrl = openpayResponse.data.payment_method?.url;
        
        if (!paymentUrl) {
            console.error('OpenPay no devolvió URL de pago:', openpayResponse.data);
            return res.status(500).json({ 
                error: 'OpenPay no devolvió URL de pago',
                details: 'payment_method.url no encontrado en respuesta'
            });
        }

        console.log(`💳 PO Box OpenPay cargo creado: ${openpayResponse.data.id} - $${totalAmount} ${currency}`);
        console.log(`🔗 Payment URL: ${paymentUrl}`);

        res.json({ 
            success: true,
            approvalUrl: paymentUrl,
            paymentId: paymentId,
            transactionId: openpayResponse.data.id,
            reference: paymentRef,
            amount: totalAmount,
            currency: currency
        });

    } catch (error: any) {
        console.error('Error creando pago OpenPay PO Box:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Error al crear cargo de pago',
            details: error.response?.data?.description || error.message
        });
    }
};

// ============================================
// 4. CREAR PAGO EN EFECTIVO/TRANSFERENCIA - MULTISUCURSAL
// Genera referencia para pago en sucursal o SPEI
// Si ya existe un pago pendiente para los mismos paquetes, devuelve ese
// ============================================
export const createPoboxCashPayment = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const { packageIds, totalAmount, currency = 'MXN', branchId } = req.body;
        const userId = req.body.userId || req.user?.userId || req.user?.id;

        if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
            return res.status(400).json({ error: 'packageIds es requerido y debe ser un array' });
        }

        if (!totalAmount || totalAmount <= 0) {
            return res.status(400).json({ error: 'totalAmount es requerido y debe ser mayor a 0' });
        }

        // Verificar que los paquetes existen y pertenecen al usuario
        // Primero buscar en packages, luego en maritime_orders
        const packagesCheck = await pool.query(
            `SELECT id, tracking_internal, status::text, service_type, assigned_cost_mxn, 'package' as source
             FROM packages 
             WHERE id = ANY($1) AND user_id = $2 
            UNION ALL
            SELECT id, ordersn as tracking_internal, status::text, 'maritime' as service_type, assigned_cost_mxn, 'maritime' as source
             FROM maritime_orders
             WHERE id = ANY($1) AND user_id = $2
            UNION ALL
            SELECT id, inbound_tracking as tracking_internal, status::text, 'AA_DHL' as service_type, total_cost_mxn as assigned_cost_mxn, 'dhl' as source
             FROM dhl_shipments
             WHERE id = ANY($1) AND user_id = $2`,
            [packageIds, userId]
        );

        if (packagesCheck.rows.length !== packageIds.length) {
            return res.status(400).json({ error: 'Algunos paquetes no existen o no pertenecen al usuario' });
        }

        // Determine service type for company config lookup
        const hasMaritime = packagesCheck.rows.some(p => p.source === 'maritime' || p.service_type === 'maritime');
        const hasDhl = packagesCheck.rows.some(p => p.source === 'dhl');
        const hasAir = packagesCheck.rows.some(p => p.service_type === 'AIR_CHN_MX');
        const serviceTypeForConfig = hasMaritime ? 'SEA_CHN_MX' : hasDhl ? 'AA_DHL' : hasAir ? 'AIR_CHN_MX' : 'POBOX_USA';

        // Verificar que ningún paquete esté ya en una orden de pago pendiente
        const dupCheck = await checkDuplicatePackagesInOrders(packageIds, userId);

        // ✨ NUEVO: Verificar si ya existe un pago pendiente para estos mismos paquetes (match exacto)
        const sortedPackageIds = [...packageIds].sort((a, b) => a - b);
        const existingPayment = await pool.query(`
            SELECT 
                pp.id, pp.payment_reference, pp.amount, pp.currency, 
                pp.expires_at, pp.created_at, pp.status
            FROM pobox_payments pp
            WHERE pp.user_id = $1 
              AND pp.status IN ('pending', 'pending_payment')
              AND pp.payment_method = 'cash'
              AND pp.package_ids::jsonb @> $2::jsonb
              AND pp.package_ids::jsonb <@ $2::jsonb
              AND (pp.expires_at IS NULL OR pp.expires_at > CURRENT_TIMESTAMP)
            ORDER BY pp.created_at DESC
            LIMIT 1
        `, [userId, JSON.stringify(sortedPackageIds)]);

        // Si hay duplicados pero NO hay match exacto, rechazar (evita órdenes con paquetes solapados)
        if (dupCheck.hasDuplicates && existingPayment.rows.length === 0) {
            const dupRefs = [...new Set(dupCheck.duplicates.map(d => d.reference))];
            return res.status(400).json({ 
                error: 'Paquetes ya en orden de pago',
                message: `Algunos paquetes ya están en una orden de pago pendiente (${dupRefs.join(', ')}). Cancela o paga esa orden primero.`,
                duplicates: dupCheck.duplicates
            });
        }

        // Si ya existe un pago pendiente válido, devolver ese
        if (existingPayment.rows.length > 0) {
            const existingPay = existingPayment.rows[0];
            console.log(`♻️ Reutilizando pago existente: ${existingPay.payment_reference}`);

            // Obtener información de empresa y sucursal
            const trackings = packagesCheck.rows.map(p => p.tracking_internal).join(', ');
            
            // Obtener info bancaria
            let companyInfo: any = null;
            try {
                const companyResult = await pool.query(
                    `SELECT 
                        fe.alias as company_name,
                        fe.business_name as legal_name,
                        fe.bank_name,
                        fe.bank_clabe,
                        fe.bank_account
                     FROM service_company_config scc
                     JOIN fiscal_emitters fe ON scc.emitter_id = fe.id
                     WHERE scc.service_type = $1 AND scc.is_active = TRUE`,[serviceTypeForConfig]
                );
                if (companyResult.rows.length > 0) {
                    companyInfo = companyResult.rows[0];
                }
            } catch (e) {
                console.log('No se encontró config de empresa para', serviceTypeForConfig);
            }

            if (!companyInfo || !companyInfo.bank_clabe) {
                companyInfo = {
                    company_name: 'EntregaX',
                    legal_name: 'ENTREGAX S.A. DE C.V.',
                    bank_name: 'BBVA México',
                    bank_clabe: '012580001234567890',
                    bank_account: '1234567890'
                };
            }

            const bankInfo = {
                banco: companyInfo.bank_name || 'BBVA México',
                clabe: companyInfo.bank_clabe || '012580001234567890',
                cuenta: companyInfo.bank_account || companyInfo.bank_clabe?.slice(-10) || '1234567890',
                beneficiario: companyInfo.legal_name || 'ENTREGAX S.A. DE C.V.',
                concepto: existingPay.payment_reference
            };

            // Obtener info de sucursal
            let branchInfo;
            try {
                const branchResult = await pool.query(
                    `SELECT name, address, phone, business_hours FROM branches WHERE is_active = TRUE ORDER BY id LIMIT 1`
                );
                branchInfo = branchResult.rows[0];
            } catch (e) {
                branchInfo = null;
            }

            if (!branchInfo) {
                branchInfo = {
                    name: 'CEDIS Monterrey',
                    address: 'Av. Industrial #123, Col. Centro, Monterrey, N.L.',
                    phone: '81 1234 5678',
                    business_hours: 'Lunes a Viernes 9:00 - 18:00, Sábados 9:00 - 14:00'
                };
            }

            return res.json({ 
                success: true,
                reused: true, // Indicar que es un pago reutilizado
                paymentId: existingPay.id,
                reference: existingPay.payment_reference,
                amount: parseFloat(existingPay.amount),
                currency: existingPay.currency,
                expiresAt: existingPay.expires_at,
                trackings: trackings,
                bankInfo: bankInfo,
                branchInfo: {
                    nombre: branchInfo.name,
                    direccion: branchInfo.address,
                    telefono: branchInfo.phone,
                    horario: branchInfo.business_hours
                },
                instructions: {
                    transfer: `1. Realiza la transferencia SPEI por $${parseFloat(existingPay.amount).toFixed(2)} ${existingPay.currency}\n2. Usa como concepto: ${existingPay.payment_reference}\n3. Una vez recibido el pago, tus paquetes serán procesados`,
                    cash: `1. Acude a nuestra sucursal\n2. Proporciona tu referencia: ${existingPay.payment_reference}\n3. Realiza el pago de $${parseFloat(existingPay.amount).toFixed(2)} ${existingPay.currency}\n4. Conserva tu comprobante`
                }
            });
        }

        // No existe pago pendiente, crear uno nuevo
        // Obtener información de la empresa asignada al servicio
        let companyInfo: any = null;
        let empresaId: number | null = null;
        try {
            const companyResult = await pool.query(
                `SELECT 
                    fe.id as empresa_id,
                    fe.alias as company_name,
                    fe.business_name as legal_name,
                    fe.rfc,
                    fe.bank_name,
                    fe.bank_clabe,
                    fe.bank_account
                 FROM service_company_config scc
                 JOIN fiscal_emitters fe ON scc.emitter_id = fe.id
                 WHERE scc.service_type = $1 AND scc.is_active = TRUE`,[serviceTypeForConfig]
            );
            if (companyResult.rows.length > 0) {
                companyInfo = companyResult.rows[0];
                empresaId = companyInfo.empresa_id;
            }
        } catch (e) {
            console.log('No se encontró config de empresa para', serviceTypeForConfig);
        }

        // Generar prefijo con iniciales de la empresa (2 primeras letras de cada palabra)
        let refPrefix = 'EF';
        if (companyInfo?.company_name) {
            const words = companyInfo.company_name.trim().split(/\s+/).filter((w: string) => !['sa', 'de', 'cv', 's.a.', 'S.A.', 'DE', 'CV', 'C.V.'].includes(w.toLowerCase()));
            if (words.length >= 2) {
                refPrefix = (words[0][0] + words[1][0]).toUpperCase();
            } else if (words.length === 1 && words[0].length >= 2) {
                refPrefix = words[0].substring(0, 2).toUpperCase();
            }
        }
        const paymentRef = generatePaymentReference(refPrefix);

        // Valores por defecto si no hay configuración
        if (!companyInfo || !companyInfo.bank_clabe) {
            companyInfo = {
                empresa_id: null,
                company_name: 'EntregaX',
                legal_name: 'ENTREGAX S.A. DE C.V.',
                bank_name: 'BBVA México',
                bank_clabe: '012580001234567890',
                bank_account: '1234567890'
            };
        }

        // Crear registro de pago (sin vencimiento para pagos en efectivo/sucursal)
        const paymentResult = await pool.query(`
            INSERT INTO pobox_payments (
                user_id, package_ids, amount, currency, payment_method, 
                payment_reference, status, created_at
            ) VALUES ($1, $2, $3, $4, 'cash', $5, 'pending_payment', 
                      CURRENT_TIMESTAMP)
            RETURNING id
        `, [userId, JSON.stringify(packageIds), totalAmount, currency, paymentRef]);

        const payment = paymentResult.rows[0];

        // Obtener lista de guías para mostrar
        const trackings = packagesCheck.rows.map(p => p.tracking_internal).join(', ');

        // ✨ NUEVO: Crear registro en openpay_webhook_logs como "pending_payment" para el dashboard
        try {
            await pool.query(`
                INSERT INTO openpay_webhook_logs (
                    transaction_id, empresa_id, user_id, monto_recibido, monto_neto,
                    concepto, fecha_pago, estatus_procesamiento, service_type, 
                    payment_method, payload_json, branch_id
                ) VALUES (
                    $1, $2, $3, $4, $4,
                    $5, CURRENT_TIMESTAMP, 'pending_payment', $8,
                    'cash', $6, $7
                )
            `, [
                paymentRef, 
                empresaId, 
                userId, 
                totalAmount,
                `Pago en espera - ${packagesCheck.rows.length} paquete(s): ${trackings}`,
                JSON.stringify({ 
                    packageIds, 
                    payment_id: payment.id,

                    trackings: trackings
                }),
                branchId || null,
                serviceTypeForConfig
            ]);
            console.log(`📝 Registro pendiente creado en dashboard: ${paymentRef}`);
        } catch (logError) {
            console.log('Nota: No se pudo crear log en dashboard', logError);
        }

        console.log(`💵 PO Box Pago en efectivo creado: ${paymentRef} - $${totalAmount} ${currency}`);

        // Información bancaria para transferencia SPEI
        const bankInfo = {
            banco: companyInfo.bank_name || 'BBVA México',
            clabe: companyInfo.bank_clabe || '012580001234567890',
            cuenta: companyInfo.bank_account || companyInfo.bank_clabe?.slice(-10) || '1234567890',
            beneficiario: companyInfo.legal_name || 'ENTREGAX S.A. DE C.V.',
            concepto: paymentRef
        };

        // Información de sucursal para pago en efectivo
        let branchInfo;
        try {
            const branchResult = await pool.query(
                `SELECT name, address, phone, business_hours FROM branches WHERE is_active = TRUE ORDER BY id LIMIT 1`
            );
            branchInfo = branchResult.rows[0];
        } catch (e) {
            branchInfo = null;
        }

        if (!branchInfo) {
            branchInfo = {
                name: 'CEDIS Monterrey',
                address: 'Av. Industrial #123, Col. Centro, Monterrey, N.L.',
                phone: '81 1234 5678',
                business_hours: 'Lunes a Viernes 9:00 - 18:00, Sábados 9:00 - 14:00'
            };
        }

        res.json({ 
            success: true,
            paymentId: payment.id,
            reference: paymentRef,
            amount: totalAmount,
            currency: currency,

            trackings: trackings,
            bankInfo: bankInfo,
            branchInfo: {
                nombre: branchInfo.name,
                direccion: branchInfo.address,
                telefono: branchInfo.phone,
                horario: branchInfo.business_hours
            },
            instructions: {
                transfer: `1. Realiza la transferencia SPEI por $${totalAmount.toFixed(2)} ${currency}\n2. Usa como concepto: ${paymentRef}\n3. Una vez recibido el pago, tus paquetes serán procesados`,
                cash: `1. Acude a nuestra sucursal\n2. Proporciona tu referencia: ${paymentRef}\n3. Realiza el pago de $${totalAmount.toFixed(2)} ${currency}\n4. Conserva tu comprobante`
            }
        });

    } catch (error: any) {
        console.error('Error creando pago en efectivo PO Box:', error.message);
        res.status(500).json({ error: 'Error al generar referencia de pago' });
    }
};

// ============================================
// 5. VERIFICAR ESTADO DE PAGO POBOX
// ============================================
export const getPoboxPaymentStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { paymentId } = req.params;

        const result = await pool.query(`
            SELECT 
                p.id, p.user_id, p.package_ids, p.amount, p.currency,
                p.payment_method, p.payment_reference, p.status,
                p.external_order_id, p.external_transaction_id,
                p.created_at, p.paid_at, p.expires_at,
                u.full_name as user_name
            FROM pobox_payments p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `, [paymentId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo estado de pago:', error);
        res.status(500).json({ error: 'Error al obtener estado de pago' });
    }
};

// ============================================
// 6. CONFIRMAR PAGO EN EFECTIVO (ADMIN) - INTEGRADO CON CAJA CHICA
// Registra el pago en caja chica para el dashboard de cobranza
// ============================================
export const confirmPoboxCashPayment = async (req: AuthRequest, res: Response): Promise<any> => {
    const client = await pool.connect();
    
    try {
        const { paymentId, notes } = req.body;
        const adminId = req.user?.id || req.user?.userId;
        const adminName = req.user?.name || 'Admin';

        if (!paymentId) {
            return res.status(400).json({ error: 'paymentId es requerido' });
        }

        await client.query('BEGIN');

        // Obtener el pago
        const paymentResult = await client.query(
            `SELECT id, user_id, package_ids, amount, status, payment_reference 
             FROM pobox_payments WHERE id = $1`,
            [paymentId]
        );

        if (paymentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        const payment = paymentResult.rows[0];

        if (payment.status === 'completed') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Este pago ya fue confirmado' });
        }

        // Obtener nombre del cliente
        const clientResult = await client.query(
            'SELECT full_name FROM users WHERE id = $1',
            [payment.user_id]
        );
        const clientName = clientResult.rows[0]?.full_name || 'Cliente';

        // Calcular saldo actual de caja
        const saldoResult = await client.query(`
            SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) as saldo
            FROM caja_chica_transacciones
        `);
        const saldoAnterior = parseFloat(saldoResult.rows[0].saldo);
        const nuevoSaldo = saldoAnterior + parseFloat(payment.amount);

        // Registrar en caja chica
        const cajaResult = await client.query(`
            INSERT INTO caja_chica_transacciones 
                (tipo, monto, concepto, cliente_id, admin_id, admin_name, 
                 saldo_despues_movimiento, categoria, notas)
            VALUES ('ingreso', $1, $2, $3, $4, $5, $6, 'cobro_guias', $7)
            RETURNING id
        `, [
            payment.amount,
            `Pago PO Box USA - ${payment.payment_reference} - ${clientName}`,
            payment.user_id,
            adminId,
            adminName,
            nuevoSaldo,
            notes || null
        ]);

        const cajaTransaccionId = cajaResult.rows[0].id;

        // Actualizar estado del pago
        await client.query(`
            UPDATE pobox_payments SET 
                status = 'completed',
                paid_at = CURRENT_TIMESTAMP,
                confirmed_by = $1,
                confirmation_notes = $2
            WHERE id = $3
        `, [adminId, notes, paymentId]);

        // Actualizar estado de los paquetes y registrar aplicaciones
        const packageIds = typeof payment.package_ids === 'string' 
            ? JSON.parse(payment.package_ids) 
            : payment.package_ids;

        for (const pkgId of packageIds) {
            // Obtener costo del paquete
            const pkgResult = await client.query(
                'SELECT assigned_cost_mxn, COALESCE(saldo_pendiente, assigned_cost_mxn) as saldo FROM packages WHERE id = $1',
                [pkgId]
            );
            
            if (pkgResult.rows.length > 0) {
                const pkg = pkgResult.rows[0];
                const montoAplicado = parseFloat(pkg.saldo);

                // Registrar aplicación del pago
                await client.query(`
                    INSERT INTO caja_chica_aplicacion_pagos 
                        (transaccion_id, package_id, monto_aplicado)
                    VALUES ($1, $2, $3)
                `, [cajaTransaccionId, pkgId, montoAplicado]);

                // Actualizar paquete (y cascada a hijas si es master)
                await client.query(`
                    UPDATE packages SET 
                        payment_status = 'paid',
                        monto_pagado = assigned_cost_mxn,
                        saldo_pendiente = 0,
                        costing_paid = TRUE,
                        costing_paid_at = CURRENT_TIMESTAMP
                    WHERE id = $1 OR master_id = $1
                `, [pkgId]);
            }
        }

        await client.query('COMMIT');

        // Generar comisiones para paquetes pagados en efectivo
        generateCommissionsForPackages(packageIds).catch(err =>
            console.error('Error generando comisiones (efectivo PO Box):', err)
        );

        console.log(`✅ Pago en efectivo ${paymentId} confirmado por ${adminName} - Registrado en caja chica`);

        res.json({ 
            success: true, 
            message: 'Pago confirmado exitosamente',
            packageIds: packageIds,
            cajaTransaccionId: cajaTransaccionId,
            nuevoSaldoCaja: nuevoSaldo
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error confirmando pago en efectivo:', error);
        res.status(500).json({ error: 'Error al confirmar pago' });
    } finally {
        client.release();
    }
};

// ============================================
// 7. WEBHOOK OPENPAY PARA POBOX - MULTISUCURSAL
// Procesa notificaciones de pago de tarjeta y SPEI
// Registra en openpay_webhook_logs para el dashboard
// Genera factura automática si requiere_factura = true
// ============================================
export const handlePoboxOpenpayWebhook = async (req: Request, res: Response): Promise<any> => {
    try {
        const event = req.body;

        console.log('📬 Webhook OpenPay PO Box recibido:', event.type);

        if (event.type === 'charge.succeeded' || event.type === 'spei.received') {
            const orderId = event.transaction?.order_id;
            const transactionId = event.transaction?.id;
            const amount = parseFloat(event.transaction?.amount || 0);
            
            // Comisión de OpenPay (aprox 2.9% + IVA para tarjeta, menor para SPEI)
            const comisionRate = event.type === 'spei.received' ? 0.01 : 0.0336;
            const montoNeto = amount * (1 - comisionRate);

            if (orderId) {
                // Buscar el pago por referencia incluyendo campo requiere_factura
                const paymentResult = await pool.query(
                    'SELECT id, user_id, package_ids, amount, requiere_factura FROM pobox_payments WHERE payment_reference = $1',
                    [orderId]
                );

                if (paymentResult.rows.length > 0) {
                    const payment = paymentResult.rows[0];

                    // Actualizar estado del pago
                    await pool.query(`
                        UPDATE pobox_payments SET 
                            status = 'completed',
                            external_transaction_id = $1,
                            paid_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `, [transactionId, payment.id]);

                    // Actualizar paquetes
                    const packageIds = typeof payment.package_ids === 'string' 
                        ? JSON.parse(payment.package_ids) 
                        : payment.package_ids;

                    await pool.query(`
                        UPDATE packages SET 
                            payment_status = 'paid',
                            monto_pagado = COALESCE(monto_pagado, 0) + $1,
                            saldo_pendiente = 0,
                            costing_paid = TRUE,
                            costing_paid_at = CURRENT_TIMESTAMP
                        WHERE id = ANY($2) OR master_id = ANY($2)
                    `, [payment.amount, packageIds]);

                    // Registrar en openpay_webhook_logs para el dashboard de cobranza
                    await pool.query(`
                        INSERT INTO openpay_webhook_logs (
                            transaction_id, monto_recibido, monto_neto, concepto,
                            fecha_pago, estatus_procesamiento, user_id, tipo_pago, service_type
                        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'procesado', $5, $6, 'POBOX_USA')
                    `, [
                        transactionId,
                        amount,
                        montoNeto,
                        `Pago PO Box ${event.type === 'spei.received' ? 'SPEI' : 'Tarjeta'} - ${packageIds.length} paquete(s)`,
                        payment.user_id,
                        event.type === 'spei.received' ? 'spei' : 'tarjeta'
                    ]);

                    console.log(`✅ Pago OpenPay ${orderId} completado vía webhook - $${amount} MXN`);

                    // Generar comisiones para paquetes pagados via OpenPay
                    generateCommissionsForPackages(packageIds).catch(err =>
                        console.error('Error generando comisiones (OpenPay PO Box):', err)
                    );

                    // 🧾 FACTURACIÓN AUTOMÁTICA si requiere_factura = true
                    if (payment.requiere_factura) {
                        console.log(`🧾 Generando factura automática para pago ${payment.id}...`);
                        try {
                            const invoiceResult = await createInvoice({
                                paymentId: transactionId,
                                paymentType: 'openpay',
                                userId: payment.user_id,
                                amount: amount,
                                currency: 'MXN',
                                paymentMethod: event.type === 'spei.received' ? 'spei' : 'card',
                                description: `Servicio PO Box USA - ${packageIds.length} paquete(s)`,
                                packageIds: packageIds,
                                serviceType: 'po_box'
                            });

                            if (invoiceResult.success) {
                                // Actualizar el registro de pago con datos de factura
                                await pool.query(`
                                    UPDATE pobox_payments SET
                                        facturada = TRUE,
                                        factura_uuid = $1,
                                        factura_created_at = CURRENT_TIMESTAMP
                                    WHERE id = $2
                                `, [invoiceResult.uuid, payment.id]);
                                
                                console.log(`✅ Factura generada: ${invoiceResult.uuid}`);
                            } else {
                                // Guardar error para reintento posterior
                                await pool.query(`
                                    UPDATE pobox_payments SET
                                        factura_error = $1
                                    WHERE id = $2
                                `, [invoiceResult.error, payment.id]);
                                
                                console.error(`❌ Error generando factura: ${invoiceResult.error}`);
                            }
                        } catch (invoiceError: any) {
                            console.error(`❌ Excepción generando factura:`, invoiceError.message);
                            await pool.query(`
                                UPDATE pobox_payments SET factura_error = $1 WHERE id = $2
                            `, [invoiceError.message, payment.id]);
                        }
                    }
                }
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Error procesando webhook OpenPay PO Box:', error);
        res.status(500).json({ error: 'Error procesando webhook' });
    }
};

// ============================================
// 7.5 CALLBACK OPENPAY PARA POBOX
// Redirige al usuario después del pago en WebView
// ============================================
export const handlePoboxOpenpayCallback = async (req: Request, res: Response): Promise<any> => {
    try {
        const { paymentId, id: transactionId } = req.query;
        
        console.log(`📱 Callback OpenPay PO Box - paymentId: ${paymentId}, transactionId: ${transactionId}`);
        
        if (paymentId) {
            // Verificar estado del pago
            const paymentResult = await pool.query(
                'SELECT id, status, amount, payment_reference FROM pobox_payments WHERE id = $1',
                [paymentId]
            );
            
            if (paymentResult.rows.length > 0) {
                const payment = paymentResult.rows[0];
                
                // Si el pago ya fue completado por el webhook, redirigir a éxito
                if (payment.status === 'completed') {
                    return res.redirect(`entregax://payment/success?paymentId=${paymentId}&amount=${payment.amount}`);
                }
                
                // Si no, marcar como pendiente de verificación y redirigir
                // El webhook debería procesarlo pronto
                return res.redirect(`entregax://payment/pending?paymentId=${paymentId}&ref=${payment.payment_reference}`);
            }
        }
        
        // Página HTML de confirmación como fallback (para WebView que no maneja deeplinks)
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Pago Procesado - EntregaX</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 40px 20px; background: #f5f5f5; }
                    .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .icon { font-size: 64px; margin-bottom: 20px; }
                    h1 { color: #333; font-size: 24px; margin-bottom: 10px; }
                    p { color: #666; font-size: 16px; line-height: 1.5; }
                    .btn { display: inline-block; margin-top: 20px; padding: 14px 28px; background: #F05A28; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">✅</div>
                    <h1>Pago Procesado</h1>
                    <p>Tu pago está siendo verificado. Regresa a la app para ver el estado actualizado.</p>
                    <a href="entregax://home" class="btn">Volver a la App</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error en callback OpenPay PO Box:', error);
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Error - EntregaX</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 40px 20px; background: #f5f5f5; }
                    .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 16px; }
                    .icon { font-size: 64px; margin-bottom: 20px; }
                    h1 { color: #333; font-size: 24px; }
                    .btn { display: inline-block; margin-top: 20px; padding: 14px 28px; background: #F05A28; color: white; text-decoration: none; border-radius: 8px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">⚠️</div>
                    <h1>Procesando...</h1>
                    <p>Tu pago está siendo procesado. Regresa a la app para verificar.</p>
                    <a href="entregax://home" class="btn">Volver a la App</a>
                </div>
            </body>
            </html>
        `);
    }
};

// ============================================
// 8. LISTAR PAGOS PENDIENTES POBOX (ADMIN)
// Para el panel de cuentas por cobrar
// ============================================
export const getPoboxPendingPayments = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status, userId, dateFrom, dateTo } = req.query;

        let whereClause = "WHERE p.status IN ('pending', 'pending_payment')";
        const params: any[] = [];
        let paramIndex = 1;

        if (userId) {
            whereClause += ` AND p.user_id = $${paramIndex++}`;
            params.push(userId);
        }

        if (dateFrom) {
            whereClause += ` AND p.created_at >= $${paramIndex++}`;
            params.push(dateFrom);
        }

        if (dateTo) {
            whereClause += ` AND p.created_at <= $${paramIndex++}`;
            params.push(dateTo + ' 23:59:59');
        }

        const result = await pool.query(`
            SELECT 
                p.id,
                p.user_id,
                u.full_name as user_name,
                u.email as user_email,
                p.package_ids,
                p.amount,
                p.currency,
                p.payment_method,
                p.payment_reference,
                p.status,
                p.created_at,
                p.expires_at
            FROM pobox_payments p
            LEFT JOIN users u ON p.user_id = u.id
            ${whereClause}
            ORDER BY p.created_at DESC
            LIMIT 100
        `, params);

        // Calcular totales
        const totals = await pool.query(`
            SELECT 
                COUNT(*) as total_pendientes,
                COALESCE(SUM(amount), 0) as monto_total_pendiente
            FROM pobox_payments
            ${whereClause}
        `, params);

        res.json({
            success: true,
            payments: result.rows,
            totals: totals.rows[0]
        });
    } catch (error) {
        console.error('Error obteniendo pagos pendientes PO Box:', error);
        res.status(500).json({ error: 'Error al obtener pagos pendientes' });
    }
};

// ============================================
// 9. HISTORIAL DE PAGOS POBOX (CLIENTE)
// Para la app móvil
// ============================================
export const getPoboxPaymentHistory = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || req.user?.id;

        const result = await pool.query(`
            SELECT 
                p.id,
                p.package_ids,
                p.amount,
                p.currency,
                p.payment_method,
                p.payment_reference,
                p.status,
                p.created_at,
                p.paid_at,
                p.expires_at,
                p.credit_applied,
                p.credit_service,
                p.credit_applied_at,
                p.wallet_applied,
                p.wallet_applied_at
            FROM pobox_payments p
            WHERE p.user_id = $1 AND p.status != 'cancelled'
            ORDER BY p.created_at DESC
            LIMIT 50
        `, [userId]);

        // Get company bank info for cash payments
        let bankInfo: any = null;
        let branchInfo: any = null;
        try {
            const companyResult = await pool.query(`SELECT bank_name, bank_clabe, bank_account, legal_name FROM companies LIMIT 1`);
            const companyInfo = companyResult.rows[0] || {};
            bankInfo = {
                banco: companyInfo.bank_name || 'BBVA México',
                clabe: companyInfo.bank_clabe || '012580001234567890',
                cuenta: companyInfo.bank_account || companyInfo.bank_clabe?.slice(-10) || '1234567890',
                beneficiario: companyInfo.legal_name || 'ENTREGAX S.A. DE C.V.'
            };
            const branchResult = await pool.query(`SELECT name, address, phone, business_hours FROM branches WHERE is_active = TRUE ORDER BY id LIMIT 1`);
            const br = branchResult.rows[0];
            branchInfo = br ? { nombre: br.name, direccion: br.address, telefono: br.phone, horario: br.business_hours } : null;
        } catch (e) {
            bankInfo = {
                banco: 'BBVA México',
                clabe: '012580001234567890',
                cuenta: '1234567890',
                beneficiario: 'ENTREGAX S.A. DE C.V.'
            };
            branchInfo = {
                nombre: 'CEDIS Monterrey',
                direccion: 'Av. Industrial #123, Col. Centro, Monterrey, N.L.',
                telefono: '81 1234 5678',
                horario: 'Lunes a Viernes 9:00 - 18:00, Sábados 9:00 - 14:00'
            };
        }

        // Enrich with package details
        const payments = [];
        for (const row of result.rows) {
            let packages: any[] = [];
            if (Array.isArray(row.package_ids) && row.package_ids.length > 0) {
                try {
                    const pkgResult = await pool.query(`
                        SELECT id, tracking_internal, international_tracking, weight, 
                               assigned_cost_mxn, saldo_pendiente, national_shipping_cost,
                               national_carrier, status
                        FROM packages
                        WHERE id = ANY($1)
                    `, [row.package_ids]);
                    packages = pkgResult.rows;
                } catch (e) {
                    // ignore
                }
            }
            const enriched: any = { ...row, packages };
            if (row.payment_method === 'cash') {
                enriched.bank_info = bankInfo;
                enriched.branch_info = branchInfo;
            }
            payments.push(enriched);
        }

        res.json({
            success: true,
            payments
        });
    } catch (error) {
        console.error('Error obteniendo historial de pagos PO Box:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
};
/**
 * Cancelar/Eliminar una orden de pago pendiente del cliente
 * Solo permite cancelar si la orden está en estado pendiente (no pagada)
 */
export const cancelPoboxPaymentOrder = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = (req.user as any)?.userId || (req.user as any)?.id;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });

        const orderId = parseInt(String(req.params.id), 10);
        if (!orderId || isNaN(orderId)) {
            return res.status(400).json({ error: 'ID de orden inválido' });
        }

        // Verificar que la orden pertenezca al usuario y esté en estado cancelable
        const orderRes = await pool.query(
            `SELECT id, user_id, status, payment_reference, credit_applied, credit_service, wallet_applied
             FROM pobox_payments
             WHERE id = $1`,
            [orderId]
        );

        if (orderRes.rows.length === 0) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const order = orderRes.rows[0];
        if (Number(order.user_id) !== Number(userId)) {
            return res.status(403).json({ error: 'No autorizado para esta orden' });
        }

        const cancelableStatuses = ['pending_payment', 'pending', 'vouchers_partial'];
        if (!cancelableStatuses.includes(order.status)) {
            return res.status(400).json({
                error: 'No se puede cancelar',
                message: `La orden está en estado "${order.status}" y no puede ser cancelada.`
            });
        }

        // Reintegrar crédito si se había aplicado parcialmente
        const creditApplied = parseFloat(order.credit_applied || 0);
        if (creditApplied > 0 && order.credit_service) {
            try {
                await pool.query(
                    `UPDATE user_service_credits
                     SET used_credit = GREATEST(0, COALESCE(used_credit,0) - $1), updated_at = NOW()
                     WHERE user_id = $2 AND service = $3`,
                    [creditApplied, userId, order.credit_service]
                );
                console.log(`↩️ Crédito reintegrado: $${creditApplied} al servicio ${order.credit_service} (usuario ${userId})`);
            } catch (e) {
                console.warn('No se pudo reintegrar crédito al cancelar:', e);
            }
        }

        // Reintegrar saldo a favor si se había aplicado parcialmente
        const walletApplied = parseFloat(order.wallet_applied || 0);
        if (walletApplied > 0) {
            try {
                await pool.query(
                    `UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) + $1 WHERE id = $2`,
                    [walletApplied, userId]
                );
                try {
                    await pool.query(
                        `INSERT INTO financial_transactions (user_id, type, amount, description, reference_id, reference_type, created_at)
                         VALUES ($1, 'refund', $2, $3, $4, 'pobox_payment', NOW())`,
                        [userId, walletApplied, `Reversa por cancelación de orden ${order.payment_reference}`, orderId]
                    );
                } catch {}
                console.log(`↩️ Saldo a favor reintegrado: $${walletApplied} (usuario ${userId})`);
            } catch (e) {
                console.warn('No se pudo reintegrar saldo al cancelar:', e);
            }
        }

        // Marcar como cancelled
        await pool.query(
            `UPDATE pobox_payments
             SET status = 'cancelled'
             WHERE id = $1`,
            [orderId]
        );

        // Limpiar el log del dashboard para que los paquetes vuelvan a estar disponibles
        try {
            await pool.query(
                `UPDATE openpay_webhook_logs
                 SET estatus_procesamiento = 'cancelled'
                 WHERE transaction_id = $1
                   AND estatus_procesamiento = 'pending_payment'`,
                [order.payment_reference]
            );
        } catch (e) {
            console.warn('No se pudo actualizar webhook log al cancelar orden', e);
        }

        console.log(`🗑️ Orden de pago cancelada: ${order.payment_reference} (id ${orderId})`);

        return res.json({
            success: true,
            message: 'Orden de pago cancelada correctamente',
            reference: order.payment_reference
        });
    } catch (error) {
        console.error('Error cancelando orden de pago PO Box:', error);
        res.status(500).json({ error: 'Error al cancelar orden de pago' });
    }
};

/**
 * Pagar orden con saldo interno: Saldo a favor (wallet) o Crédito disponible
 * body: { method: 'wallet' | 'credit', requiere_factura?: boolean }
 *
 * Reglas:
 *  - Si method = 'wallet', descuenta del users.wallet_balance (no se permite factura).
 *  - Si method = 'credit', incrementa used_credit hasta available_credit.
 *  - Marca la orden como completed, paquetes como pagados, y genera factura si aplica.
 */
export const payPoboxOrderInternal = async (req: AuthRequest, res: Response): Promise<any> => {
    const client = await pool.connect();
    try {
        const userId = (req.user as any)?.userId || (req.user as any)?.id;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });

        const orderId = parseInt(String(req.params.id), 10);
        if (!orderId || isNaN(orderId)) {
            return res.status(400).json({ error: 'ID de orden inválido' });
        }

        const { method, service } = req.body || {};
        if (!method || !['wallet', 'credit'].includes(method)) {
            return res.status(400).json({ error: 'Método inválido. Usa wallet o credit.' });
        }

        await client.query('BEGIN');

        // Obtener orden
        const orderRes = await client.query(
            `SELECT id, user_id, status, amount, currency, payment_reference, package_ids
             FROM pobox_payments
             WHERE id = $1
             FOR UPDATE`,
            [orderId]
        );
        if (orderRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Orden no encontrada' });
        }
        const order = orderRes.rows[0];
        if (Number(order.user_id) !== Number(userId)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'No autorizado para esta orden' });
        }

        const payableStatuses = ['pending_payment', 'pending', 'vouchers_partial'];
        if (!payableStatuses.includes(order.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'No se puede pagar',
                message: `La orden está en estado "${order.status}".`
            });
        }

        const amount = parseFloat(order.amount);

        // Obtener monedero / crédito
        const userRes = await client.query(
            `SELECT wallet_balance, credit_limit, used_credit, is_credit_blocked
             FROM users WHERE id = $1 FOR UPDATE`,
            [userId]
        );
        if (userRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        const u = userRes.rows[0];
        const walletBalance = parseFloat(u.wallet_balance || 0);
        const creditLimit = parseFloat(u.credit_limit || 0);
        const usedCredit = parseFloat(u.used_credit || 0);
        const availableCredit = Math.max(0, creditLimit - usedCredit);

        if (method === 'wallet') {
            if (walletBalance < amount) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: 'Saldo insuficiente',
                    message: `Saldo disponible: $${walletBalance.toFixed(2)}. Requerido: $${amount.toFixed(2)}.`
                });
            }
            await client.query(
                `UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2`,
                [amount, userId]
            );
        } else if (method === 'credit') {
            if (u.is_credit_blocked) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Línea de crédito bloqueada' });
            }

            // Crédito disponible: si viene "service", usar sólo ese; sino el mejor de la tabla
            let serviceAvail = 0;
            let serviceRow: any = null;
            try {
                const svcRes = service
                    ? await client.query(
                        `SELECT id, service, credit_limit, used_credit, is_blocked
                         FROM user_service_credits
                         WHERE user_id = $1 AND service = $2 AND COALESCE(is_blocked,false) = FALSE
                         LIMIT 1
                         FOR UPDATE`,
                        [userId, service]
                    )
                    : await client.query(
                        `SELECT id, service, credit_limit, used_credit, is_blocked
                         FROM user_service_credits
                         WHERE user_id = $1 AND COALESCE(is_blocked,false) = FALSE
                         ORDER BY (COALESCE(credit_limit,0) - COALESCE(used_credit,0)) DESC
                         LIMIT 1
                         FOR UPDATE`,
                        [userId]
                    );
                if (svcRes.rows.length > 0) {
                    serviceRow = svcRes.rows[0];
                    serviceAvail = Math.max(
                        0,
                        parseFloat(serviceRow.credit_limit || 0) - parseFloat(serviceRow.used_credit || 0)
                    );
                }
            } catch (e) {
                // Tabla puede no existir; continuar con crédito wallet
            }

            // Si el cliente eligió un servicio específico, NO usar crédito wallet como fallback
            const bestAvail = service ? serviceAvail : Math.max(availableCredit, serviceAvail);
            if (bestAvail < amount) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: 'Crédito insuficiente',
                    message: `Crédito disponible: $${bestAvail.toFixed(2)}. Requerido: $${amount.toFixed(2)}.`
                });
            }

            // Preferir el crédito de servicio si cubre o si fue solicitado explícitamente
            if (serviceRow && serviceAvail >= amount) {
                await client.query(
                    `UPDATE user_service_credits SET used_credit = COALESCE(used_credit,0) + $1, updated_at = NOW() WHERE id = $2`,
                    [amount, serviceRow.id]
                );
            } else if (!service) {
                await client.query(
                    `UPDATE users SET used_credit = COALESCE(used_credit, 0) + $1 WHERE id = $2`,
                    [amount, userId]
                );
            } else {
                // service solicitado pero sin cupo (no debería ocurrir por validación anterior)
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Crédito insuficiente para el servicio seleccionado' });
            }
        }

        // Regla de negocio: pago interno (wallet/crédito) NO genera factura.
        // La factura se solicita únicamente en el flujo de tarjeta/PayPal.
        const willInvoice = false;

        // Marcar orden pagada
        await client.query(
            `UPDATE pobox_payments SET
                status = 'completed',
                paid_at = CURRENT_TIMESTAMP,
                payment_method = $1,
                requiere_factura = $2
             WHERE id = $3`,
            [method === 'wallet' ? 'wallet' : 'credit', willInvoice, orderId]
        );

        // Marcar paquetes como pagados
        const packageIds = typeof order.package_ids === 'string'
            ? JSON.parse(order.package_ids)
            : order.package_ids;

        if (Array.isArray(packageIds) && packageIds.length > 0) {
            await client.query(
                `UPDATE packages SET
                    payment_status = 'paid',
                    monto_pagado = COALESCE(assigned_cost_mxn, 0),
                    saldo_pendiente = 0,
                    costing_paid = TRUE,
                    client_paid = TRUE,
                    costing_paid_at = CURRENT_TIMESTAMP
                 WHERE id = ANY($1) OR master_id = ANY($1)`,
                [packageIds]
            );
        }

        // Log en webhook_logs para dashboard
        try {
            await client.query(
                `INSERT INTO openpay_webhook_logs (
                    transaction_id, monto_recibido, monto_neto, concepto,
                    fecha_pago, estatus_procesamiento, user_id, tipo_pago, payment_method, service_type
                 ) VALUES ($1, $2, $2, $3, CURRENT_TIMESTAMP, 'procesado', $4, $5, $5, 'POBOX_USA')`,
                [
                    `INTERNAL-${order.payment_reference}`,
                    amount,
                    `Pago PO Box (${method === 'wallet' ? 'Saldo a favor' : 'Crédito'}) - ${Array.isArray(packageIds) ? packageIds.length : 0} paquete(s)`,
                    userId,
                    method === 'wallet' ? 'wallet' : 'credit',
                ]
            );
        } catch (logErr) {
            console.warn('No se pudo registrar webhook log interno:', logErr);
        }

        await client.query('COMMIT');

        // Generar comisiones
        generateCommissionsForPackages(packageIds).catch(err =>
            console.error('Error generando comisiones (pago interno):', err)
        );

        // Facturación automática (no aplica en pagos internos)
        if (willInvoice) {
            try {
                const invoiceResult = await createInvoice({
                    paymentId: `INTERNAL-${order.payment_reference}`,
                    paymentType: 'pobox',
                    userId: userId,
                    amount: amount,
                    currency: order.currency || 'MXN',
                    paymentMethod: method,
                    description: `Servicio PO Box USA - ${Array.isArray(packageIds) ? packageIds.length : 0} paquete(s)`,
                    packageIds: packageIds,
                    serviceType: 'po_box'
                });
                if (invoiceResult?.success) {
                    await pool.query(
                        `UPDATE pobox_payments SET facturada = TRUE, factura_uuid = $1, factura_created_at = CURRENT_TIMESTAMP WHERE id = $2`,
                        [invoiceResult.uuid, orderId]
                    );
                } else {
                    await pool.query(
                        `UPDATE pobox_payments SET factura_error = $1 WHERE id = $2`,
                        [invoiceResult?.error || 'unknown', orderId]
                    );
                }
            } catch (invErr: any) {
                console.error('Error generando factura automática (interno):', invErr?.message || invErr);
            }
        }

        return res.json({
            success: true,
            message: method === 'wallet'
                ? '✅ Pago procesado con tu saldo a favor'
                : '✅ Pago procesado con tu línea de crédito',
            reference: order.payment_reference,
            method,
            amount,
            invoice_requested: willInvoice
        });
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error en pago interno PO Box:', error);
        res.status(500).json({ error: 'Error al procesar pago interno', message: error?.message });
    } finally {
        client.release();
    }
};

/**
 * Aplica parcialmente crédito (por servicio) a una orden pobox_payments y reduce el monto pendiente.
 * body: { service: string, credit_amount: number }
 *
 * - Descuenta credit_amount del user_service_credits.used_credit
 * - Actualiza pobox_payments: amount = amount - credit_amount, credit_applied += credit_amount, credit_service, credit_applied_at
 * - Si amount restante llega a 0, marca la orden como completed y los paquetes pagados.
 * - Si queda monto pendiente, deja la orden abierta para completarse con otro método (tarjeta/paypal/saldo).
 */
export const applyCreditToPoboxOrder = async (req: AuthRequest, res: Response): Promise<any> => {
    const client = await pool.connect();
    try {
        const userId = (req.user as any)?.userId || (req.user as any)?.id;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });

        const orderId = parseInt(String(req.params.id), 10);
        if (!orderId || isNaN(orderId)) return res.status(400).json({ error: 'ID de orden inválido' });

        const { service, credit_amount } = req.body || {};
        const reqAmount = Number(credit_amount || 0);
        if (!service || !(reqAmount > 0)) {
            return res.status(400).json({ error: 'Parámetros inválidos (service, credit_amount)' });
        }

        await client.query('BEGIN');

        const orderRes = await client.query(
            `SELECT id, user_id, status, amount, currency, payment_reference, package_ids, credit_applied
             FROM pobox_payments WHERE id = $1 FOR UPDATE`,
            [orderId]
        );
        if (orderRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Orden no encontrada' });
        }
        const order = orderRes.rows[0];
        if (Number(order.user_id) !== Number(userId)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'No autorizado' });
        }
        const payableStatuses = ['pending_payment', 'pending', 'vouchers_partial'];
        if (!payableStatuses.includes(order.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Orden no pagable' });
        }

        const orderAmount = parseFloat(order.amount);
        const applied = Math.min(reqAmount, orderAmount); // no exceder el monto pendiente

        // Validar bloqueo global
        const u = await client.query(`SELECT is_credit_blocked FROM users WHERE id = $1`, [userId]);
        if (u.rows[0]?.is_credit_blocked) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Línea de crédito bloqueada' });
        }

        // Buscar línea de crédito del servicio
        const svcRes = await client.query(
            `SELECT id, credit_limit, used_credit, is_blocked
             FROM user_service_credits
             WHERE user_id = $1 AND service = $2 AND COALESCE(is_blocked,false) = FALSE
             FOR UPDATE`,
            [userId, service]
        );
        if (svcRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No tienes crédito disponible para este servicio' });
        }
        const svcRow = svcRes.rows[0];
        const svcAvail = Math.max(0, parseFloat(svcRow.credit_limit || 0) - parseFloat(svcRow.used_credit || 0));
        if (svcAvail < applied) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'Crédito insuficiente',
                message: `Crédito disponible: $${svcAvail.toFixed(2)}. Solicitado: $${applied.toFixed(2)}`
            });
        }

        // Descontar crédito de servicio
        await client.query(
            `UPDATE user_service_credits SET used_credit = COALESCE(used_credit,0) + $1, updated_at = NOW() WHERE id = $2`,
            [applied, svcRow.id]
        );

        // Actualizar orden
        const newAmount = Math.max(0, orderAmount - applied);
        await client.query(
            `UPDATE pobox_payments SET
                amount = $1,
                credit_applied = COALESCE(credit_applied,0) + $2,
                credit_service = $3,
                credit_applied_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [newAmount, applied, service, orderId]
        );

        let completed = false;
        if (newAmount <= 0.009) {
            // Pago cubierto 100% con crédito
            await client.query(
                `UPDATE pobox_payments SET status='completed', paid_at=CURRENT_TIMESTAMP, payment_method='credit' WHERE id=$1`,
                [orderId]
            );

            const packageIds = typeof order.package_ids === 'string' ? JSON.parse(order.package_ids) : order.package_ids;
            if (Array.isArray(packageIds) && packageIds.length > 0) {
                await client.query(
                    `UPDATE packages SET
                        payment_status='paid',
                        monto_pagado = COALESCE(assigned_cost_mxn, 0),
                        saldo_pendiente = 0,
                        costing_paid = TRUE,
                        client_paid = TRUE,
                        costing_paid_at = CURRENT_TIMESTAMP
                     WHERE id = ANY($1) OR master_id = ANY($1)`,
                    [packageIds]
                );
            }
            try {
                await client.query(
                    `INSERT INTO openpay_webhook_logs (
                        transaction_id, monto_recibido, monto_neto, concepto,
                        fecha_pago, estatus_procesamiento, user_id, tipo_pago, service_type
                     ) VALUES ($1, $2, $2, $3, CURRENT_TIMESTAMP, 'procesado', $4, 'credit', 'POBOX_USA')`,
                    [
                        `CREDIT-${order.payment_reference}`,
                        applied,
                        `Pago PO Box (Crédito ${service}) - ${Array.isArray(packageIds) ? packageIds.length : 0} paquete(s)`,
                        userId,
                    ]
                );
            } catch (logErr) {
                console.warn('No se pudo registrar log crédito:', logErr);
            }

            completed = true;
            await client.query('COMMIT');
            if (Array.isArray(packageIds)) {
                generateCommissionsForPackages(packageIds).catch(err =>
                    console.error('Error comisiones (crédito total):', err)
                );
            }
        } else {
            await client.query('COMMIT');
        }

        return res.json({
            success: true,
            message: completed
                ? '✅ Pago cubierto totalmente con crédito'
                : `✅ Crédito aplicado. Restante: $${newAmount.toFixed(2)}`,
            credit_applied: applied,
            new_amount: newAmount,
            completed,
            reference: order.payment_reference
        });
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error aplicando crédito:', error);
        res.status(500).json({ error: 'Error al aplicar crédito', message: error?.message });
    } finally {
        client.release();
    }
};

/**
 * REVERTIR crédito aplicado a una orden PO Box (si el pago externo no se concretó).
 * - Devuelve el crédito a user_service_credits (used_credit -= credit_applied)
 * - Restaura pobox_payments.amount += credit_applied
 * - Limpia credit_applied, credit_service, credit_applied_at
 * - Solo permitido si la orden sigue en status pending/pending_payment/vouchers_partial
 */
export const revertCreditFromPoboxOrder = async (req: AuthRequest, res: Response): Promise<any> => {
    const orderId = parseInt(req.params.id as string);
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'No autorizado' });
    if (!orderId) return res.status(400).json({ error: 'ID de orden inválido' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const orderRes = await client.query(
            `SELECT id, user_id, status, amount, credit_applied, credit_service, payment_reference
             FROM pobox_payments WHERE id = $1 AND user_id = $2 FOR UPDATE`,
            [orderId, userId]
        );
        if (orderRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Orden no encontrada' });
        }
        const order = orderRes.rows[0];
        const allowedStatuses = ['pending_payment', 'pending', 'vouchers_partial'];
        if (!allowedStatuses.includes(order.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `No se puede revertir crédito en una orden con status ${order.status}` });
        }

        const creditApplied = parseFloat(order.credit_applied || 0);
        if (creditApplied <= 0) {
            await client.query('ROLLBACK');
            return res.json({ success: true, message: 'No había crédito aplicado', reverted: 0 });
        }

        const service = order.credit_service;
        if (service) {
            await client.query(
                `UPDATE user_service_credits
                 SET used_credit = GREATEST(0, COALESCE(used_credit,0) - $1),
                     updated_at = NOW()
                 WHERE user_id = $2 AND service = $3`,
                [creditApplied, userId, service]
            );
        }

        const updRes = await client.query(
            `UPDATE pobox_payments
             SET amount = COALESCE(amount,0) + $2,
                 credit_applied = 0,
                 credit_service = NULL,
                 credit_applied_at = NULL
             WHERE id = $1
             RETURNING amount`,
            [orderId, creditApplied]
        );

        await client.query('COMMIT');

        return res.json({
            success: true,
            message: `✅ Crédito revertido: $${creditApplied.toFixed(2)}`,
            reverted: creditApplied,
            new_amount: parseFloat(updRes.rows[0].amount),
            reference: order.payment_reference
        });
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error revirtiendo crédito:', error);
        res.status(500).json({ error: 'Error al revertir crédito', message: error?.message });
    } finally {
        client.release();
    }
};

/**
 * Aplica parcialmente SALDO A FAVOR (wallet) a una orden pobox_payments y reduce el monto pendiente.
 * body: { wallet_amount: number }
 *
 * - Descuenta wallet_amount del users.wallet_balance
 * - Actualiza pobox_payments: amount = amount - wallet_amount, wallet_applied += wallet_amount, wallet_applied_at
 * - Registra financial_transactions tipo 'payment' por trazabilidad
 * - Si amount restante llega a 0, marca la orden como completed y los paquetes pagados.
 */
export const applyWalletToPoboxOrder = async (req: AuthRequest, res: Response): Promise<any> => {
    const client = await pool.connect();
    try {
        const userId = (req.user as any)?.userId || (req.user as any)?.id;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });

        const orderId = parseInt(String(req.params.id), 10);
        if (!orderId || isNaN(orderId)) return res.status(400).json({ error: 'ID de orden inválido' });

        const { wallet_amount } = req.body || {};
        const reqAmount = Number(wallet_amount || 0);
        if (!(reqAmount > 0)) {
            return res.status(400).json({ error: 'Parámetro inválido (wallet_amount)' });
        }

        await client.query('BEGIN');

        const orderRes = await client.query(
            `SELECT id, user_id, status, amount, currency, payment_reference, package_ids, wallet_applied
             FROM pobox_payments WHERE id = $1 FOR UPDATE`,
            [orderId]
        );
        if (orderRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Orden no encontrada' });
        }
        const order = orderRes.rows[0];
        if (Number(order.user_id) !== Number(userId)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'No autorizado' });
        }
        const payableStatuses = ['pending_payment', 'pending', 'vouchers_partial'];
        if (!payableStatuses.includes(order.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Orden no pagable' });
        }

        const orderAmount = parseFloat(order.amount);
        const applied = Math.min(reqAmount, orderAmount);

        // Validar saldo disponible
        const uRes = await client.query(
            `SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE`,
            [userId]
        );
        const walletBalance = parseFloat(uRes.rows[0]?.wallet_balance || 0);
        if (walletBalance < applied) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'Saldo insuficiente',
                message: `Saldo disponible: $${walletBalance.toFixed(2)}. Solicitado: $${applied.toFixed(2)}`
            });
        }

        // Descontar saldo
        const newWallet = walletBalance - applied;
        await client.query(
            `UPDATE users SET wallet_balance = $1 WHERE id = $2`,
            [newWallet, userId]
        );

        // Registrar transacción (si la tabla existe) — usar SAVEPOINT para no abortar el tx
        try {
            await client.query('SAVEPOINT sp_fintx');
            await client.query(
                `INSERT INTO financial_transactions
                 (user_id, type, amount, balance_after, description, reference_id, reference_type, created_at)
                 VALUES ($1, 'payment', $2, $3, $4, $5, 'pobox_payment', NOW())`,
                [
                    userId,
                    -applied,
                    newWallet,
                    `Aplicado a orden ${order.payment_reference}`,
                    orderId,
                ]
            );
            await client.query('RELEASE SAVEPOINT sp_fintx');
        } catch (e) {
            await client.query('ROLLBACK TO SAVEPOINT sp_fintx').catch(() => {});
            console.warn('No se pudo registrar financial_transactions (wallet):', (e as any)?.message);
        }

        // Actualizar orden
        const newAmount = Math.max(0, orderAmount - applied);
        await client.query(
            `UPDATE pobox_payments SET
                amount = $1,
                wallet_applied = COALESCE(wallet_applied,0) + $2,
                wallet_applied_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [newAmount, applied, orderId]
        );

        let completed = false;
        if (newAmount <= 0.009) {
            await client.query(
                `UPDATE pobox_payments SET status='completed', paid_at=CURRENT_TIMESTAMP, payment_method='wallet' WHERE id=$1`,
                [orderId]
            );

            const packageIds = typeof order.package_ids === 'string' ? JSON.parse(order.package_ids) : order.package_ids;
            if (Array.isArray(packageIds) && packageIds.length > 0) {
                await client.query(
                    `UPDATE packages SET
                        payment_status='paid',
                        monto_pagado = COALESCE(assigned_cost_mxn, 0),
                        saldo_pendiente = 0,
                        costing_paid = TRUE,
                        client_paid = TRUE,
                        costing_paid_at = CURRENT_TIMESTAMP
                     WHERE id = ANY($1) OR master_id = ANY($1)`,
                    [packageIds]
                );
            }
            try {
                await client.query(
                    `INSERT INTO openpay_webhook_logs (
                        transaction_id, monto_recibido, monto_neto, concepto,
                        fecha_pago, estatus_procesamiento, user_id, tipo_pago, service_type
                     ) VALUES ($1, $2, $2, $3, CURRENT_TIMESTAMP, 'procesado', $4, 'wallet', 'POBOX_USA')`,
                    [
                        `WALLET-${order.payment_reference}`,
                        applied,
                        `Pago PO Box (Saldo a favor) - ${Array.isArray(packageIds) ? packageIds.length : 0} paquete(s)`,
                        userId,
                    ]
                );
            } catch (logErr) {
                console.warn('No se pudo registrar log wallet:', logErr);
            }

            completed = true;
            await client.query('COMMIT');
            if (Array.isArray(packageIds)) {
                generateCommissionsForPackages(packageIds).catch(err =>
                    console.error('Error comisiones (wallet total):', err)
                );
            }
        } else {
            await client.query('COMMIT');
        }

        return res.json({
            success: true,
            message: completed
                ? '✅ Pago cubierto totalmente con saldo a favor'
                : `✅ Saldo aplicado. Restante: $${newAmount.toFixed(2)}`,
            wallet_applied: applied,
            new_amount: newAmount,
            new_wallet_balance: newWallet,
            completed,
            reference: order.payment_reference
        });
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error aplicando saldo a favor:', error);
        res.status(500).json({ error: 'Error al aplicar saldo a favor', message: error?.message });
    } finally {
        client.release();
    }
};

/**
 * REVERTIR saldo a favor aplicado a una orden (si el pago externo no se concretó).
 */
export const revertWalletFromPoboxOrder = async (req: AuthRequest, res: Response): Promise<any> => {
    const orderId = parseInt(req.params.id as string);
    const userId = (req.user as any)?.userId || (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'No autorizado' });
    if (!orderId) return res.status(400).json({ error: 'ID de orden inválido' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const orderRes = await client.query(
            `SELECT id, user_id, status, amount, wallet_applied, payment_reference
             FROM pobox_payments WHERE id = $1 AND user_id = $2 FOR UPDATE`,
            [orderId, userId]
        );
        if (orderRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Orden no encontrada' });
        }
        const order = orderRes.rows[0];
        const allowedStatuses = ['pending_payment', 'pending', 'vouchers_partial'];
        if (!allowedStatuses.includes(order.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `No se puede revertir saldo en una orden con status ${order.status}` });
        }

        const walletApplied = parseFloat(order.wallet_applied || 0);
        if (walletApplied <= 0) {
            await client.query('ROLLBACK');
            return res.json({ success: true, message: 'No había saldo aplicado', reverted: 0 });
        }

        // Reintegrar al wallet del usuario
        const uRes = await client.query(
            `UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) + $1 WHERE id = $2 RETURNING wallet_balance`,
            [walletApplied, userId]
        );
        const newBalance = parseFloat(uRes.rows[0]?.wallet_balance || 0);

        try {
            await client.query(
                `INSERT INTO financial_transactions
                 (user_id, type, amount, balance_after, description, reference_id, reference_type, created_at)
                 VALUES ($1, 'refund', $2, $3, $4, $5, 'pobox_payment', NOW())`,
                [
                    userId,
                    walletApplied,
                    newBalance,
                    `Reversa de saldo aplicado a orden ${order.payment_reference}`,
                    orderId,
                ]
            );
        } catch (e) {
            console.warn('No se pudo registrar reversa en financial_transactions:', (e as any)?.message);
        }

        const updRes = await client.query(
            `UPDATE pobox_payments
             SET amount = COALESCE(amount,0) + $2,
                 wallet_applied = 0,
                 wallet_applied_at = NULL
             WHERE id = $1
             RETURNING amount`,
            [orderId, walletApplied]
        );

        await client.query('COMMIT');

        return res.json({
            success: true,
            message: `✅ Saldo revertido: $${walletApplied.toFixed(2)}`,
            reverted: walletApplied,
            new_amount: parseFloat(updRes.rows[0].amount),
            new_wallet_balance: newBalance,
            reference: order.payment_reference
        });
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error revirtiendo saldo a favor:', error);
        res.status(500).json({ error: 'Error al revertir saldo a favor', message: error?.message });
    } finally {
        client.release();
    }
};