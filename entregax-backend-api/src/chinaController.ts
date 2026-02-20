// ============================================
// CONTROLADOR DE RECEPCIÓN CHINA (TDI Aéreo)
// Procesa datos del sistema externo chino
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import { createNotification } from './notificationController';
import crypto from 'crypto';

// INTERFACES DEL JSON DE LA API CHINA
interface ChinaApiPayload {
    fno: string;           // "AIR2609..." - Identificador único del envío
    shippingMark: string;  // "S3019" - Código del cliente
    totalQty: number;      // Total de cajas
    totalWeight: number;   // Peso total en kg
    totalVolume: number;   // Volumen total
    totalCbm: number;      // CBM total
    file: string[];        // Array de URLs de fotos/evidencias
    data: ChinaPackageData[]; // Array de cajas individuales
}

interface ChinaPackageData {
    childNo: string;       // "AIR2609...-001" - ID único de la caja
    trajecotryName: string; // Nombre de la trayectoria (typo en API original)
    weight: number;
    long: number;          // Largo en cm
    width: number;         // Ancho en cm
    height: number;        // Alto en cm
    proName: string;       // Descripción del producto
    customsBno: string;    // Código aduanal
    singleVolume: number;
    singleCbm: number;
    billNo?: string | null; // Guía aérea internacional (puede venir después)
    etd?: string | null;    // Fecha estimada de salida
    eta?: string | null;    // Fecha estimada de llegada
}

