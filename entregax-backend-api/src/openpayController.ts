import { Request, Response } from 'express';
import { pool } from './db';
import axios from 'axios';
import crypto from 'crypto';
import { generateCommissionsForPackages } from './commissionService';

// ============================================
// OPENPAY MULTI-EMPRESA - SPEI AUTOMATIZADO
// Cada empresa emisora tiene su propia cuenta Openpay
// ============================================

const OPENPAY_BASE_URL_SANDBOX = 'https://sandbox-api.openpay.mx/v1';
const OPENPAY_BASE_URL_PRODUCTION = 'https://api.openpay.mx/v1';

// Helper para obtener URL base según modo
const getOpenpayUrl = (merchantId: string, production: boolean) => {
    const base = production ? OPENPAY_BASE_URL_PRODUCTION : OPENPAY_BASE_URL_SANDBOX;
    return `${base}/${merchantId}`;
};

// Helper para crear headers de autenticación
const getOpenpayAuth = (privateKey: string) => {
    return {
        auth: {
            username: privateKey,
            password: ''
        }
    };
};

// ============================================
// CONFIGURACIÓN DE OPENPAY POR EMPRESA
// ============================================

// Guardar configuración Openpay para una empresa
export const saveOpenpayConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const { 
            empresa_id, 
            merchant_id, 
            private_key, 
            public_key, 
            production_mode,
            webhook_secret,
            commission_fee 
        } = req.body;

        if (!empresa_id || !merchant_id || !private_key) {
            return res.status(400).json({ error: 'empresa_id, merchant_id y private_key son requeridos' });
        }

        // Verificar que la empresa existe
        const empresa = await pool.query('SELECT id, alias FROM fiscal_emitters WHERE id = $1', [empresa_id]);
        if (empresa.rows.length === 0) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        // Probar conexión con Openpay
        const testUrl = getOpenpayUrl(merchant_id, production_mode || false);
        try {
            await axios.get(`${testUrl}/customers?limit=1`, getOpenpayAuth(private_key));
            console.log(`✅ Conexión Openpay exitosa para empresa ${empresa.rows[0].alias}`);
        } catch (openpayError: any) {
            console.error('❌ Error conectando a Openpay:', openpayError.response?.data || openpayError.message);
            return res.status(400).json({ 
                error: 'Credenciales de Openpay inválidas', 
                details: openpayError.response?.data?.description || openpayError.message 
            });
        }

        // Guardar configuración
        await pool.query(`
            UPDATE fiscal_emitters SET
                openpay_merchant_id = $1,
                openpay_private_key = $2,
                openpay_public_key = $3,
                openpay_production_mode = $4,
                openpay_webhook_secret = $5,
                openpay_commission_fee = $6,
                openpay_configured = TRUE
            WHERE id = $7
        `, [merchant_id, private_key, public_key, production_mode || false, webhook_secret, commission_fee || 10, empresa_id]);

        res.json({ 
            success: true, 
            message: `Configuración Openpay guardada para ${empresa.rows[0].alias}`,
            webhook_url: `${process.env.API_URL || 'https://api.entregax.com'}/webhooks/openpay/${empresa_id}`
        });
    } catch (error) {
        console.error('Error guardando config Openpay:', error);
        res.status(500).json({ error: 'Error al guardar configuración' });
    }
};

