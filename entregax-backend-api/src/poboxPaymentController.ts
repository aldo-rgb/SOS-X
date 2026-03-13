import { Request, Response } from 'express';
import { pool } from './db';
import axios from 'axios';
import crypto from 'crypto';
import { getOpenpayCredentials, ServiceType } from './services/openpayConfig';
import { createInvoice } from './fiscalController';

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
                    WHERE id = ANY($2)
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
        const { packageIds, userId, totalAmount, currency = 'MXN', branchId } = req.body;

        if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
            return res.status(400).json({ error: 'packageIds es requerido y debe ser un array' });
        }

        if (!totalAmount || totalAmount <= 0) {
            return res.status(400).json({ error: 'totalAmount es requerido y debe ser mayor a 0' });
        }

        // Verificar que los paquetes existen y pertenecen al usuario
        // Paquetes PO Box USA: service_type NULL o vacío, excluir FCL/maritime/china_air/dhl
        const packagesCheck = await pool.query(
            `SELECT id, tracking_internal, status, service_type, assigned_cost_mxn
             FROM packages 
             WHERE id = ANY($1) AND user_id = $2 
             AND (service_type IS NULL OR service_type NOT IN ('fcl', 'maritime', 'china_air', 'dhl'))`,
            [packageIds, userId]
        );

        if (packagesCheck.rows.length !== packageIds.length) {
            return res.status(400).json({ error: 'Algunos paquetes no existen o no pertenecen al usuario' });
        }

        // ✨ NUEVO: Verificar si ya existe un pago pendiente para estos mismos paquetes
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
              AND pp.expires_at > CURRENT_TIMESTAMP
            ORDER BY pp.created_at DESC
            LIMIT 1
        `, [userId, JSON.stringify(sortedPackageIds)]);

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
                     WHERE scc.service_type = 'POBOX_USA' AND scc.is_active = TRUE`
                );
                if (companyResult.rows.length > 0) {
                    companyInfo = companyResult.rows[0];
                }
            } catch (e) {
                console.log('No se encontró config de empresa para POBOX_USA');
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
        // Generar referencia única
        const paymentRef = generatePaymentReference('EF');

        // Obtener información de la empresa asignada al servicio POBOX_USA
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
                 WHERE scc.service_type = 'POBOX_USA' AND scc.is_active = TRUE`
            );
            if (companyResult.rows.length > 0) {
                companyInfo = companyResult.rows[0];
                empresaId = companyInfo.empresa_id;
            }
        } catch (e) {
            console.log('No se encontró config de empresa para POBOX_USA');
        }

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

        // Crear registro de pago
        const paymentResult = await pool.query(`
            INSERT INTO pobox_payments (
                user_id, package_ids, amount, currency, payment_method, 
                payment_reference, status, expires_at, created_at
            ) VALUES ($1, $2, $3, $4, 'cash', $5, 'pending_payment', 
                      CURRENT_TIMESTAMP + INTERVAL '48 hours', CURRENT_TIMESTAMP)
            RETURNING id, expires_at
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
                    $5, CURRENT_TIMESTAMP, 'pending_payment', 'POBOX_USA',
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
                    expires_at: payment.expires_at,
                    trackings: trackings
                }),
                branchId || null
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
            expiresAt: payment.expires_at,
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

                // Actualizar paquete
                await client.query(`
                    UPDATE packages SET 
                        payment_status = 'paid',
                        monto_pagado = assigned_cost_mxn,
                        saldo_pendiente = 0,
                        costing_paid = TRUE,
                        costing_paid_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [pkgId]);
            }
        }

        await client.query('COMMIT');

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
                        WHERE id = ANY($2)
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
                p.paid_at
            FROM pobox_payments p
            WHERE p.user_id = $1
            ORDER BY p.created_at DESC
            LIMIT 50
        `, [userId]);

        res.json({
            success: true,
            payments: result.rows
        });
    } catch (error) {
        console.error('Error obteniendo historial de pagos PO Box:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
};