// ============================================
// WEBHOOK: Recibir datos de China
// POST /api/china/receive
// ============================================
export const receiveFromChina = async (req: Request, res: Response): Promise<any> => {
    const client = await pool.connect();
    
    try {
        const payload: ChinaApiPayload = req.body;
        console.log("📦 Recibiendo FNO:", payload.fno, "- ShippingMark:", payload.shippingMark);

        await client.query('BEGIN');

        // 1. IDENTIFICAR CLIENTE por Shipping Mark
        // Buscamos si existe un usuario con ese box_id o algún campo de identificación
        const userCheck = await client.query(
            `SELECT id, full_name FROM users WHERE box_id = $1 OR box_id ILIKE $2`,
            [payload.shippingMark, `%${payload.shippingMark}%`]
        );
        
        const userId = userCheck.rows.length > 0 ? userCheck.rows[0].id : null;
        const userName = userCheck.rows.length > 0 ? userCheck.rows[0].full_name : 'Sin asignar';
        
        console.log(`  → Cliente identificado: ${userName} (ID: ${userId || 'N/A'})`);

        // 2. INSERTAR O ACTUALIZAR RECIBO CHINA (FNO)
        const receiptQuery = await client.query(`
            INSERT INTO china_receipts 
            (fno, user_id, shipping_mark, total_qty, total_weight, total_volume, total_cbm, evidence_urls)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (fno) DO UPDATE SET
                total_qty = EXCLUDED.total_qty,
                total_weight = EXCLUDED.total_weight,
                total_volume = EXCLUDED.total_volume,
                total_cbm = EXCLUDED.total_cbm,
                evidence_urls = EXCLUDED.evidence_urls,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            payload.fno,
            userId,
            payload.shippingMark,
            payload.totalQty,
            payload.totalWeight,
            payload.totalVolume,
            payload.totalCbm,
            payload.file || []
        ]);

        const receiptId = receiptQuery.rows[0].id;
        console.log(`  → Recibo ID: ${receiptId}`);

        // 3. PROCESAR CAJAS INDIVIDUALES (data)
        let packagesCreated = 0;
        let packagesUpdated = 0;

        for (const item of payload.data) {
            // Verificar si la caja ya existe
            const existingPkg = await client.query(
                'SELECT id FROM packages WHERE child_no = $1',
                [item.childNo]
            );

            if (existingPkg.rows.length > 0) {
                // ACTUALIZAR caja existente (ej: cuando llega el billNo)
                await client.query(`
                    UPDATE packages SET
                        international_tracking = COALESCE($1, international_tracking),
                        weight = $2,
                        pro_name = $3,
                        customs_bno = $4,
                        etd = $5,
                        eta = $6,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE child_no = $7
                `, [
                    item.billNo || null,
                    item.weight,
                    item.proName,
                    item.customsBno,
                    item.etd || null,
                    item.eta || null,
                    item.childNo
                ]);
                packagesUpdated++;
            } else {
                // CREAR nueva caja
                const trackingInternal = `CN-${item.childNo.slice(-8)}`;
                const dimensions = `${item.long}x${item.width}x${item.height}`;
                
                await client.query(`
                    INSERT INTO packages 
                    (tracking_internal, child_no, china_receipt_id, user_id, 
                     weight, dimensions, long_cm, width_cm, height_cm,
                     description, pro_name, customs_bno, trajectory_name,
                     single_volume, single_cbm, international_tracking,
                     etd, eta, service_type, warehouse_location, status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                `, [
                    trackingInternal,
                    item.childNo,
                    receiptId,
                    userId,
                    item.weight,
                    dimensions,
                    item.long,
                    item.width,
                    item.height,
                    item.proName,
                    item.proName,
                    item.customsBno,
                    item.trajecotryName,
                    item.singleVolume,
                    item.singleCbm,
                    item.billNo || null,
                    item.etd || null,
                    item.eta || null,
                    'AIR_CHN_MX',
                    'china_air',
                    'received_china'
                ]);
                packagesCreated++;
            }
        }

        await client.query('COMMIT');

        console.log(`  ✅ FNO ${payload.fno}: ${packagesCreated} cajas creadas, ${packagesUpdated} actualizadas`);

        res.json({
            success: true,
            message: 'Datos de China procesados correctamente',
            data: {
                fno: payload.fno,
                receiptId,
                userId,
                packagesCreated,
                packagesUpdated
            }
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("❌ Error API China:", error);
        res.status(500).json({ 
            success: false, 
            error: 'Error procesando datos de China',
            details: error.message 
        });
    } finally {
        client.release();
    }
};

// ============================================
// GET: Listar recepciones de China
// GET /api/china/receipts
// ============================================
export const getChinaReceipts = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT 
                cr.*,
                u.full_name as client_name,
                u.box_id as client_box_id,
                (SELECT COUNT(*) FROM packages WHERE china_receipt_id = cr.id) as package_count
            FROM china_receipts cr
            LEFT JOIN users u ON cr.user_id = u.id
        `;
        const params: any[] = [];
        
        if (status) {
            query += ` WHERE cr.status = $1`;
            params.push(status);
        }

        query += ` ORDER BY cr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({
            success: true,
            receipts: result.rows,
            total: result.rowCount
        });

    } catch (error: any) {
        console.error("Error obteniendo recepciones China:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// POST: Crear recepción manual
// POST /api/china/receipts
// ============================================
export const createChinaReceipt = async (req: Request, res: Response): Promise<any> => {
    try {
        const { fno, shipping_mark, total_qty, total_weight, total_cbm, notes } = req.body;

        if (!fno || !shipping_mark) {
            return res.status(400).json({ 
                success: false, 
                error: 'FNO y Shipping Mark son requeridos' 
            });
        }

        // Verificar si ya existe
        const existing = await pool.query('SELECT id FROM china_receipts WHERE fno = $1', [fno]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ 
                success: false, 
                error: 'Ya existe una recepción con ese FNO' 
            });
        }

        // Buscar cliente por shipping_mark (box_id)
        const clientResult = await pool.query(
            'SELECT id FROM users WHERE box_id ILIKE $1 LIMIT 1',
            [shipping_mark]
        );
        const userId = clientResult.rows.length > 0 ? clientResult.rows[0].id : null;

        // Insertar recepción
        const result = await pool.query(`
            INSERT INTO china_receipts 
            (fno, user_id, shipping_mark, total_qty, total_weight, total_cbm, notes, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'received_origin')
            RETURNING *
        `, [fno, userId, shipping_mark, total_qty || 1, total_weight || 0, total_cbm || 0, notes || 'Captura manual']);

        console.log(`✅ Recepción manual creada: ${fno} por usuario admin`);

        res.status(201).json({
            success: true,
            receipt: result.rows[0],
            message: 'Recepción creada exitosamente'
        });

    } catch (error: any) {
        console.error("Error creando recepción China:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Detalle de un recibo con sus cajas
// GET /api/china/receipts/:id
// ============================================
export const getChinaReceiptDetail = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        // Obtener el recibo
        const receiptResult = await pool.query(`
            SELECT 
                cr.*,
                u.full_name as client_name,
                u.email as client_email,
                u.box_id as client_box_id
            FROM china_receipts cr
            LEFT JOIN users u ON cr.user_id = u.id
            WHERE cr.id = $1
        `, [id]);

        if (receiptResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recibo no encontrado' });
        }

        // Obtener las cajas
        const packagesResult = await pool.query(`
            SELECT 
                id, tracking_internal, child_no, weight, dimensions,
                pro_name, customs_bno, trajectory_name,
                single_volume, single_cbm, international_tracking,
                etd, eta, status, created_at
            FROM packages 
            WHERE china_receipt_id = $1
            ORDER BY child_no
        `, [id]);

        res.json({
            success: true,
            receipt: receiptResult.rows[0],
            packages: packagesResult.rows
        });

    } catch (error: any) {
        console.error("Error obteniendo detalle:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// PUT: Actualizar estado de recibo
// PUT /api/china/receipts/:id/status
// ============================================
export const updateChinaReceiptStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { status, notes, internationalTracking } = req.body;

        // Obtener datos del recibo antes de actualizar
        const receiptResult = await pool.query(`
            SELECT r.*, r.user_id, r.fno, r.shipping_mark
            FROM china_receipts r
            WHERE r.id = $1
        `, [id]);
        const receipt = receiptResult.rows[0];

        await pool.query(`
            UPDATE china_receipts SET
                status = COALESCE($1, status),
                notes = COALESCE($2, notes),
                international_tracking = COALESCE($3, international_tracking),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [status, notes, internationalTracking, id]);

        // Si el status cambia, actualizar también las cajas
        if (status) {
            const packageStatus = status === 'in_transit' ? 'in_transit_international' : status;
            await pool.query(`
                UPDATE packages SET status = $1, updated_at = CURRENT_TIMESTAMP
                WHERE china_receipt_id = $2
            `, [packageStatus, id]);

            // Enviar notificación según el status
            if (receipt && receipt.user_id) {
                const statusMessages: Record<string, string> = {
                    'in_transit': `✈️ Tu envío China Air ${receipt.fno || receipt.shipping_mark} está en tránsito internacional hacia México.`,
                    'arrived_mexico': `🛬 Tu envío China Air ${receipt.fno || receipt.shipping_mark} ha llegado a México. Pronto pasará por aduana.`,
                    'in_customs': `🛃 Tu envío China Air ${receipt.fno || receipt.shipping_mark} está en proceso de liberación aduanal.`,
                    'at_cedis': `📦 Tu envío China Air ${receipt.fno || receipt.shipping_mark} ha llegado a nuestro CEDIS y está listo para despacho.`,
                    'dispatched': `🚚 Tu envío China Air ${receipt.fno || receipt.shipping_mark} ha sido despachado. ¡Revisa tu guía nacional!`,
                    'delivered': `✅ Tu envío China Air ${receipt.fno || receipt.shipping_mark} ha sido entregado. ¡Gracias por tu confianza!`
                };

                const notificationTypes: Record<string, 'PACKAGE_RECEIVED' | 'PACKAGE_IN_TRANSIT' | 'PACKAGE_DELIVERED'> = {
                    'in_transit': 'PACKAGE_IN_TRANSIT',
                    'arrived_mexico': 'PACKAGE_RECEIVED',
                    'in_customs': 'PACKAGE_IN_TRANSIT',
                    'at_cedis': 'PACKAGE_RECEIVED',
                    'dispatched': 'PACKAGE_IN_TRANSIT',
                    'delivered': 'PACKAGE_DELIVERED'
                };

                if (statusMessages[status]) {
                    const notifType = notificationTypes[status] || 'PACKAGE_IN_TRANSIT';
                    await createNotification(
                        receipt.user_id,
                        notifType,
                        statusMessages[status],
                        { 
                            receiptId: id, 
                            fno: receipt.fno,
                            status: status,
                            service: 'China Air'
                        },
                        '/china-dashboard'
                    );
                }
            }
        }

        res.json({ success: true, message: 'Recibo actualizado' });

    } catch (error: any) {
        console.error("Error actualizando recibo:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// POST: Asignar cliente a recibo huérfano
// POST /api/china/receipts/:id/assign
// ============================================
export const assignClientToReceipt = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        // Actualizar recibo
        await pool.query(`
            UPDATE china_receipts SET user_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [userId, id]);

        // Actualizar cajas
        await pool.query(`
            UPDATE packages SET user_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE china_receipt_id = $2
        `, [userId, id]);

        res.json({ success: true, message: 'Cliente asignado correctamente' });

    } catch (error: any) {
        console.error("Error asignando cliente:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Estadísticas del panel China
// GET /api/china/stats
// ============================================
export const getChinaStats = async (req: Request, res: Response): Promise<any> => {
    try {
        // Recepciones por estado
        const statusStats = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM china_receipts 
            GROUP BY status
        `);

        // Total cajas hoy
        const todayPackages = await pool.query(`
            SELECT COUNT(*) as count 
            FROM packages 
            WHERE warehouse_location = 'china_air' 
            AND DATE(created_at) = CURRENT_DATE
        `);

        // Recepciones sin asignar
        const unassigned = await pool.query(`
            SELECT COUNT(*) as count 
            FROM china_receipts 
            WHERE user_id IS NULL
        `);

        // Pendientes de guía aérea
        const pendingBillNo = await pool.query(`
            SELECT COUNT(*) as count 
            FROM china_receipts 
            WHERE international_tracking IS NULL 
            AND status = 'received_origin'
        `);

        res.json({
            success: true,
            stats: {
                byStatus: statusStats.rows,
                todayPackages: parseInt(todayPackages.rows[0].count),
                unassignedReceipts: parseInt(unassigned.rows[0].count),
                pendingBillNo: parseInt(pendingBillNo.rows[0].count)
            }
        });

    } catch (error: any) {
        console.error("Error obteniendo stats:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// API MJCUSTOMER.COM - CONFIGURACIÓN
// Credenciales h5api con password pre-encriptado SM2
// ============================================

const MJCUSTOMER_API = {
    baseUrl: process.env.MJCUSTOMER_API_URL || 'http://api.mjcustomer.com',
    token: process.env.MJCUSTOMER_API_TOKEN || '',
    // Credenciales h5api - password pre-encriptado con SM2
    username: 'h5api',
    password: '6f6a8028e7321318074aae954172fc07da974d3f63907d582b1e7d4323124423a026e4d3fdbaa2af539008d88a64b5e133ca1a74124a0b386ae65334605c304f225020cdd840676eab6a200b4ddf570766995f52601db8d99308e4a3f55a894264678d120e8f8bba',
    tokenExpiry: 0  // Timestamp de expiración
};

// ============================================
// LOGIN: Obtener token de MJCustomer
// Usa endpoint /api/sysAuth/login (credenciales SM2)
// ============================================
async function loginToMJCustomer(): Promise<string | null> {
    try {
        console.log('🔐 Iniciando login en MJCustomer (h5api)...');
        console.log('   Usuario:', MJCUSTOMER_API.username);
        
        // Login con credenciales SM2 pre-encriptadas
        const response = await fetch(
            `${MJCUSTOMER_API.baseUrl}/api/sysAuth/login`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json-patch+json',
                    'Accept': 'text/plain',
                    'request-from': 'swagger'
                },
                body: JSON.stringify({
                    account: MJCUSTOMER_API.username,
                    password: MJCUSTOMER_API.password,
                    codeId: 0,
                    code: 'string',
                    loginMode: 1
                })
            }
        );

        const data = await response.json() as { code: number; message: string; result?: { accessToken: string } };
        console.log('   Respuesta:', data.code, data.message);
        
        if (data.code === 200 && data.result?.accessToken) {
            const token = data.result.accessToken;
            MJCUSTOMER_API.token = token;
            // Token válido por 7 días (168 horas) - renovar a las 6 días
            MJCUSTOMER_API.tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000);
            
            // Guardar en BD para persistencia
            try {
                await pool.query(`
                    INSERT INTO system_config (key, value, updated_at)
                    VALUES ('mjcustomer_token', $1, NOW())
                    ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
                `, [token]);
                await pool.query(`
                    INSERT INTO system_config (key, value, updated_at)
                    VALUES ('mjcustomer_token_expiry', $1, NOW())
                    ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
                `, [MJCUSTOMER_API.tokenExpiry.toString()]);
            } catch (dbErr) {
                console.warn('⚠️ No se pudo guardar token en BD');
            }
            
            console.log('✅ Login exitoso en MJCustomer');
            return token;
        } else {
            console.error('❌ Login fallido:', data.message);
            return null;
        }
    } catch (error: any) {
        console.error('❌ Error en login MJCustomer:', error.message);
        return null;
    }
}

// Obtener token válido (intenta desde .env, BD, o hace login)
async function getMJCustomerToken(): Promise<string> {
    // 1. Si hay token en memoria y no expiró, usarlo
    if (MJCUSTOMER_API.token && Date.now() < MJCUSTOMER_API.tokenExpiry) {
        return MJCUSTOMER_API.token;
    }
    
    // 2. Intentar cargar desde BD
    try {
        const dbToken = await pool.query("SELECT value FROM system_config WHERE key = 'mjcustomer_token'");
        const dbExpiry = await pool.query("SELECT value FROM system_config WHERE key = 'mjcustomer_token_expiry'");
        
        if (dbToken.rows.length > 0 && dbExpiry.rows.length > 0) {
            const tokenExpiry = parseInt(dbExpiry.rows[0].value);
            if (Date.now() < tokenExpiry) {
                MJCUSTOMER_API.token = dbToken.rows[0].value;
                MJCUSTOMER_API.tokenExpiry = tokenExpiry;
                console.log('✅ Token MJCustomer cargado desde BD');
                return MJCUSTOMER_API.token;
            }
        }
    } catch (e) {
        console.warn('⚠️ No se pudo cargar token desde BD');
    }
    
    // 3. Si hay token en .env, usarlo (configuración manual)
    if (process.env.MJCUSTOMER_API_TOKEN) {
        MJCUSTOMER_API.token = process.env.MJCUSTOMER_API_TOKEN;
        MJCUSTOMER_API.tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000); // Asumir 6 días
        console.log('✅ Token MJCustomer cargado desde .env');
        return MJCUSTOMER_API.token;
    }
    
    // 4. Intentar login automático (requiere SM2)
    const newToken = await loginToMJCustomer();
    if (newToken) {
        return newToken;
    }
    
    throw new Error('No hay token de MJCustomer disponible. Configura MJCUSTOMER_API_TOKEN en .env o proporciona la llave SM2 para login automático.');
}

// ============================================
// ENDPOINT: Login manual a MJCustomer
// POST /api/china/mjcustomer/login
// Usa credenciales h5api hardcodeadas (password pre-encriptado SM2)
// ============================================
export const loginMJCustomerEndpoint = async (req: Request, res: Response): Promise<any> => {
    try {
        // Las credenciales ya están configuradas en MJCUSTOMER_API
        console.log('🔐 Iniciando login MJCustomer con credenciales h5api...');
        
        const token = await loginToMJCustomer();
        
        if (token) {
            res.json({
                success: true,
                message: 'Login exitoso',
                tokenPreview: token.substring(0, 20) + '...',
                expiresAt: new Date(MJCUSTOMER_API.tokenExpiry).toISOString()
            });
        } else {
            res.status(401).json({
                success: false,
                error: 'Login fallido. Verifica credenciales.'
            });
        }
    } catch (error: any) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Interface para respuesta de MJCustomer API
// El formato es EXACTO al webhook original - misma estructura
interface MJCustomerOrderResponse {
    code: number;
    type: string;
    message: string;
    result: ChinaApiPayload | ChinaApiPayload[] | null;  // Usa el mismo formato que webhook
    extras: any;
    time: string;
}

// Interface para respuesta de trayectoria
interface TrajectoryResponse {
    code: number;
    type: string;
    message: string;
    result: Array<{
        ch: string;      // Texto en chino
        en: string;      // Texto en español/inglés
        date: string;    // Fecha del evento
    }> | null;
    extras: any;
    time: string;
}

// ============================================
// RASTREO: Consultar status de un FNO (sin guardar)
// GET /api/china/track/:fno
// ============================================
export const trackFNO = async (req: Request, res: Response): Promise<any> => {
    try {
        const { fno } = req.params;
        
        if (!fno) {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere el número de FNO' 
            });
        }

        console.log(`🔍 Rastreando FNO: ${fno}`);

        // Obtener token válido
        const token = await getMJCustomerToken();

        // Consultar API de MJCustomer
        const apiResponse = await fetch(
            `${MJCUSTOMER_API.baseUrl}/api/otherSystem/orderByList/${fno}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'request-from': 'swagger'
                }
            }
        );

        const apiData = await apiResponse.json() as MJCustomerOrderResponse;
        
        if (apiData.code !== 200 || !apiData.result) {
            return res.status(apiResponse.status === 401 ? 401 : 404).json({
                success: false,
                error: apiData.message || 'FNO no encontrado',
                apiCode: apiData.code
            });
        }

        // Procesar resultado
        const order = Array.isArray(apiData.result) ? apiData.result[0] : apiData.result;
        
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'FNO no encontrado en la respuesta'
            });
        }
        
        // Formatear respuesta amigable
        const trackingInfo = {
            fno: order.fno,
            shippingMark: order.shippingMark,
            totalQty: order.totalQty,
            totalWeight: order.totalWeight,
            totalVolume: order.totalVolume,
            totalCbm: order.totalCbm,
            evidencias: order.file || [],
            paquetes: (order.data || []).map((item: ChinaPackageData) => ({
                childNo: item.childNo,
                status: item.trajecotryName,
                peso: item.weight,
                dimensiones: `${item.long}x${item.width}x${item.height} cm`,
                producto: item.proName,
                codigoAduanal: item.customsBno,
                guiaInternacional: item.billNo || 'Pendiente',
                etd: item.etd || 'Pendiente',
                eta: item.eta || 'Pendiente'
            }))
        };

        console.log(`  ✅ FNO encontrado: ${order.totalQty} paquetes`);

        res.json({
            success: true,
            tracking: trackingInfo,
            raw: order
        });

    } catch (error: any) {
        console.error('❌ Error rastreando FNO:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al consultar tracking',
            details: error.message 
        });
    }
};

// ============================================
// RASTREO DETALLADO: Obtener trayectoria de un childNo
// GET /api/china/trajectory/:childNo
// ============================================
export const getTrajectory = async (req: Request, res: Response): Promise<any> => {
    try {
        const { childNo } = req.params;
        
        if (!childNo) {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere el número de paquete (childNo)' 
            });
        }

        console.log(`🔍 Consultando trayectoria: ${childNo}`);

        // Obtener token válido
        const token = await getMJCustomerToken();

        // Consultar API de trayectoria
        const apiResponse = await fetch(
            `${MJCUSTOMER_API.baseUrl}/api/orderInfo/orderSystemByTrajectoryData/${childNo}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'text/plain',
                    'request-from': 'swagger'
                }
            }
        );

        const apiData = await apiResponse.json() as TrajectoryResponse;
        
        if (apiData.code !== 200) {
            return res.status(apiResponse.status === 401 ? 401 : 404).json({
                success: false,
                error: apiData.message || 'Trayectoria no encontrada',
                apiCode: apiData.code
            });
        }

        // Formatear trayectoria
        const trajectory = (apiData.result || []).map(event => ({
            fecha: event.date,
            descripcion: event.en || event.ch,
            descripcionChino: event.ch
        }));

        console.log(`  ✅ Trayectoria encontrada: ${trajectory.length} eventos`);

        res.json({
            success: true,
            childNo,
            eventos: trajectory.length,
            trayectoria: trajectory,
            raw: apiData.result
        });

    } catch (error: any) {
        console.error('❌ Error consultando trayectoria:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al consultar trayectoria',
            details: error.message 
        });
    }
};