// Obtener configuración Openpay de una empresa (sin claves sensibles)
export const getOpenpayConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const { empresa_id } = req.params;

        const result = await pool.query(`
            SELECT 
                id, alias, rfc,
                openpay_merchant_id,
                openpay_public_key,
                openpay_production_mode,
                openpay_commission_fee,
                openpay_configured,
                CASE WHEN openpay_private_key IS NOT NULL THEN '********' ELSE NULL END as has_private_key
            FROM fiscal_emitters 
            WHERE id = $1
        `, [empresa_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo config Openpay:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
};

// Listar empresas con su estado de configuración Openpay
export const getEmpresasOpenpay = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(`
            SELECT 
                id, alias, rfc, business_name, fiscal_regime, zip_code, is_active, created_at,
                openpay_configured,
                openpay_production_mode,
                openpay_merchant_id,
                bank_name, bank_clabe, bank_account,
                paypal_configured, paypal_sandbox,
                belvo_connected, belvo_institution, belvo_last_sync,
                facturama_configured, facturama_environment, facturama_reception_enabled, facturama_last_sync,
                (facturapi_api_key IS NOT NULL AND LENGTH(facturapi_api_key) > 0) AS facturapi_configured,
                facturapi_environment, facturapi_enabled, facturapi_last_sync, facturapi_last_sync_count,
                (SELECT COUNT(*) FROM users u WHERE u.openpay_empresa_id = fiscal_emitters.id AND u.virtual_clabe IS NOT NULL) as clientes_con_clabe
            FROM fiscal_emitters 
            WHERE is_active = TRUE
            ORDER BY alias
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo empresas Openpay:', error);
        res.status(500).json({ error: 'Error al obtener empresas' });
    }
};

// ============================================
// CONFIGURACIÓN DE CUENTA BANCARIA POR EMPRESA
// ============================================
export const saveBankConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const { empresa_id, bank_name, bank_clabe, bank_account } = req.body;

        if (!empresa_id || !bank_name || !bank_clabe) {
            return res.status(400).json({ error: 'empresa_id, bank_name y bank_clabe son requeridos' });
        }

        // Validar CLABE (18 dígitos)
        if (!/^\d{18}$/.test(bank_clabe)) {
            return res.status(400).json({ error: 'La CLABE debe tener exactamente 18 dígitos' });
        }

        // Verificar que la empresa existe
        const empresa = await pool.query('SELECT id, alias FROM fiscal_emitters WHERE id = $1', [empresa_id]);
        if (empresa.rows.length === 0) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        // Guardar configuración bancaria
        await pool.query(`
            UPDATE fiscal_emitters SET
                bank_name = $1,
                bank_clabe = $2,
                bank_account = $3
            WHERE id = $4
        `, [bank_name, bank_clabe, bank_account || bank_clabe.slice(-10), empresa_id]);

        console.log(`🏦 Configuración bancaria guardada para ${empresa.rows[0].alias}`);

        res.json({ 
            success: true, 
            message: `Cuenta bancaria configurada para ${empresa.rows[0].alias}`,
            bank: {
                name: bank_name,
                clabe: bank_clabe,
                account: bank_account || bank_clabe.slice(-10)
            }
        });
    } catch (error) {
        console.error('Error guardando config bancaria:', error);
        res.status(500).json({ error: 'Error al guardar configuración bancaria' });
    }
};

// Obtener configuración bancaria de una empresa
export const getBankConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const { empresa_id } = req.params;

        const result = await pool.query(`
            SELECT 
                id, alias, bank_name, bank_clabe, bank_account, business_name as legal_name
            FROM fiscal_emitters 
            WHERE id = $1
        `, [empresa_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo config bancaria:', error);
        res.status(500).json({ error: 'Error al obtener configuración bancaria' });
    }
};

// ============================================
// CONFIGURACIÓN DE PAYPAL POR EMPRESA
// ============================================
const PAYPAL_API_SANDBOX = 'https://api-m.sandbox.paypal.com';
const PAYPAL_API_PRODUCTION = 'https://api-m.paypal.com';

export const savePaypalConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const { empresa_id, paypal_client_id, paypal_secret, paypal_sandbox } = req.body;

        if (!empresa_id || !paypal_client_id || !paypal_secret) {
            return res.status(400).json({ error: 'empresa_id, paypal_client_id y paypal_secret son requeridos' });
        }

        // Verificar que la empresa existe
        const empresa = await pool.query('SELECT id, alias FROM fiscal_emitters WHERE id = $1', [empresa_id]);
        if (empresa.rows.length === 0) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        // Probar conexión con PayPal
        const paypalApi = paypal_sandbox !== false ? PAYPAL_API_SANDBOX : PAYPAL_API_PRODUCTION;
        try {
            const auth = Buffer.from(`${paypal_client_id}:${paypal_secret}`).toString('base64');
            await axios.post(
                `${paypalApi}/v1/oauth2/token`,
                'grant_type=client_credentials',
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            console.log(`✅ Conexión PayPal exitosa para empresa ${empresa.rows[0].alias}`);
        } catch (paypalError: any) {
            console.error('❌ Error conectando a PayPal:', paypalError.response?.data || paypalError.message);
            return res.status(400).json({ 
                error: 'Credenciales de PayPal inválidas', 
                details: paypalError.response?.data?.error_description || paypalError.message 
            });
        }

        // Guardar configuración
        await pool.query(`
            UPDATE fiscal_emitters SET
                paypal_client_id = $1,
                paypal_secret = $2,
                paypal_sandbox = $3,
                paypal_configured = TRUE
            WHERE id = $4
        `, [paypal_client_id, paypal_secret, paypal_sandbox !== false, empresa_id]);

        res.json({ 
            success: true, 
            message: `PayPal configurado para ${empresa.rows[0].alias}`,
            mode: paypal_sandbox !== false ? 'sandbox' : 'production'
        });
    } catch (error) {
        console.error('Error guardando config PayPal:', error);
        res.status(500).json({ error: 'Error al guardar configuración de PayPal' });
    }
};

// Obtener configuración PayPal de una empresa (sin claves sensibles)
export const getPaypalConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const { empresa_id } = req.params;

        const result = await pool.query(`
            SELECT 
                id, alias,
                paypal_client_id,
                paypal_sandbox,
                paypal_configured,
                CASE WHEN paypal_secret IS NOT NULL THEN '********' ELSE NULL END as has_secret
            FROM fiscal_emitters 
            WHERE id = $1
        `, [empresa_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo config PayPal:', error);
        res.status(500).json({ error: 'Error al obtener configuración de PayPal' });
    }
};

// Obtener configuración completa de empresa (Openpay, Banco, PayPal)
export const getEmpresaFullConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const { empresa_id } = req.params;

        const result = await pool.query(`
            SELECT 
                id, alias, rfc, business_name, fiscal_regime, zip_code,
                -- Openpay
                openpay_merchant_id,
                openpay_public_key,
                openpay_production_mode,
                openpay_commission_fee,
                openpay_configured,
                CASE WHEN openpay_private_key IS NOT NULL THEN TRUE ELSE FALSE END as openpay_has_private_key,
                -- Banco
                bank_name,
                bank_clabe,
                bank_account,
                -- PayPal
                paypal_client_id,
                paypal_sandbox,
                paypal_configured,
                CASE WHEN paypal_secret IS NOT NULL THEN TRUE ELSE FALSE END as paypal_has_secret
            FROM fiscal_emitters 
            WHERE id = $1
        `, [empresa_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo config completa:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
};

// ============================================
// GESTIÓN DE CLIENTES Y CLABEs VIRTUALES
// ============================================

// Crear cliente en Openpay y asignar CLABE virtual
export const createOpenpayCustomer = async (req: Request, res: Response): Promise<any> => {
    try {
        const { user_id, empresa_id } = req.body;

        if (!user_id || !empresa_id) {
            return res.status(400).json({ error: 'user_id y empresa_id son requeridos' });
        }

        // Obtener usuario
        const userResult = await pool.query(
            'SELECT id, full_name, email, phone, openpay_customer_id, virtual_clabe FROM users WHERE id = $1',
            [user_id]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        const user = userResult.rows[0];

        // Verificar si ya tiene CLABE
        if (user.virtual_clabe) {
            return res.json({ 
                message: 'El usuario ya tiene CLABE virtual asignada',
                clabe: user.virtual_clabe,
                customer_id: user.openpay_customer_id
            });
        }

        // Obtener configuración de la empresa
        const empresaResult = await pool.query(
            'SELECT * FROM fiscal_emitters WHERE id = $1 AND openpay_configured = TRUE',
            [empresa_id]
        );
        if (empresaResult.rows.length === 0) {
            return res.status(400).json({ error: 'Empresa no tiene Openpay configurado' });
        }
        const empresa = empresaResult.rows[0];

        // Crear cliente en Openpay
        const openpayUrl = getOpenpayUrl(empresa.openpay_merchant_id, empresa.openpay_production_mode);
        
        const customerData = {
            name: user.full_name?.split(' ')[0] || 'Cliente',
            last_name: user.full_name?.split(' ').slice(1).join(' ') || 'EntregaX',
            email: user.email || `cliente${user.id}@entregax.com`,
            phone_number: user.phone?.replace(/\D/g, '').slice(-10) || '0000000000',
            requires_account: true // Esto genera la CLABE virtual STP
        };

        console.log(`🏦 Creando cliente Openpay para ${user.full_name}...`);
        
        const openpayResponse = await axios.post(
            `${openpayUrl}/customers`,
            customerData,
            getOpenpayAuth(empresa.openpay_private_key)
        );

        const openpayCustomer = openpayResponse.data;
        const clabe = openpayCustomer.clabe; // La CLABE virtual asignada por STP

        // Guardar en base de datos
        await pool.query(`
            UPDATE users SET 
                openpay_customer_id = $1,
                virtual_clabe = $2,
                openpay_empresa_id = $3,
                clabe_created_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [openpayCustomer.id, clabe, empresa_id, user_id]);

        console.log(`✅ CLABE ${clabe} asignada a ${user.full_name}`);

        res.json({
            success: true,
            message: 'Cliente creado y CLABE asignada',
            customer_id: openpayCustomer.id,
            clabe: clabe,
            empresa: empresa.alias
        });
    } catch (error: any) {
        console.error('Error creando cliente Openpay:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Error al crear cliente en Openpay',
            details: error.response?.data?.description || error.message
        });
    }
};