// ============================================
// PULL: Consultar orden por código desde MJCustomer
// GET /api/china/pull/:orderCode
// ============================================
export const pullFromMJCustomer = async (req: Request, res: Response): Promise<any> => {
    const client = await pool.connect();
    
    try {
        const { orderCode } = req.params;
        
        if (!orderCode) {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere el código de orden' 
            });
        }

        console.log(`🔄 Consultando MJCustomer API: ${orderCode}`);

        // Obtener token válido (login automático si es necesario)
        const token = await getMJCustomerToken();

        // Llamar al API externo
        const apiResponse = await fetch(
            `${MJCUSTOMER_API.baseUrl}/api/otherSystem/orderByList/${orderCode}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            }
        );

        const apiData = await apiResponse.json() as MJCustomerOrderResponse;
        
        console.log(`  → Respuesta API: code=${apiData.code}, message=${apiData.message}`);

        if (apiData.code !== 200 || !apiData.result) {
            return res.status(apiResponse.status === 401 ? 401 : 400).json({
                success: false,
                error: apiData.message || 'Error al consultar API externa',
                apiCode: apiData.code
            });
        }

        // Procesar resultado (puede ser un objeto o array)
        const orders = Array.isArray(apiData.result) ? apiData.result : [apiData.result];
        
        await client.query('BEGIN');

        const results: any[] = [];

        for (const order of orders) {
            // El JSON usa: fno, shippingMark, totalQty, totalWeight, totalVolume, totalCbm, file, data
            const fno = order.fno || orderCode;
            const shippingMark = order.shippingMark || 'UNKNOWN';

            // Buscar cliente por shipping mark
            const userCheck = await client.query(
                `SELECT id, full_name FROM users WHERE box_id = $1 OR box_id ILIKE $2`,
                [shippingMark, `%${shippingMark}%`]
            );
            const userId = userCheck.rows.length > 0 ? userCheck.rows[0].id : null;
            const userName = userCheck.rows.length > 0 ? userCheck.rows[0].full_name : 'Sin asignar';
            
            console.log(`  → Cliente: ${userName} (${shippingMark})`);

            // Convertir array de fotos a formato PostgreSQL TEXT[]
            // order.file puede venir como array o como string JSON
            let evidenceUrls: string[] = [];
            if (order.file) {
                if (Array.isArray(order.file)) {
                    evidenceUrls = order.file;
                } else if (typeof order.file === 'string') {
                    try {
                        const parsed = JSON.parse(order.file);
                        if (Array.isArray(parsed)) {
                            evidenceUrls = parsed;
                        }
                    } catch (e) {
                        // Si no es JSON válido, tratarlo como URL única
                        evidenceUrls = [order.file];
                    }
                }
            }
            console.log(`  → URLs de evidencia (${evidenceUrls.length}):`, evidenceUrls);

            // Insertar o actualizar recibo
            const receiptResult = await client.query(`
                INSERT INTO china_receipts 
                (fno, user_id, shipping_mark, total_qty, total_weight, total_volume, total_cbm, 
                 evidence_urls, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (fno) DO UPDATE SET
                    total_qty = COALESCE(EXCLUDED.total_qty, china_receipts.total_qty),
                    total_weight = COALESCE(EXCLUDED.total_weight, china_receipts.total_weight),
                    total_cbm = COALESCE(EXCLUDED.total_cbm, china_receipts.total_cbm),
                    evidence_urls = COALESCE(EXCLUDED.evidence_urls, china_receipts.evidence_urls),
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
            `, [
                fno,
                userId,
                shippingMark,
                order.totalQty || 1,
                order.totalWeight || 0,
                order.totalVolume || 0,
                order.totalCbm || 0,
                evidenceUrls,  // node-postgres maneja arrays nativamente
                `Sincronizado desde MJCustomer: ${new Date().toISOString()}`
            ]);

            const receiptId = receiptResult.rows[0].id;
            let packagesCreated = 0;
            let packagesUpdated = 0;

            // Procesar cajas - El JSON usa "data" (array de ChinaPackageData)
            if (order.data && Array.isArray(order.data)) {
                for (const item of order.data) {
                    const childNo = item.childNo;
                    
                    const existingPkg = await client.query(
                        'SELECT id FROM packages WHERE child_no = $1',
                        [childNo]
                    );

                    if (existingPkg.rows.length > 0) {
                        // Actualizar caja existente
                        await client.query(`
                            UPDATE packages SET
                                international_tracking = COALESCE($1, international_tracking),
                                weight = $2,
                                pro_name = $3,
                                customs_bno = $4,
                                etd = $5,
                                eta = $6,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE child_no = $7
                        `, [
                            item.billNo || null,
                            item.weight,
                            item.proName,
                            item.customsBno,
                            item.etd || null,
                            item.eta || null,
                            childNo
                        ]);
                        packagesUpdated++;
                    } else {
                        // Crear nueva caja
                        const trackingInternal = `CN-${childNo.slice(-8)}`;
                        const dimensions = `${item.long}x${item.width}x${item.height}`;
                        
                        await client.query(`
                            INSERT INTO packages 
                            (tracking_internal, child_no, china_receipt_id, user_id, 
                             weight, dimensions, long_cm, width_cm, height_cm,
                             description, pro_name, customs_bno, trajectory_name,
                             single_volume, single_cbm, international_tracking,
                             etd, eta, service_type, warehouse_location, status)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                        `, [
                            trackingInternal,
                            childNo,
                            receiptId,
                            userId,
                            item.weight,
                            dimensions,
                            item.long,
                            item.width,
                            item.height,
                            item.proName,
                            item.proName,
                            item.customsBno,
                            item.trajecotryName,
                            item.singleVolume,
                            item.singleCbm,
                            item.billNo || null,
                            item.etd || null,
                            item.eta || null,
                            'AIR_CHN_MX',
                            'china_air',
                            'received_china'
                        ]);
                        packagesCreated++;
                    }
                }
            }

            results.push({
                fno,
                receiptId,
                userId,
                shippingMark,
                packagesCreated,
                packagesUpdated
            });
        }

        await client.query('COMMIT');

        console.log(`  ✅ Sincronización completada: ${results.length} órdenes procesadas`);

        // Preparar respuesta con el order para el frontend
        const orderResponse = Array.isArray(apiData.result) ? apiData.result[0] : apiData.result;

        res.json({
            success: true,
            message: 'Datos sincronizados desde MJCustomer',
            data: results,
            order: orderResponse, // Para el modal de rastreo en frontend
            rawResponse: apiData.result
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("❌ Error consultando MJCustomer:", error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al sincronizar con MJCustomer',
            details: error.message 
        });
    } finally {
        client.release();
    }
};

// ============================================
// PULL MASIVO: Sincronizar múltiples órdenes
// POST /api/china/pull-batch
// Body: { orderCodes: ["CODE1", "CODE2", ...] }
// ============================================
export const pullBatchFromMJCustomer = async (req: Request, res: Response): Promise<any> => {
    try {
        const { orderCodes } = req.body;

        if (!orderCodes || !Array.isArray(orderCodes) || orderCodes.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere un array de códigos de orden'
            });
        }

        console.log(`🔄 Sincronización masiva: ${orderCodes.length} códigos`);

        // Obtener token válido antes de empezar
        const token = await getMJCustomerToken();

        const results: any[] = [];
        const errors: any[] = [];

        for (const code of orderCodes) {
            try {
                const apiResponse = await fetch(
                    `${MJCUSTOMER_API.baseUrl}/api/otherSystem/orderByList/${code}`,
                    {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/json'
                        }
                    }
                );

                const apiData = await apiResponse.json() as MJCustomerOrderResponse;
                
                if (apiData.code === 200 && apiData.result) {
                    results.push({ code, status: 'success', data: apiData.result });
                } else {
                    errors.push({ code, status: 'error', message: apiData.message });
                }
            } catch (err: any) {
                errors.push({ code, status: 'error', message: err.message });
            }

            // Pequeña pausa entre requests para no saturar
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        res.json({
            success: true,
            message: `Procesados ${results.length} exitosos, ${errors.length} errores`,
            results,
            errors
        });

    } catch (error: any) {
        console.error("❌ Error en sincronización masiva:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// CONFIG: Actualizar token de MJCustomer
// PUT /api/china/config/token
// ============================================
export const updateMJCustomerToken = async (req: Request, res: Response): Promise<any> => {
    try {
        const { token, expiresInDays } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, error: 'Token requerido' });
        }

        // Calcular expiración (default 6 días)
        const daysToExpire = expiresInDays || 6;
        const expiryTimestamp = Date.now() + (daysToExpire * 24 * 60 * 60 * 1000);
        
        // Guardar en runtime
        MJCUSTOMER_API.token = token;
        MJCUSTOMER_API.tokenExpiry = expiryTimestamp;

        // Guardar en BD para persistencia
        await pool.query(`
            INSERT INTO system_config (key, value, updated_at)
            VALUES ('mjcustomer_token', $1, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [token]);
        
        await pool.query(`
            INSERT INTO system_config (key, value, updated_at)
            VALUES ('mjcustomer_token_expiry', $1, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [expiryTimestamp.toString()]);

        res.json({ 
            success: true, 
            message: 'Token actualizado correctamente',
            expiresAt: new Date(expiryTimestamp).toISOString()
        });

    } catch (error: any) {
        console.error("Error actualizando token:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// CRON: Sincronizar órdenes activas desde MJCustomer
// Llamado cada 15 minutos desde cronJobs.ts
// ============================================
export const syncActiveMJCustomerOrders = async (): Promise<{
    success: boolean;
    ordersProcessed: number;
    ordersUpdated: number;
    errors: string[];
}> => {
    const errors: string[] = [];
    let ordersProcessed = 0;
    let ordersUpdated = 0;

    try {
        console.log('🔄 [CRON MJCustomer] Iniciando sincronización de órdenes activas...');

        // Obtener órdenes activas (no entregadas, últimos 30 días)
        const activeOrders = await pool.query(`
            SELECT DISTINCT fno 
            FROM china_receipts 
            WHERE status NOT IN ('delivered', 'cancelled', 'completed')
              AND created_at > NOW() - INTERVAL '30 days'
              AND fno IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 50
        `);

        if (activeOrders.rows.length === 0) {
            console.log('   → No hay órdenes activas para sincronizar');
            return { success: true, ordersProcessed: 0, ordersUpdated: 0, errors: [] };
        }

        console.log(`   → ${activeOrders.rows.length} órdenes activas encontradas`);

        // Obtener token válido
        const token = await getMJCustomerToken();
        if (!token) {
            console.error('   ❌ No se pudo obtener token de MJCustomer');
            return { success: false, ordersProcessed: 0, ordersUpdated: 0, errors: ['No token available'] };
        }

        // Procesar cada orden
        for (const order of activeOrders.rows) {
            try {
                const fno = order.fno;
                
                const apiResponse = await fetch(
                    `${MJCUSTOMER_API.baseUrl}/api/otherSystem/orderByList/${fno}`,
                    {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/json'
                        }
                    }
                );

                const apiData = await apiResponse.json() as any;
                
                if (apiData.code === 200 && apiData.result) {
                    const orderData = Array.isArray(apiData.result) ? apiData.result[0] : apiData.result;
                    
                    // Determinar status basado en trajectoryName de los paquetes
                    let newStatus = 'received_china'; // default
                    if (orderData.data && Array.isArray(orderData.data)) {
                        const trajectories = orderData.data.map((p: any) => (p.trajecotryName || '').toLowerCase());
                        
                        // Mapeo de status basado en trajectory
                        if (trajectories.some((t: string) => t.includes('entregado') || t.includes('delivered'))) {
                            newStatus = 'delivered';
                        } else if (trajectories.some((t: string) => t.includes('aduana') || t.includes('customs') || t.includes('despacho'))) {
                            newStatus = 'customs';
                        } else if (trajectories.some((t: string) => t.includes('tránsito') || t.includes('transit') || t.includes('vuelo') || t.includes('flight'))) {
                            newStatus = 'in_transit';
                        } else if (trajectories.some((t: string) => t.includes('almacén') || t.includes('bodega') || t.includes('warehouse'))) {
                            newStatus = 'received_china';
                        }
                    }
                    
                    // Actualizar datos de la orden incluyendo status
                    await pool.query(`
                        UPDATE china_receipts SET
                            total_qty = COALESCE($1, total_qty),
                            total_weight = COALESCE($2, total_weight),
                            total_cbm = COALESCE($3, total_cbm),
                            status = CASE 
                                WHEN status IN ('delivered', 'received_cdmx', 'completed') THEN status 
                                ELSE $5 
                            END,
                            updated_at = NOW(),
                            last_sync_at = NOW()
                        WHERE fno = $4
                    `, [
                        orderData.totalQty,
                        orderData.totalWeight,
                        orderData.totalCbm,
                        fno,
                        newStatus
                    ]);

                    // Actualizar paquetes con ETA/ETD si están disponibles
                    if (orderData.data && Array.isArray(orderData.data)) {
                        for (const pkg of orderData.data) {
                            await pool.query(`
                                UPDATE packages SET
                                    international_tracking = COALESCE($1, international_tracking),
                                    eta = COALESCE($2, eta),
                                    etd = COALESCE($3, etd),
                                    trajectory_name = COALESCE($4, trajectory_name),
                                    updated_at = NOW()
                                WHERE child_no = $5
                            `, [
                                pkg.billNo || null,
                                pkg.eta || null,
                                pkg.etd || null,
                                pkg.trajecotryName || null,
                                pkg.childNo
                            ]);
                        }
                    }

                    ordersUpdated++;
                    console.log(`   ✓ ${fno}: status=${newStatus}`);
                }
                ordersProcessed++;

                // Pequeña pausa entre requests para no saturar el API
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (err: any) {
                errors.push(`${order.fno}: ${err.message}`);
            }
        }

        console.log(`✅ [CRON MJCustomer] Sincronización completada: ${ordersUpdated}/${ordersProcessed} actualizadas`);
        
        return { success: true, ordersProcessed, ordersUpdated, errors };

    } catch (error: any) {
        console.error('❌ [CRON MJCustomer] Error en sincronización:', error);
        return { success: false, ordersProcessed, ordersUpdated, errors: [error.message] };
    }
};

// ============================================
// CONFIGURACIÓN DES PARA CALLBACK DE MOJIE
// La llave DES debe configurarse en .env como MJCUSTOMER_DES_KEY
// ============================================
const MOJIE_DES_KEY = process.env.MJCUSTOMER_DES_KEY || 'ENTREGAX'; // Llave DES de 8 caracteres

/**
 * Desencripta datos usando DES-ECB
 * MoJie envía los datos encriptados con DES y codificados en Base64 o Hex
 */
function decryptDES(encryptedData: string): string {
    try {
        // La llave DES debe ser de 8 bytes
        const key = Buffer.from(MOJIE_DES_KEY.padEnd(8, '\0').slice(0, 8));
        
        // Intentar primero con Base64
        let encryptedBuffer: Buffer;
        try {
            encryptedBuffer = Buffer.from(encryptedData, 'base64');
        } catch {
            // Si falla, intentar con Hex
            encryptedBuffer = Buffer.from(encryptedData, 'hex');
        }
        
        // Crear decipher DES-ECB (sin IV)
        const decipher = crypto.createDecipheriv('des-ecb', key, null);
        decipher.setAutoPadding(true);
        
        let decrypted = decipher.update(encryptedBuffer);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted.toString('utf8').trim();
    } catch (error: any) {
        console.error('❌ Error desencriptando DES:', error.message);
        throw new Error(`Error de desencriptación DES: ${error.message}`);
    }
}

// ============================================
// WEBHOOK CALLBACK: Recibir datos encriptados de MoJie
// POST /api/china/callback
// El body viene como string encriptado con DES
// ============================================
export const mojieCallbackEncrypted = async (req: Request, res: Response): Promise<any> => {
    const client = await pool.connect();
    
    try {
        console.log('📥 [MoJie Callback] Recibiendo datos encriptados...');
        
        // El body puede venir como string directo o como { data: "encrypted_string" }
        let encryptedData: string;
        
        if (typeof req.body === 'string') {
            encryptedData = req.body;
        } else if (req.body.data && typeof req.body.data === 'string') {
            encryptedData = req.body.data;
        } else if (req.body.encrypted && typeof req.body.encrypted === 'string') {
            encryptedData = req.body.encrypted;
        } else {
            // Si viene como JSON sin encriptar, procesarlo directamente
            if (req.body.fno) {
                console.log('   → Datos recibidos sin encriptar, procesando directamente...');
                return processCallbackPayload(client, req.body, res);
            }
            return res.status(400).json({ 
                success: false, 
                error: 'Formato de datos no reconocido. Se espera string encriptado o JSON con fno.' 
            });
        }
        
        console.log(`   → Datos encriptados recibidos: ${encryptedData.length} caracteres`);
        
        // Desencriptar con DES
        const decryptedString = decryptDES(encryptedData);
        console.log('   → Datos desencriptados correctamente');
        
        // Parsear el JSON desencriptado
        const payload: ChinaApiPayload = JSON.parse(decryptedString);
        console.log(`   → FNO: ${payload.fno}, ShippingMark: ${payload.shippingMark}`);
        
        // Procesar el payload
        return processCallbackPayload(client, payload, res);
        
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('❌ [MoJie Callback] Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error procesando callback de MoJie',
            details: error.message 
        });
    } finally {
        client.release();
    }
};

/**
 * Procesa el payload del callback de MoJie (ya desencriptado)
 * Estructura según documentación:
 * - fno: Número de orden principal
 * - shippingMark: Marca/código del cliente
 * - totalQty, totalWeight, totalVolume, totalCbm: Totales
 * - createTime: Fecha de creación
 * - operateType: 1=App, 2=Web, 3=Reservation
 * - file: URLs de archivos adjuntos
 * - data[]: Array de paquetes individuales con childNo, weight, dimensions, etc.
 */
async function processCallbackPayload(
    client: any, 
    payload: ChinaApiPayload, 
    res: Response
): Promise<any> {
    try {
        console.log(`📦 Procesando callback FNO: ${payload.fno}`);
        
        await client.query('BEGIN');
        
        // 1. Buscar cliente por ShippingMark (box_id)
        const userCheck = await client.query(
            `SELECT id, full_name FROM users WHERE box_id = $1 OR box_id ILIKE $2`,
            [payload.shippingMark, `%${payload.shippingMark}%`]
        );
        
        const userId = userCheck.rows.length > 0 ? userCheck.rows[0].id : null;
        const userName = userCheck.rows.length > 0 ? userCheck.rows[0].full_name : 'Sin asignar';
        
        console.log(`   → Cliente: ${userName} (ID: ${userId || 'N/A'})`);
        
        // 2. Insertar o actualizar recibo principal
        const receiptResult = await client.query(`
            INSERT INTO china_receipts 
            (fno, user_id, shipping_mark, total_qty, total_weight, total_volume, total_cbm, 
             evidence_urls, notes, source)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (fno) DO UPDATE SET
                total_qty = EXCLUDED.total_qty,
                total_weight = EXCLUDED.total_weight,
                total_volume = EXCLUDED.total_volume,
                total_cbm = EXCLUDED.total_cbm,
                evidence_urls = COALESCE(EXCLUDED.evidence_urls, china_receipts.evidence_urls),
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            payload.fno,
            userId,
            payload.shippingMark,
            payload.totalQty || 0,
            payload.totalWeight || 0,
            payload.totalVolume || 0,
            payload.totalCbm || 0,
            payload.file || [],
            `Callback MoJie ${new Date().toISOString()}`,
            'mojie_callback'
        ]);
        
        const receiptId = receiptResult.rows[0].id;
        let packagesCreated = 0;
        let packagesUpdated = 0;
        
        // 3. Procesar cada paquete en data[]
        if (payload.data && Array.isArray(payload.data)) {
            for (const item of payload.data) {
                const childNo = item.childNo;
                
                // Verificar si el paquete ya existe
                const existingPkg = await client.query(
                    'SELECT id FROM packages WHERE child_no = $1',
                    [childNo]
                );
                
                if (existingPkg.rows.length > 0) {
                    // Actualizar paquete existente
                    await client.query(`
                        UPDATE packages SET
                            weight = COALESCE($1, weight),
                            long_cm = COALESCE($2, long_cm),
                            width_cm = COALESCE($3, width_cm),
                            height_cm = COALESCE($4, height_cm),
                            pro_name = COALESCE($5, pro_name),
                            customs_bno = COALESCE($6, customs_bno),
                            trajectory_name = COALESCE($7, trajectory_name),
                            single_volume = COALESCE($8, single_volume),
                            single_cbm = COALESCE($9, single_cbm),
                            international_tracking = COALESCE($10, international_tracking),
                            etd = COALESCE($11, etd),
                            eta = COALESCE($12, eta),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE child_no = $13
                    `, [
                        item.weight,
                        item.long,
                        item.width,
                        item.height,
                        item.proName,
                        item.customsBno,
                        item.trajecotryName, // Nota: typo en API original
                        item.singleVolume,
                        item.singleCbm,
                        item.billNo || null,
                        item.etd || null,
                        item.eta || null,
                        childNo
                    ]);
                    packagesUpdated++;
                } else {
                    // Crear nuevo paquete
                    const trackingInternal = `CN-${childNo.slice(-8)}`;
                    const dimensions = `${item.long || 0}x${item.width || 0}x${item.height || 0}`;
                    
                    await client.query(`
                        INSERT INTO packages 
                        (tracking_internal, child_no, china_receipt_id, user_id, 
                         weight, dimensions, long_cm, width_cm, height_cm,
                         description, pro_name, customs_bno, trajectory_name,
                         single_volume, single_cbm, international_tracking,
                         etd, eta, service_type, warehouse_location, status)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                    `, [
                        trackingInternal,
                        childNo,
                        receiptId,
                        userId,
                        item.weight || 0,
                        dimensions,
                        item.long || 0,
                        item.width || 0,
                        item.height || 0,
                        item.proName || 'Sin descripción',
                        item.proName,
                        item.customsBno,
                        item.trajecotryName,
                        item.singleVolume || 0,
                        item.singleCbm || 0,
                        item.billNo || null,
                        item.etd || null,
                        item.eta || null,
                        'AIR_CHN_MX',
                        'china_air',
                        'received_china'
                    ]);
                    packagesCreated++;
                }
            }
        }
        
        await client.query('COMMIT');
        
        console.log(`   ✅ FNO ${payload.fno}: ${packagesCreated} creados, ${packagesUpdated} actualizados`);
        
        // 4. Notificar al cliente si está identificado
        if (userId) {
            try {
                await createNotification(
                    userId,
                    'PACKAGE_RECEIVED',
                    `📦 Nueva recepción China Air: ${payload.fno} con ${payload.totalQty || payload.data?.length || 1} paquete(s)`,
                    { 
                        receiptId, 
                        fno: payload.fno,
                        service: 'China Air',
                        packagesCount: payload.data?.length || 0
                    },
                    '/china-dashboard'
                );
            } catch (notifError) {
                console.warn('   ⚠️ Error enviando notificación:', notifError);
            }
        }
        
        // Respuesta exitosa (código 200 según documentación)
        return res.status(200).json({
            success: true,
            message: 'Callback procesado correctamente',
            data: {
                fno: payload.fno,
                receiptId,
                userId,
                shippingMark: payload.shippingMark,
                packagesCreated,
                packagesUpdated,
                totalPackages: payload.data?.length || 0
            }
        });
        
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
}