// Obtener CLABE de un usuario
export const getUserClabe = async (req: Request, res: Response): Promise<any> => {
    try {
        const { user_id } = req.params;

        const result = await pool.query(`
            SELECT 
                u.id, u.full_name, u.email, u.virtual_clabe, u.openpay_customer_id,
                fe.alias as empresa_alias, fe.business_name as empresa_nombre
            FROM users u
            LEFT JOIN fiscal_emitters fe ON u.openpay_empresa_id = fe.id
            WHERE u.id = $1
        `, [user_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const user = result.rows[0];

        if (!user.virtual_clabe) {
            return res.status(404).json({ 
                error: 'Usuario no tiene CLABE asignada',
                message: 'Debe solicitar la generación de CLABE virtual'
            });
        }

        res.json({
            user_id: user.id,
            nombre: user.full_name,
            clabe: user.virtual_clabe,
            banco_destino: 'STP (Sistema de Transferencias y Pagos)',
            beneficiario: user.empresa_nombre || 'EntregaX',
            instrucciones: 'Realiza tu transferencia SPEI a esta CLABE. El pago se aplicará automáticamente a tu cuenta.'
        });
    } catch (error) {
        console.error('Error obteniendo CLABE:', error);
        res.status(500).json({ error: 'Error al obtener CLABE' });
    }
};

// Generar CLABEs en lote para clientes de una empresa
export const generateClabeBatch = async (req: Request, res: Response): Promise<any> => {
    try {
        const { empresa_id, user_ids } = req.body;

        if (!empresa_id || !user_ids || !Array.isArray(user_ids)) {
            return res.status(400).json({ error: 'empresa_id y user_ids (array) son requeridos' });
        }

        // Obtener configuración de la empresa
        const empresaResult = await pool.query(
            'SELECT * FROM fiscal_emitters WHERE id = $1 AND openpay_configured = TRUE',
            [empresa_id]
        );
        if (empresaResult.rows.length === 0) {
            return res.status(400).json({ error: 'Empresa no tiene Openpay configurado' });
        }
        const empresa = empresaResult.rows[0];

        const results = [];
        const errors = [];

        for (const userId of user_ids) {
            try {
                const userResult = await pool.query(
                    'SELECT id, full_name, email, phone, virtual_clabe FROM users WHERE id = $1',
                    [userId]
                );
                
                if (userResult.rows.length === 0) {
                    errors.push({ user_id: userId, error: 'Usuario no encontrado' });
                    continue;
                }

                const user = userResult.rows[0];

                if (user.virtual_clabe) {
                    results.push({ user_id: userId, clabe: user.virtual_clabe, status: 'existente' });
                    continue;
                }

                // Crear en Openpay
                const openpayUrl = getOpenpayUrl(empresa.openpay_merchant_id, empresa.openpay_production_mode);
                const customerData = {
                    name: user.full_name?.split(' ')[0] || 'Cliente',
                    last_name: user.full_name?.split(' ').slice(1).join(' ') || 'EntregaX',
                    email: user.email || `cliente${user.id}@entregax.com`,
                    phone_number: user.phone?.replace(/\D/g, '').slice(-10) || '0000000000',
                    requires_account: true
                };

                const openpayResponse = await axios.post(
                    `${openpayUrl}/customers`,
                    customerData,
                    getOpenpayAuth(empresa.openpay_private_key)
                );

                const clabe = openpayResponse.data.clabe;

                await pool.query(`
                    UPDATE users SET 
                        openpay_customer_id = $1,
                        virtual_clabe = $2,
                        openpay_empresa_id = $3,
                        clabe_created_at = CURRENT_TIMESTAMP
                    WHERE id = $4
                `, [openpayResponse.data.id, clabe, empresa_id, userId]);

                results.push({ user_id: userId, clabe, status: 'creada' });
                console.log(`✅ CLABE ${clabe} asignada a usuario ${userId}`);

                // Pequeña pausa para no saturar API
                await new Promise(r => setTimeout(r, 200));
            } catch (e: any) {
                errors.push({ user_id: userId, error: e.response?.data?.description || e.message });
            }
        }

        res.json({
            success: true,
            total_procesados: results.length,
            total_errores: errors.length,
            results,
            errors
        });
    } catch (error) {
        console.error('Error en generación batch:', error);
        res.status(500).json({ error: 'Error en generación de CLABEs' });
    }
};

// ============================================
// WEBHOOK - RECEPCIÓN DE PAGOS SPEI
// ============================================

// Endpoint receptor de webhooks (uno por empresa)
export const handleOpenpayWebhook = async (req: Request, res: Response): Promise<any> => {
    try {
        const { empresa_id } = req.params;
        const payload = req.body;

        console.log(`📥 Webhook Openpay recibido para empresa ${empresa_id}:`, JSON.stringify(payload).slice(0, 500));

        // Verificar que es un evento de cargo exitoso
        if (payload.type !== 'charge.succeeded' && payload.type !== 'spei.received') {
            console.log(`⏭️ Evento ${payload.type} ignorado (solo procesamos charge.succeeded y spei.received)`);
            return res.status(200).json({ received: true, processed: false });
        }

        const transaction = payload.transaction || payload;
        const clabe = transaction.clabe || transaction.customer_clabe;
        const monto = parseFloat(transaction.amount || 0);
        const transactionId = transaction.id || payload.id;

        // Verificar que no sea duplicado
        const existing = await pool.query(
            'SELECT id FROM openpay_webhook_logs WHERE transaction_id = $1',
            [transactionId]
        );
        if (existing.rows.length > 0) {
            console.log(`⏭️ Transacción ${transactionId} ya procesada`);
            return res.status(200).json({ received: true, duplicate: true });
        }

        // Buscar usuario por CLABE
        const userResult = await pool.query(
            'SELECT id, full_name FROM users WHERE virtual_clabe = $1',
            [clabe]
        );

        const userId = userResult.rows[0]?.id || null;
        const userName = userResult.rows[0]?.full_name || 'Desconocido';

        // Obtener comisión de la empresa
        const empresaResult = await pool.query(
            'SELECT openpay_commission_fee FROM fiscal_emitters WHERE id = $1',
            [empresa_id]
        );
        const comision = parseFloat(empresaResult.rows[0]?.openpay_commission_fee || 10);
        const montoNeto = monto - comision;

        // Registrar en logs
        const logResult = await pool.query(`
            INSERT INTO openpay_webhook_logs 
            (transaction_id, empresa_id, user_id, clabe_virtual, monto_recibido, monto_neto, concepto, fecha_pago, payload_json)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
        `, [
            transactionId,
            empresa_id,
            userId,
            clabe,
            monto,
            montoNeto,
            transaction.description || transaction.concept || 'Pago SPEI',
            new Date(transaction.operation_date || transaction.created_at || new Date()),
            JSON.stringify(payload)
        ]);

        const logId = logResult.rows[0].id;

        if (!userId) {
            console.log(`⚠️ CLABE ${clabe} no encontrada en sistema - Monto: $${monto}`);
            await pool.query(
                'UPDATE openpay_webhook_logs SET estatus_procesamiento = $1, error_message = $2 WHERE id = $3',
                ['error', 'CLABE no asociada a ningún cliente', logId]
            );
            return res.status(200).json({ received: true, processed: false, error: 'CLABE not found' });
        }

        console.log(`💰 Pago SPEI recibido: $${monto} de ${userName} (CLABE: ${clabe})`);

        // ============================================
        // MOTOR DE CONCILIACIÓN FIFO
        // Buscar guías pendientes y aplicar el pago
        // ============================================
        let saldoDisponible = montoNeto;
        const aplicaciones = [];

        // Obtener guías pendientes del cliente (FIFO - más antiguas primero)
        const guiasPendientes = await pool.query(`
            SELECT id, tracking_internal, saldo_pendiente, created_at
            FROM packages 
            WHERE user_id = $1 
            AND (saldo_pendiente > 0 OR (saldo_pendiente IS NULL AND payment_status != 'paid'))
            ORDER BY created_at ASC
        `, [userId]);

        for (const guia of guiasPendientes.rows) {
            if (saldoDisponible <= 0) break;

            const saldoPendiente = parseFloat(guia.saldo_pendiente) || 0;
            if (saldoPendiente <= 0) continue;

            const montoAplicar = Math.min(saldoDisponible, saldoPendiente);
            const nuevoSaldo = saldoPendiente - montoAplicar;
            const nuevoStatus = nuevoSaldo <= 0 ? 'paid' : 'partial';

            // Actualizar paquete
            await pool.query(`
                UPDATE packages SET 
                    saldo_pendiente = $1,
                    monto_pagado = COALESCE(monto_pagado, 0) + $2,
                    payment_status = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
            `, [nuevoSaldo, montoAplicar, nuevoStatus, guia.id]);

            // Registrar aplicación
            await pool.query(`
                INSERT INTO openpay_payment_applications 
                (webhook_log_id, user_id, package_id, monto_aplicado, saldo_anterior, saldo_nuevo, tipo_documento, documento_referencia)
                VALUES ($1, $2, $3, $4, $5, $6, 'guia', $7)
            `, [logId, userId, guia.id, montoAplicar, saldoPendiente, nuevoSaldo, guia.tracking_internal]);

            aplicaciones.push({
                guia: guia.tracking_internal,
                monto_aplicado: montoAplicar,
                nuevo_saldo: nuevoSaldo,
                status: nuevoStatus
            });

            saldoDisponible -= montoAplicar;
            console.log(`  ✅ Aplicado $${montoAplicar} a guía ${guia.tracking_internal} (nuevo saldo: $${nuevoSaldo})`);
        }

        // Generar comisiones para paquetes completamente pagados
        const paidPkgIds = aplicaciones
            .filter(a => a.status === 'paid')
            .map(a => guiasPendientes.rows.find(g => g.tracking_internal === a.guia)?.id)
            .filter((id): id is number => !!id);
        if (paidPkgIds.length > 0) {
            generateCommissionsForPackages(paidPkgIds).catch(err =>
                console.error('Error generando comisiones (openpay SPEI):', err)
            );
        }

        // Si queda saldo, dejarlo como crédito a favor
        if (saldoDisponible > 0) {
            console.log(`  💵 Saldo a favor del cliente: $${saldoDisponible}`);
            // Aquí podrías crear un registro de "saldo a favor" si lo necesitas
        }

        // Actualizar log como procesado
        await pool.query(`
            UPDATE openpay_webhook_logs SET 
                estatus_procesamiento = 'procesado',
                processed_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [logId]);

        console.log(`✅ Pago procesado: ${aplicaciones.length} guías actualizadas`);

        res.status(200).json({ 
            received: true, 
            processed: true,
            cliente: userName,
            monto_recibido: monto,
            monto_neto: montoNeto,
            guias_actualizadas: aplicaciones.length,
            saldo_favor: saldoDisponible > 0 ? saldoDisponible : 0
        });
    } catch (error) {
        console.error('❌ Error procesando webhook Openpay:', error);
        res.status(500).json({ error: 'Error procesando pago' });
    }
};

// ============================================
// REPORTES Y CONSULTAS
// ============================================

// Obtener historial de pagos SPEI
export const getOpenpayPaymentHistory = async (req: Request, res: Response): Promise<any> => {
    try {
        const { empresa_id, date_from, date_to, status } = req.query;

        let whereClause = 'WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;

        if (empresa_id) {
            whereClause += ` AND owl.empresa_id = $${paramIndex++}`;
            params.push(empresa_id);
        }
        if (date_from) {
            whereClause += ` AND owl.fecha_pago >= $${paramIndex++}`;
            params.push(date_from);
        }
        if (date_to) {
            whereClause += ` AND owl.fecha_pago <= $${paramIndex++}`;
            params.push(date_to + ' 23:59:59');
        }
        if (status) {
            whereClause += ` AND owl.estatus_procesamiento = $${paramIndex++}`;
            params.push(status);
        }

        const result = await pool.query(`
            SELECT 
                owl.id,
                owl.transaction_id,
                owl.monto_recibido,
                owl.monto_neto,
                owl.concepto,
                owl.fecha_pago,
                owl.estatus_procesamiento,
                owl.error_message,
                owl.clabe_virtual,
                fe.alias as empresa_alias,
                fe.rfc as empresa_rfc,
                u.full_name as cliente_nombre,
                u.email as cliente_email,
                (SELECT COUNT(*) FROM openpay_payment_applications WHERE webhook_log_id = owl.id) as guias_aplicadas
            FROM openpay_webhook_logs owl
            LEFT JOIN fiscal_emitters fe ON owl.empresa_id = fe.id
            LEFT JOIN users u ON owl.user_id = u.id
            ${whereClause}
            ORDER BY owl.fecha_pago DESC
            LIMIT 100
        `, params);

        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
};

// Dashboard de cobranza SPEI
export const getOpenpayDashboard = async (req: Request, res: Response): Promise<any> => {
    try {
        const { empresa_id } = req.query;

        let empresaFilter = '';
        const params: any[] = [];
        if (empresa_id) {
            empresaFilter = 'WHERE empresa_id = $1';
            params.push(empresa_id);
        }

        // Estadísticas generales
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_transacciones,
                COALESCE(SUM(monto_recibido), 0) as total_recibido,
                COALESCE(SUM(monto_neto), 0) as total_neto,
                COUNT(CASE WHEN estatus_procesamiento = 'procesado' THEN 1 END) as procesados,
                COUNT(CASE WHEN estatus_procesamiento = 'error' THEN 1 END) as errores,
                COUNT(CASE WHEN estatus_procesamiento = 'pendiente' THEN 1 END) as pendientes
            FROM openpay_webhook_logs
            ${empresaFilter}
        `, params);

        // Últimos 7 días
        const ultimos7Dias = await pool.query(`
            SELECT 
                DATE(fecha_pago) as fecha,
                COUNT(*) as transacciones,
                COALESCE(SUM(monto_recibido), 0) as monto
            FROM openpay_webhook_logs
            WHERE fecha_pago >= CURRENT_DATE - INTERVAL '7 days'
            ${empresa_id ? 'AND empresa_id = $1' : ''}
            GROUP BY DATE(fecha_pago)
            ORDER BY fecha DESC
        `, empresa_id ? [empresa_id] : []);

        // Clientes con CLABE
        const clientesConClabe = await pool.query(`
            SELECT COUNT(*) as total FROM users WHERE virtual_clabe IS NOT NULL
            ${empresa_id ? 'AND openpay_empresa_id = $1' : ''}
        `, empresa_id ? [empresa_id] : []);

        res.json({
            stats: stats.rows[0],
            ultimos_7_dias: ultimos7Dias.rows,
            clientes_con_clabe: parseInt(clientesConClabe.rows[0].total)
        });
    } catch (error) {
        console.error('Error obteniendo dashboard:', error);
        res.status(500).json({ error: 'Error al obtener dashboard' });
    }
};

// Obtener detalle de aplicaciones de un pago
export const getPaymentApplications = async (req: Request, res: Response): Promise<any> => {
    try {
        const { log_id } = req.params;

        const result = await pool.query(`
            SELECT 
                opa.*,
                p.tracking_internal,
                p.status as guia_status
            FROM openpay_payment_applications opa
            LEFT JOIN packages p ON opa.package_id = p.id
            WHERE opa.webhook_log_id = $1
            ORDER BY opa.created_at
        `, [log_id]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo aplicaciones:', error);
        res.status(500).json({ error: 'Error al obtener aplicaciones' });
    }
};
