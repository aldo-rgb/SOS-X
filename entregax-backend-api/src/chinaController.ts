// ============================================
// CONTROLADOR DE RECEPCIÓN CHINA (TDI Aéreo)
// Procesa datos del sistema externo chino
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import { createNotification } from './notificationController';
import crypto from 'crypto';
import { sm2 } from 'sm-crypto';

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
    const sourceIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    
    // SIEMPRE guardar el payload RAW para debug (antes de cualquier procesamiento)
    try {
        await client.query(`
            INSERT INTO china_callback_logs (raw_payload, headers, source_ip, success)
            VALUES ($1, $2, $3, false)
        `, [JSON.stringify(req.body), JSON.stringify(req.headers), sourceIp]);
    } catch (logErr) {
        console.error('Error guardando log:', logErr);
    }
    
    try {
        // LOG COMPLETO del payload recibido para debug
        console.log("========================================");
        console.log("📥 CHINA CALLBACK RECIBIDO:");
        console.log("Source IP:", sourceIp);
        console.log("Body RAW:", JSON.stringify(req.body, null, 2));
        console.log("========================================");
        
        // Normalizar campos - MoJie puede enviar con diferentes nombres
        const rawBody = req.body;
        const payload: ChinaApiPayload = {
            fno: rawBody.fno || rawBody.FNO || rawBody.Fno || rawBody.fNo || rawBody.order_no || rawBody.orderNo || rawBody.order_id,
            shippingMark: rawBody.shippingMark || rawBody.ShippingMark || rawBody.shipping_mark || rawBody.mark || rawBody.customer_code || rawBody.customerCode,
            totalQty: rawBody.totalQty || rawBody.TotalQty || rawBody.total_qty || rawBody.qty || rawBody.quantity || 0,
            totalWeight: rawBody.totalWeight || rawBody.TotalWeight || rawBody.total_weight || rawBody.weight || 0,
            totalVolume: rawBody.totalVolume || rawBody.TotalVolume || rawBody.total_volume || rawBody.volume || 0,
            totalCbm: rawBody.totalCbm || rawBody.TotalCbm || rawBody.total_cbm || rawBody.cbm || 0,
            // file puede ser string o array - normalizar a array
            file: Array.isArray(rawBody.file) ? rawBody.file : 
                  (rawBody.file ? [rawBody.file] : 
                  (Array.isArray(rawBody.files) ? rawBody.files : 
                  (rawBody.files ? [rawBody.files] : []))),
            data: rawBody.data || rawBody.Data || rawBody.items || rawBody.packages || rawBody.boxes || []
        };
        
        console.log("📦 Recibiendo FNO:", payload.fno, "- ShippingMark:", payload.shippingMark);
        console.log("  → Evidencias:", payload.file.length, "archivo(s)");
        
        // Validar campos requeridos
        if (!payload.fno) {
            console.error("❌ FNO no encontrado en payload. Campos disponibles:", Object.keys(rawBody));
            return res.status(400).json({ 
                success: false, 
                error: 'Campo FNO requerido', 
                availableFields: Object.keys(rawBody),
                hint: 'Enviar fno, FNO, order_no u orderNo'
            });
        }

        await client.query('BEGIN');

        // 1. IDENTIFICAR CLIENTE por Shipping Mark
        // Primero buscamos en users, luego en legacy_clients
        let userId = null;
        let userName = 'Sin asignar';
        
        // Buscar en users primero
        const userCheck = await client.query(
            `SELECT id, full_name FROM users WHERE UPPER(box_id) = UPPER($1)`,
            [payload.shippingMark]
        );
        
        if (userCheck.rows.length > 0) {
            userId = userCheck.rows[0].id;
            userName = userCheck.rows[0].full_name;
        } else {
            // Buscar en legacy_clients y verificar si está reclamado
            const legacyCheck = await client.query(
                `SELECT lc.box_id, lc.full_name, lc.claimed_by_user_id, u.full_name as claimed_name
                 FROM legacy_clients lc
                 LEFT JOIN users u ON lc.claimed_by_user_id = u.id
                 WHERE UPPER(lc.box_id) = UPPER($1)`,
                [payload.shippingMark]
            );
            
            if (legacyCheck.rows.length > 0) {
                const legacy = legacyCheck.rows[0];
                if (legacy.claimed_by_user_id) {
                    userId = legacy.claimed_by_user_id;
                    userName = legacy.claimed_name || legacy.full_name;
                } else {
                    userName = `${legacy.full_name} (Legacy: ${legacy.box_id})`;
                }
            }
        }
        
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

            // === CALCULAR PRECIO DE VENTA ===
            // Buscar ruta activa
            const routeRes = await client.query(`
                SELECT id FROM air_routes WHERE is_active = true LIMIT 1
            `);
            const airRouteId = routeRes.rows.length > 0 ? routeRes.rows[0].id : null;
            
            // Determinar tipo de tarifa basado en proName/descripción
            const proNameLower = (item.proName || '').toLowerCase();
            let tariffType = 'G'; // Por defecto Genérico
            if (proNameLower.includes('logo') || proNameLower.includes('鞋') || proNameLower.includes('zapato') || proNameLower.includes('shoes')) {
                tariffType = 'L';
            } else if (proNameLower.includes('medical') || proNameLower.includes('sensible') || proNameLower.includes('medicina')) {
                tariffType = 'S';
            }
            
            // Buscar precio: primero verificar Start Up, luego personalizada, luego general
            const itemWeight = parseFloat(String(item.weight || 0)) || 0;
            let pricePerKg = 0;
            let isCustomTariff = false;
            let salePrice = 0;
            let isStartup = false;
            
            // Check Start Up tier (flat price by weight bracket, ≤15kg)
            if (airRouteId && itemWeight > 0 && itemWeight <= 15) {
                const startupRes = await client.query(`
                    SELECT price_usd FROM air_startup_tiers
                    WHERE route_id = $1 AND is_active = true AND $2 >= min_weight AND $2 <= max_weight
                    LIMIT 1
                `, [airRouteId, itemWeight]);
                if (startupRes.rows.length > 0) {
                    salePrice = parseFloat(startupRes.rows[0].price_usd);
                    pricePerKg = itemWeight > 0 ? salePrice / itemWeight : 0;
                    isStartup = true;
                    tariffType = 'SU';
                }
            }
            
            // If not startup, use per-kg pricing
            if (!isStartup) {
                if (airRouteId && userId) {
                    const customTariffRes = await client.query(`
                        SELECT price_per_kg FROM air_client_tariffs 
                        WHERE user_id = $1 AND route_id = $2 AND tariff_type = $3 AND is_active = true
                        LIMIT 1
                    `, [userId, airRouteId, tariffType]);
                    
                    if (customTariffRes.rows.length > 0) {
                        pricePerKg = parseFloat(customTariffRes.rows[0].price_per_kg);
                        isCustomTariff = true;
                    }
                }
                
                if (pricePerKg === 0 && airRouteId) {
                    const generalTariffRes = await client.query(`
                        SELECT price_per_kg FROM air_tariffs 
                        WHERE route_id = $1 AND tariff_type = $2 AND is_active = true
                        LIMIT 1
                    `, [airRouteId, tariffType]);
                    
                    if (generalTariffRes.rows.length > 0) {
                        pricePerKg = parseFloat(generalTariffRes.rows[0].price_per_kg);
                    }
                }
                salePrice = itemWeight * pricePerKg;
            }
            
            console.log(`   📦 ${item.childNo}: ${tariffType} | ${itemWeight}kg ${isStartup ? `STARTUP $${salePrice.toFixed(2)}` : `× $${pricePerKg}/kg = $${salePrice.toFixed(2)}`} (${isCustomTariff ? 'CUSTOM' : 'GENERAL'})`);

            if (existingPkg.rows.length > 0) {
                // ACTUALIZAR caja existente (ej: cuando llega el billNo)
                // Si no tiene precio asignado, asignarlo ahora (congelar precio)
                const existingId = existingPkg.rows[0].id;
                const hasPriceRes = await client.query(
                    'SELECT air_sale_price FROM packages WHERE id = $1',
                    [existingId]
                );
                const hasExistingPrice = hasPriceRes.rows.length > 0 && 
                    hasPriceRes.rows[0].air_sale_price !== null && 
                    parseFloat(hasPriceRes.rows[0].air_sale_price) > 0;

                if (hasExistingPrice) {
                    // Ya tiene precio congelado → NO sobrescribir
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
                } else {
                    // No tiene precio → asignar precio congelado ahora
                    await client.query(`
                        UPDATE packages SET
                            international_tracking = COALESCE($1, international_tracking),
                            weight = $2,
                            pro_name = $3,
                            customs_bno = $4,
                            etd = $5,
                            eta = $6,
                            air_route_id = $8,
                            air_tariff_type = $9,
                            air_price_per_kg = $10,
                            air_sale_price = $11,
                            air_is_custom_tariff = $12,
                            air_price_assigned_at = NOW(),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE child_no = $7
                    `, [
                        item.billNo || null,
                        item.weight,
                        item.proName,
                        item.customsBno,
                        item.etd || null,
                        item.eta || null,
                        item.childNo,
                        airRouteId,
                        tariffType,
                        pricePerKg,
                        salePrice,
                        isCustomTariff
                    ]);
                }
                packagesUpdated++;
            } else {
                // CREAR nueva caja CON PRECIO CONGELADO
                const trackingInternal = `CN-${item.childNo.slice(-8)}`;
                const dimensions = `${item.long}x${item.width}x${item.height}`;
                
                await client.query(`
                    INSERT INTO packages 
                    (tracking_internal, child_no, china_receipt_id, user_id, 
                     weight, dimensions, long_cm, width_cm, height_cm,
                     description, pro_name, customs_bno, trajectory_name,
                     single_volume, single_cbm, international_tracking,
                     etd, eta, service_type, warehouse_location, status,
                     air_route_id, air_tariff_type, air_price_per_kg, air_sale_price, air_is_custom_tariff, air_price_assigned_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW())
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
                    'received_china',
                    airRouteId,
                    tariffType,
                    pricePerKg,
                    salePrice,
                    isCustomTariff
                ]);
                packagesCreated++;
            }
        }

        await client.query('COMMIT');
        
        // === ACTUALIZAR SALDO EN CHINA_RECEIPTS ===
        // Calcular el total de air_sale_price de los paquetes asociados
        const totalSaleRes = await pool.query(`
            SELECT COALESCE(SUM(air_sale_price), 0) as total_sale
            FROM packages 
            WHERE china_receipt_id = $1 AND air_sale_price IS NOT NULL
        `, [receiptId]);
        const totalSale = parseFloat(totalSaleRes.rows[0].total_sale) || 0;
        
        // Si no hay precios en packages, usar estimado basado en peso del receipt
        if (totalSale > 0) {
            await pool.query(`
                UPDATE china_receipts 
                SET assigned_cost_mxn = $1, saldo_pendiente = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND (assigned_cost_mxn IS NULL OR assigned_cost_mxn != $1)
            `, [totalSale, receiptId]);
            console.log(`  💰 Saldo asignado: $${totalSale.toFixed(2)} USD`);
        } else if (payload.totalWeight > 0) {
            // Usar tarifa general $21/kg si no hay paquetes con precio
            const estimatedCost = payload.totalWeight * 21;
            await pool.query(`
                UPDATE china_receipts 
                SET assigned_cost_mxn = $1, saldo_pendiente = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND assigned_cost_mxn IS NULL
            `, [estimatedCost, receiptId]);
            console.log(`  💰 Saldo estimado: $${estimatedCost.toFixed(2)} USD (${payload.totalWeight}kg × $21/kg)`);
        }

        // Marcar log como exitoso
        await pool.query(`
            UPDATE china_callback_logs 
            SET success = true 
            WHERE id = (
                SELECT id FROM china_callback_logs 
                WHERE raw_payload->>'fno' = $1 OR raw_payload->>'FNO' = $1
                ORDER BY created_at DESC LIMIT 1
            )
        `, [payload.fno]);

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
        
        // Guardar error en log
        try {
            await pool.query(`
                UPDATE china_callback_logs 
                SET error_message = $1 
                WHERE id = (SELECT MAX(id) FROM china_callback_logs)
            `, [error.message]);
        } catch (e) {}
        
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
                COALESCE(u.full_name, lc.full_name, 'Sin asignar') as client_name,
                COALESCE(u.box_id, lc.box_id) as client_box_id,
                CASE WHEN u.id IS NOT NULL THEN true ELSE false END as is_registered,
                lc.full_name as legacy_name,
                (SELECT COUNT(*) FROM packages WHERE china_receipt_id = cr.id) as package_count
            FROM china_receipts cr
            LEFT JOIN users u ON cr.user_id = u.id
            LEFT JOIN legacy_clients lc ON UPPER(cr.shipping_mark) = UPPER(lc.box_id)
        `;
        const params: any[] = [];
        
        if (status) {
            // Soporta CSV para agrupar múltiples status: "in_transit_airport_wait,in_transit_loading,in_transit_transfer"
            const statusList = String(status).split(',').map(s => s.trim()).filter(Boolean);
            if (statusList.length === 1) {
                query += ` WHERE cr.status = $1`;
                params.push(statusList[0]);
            } else if (statusList.length > 1) {
                const placeholders = statusList.map((_, i) => `$${i + 1}`).join(', ');
                query += ` WHERE cr.status IN (${placeholders})`;
                params.push(...statusList);
            }
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

        // Buscar cliente por shipping_mark - primero en users, luego en legacy_clients
        let userId = null;
        
        const userResult = await pool.query(
            'SELECT id FROM users WHERE UPPER(box_id) = UPPER($1) LIMIT 1',
            [shipping_mark]
        );
        
        if (userResult.rows.length > 0) {
            userId = userResult.rows[0].id;
        } else {
            // Buscar en legacy_clients si está reclamado
            const legacyResult = await pool.query(
                'SELECT claimed_by_user_id FROM legacy_clients WHERE UPPER(box_id) = UPPER($1) AND claimed_by_user_id IS NOT NULL LIMIT 1',
                [shipping_mark]
            );
            if (legacyResult.rows.length > 0) {
                userId = legacyResult.rows[0].claimed_by_user_id;
            }
        }

        // Insertar recepción
        // Calcular costo estimado basado en peso × $21/kg (tarifa estándar)
        const estimatedCost = (total_weight || 0) * 21;
        
        const result = await pool.query(`
            INSERT INTO china_receipts 
            (fno, user_id, shipping_mark, total_qty, total_weight, total_cbm, notes, status, assigned_cost_mxn, saldo_pendiente)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'received_origin', $8, $8)
            RETURNING *
        `, [fno, userId, shipping_mark, total_qty || 1, total_weight || 0, total_cbm || 0, notes || 'Captura manual', estimatedCost]);

        console.log(`✅ Recepción manual creada: ${fno} - $${estimatedCost.toFixed(2)} USD (${total_weight || 0}kg × $21/kg)`);

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
                COALESCE(u.full_name, lc.full_name, 'Sin asignar') as client_name,
                COALESCE(u.email, lc.email) as client_email,
                COALESCE(u.box_id, lc.box_id) as client_box_id,
                lc.full_name as legacy_name,
                CASE WHEN u.id IS NOT NULL THEN true ELSE false END as is_registered
            FROM china_receipts cr
            LEFT JOIN users u ON cr.user_id = u.id
            LEFT JOIN legacy_clients lc ON UPPER(cr.shipping_mark) = UPPER(lc.box_id)
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
// GET: Guías aéreas hijas (daughter guides) para Gestión Aérea
// GET /api/china/air-guides
// ============================================
export const getAirDaughterGuides = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status, search, awb, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT 
                p.id,
                p.tracking_internal,
                p.tracking_provider,
                p.child_no,
                p.description,
                p.weight,
                p.pkg_length,
                p.pkg_width,
                p.pkg_height,
                p.single_volume,
                p.single_cbm,
                p.international_tracking,
                p.status::text as status,
                p.etd,
                p.eta,
                p.created_at,
                p.updated_at,
                p.user_id,
                p.box_number,
                p.total_boxes,
                p.assigned_cost_mxn,
                p.client_paid,
                p.master_id,
                p.china_receipt_id,
                p.pro_name,
                p.customs_bno,
                p.box_id as package_box_id,
                p.air_sale_price,
                p.air_price_per_kg,
                p.air_tariff_type,
                p.air_is_custom_tariff,
                COALESCE(u.full_name, lc.full_name, lc_mark.full_name, CASE WHEN COALESCE(p.box_id, cr.shipping_mark) IS NOT NULL AND COALESCE(p.box_id, cr.shipping_mark) != '' THEN COALESCE(p.box_id, cr.shipping_mark) ELSE 'Sin asignar' END) as client_name,
                COALESCE(u.box_id, p.box_id, cr.shipping_mark, '') as client_box_id,
                cr.fno as receipt_fno,
                cr.shipping_mark
            FROM packages p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN legacy_clients lc ON p.box_id = lc.box_id
            LEFT JOIN china_receipts cr ON p.china_receipt_id = cr.id
            LEFT JOIN legacy_clients lc_mark ON cr.shipping_mark = lc_mark.box_id
            WHERE p.service_type = 'AIR_CHN_MX'
            AND p.warehouse_location = 'china_air'
            AND (p.is_master = false OR p.is_master IS NULL)
        `;
        const params: any[] = [];
        let paramIndex = 1;

        if (status && status !== 'all') {
            query += ` AND p.status::text = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (search) {
            query += ` AND (
                UPPER(p.tracking_internal) LIKE UPPER($${paramIndex})
                OR UPPER(p.child_no) LIKE UPPER($${paramIndex})
                OR UPPER(p.international_tracking) LIKE UPPER($${paramIndex})
                OR UPPER(COALESCE(u.full_name, lc.full_name, '')) LIKE UPPER($${paramIndex})
                OR UPPER(COALESCE(u.box_id, '')) LIKE UPPER($${paramIndex})
                OR UPPER(COALESCE(p.box_id, '')) LIKE UPPER($${paramIndex})
                OR UPPER(COALESCE(cr.fno, '')) LIKE UPPER($${paramIndex})
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (awb) {
            query += ` AND UPPER(p.international_tracking) = UPPER($${paramIndex})`;
            params.push(awb);
            paramIndex++;
        }

        query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Count total
        let countQuery = `
            SELECT COUNT(*) as total
            FROM packages p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN legacy_clients lc ON p.box_id = lc.box_id
            LEFT JOIN china_receipts cr ON p.china_receipt_id = cr.id
            LEFT JOIN legacy_clients lc_mark ON cr.shipping_mark = lc_mark.box_id
            WHERE p.service_type = 'AIR_CHN_MX'
            AND p.warehouse_location = 'china_air'
            AND (p.is_master = false OR p.is_master IS NULL)
        `;
        const countParams: any[] = [];
        let countParamIndex = 1;

        if (status && status !== 'all') {
            countQuery += ` AND p.status::text = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }
        if (search) {
            countQuery += ` AND (
                UPPER(p.tracking_internal) LIKE UPPER($${countParamIndex})
                OR UPPER(p.child_no) LIKE UPPER($${countParamIndex})
                OR UPPER(p.international_tracking) LIKE UPPER($${countParamIndex})
                OR UPPER(COALESCE(u.full_name, lc.full_name, lc_mark.full_name, '')) LIKE UPPER($${countParamIndex})
                OR UPPER(COALESCE(u.box_id, '')) LIKE UPPER($${countParamIndex})
                OR UPPER(COALESCE(p.box_id, cr.shipping_mark, '')) LIKE UPPER($${countParamIndex})
                OR UPPER(COALESCE(cr.fno, '')) LIKE UPPER($${countParamIndex})
            )`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }
        if (awb) {
            countQuery += ` AND UPPER(p.international_tracking) = UPPER($${countParamIndex})`;
            countParams.push(awb);
            countParamIndex++;
        }

        const countResult = await pool.query(countQuery, countParams);

        res.json({
            success: true,
            guides: result.rows,
            total: parseInt(countResult.rows[0].total),
        });
    } catch (error: any) {
        console.error("Error obteniendo guías aéreas hijas:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Estadísticas de guías aéreas hijas
// GET /api/china/air-guides/stats
// ============================================
export const getAirDaughterStats = async (req: Request, res: Response): Promise<any> => {
    try {
        const statusStats = await pool.query(`
            SELECT p.status::text as status, COUNT(*) as count
            FROM packages p
            WHERE p.service_type = 'AIR_CHN_MX'
            AND p.warehouse_location = 'china_air'
            AND (p.is_master = false OR p.is_master IS NULL)
            GROUP BY p.status
        `);

        const awbStats = await pool.query(`
            SELECT 
                COALESCE(p.international_tracking, 'Sin AWB') as awb,
                COUNT(*) as count
            FROM packages p
            WHERE p.service_type = 'AIR_CHN_MX'
            AND p.warehouse_location = 'china_air'
            AND (p.is_master = false OR p.is_master IS NULL)
            GROUP BY p.international_tracking
            ORDER BY count DESC
            LIMIT 20
        `);

        // "Sin asignar" = paquetes que NO tienen:
        // - user_id válido
        // - box_id que exista en legacy_clients
        // - shipping_mark (del china_receipt) que exista en legacy_clients
        const unassigned = await pool.query(`
            SELECT COUNT(*) as count
            FROM packages p
            LEFT JOIN legacy_clients lc ON p.box_id = lc.box_id
            LEFT JOIN china_receipts cr ON p.china_receipt_id = cr.id
            LEFT JOIN legacy_clients lc_mark ON cr.shipping_mark = lc_mark.box_id
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.service_type = 'AIR_CHN_MX'
            AND p.warehouse_location = 'china_air'
            AND (p.is_master = false OR p.is_master IS NULL)
            AND u.id IS NULL
            AND lc.id IS NULL
            AND lc_mark.id IS NULL
            AND (p.box_id IS NULL OR p.box_id = '')
            AND (cr.shipping_mark IS NULL OR cr.shipping_mark = '')
        `);

        const total = await pool.query(`
            SELECT COUNT(*) as count
            FROM packages p
            WHERE p.service_type = 'AIR_CHN_MX'
            AND p.warehouse_location = 'china_air'
            AND (p.is_master = false OR p.is_master IS NULL)
        `);

        res.json({
            success: true,
            stats: {
                byStatus: statusStats.rows,
                byAwb: awbStats.rows,
                totalGuides: parseInt(total.rows[0].count),
                unassigned: parseInt(unassigned.rows[0].count),
            }
        });
    } catch (error: any) {
        console.error("Error obteniendo stats de guías aéreas:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Logs de callbacks de MoJie (diagnóstico)
// GET /api/china/callback-logs
// ============================================
export const getCallbackLogs = async (req: Request, res: Response): Promise<any> => {
    try {
        const { limit = 50 } = req.query;
        
        const result = await pool.query(`
            SELECT id, raw_body, content_type, status, error_message, fno, shipping_mark, created_at
            FROM china_callback_logs
            ORDER BY created_at DESC
            LIMIT $1
        `, [limit]);
        
        res.json({
            success: true,
            logs: result.rows,
            total: result.rowCount
        });
    } catch (error: any) {
        // Si la tabla no existe, informar
        if (error.code === '42P01') {
            return res.json({
                success: false,
                error: 'Tabla china_callback_logs no existe. Ejecuta la migración add_china_callback_logs.sql',
                logs: []
            });
        }
        console.error("Error obteniendo logs:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// API MJCUSTOMER.COM - CONFIGURACIÓN
// Dos métodos de autenticación disponibles:
// 1. h5api con SM2 (endpoint /api/sysAuth/login) - PRINCIPAL
// 2. orderSystem plano (endpoint /api/appAuth/loginByOrderSystem) - BACKUP
// ============================================

const MJCUSTOMER_API = {
    baseUrl: process.env.MJCUSTOMER_API_URL || 'http://api.mjcustomer.com',
    token: process.env.MJCUSTOMER_API_TOKEN || '',
    tokenExpiry: 0,
    
    // Credenciales h5api con SM2 (principal)
    h5api: {
        username: 'h5api',
        password: 'H_5@nLP.',
        // PublicKey SM2 proporcionada por MoJie
        publicKey: '046BB47A0777ADAD614BEF4F234BBE275C4FBB4BB45A9EDCAB5602EEE9588B52AEFB5CD7A29396DA46526E1C4F72650166F5FB41515B83C192AE37134470EB951D'
    },
    
    // Credenciales orderSystem (backup)
    orderSystem: {
        username: process.env.MJCUSTOMER_USERNAME || '18824927368',
        password: process.env.MJCUSTOMER_PASSWORD || 'cM4V92S0RNE2.'
    }
};

/**
 * Encripta una cadena usando SM2 con la llave pública de MoJie
 */
function encryptWithSM2(plainText: string): string {
    try {
        // La llave pública viene en formato hex con prefijo 04
        const publicKey = MJCUSTOMER_API.h5api.publicKey;
        
        // Encriptar usando sm-crypto (modo C1C3C2 es el estándar)
        const encrypted = sm2.doEncrypt(plainText, publicKey, 1); // 1 = C1C3C2 mode
        
        console.log('🔐 Password encriptado con SM2 correctamente');
        return encrypted;
    } catch (error: any) {
        console.error('❌ Error encriptando con SM2:', error.message);
        throw error;
    }
}

// ============================================
// LOGIN: Obtener token de MJCustomer
// Intenta primero con h5api/SM2, si falla usa orderSystem
// ============================================

/**
 * fetch con timeout explícito. MoJie (api.mjcustomer.com) a veces tarda o
 * no responde y Railway corta el request con 502. Usamos AbortController.
 */
async function fetchWithTimeout(url: string, options: any = {}, timeoutMs: number = 20000): Promise<globalThis.Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res as unknown as globalThis.Response;
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error(`MoJie API timeout (${timeoutMs}ms): ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

async function loginToMJCustomer(): Promise<string | null> {
    // Intentar primero con h5api + SM2
    const tokenH5 = await loginWithH5Api();
    if (tokenH5) return tokenH5;
    
    // Si falla, intentar con orderSystem
    console.log('⚠️ h5api falló, intentando con orderSystem...');
    return await loginWithOrderSystem();
}

/**
 * Login con credenciales h5api y SM2
 * Endpoint: /api/sysAuth/login
 */
async function loginWithH5Api(): Promise<string | null> {
    try {
        console.log('🔐 Iniciando login en MJCustomer (h5api + SM2)...');
        console.log('   Usuario:', MJCUSTOMER_API.h5api.username);
        
        // Encriptar password con SM2
        const encryptedPassword = encryptWithSM2(MJCUSTOMER_API.h5api.password);
        
        const response = await fetchWithTimeout(
            `${MJCUSTOMER_API.baseUrl}/api/sysAuth/login`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json-patch+json',
                    'Accept': 'text/plain',
                    'request-from': 'swagger'
                },
                body: JSON.stringify({
                    account: MJCUSTOMER_API.h5api.username,
                    password: encryptedPassword,
                    codeId: 0,
                    code: 'string',
                    loginMode: 1
                })
            },
            15000
        );

        const data = await response.json() as { code: number; message: string; result?: { accessToken: string } };
        console.log('   Respuesta h5api:', data.code, data.message);
        
        if (data.code === 200 && data.result?.accessToken) {
            const token = data.result.accessToken;
            MJCUSTOMER_API.token = token;
            MJCUSTOMER_API.tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000); // 6 días
            
            // Guardar en BD
            await saveTokenToDB(token);
            
            console.log('✅ Login exitoso con h5api + SM2');
            return token;
        } else {
            console.error('❌ Login h5api fallido:', data.message);
            return null;
        }
    } catch (error: any) {
        console.error('❌ Error en login h5api:', error.message);
        return null;
    }
}

/**
 * Login con credenciales orderSystem (sin encriptación)
 * Endpoint: /api/appAuth/loginByOrderSystem
 */
async function loginWithOrderSystem(): Promise<string | null> {
    try {
        console.log('🔐 Iniciando login en MJCustomer (orderSystem)...');
        console.log('   Usuario:', MJCUSTOMER_API.orderSystem.username);
        
        const response = await fetchWithTimeout(
            `${MJCUSTOMER_API.baseUrl}/api/appAuth/loginByOrderSystem`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json-patch+json',
                    'Accept': 'text/plain',
                    'request-from': 'swagger'
                },
                body: JSON.stringify({
                    account: MJCUSTOMER_API.orderSystem.username,
                    password: MJCUSTOMER_API.orderSystem.password
                })
            },
            15000
        );

        const data = await response.json() as { code: number; message: string; result?: { accessToken: string } };
        console.log('   Respuesta orderSystem:', data.code, data.message);
        
        if (data.code === 200 && data.result?.accessToken) {
            const token = data.result.accessToken;
            MJCUSTOMER_API.token = token;
            MJCUSTOMER_API.tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000);
            
            await saveTokenToDB(token);
            
            console.log('✅ Login exitoso con orderSystem');
            return token;
        } else {
            console.error('❌ Login orderSystem fallido:', data.message);
            return null;
        }
    } catch (error: any) {
        console.error('❌ Error en login orderSystem:', error.message);
        return null;
    }
}

/**
 * Guarda el token en la base de datos para persistencia
 */
async function saveTokenToDB(token: string): Promise<void> {
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
// Intenta primero h5api+SM2, si falla usa orderSystem
// ============================================
export const loginMJCustomerEndpoint = async (req: Request, res: Response): Promise<any> => {
    try {
        console.log('🔐 Iniciando login MJCustomer...');
        
        const token = await loginToMJCustomer();
        
        if (token) {
            res.json({
                success: true,
                message: 'Login exitoso',
                method: 'h5api+SM2 o orderSystem',
                tokenPreview: token.substring(0, 20) + '...',
                expiresAt: new Date(MJCUSTOMER_API.tokenExpiry).toISOString()
            });
        } else {
            res.status(401).json({
                success: false,
                error: 'Login fallido con ambos métodos (h5api+SM2 y orderSystem). Verifica credenciales.'
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

        // Helper para hacer la llamada con un token dado
        const callApi = async (token: string) => {
            const apiResponse = await fetchWithTimeout(
                `${MJCUSTOMER_API.baseUrl}/api/otherSystem/orderByList/${fno}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                        'request-from': 'swagger'
                    }
                },
                20000
            );
            const text = await apiResponse.text();
            let data: MJCustomerOrderResponse | null = null;
            try { data = JSON.parse(text) as MJCustomerOrderResponse; } catch { /* noop */ }
            return { status: apiResponse.status, data, rawText: text };
        };

        // Obtener token válido
        let token: string;
        try {
            token = await getMJCustomerToken();
        } catch (tokenErr: any) {
            console.error('❌ Error obteniendo token MJCustomer:', tokenErr);
            return res.status(503).json({
                success: false,
                error: 'No se pudo autenticar con MoJie',
                details: tokenErr.message
            });
        }

        // Primera llamada
        let { status: httpStatus, data: apiData, rawText } = await callApi(token);

        // Si 401 o código 401 en payload → refrescar token y reintentar 1 vez
        const isAuthFail = httpStatus === 401 || (apiData && (apiData.code === 401 || apiData.code === 403));
        if (isAuthFail) {
            console.warn('🔄 Token MJCustomer inválido, refrescando...');
            MJCUSTOMER_API.token = '';
            MJCUSTOMER_API.tokenExpiry = 0;
            try {
                const newToken = await loginToMJCustomer();
                if (newToken) {
                    ({ status: httpStatus, data: apiData, rawText } = await callApi(newToken));
                }
            } catch (refreshErr: any) {
                console.error('❌ Falló refresh de token:', refreshErr);
            }
        }

        if (!apiData) {
            console.error('❌ Respuesta no-JSON de MoJie:', rawText?.substring(0, 500));
            return res.status(502).json({
                success: false,
                error: 'Respuesta inválida de MoJie',
                details: rawText?.substring(0, 200)
            });
        }

        if (apiData.code !== 200 || !apiData.result) {
            return res.status(httpStatus === 401 ? 401 : 404).json({
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
        console.error('❌ Error rastreando FNO:', error?.stack || error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al consultar tracking',
            details: error?.message || String(error)
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
// ADMIN: Listar valores únicos de trajectory_name (status crudo de MoJie)
// GET /api/china/trajectory-names
// ============================================
// ============================================
// Mapeo de trajectory_name (chino/español) a status interno SOS-X
// Basado en los valores reales que envía MoJie (api.mjcustomer.com)
// Orden de prioridad: delivered > in_customs_gz > in_transit_* > received_china > received_origin > pending
// ============================================
export function mapTrajectoryToStatus(trajectoryNames: string[]): string {
    const joined = trajectoryNames.map(t => (t || '').toLowerCase()).join(' | ');

    // 1. Entregado (firmado por destinatario) - prioridad máxima
    //    "该货件已派送签收" = El envío fue entregado/firmado
    if (/派送签收|已签收|签收|entregado|delivered/i.test(joined)) {
        return 'delivered';
    }

    // 2. En aduana Guangzhou (esperando despacho de importación)
    //    "航班已抵达机场，等待办理进口清关文件"
    if (/清关|海关|报关|aduana|customs|despacho/i.test(joined)) {
        return 'in_customs_gz';
    }

    // 3. En tránsito - esperando vuelo en aeropuerto
    //    "已到达机场等待安排航班指示"
    if (/到达机场|抵达机场|等待安排航班|等待航班/i.test(joined)) {
        return 'in_transit_airport_wait';
    }

    // 4. En tránsito - cargando / en puerto
    //    "该货物正在装车过港接收中"
    if (/装车|过港/i.test(joined)) {
        return 'in_transit_loading';
    }

    // 5. En tránsito - en transferencia / vuelo aéreo
    //    "空运货物正在安排中转" (también unicode-escaped u7a7au8fd0...)
    if (/中转|已发货|起飞|航班|transit|tránsito|vuelo|flight/i.test(joined) ||
        /u7a7au8fd0/.test(joined)) {
        return 'in_transit_transfer';
    }

    // 6. Recibido en bodega China - info de guía aérea recibida
    //    "空运单信息已收到 -广州鹤龙"
    if (/空运单信息已收到|信息已收到|已收到/i.test(joined)) {
        return 'received_china';
    }

    // 7. Recibido en bodega origen - escaneado / en clasificación
    //    "空运货物已扫描入仓正在分拣中 -广州鹤龙"
    if (/扫描入仓|入仓|分拣|almacén|bodega|warehouse/i.test(joined)) {
        return 'received_origin';
    }

    // 8. Pendiente - reservado, esperando recepción en bodega
    //    "预约下单，等待仓接收货"
    if (/预约|下单|等待仓接收|pendiente|pending/i.test(joined)) {
        return 'pending';
    }

    // Default: recibido en origen (si ya está en BD asumimos que al menos está en bodega)
    return 'received_origin';
}

export const listTrajectoryNames = async (_req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(`
            SELECT 
                COALESCE(NULLIF(TRIM(trajectory_name), ''), '(vacío)') AS trajectory_name,
                COUNT(*)::int AS count,
                MIN(created_at) AS first_seen,
                MAX(updated_at) AS last_seen
            FROM packages
            WHERE trajectory_name IS NOT NULL AND TRIM(trajectory_name) <> ''
            GROUP BY 1
            ORDER BY count DESC
        `);

        res.json({
            success: true,
            total: result.rows.length,
            trajectoryNames: result.rows
        });
    } catch (error: any) {
        console.error('❌ Error listando trajectory_names:', error?.stack || error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al listar trajectory_names',
            details: error?.message 
        });
    }
};

// ============================================
// ADMIN: Recalcular status de china_receipts con base en trajectory_name actual
// POST /api/china/recalc-statuses
// No consulta a MoJie; usa los valores que ya tenemos en packages.trajectory_name.
// ============================================
export const recalcChinaStatuses = async (_req: Request, res: Response): Promise<any> => {
    try {
        console.log('🔁 Recalculando status de china_receipts...');

        // Traer todas las recepciones que NO están en estado final + sus trajectories
        const receipts = await pool.query(`
            SELECT cr.id, cr.fno, cr.status,
                   COALESCE(ARRAY_AGG(p.trajectory_name) FILTER (WHERE p.trajectory_name IS NOT NULL), ARRAY[]::text[]) AS trajectories
            FROM china_receipts cr
            LEFT JOIN packages p ON p.china_receipt_id = cr.id
            WHERE cr.status NOT IN ('delivered', 'received_cdmx', 'completed')
            GROUP BY cr.id
        `);

        const summary: Record<string, number> = {};
        let updated = 0;

        for (const r of receipts.rows) {
            const newStatus = mapTrajectoryToStatus(r.trajectories || []);
            summary[newStatus] = (summary[newStatus] || 0) + 1;
            if (newStatus !== r.status) {
                await pool.query(
                    `UPDATE china_receipts SET status = $1, updated_at = NOW() WHERE id = $2`,
                    [newStatus, r.id]
                );
                updated++;
            }
        }

        console.log(`✅ Recalculados ${receipts.rows.length}, actualizados ${updated}`);

        res.json({
            success: true,
            scanned: receipts.rows.length,
            updated,
            distribution: summary
        });
    } catch (error: any) {
        console.error('❌ Error recalculando status:', error?.stack || error);
        res.status(500).json({
            success: false,
            error: 'Error al recalcular status',
            details: error?.message
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

            // === ACTUALIZAR SALDO EN CHINA_RECEIPTS ===
            const totalWeight = parseFloat(String(order.totalWeight || 0)) || 0;
            if (totalWeight > 0) {
                const estimatedCost = totalWeight * 21; // $21 USD/kg tarifa estándar
                await client.query(`
                    UPDATE china_receipts 
                    SET assigned_cost_mxn = $1, saldo_pendiente = $1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2 AND (assigned_cost_mxn IS NULL OR assigned_cost_mxn = 0)
                `, [estimatedCost, receiptId]);
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
        // Usamos subquery para poder hacer DISTINCT y ORDER BY created_at
        const activeOrders = await pool.query(`
            SELECT fno FROM (
                SELECT DISTINCT ON (fno) fno, created_at
                FROM china_receipts 
                WHERE status NOT IN ('delivered', 'cancelled', 'completed')
                  AND created_at > NOW() - INTERVAL '30 days'
                  AND fno IS NOT NULL
                ORDER BY fno, created_at DESC
            ) sub
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
                        const trajectories = orderData.data.map((p: any) => p.trajecotryName || '');
                        newStatus = mapTrajectoryToStatus(trajectories);
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
 * La llave DES debe configurarse en .env como MJCUSTOMER_DES_KEY
 */
function decryptDES(encryptedData: string): string {
    try {
        console.log('🔐 Intentando desencriptar DES...');
        console.log('   → Llave DES configurada:', MOJIE_DES_KEY.substring(0, 3) + '***');
        console.log('   → Longitud datos encriptados:', encryptedData.length);
        
        // La llave DES debe ser de 8 bytes
        const key = Buffer.from(MOJIE_DES_KEY.padEnd(8, '\0').slice(0, 8));
        
        // Intentar primero con Base64
        let encryptedBuffer: Buffer;
        let encoding = 'base64';
        try {
            encryptedBuffer = Buffer.from(encryptedData, 'base64');
            // Verificar si es realmente base64 válido
            if (encryptedBuffer.toString('base64') !== encryptedData.replace(/\s/g, '')) {
                throw new Error('No es base64 válido');
            }
        } catch {
            // Si falla, intentar con Hex
            encoding = 'hex';
            encryptedBuffer = Buffer.from(encryptedData, 'hex');
        }
        console.log(`   → Encoding detectado: ${encoding}`);
        
        // Crear decipher DES-ECB (sin IV)
        const decipher = crypto.createDecipheriv('des-ecb', key, null);
        decipher.setAutoPadding(true);
        
        let decrypted = decipher.update(encryptedBuffer);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        const result = decrypted.toString('utf8').trim();
        console.log('   → Desencriptado exitoso, longitud:', result.length);
        return result;
    } catch (error: any) {
        console.error('❌ Error desencriptando DES:', error.message);
        console.error('   → Llave usada:', MOJIE_DES_KEY);
        console.error('   → Primeros 50 chars del input:', encryptedData.substring(0, 50));
        throw new Error(`Error de desencriptación DES: ${error.message}. Verifica la llave MJCUSTOMER_DES_KEY en .env`);
    }
}

// ============================================
// WEBHOOK CALLBACK: Recibir datos encriptados de MoJie
// POST /api/china/callback
// El body viene como string encriptado con DES
// ============================================

// Función auxiliar para guardar logs de callbacks (diagnóstico)
async function logCallback(data: any, status: 'received' | 'processed' | 'error', errorMsg?: string): Promise<void> {
    try {
        await pool.query(`
            INSERT INTO china_callback_logs (raw_body, content_type, status, error_message, created_at)
            VALUES ($1, $2, $3, $4, NOW())
        `, [
            typeof data === 'string' ? data : JSON.stringify(data),
            'application/json',
            status,
            errorMsg || null
        ]);
    } catch (e) {
        // Ignorar errores de log (la tabla puede no existir)
        console.warn('⚠️ No se pudo guardar log de callback (tabla puede no existir)');
    }
}

export const mojieCallbackEncrypted = async (req: Request, res: Response): Promise<any> => {
    const client = await pool.connect();
    
    try {
        console.log('📥 [MoJie Callback] Recibiendo datos...');
        console.log('   → Content-Type:', req.headers['content-type']);
        console.log('   → Body type:', typeof req.body);
        console.log('   → Body preview:', typeof req.body === 'string' ? req.body.substring(0, 100) : JSON.stringify(req.body).substring(0, 100));
        
        // Guardar log del callback recibido
        await logCallback({ 
            headers: req.headers, 
            body: req.body,
            rawBody: typeof req.body === 'string' ? req.body.substring(0, 500) : null
        }, 'received');
        
        // El body puede venir en múltiples formatos según cómo MoJie lo envíe
        let encryptedData: string | null = null;
        let directPayload: ChinaApiPayload | null = null;
        
        // Caso 1: Body es string directo (text/plain)
        if (typeof req.body === 'string' && req.body.length > 0) {
            // Verificar si es JSON sin encriptar
            if (req.body.trim().startsWith('{')) {
                try {
                    directPayload = JSON.parse(req.body);
                    console.log('   → Body es JSON string, parseado correctamente');
                } catch {
                    encryptedData = req.body;
                    console.log('   → Body es string encriptado');
                }
            } else {
                encryptedData = req.body;
                console.log('   → Body es string encriptado (no JSON)');
            }
        }
        // Caso 2: Body es objeto con datos encriptados en algún campo
        else if (typeof req.body === 'object' && req.body !== null) {
            if (req.body.data && typeof req.body.data === 'string') {
                encryptedData = req.body.data;
                console.log('   → Datos encriptados en campo "data"');
            } else if (req.body.encrypted && typeof req.body.encrypted === 'string') {
                encryptedData = req.body.encrypted;
                console.log('   → Datos encriptados en campo "encrypted"');
            } else if (req.body.content && typeof req.body.content === 'string') {
                encryptedData = req.body.content;
                console.log('   → Datos encriptados en campo "content"');
            } else if (req.body.fno) {
                // JSON sin encriptar con estructura esperada
                directPayload = req.body as ChinaApiPayload;
                console.log('   → Datos JSON sin encriptar (tiene fno)');
            } else {
                // Intentar buscar cualquier campo string largo que pueda ser encriptado
                for (const key of Object.keys(req.body)) {
                    if (typeof req.body[key] === 'string' && req.body[key].length > 50) {
                        encryptedData = req.body[key];
                        console.log(`   → Posibles datos encriptados en campo "${key}"`);
                        break;
                    }
                }
            }
        }
        
        // Si no encontramos datos válidos
        if (!encryptedData && !directPayload) {
            console.error('❌ [MoJie Callback] No se encontraron datos válidos');
            console.error('   → Body completo:', JSON.stringify(req.body));
            return res.status(400).json({ 
                success: false, 
                error: 'Formato de datos no reconocido. Se espera string encriptado o JSON con fno.',
                receivedType: typeof req.body,
                receivedKeys: typeof req.body === 'object' ? Object.keys(req.body || {}) : 'N/A'
            });
        }
        
        // Si ya tenemos el payload directo, procesarlo
        if (directPayload) {
            console.log('   → Procesando payload directo sin desencriptar...');
            return processCallbackPayload(client, directPayload, res);
        }
        
        // Si llegamos aquí, tenemos datos encriptados
        if (!encryptedData) {
            throw new Error('No se encontraron datos encriptados para procesar');
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
                    // Actualizar paquete existente (NO sobrescribir precio si ya tiene)
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
                    // Crear nuevo paquete CON PRECIO DE VENTA ASIGNADO
                    const trackingInternal = `CN-${childNo.slice(-8)}`;
                    const dimensions = `${item.long || 0}x${item.width || 0}x${item.height || 0}`;
                    
                    // === CALCULAR PRECIO DE VENTA ===
                    // Buscar ruta activa (asumimos destino MEX por defecto)
                    const routeRes = await client.query(`
                        SELECT id FROM air_routes WHERE is_active = true LIMIT 1
                    `);
                    const airRouteId = routeRes.rows.length > 0 ? routeRes.rows[0].id : null;
                    
                    // Determinar tipo de tarifa basado en proName/descripción
                    const proNameLower = (item.proName || '').toLowerCase();
                    let tariffType = 'G'; // Por defecto Genérico
                    if (proNameLower.includes('logo') || proNameLower.includes('鞋') || proNameLower.includes('zapato') || proNameLower.includes('shoes')) {
                        tariffType = 'L';
                    } else if (proNameLower.includes('medical') || proNameLower.includes('sensible') || proNameLower.includes('medicina')) {
                        tariffType = 'S';
                    }
                    
                    // Buscar precio: primero verificar Start Up, luego personalizada, luego general
                    const weight = parseFloat(String(item.weight || 0)) || 0;
                    let pricePerKg = 0;
                    let isCustomTariff = false;
                    let salePrice = 0;
                    let isStartup = false;
                    
                    // Check Start Up tier (flat price by weight bracket, ≤15kg)
                    if (airRouteId && weight > 0 && weight <= 15) {
                        const startupRes = await client.query(`
                            SELECT price_usd FROM air_startup_tiers
                            WHERE route_id = $1 AND is_active = true AND $2 >= min_weight AND $2 <= max_weight
                            LIMIT 1
                        `, [airRouteId, weight]);
                        if (startupRes.rows.length > 0) {
                            salePrice = parseFloat(startupRes.rows[0].price_usd);
                            pricePerKg = weight > 0 ? salePrice / weight : 0;
                            isStartup = true;
                            tariffType = 'SU';
                        }
                    }
                    
                    // If not startup, use per-kg pricing
                    if (!isStartup) {
                        if (airRouteId && userId) {
                            const customTariffRes = await client.query(`
                                SELECT price_per_kg FROM air_client_tariffs 
                                WHERE user_id = $1 AND route_id = $2 AND tariff_type = $3 AND is_active = true
                                LIMIT 1
                            `, [userId, airRouteId, tariffType]);
                            
                            if (customTariffRes.rows.length > 0) {
                                pricePerKg = parseFloat(customTariffRes.rows[0].price_per_kg);
                                isCustomTariff = true;
                            }
                        }
                        
                        if (pricePerKg === 0 && airRouteId) {
                            const generalTariffRes = await client.query(`
                                SELECT price_per_kg FROM air_tariffs 
                                WHERE route_id = $1 AND tariff_type = $2 AND is_active = true
                                LIMIT 1
                            `, [airRouteId, tariffType]);
                            
                            if (generalTariffRes.rows.length > 0) {
                                pricePerKg = parseFloat(generalTariffRes.rows[0].price_per_kg);
                            }
                        }
                        salePrice = weight * pricePerKg;
                    }
                    
                    console.log(`   📦 ${childNo}: ${tariffType} | ${weight}kg ${isStartup ? `STARTUP $${salePrice.toFixed(2)}` : `× $${pricePerKg}/kg = $${salePrice.toFixed(2)}`} (${isCustomTariff ? 'CUSTOM' : 'GENERAL'})`);
                    
                    await client.query(`
                        INSERT INTO packages 
                        (tracking_internal, child_no, china_receipt_id, user_id, box_id,
                         weight, dimensions, long_cm, width_cm, height_cm,
                         description, pro_name, customs_bno, trajectory_name,
                         single_volume, single_cbm, international_tracking,
                         etd, eta, service_type, warehouse_location, status,
                         air_route_id, air_tariff_type, air_price_per_kg, air_sale_price, air_is_custom_tariff, air_price_assigned_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW())
                    `, [
                        trackingInternal,       // $1
                        childNo,                // $2
                        receiptId,              // $3
                        userId,                 // $4
                        payload.shippingMark || null, // $5 box_id
                        item.weight || 0,       // $6
                        dimensions,             // $7
                        item.long || 0,         // $8
                        item.width || 0,        // $9
                        item.height || 0,       // $10
                        item.proName || 'Sin descripción', // $11
                        item.proName,           // $12
                        item.customsBno,        // $13
                        item.trajecotryName,    // $14
                        item.singleVolume || 0, // $15
                        item.singleCbm || 0,    // $16
                        item.billNo || null,    // $17
                        item.etd || null,       // $18
                        item.eta || null,       // $19
                        'AIR_CHN_MX',           // $20
                        'china_air',            // $21
                        'received_china',       // $22
                        airRouteId,             // $23
                        tariffType,             // $24
                        pricePerKg,             // $25
                        salePrice,              // $26
                        isCustomTariff          // $27
                    ]);
                    packagesCreated++;
                }
            }
        }
        
        // === ACTUALIZAR SALDO EN CHINA_RECEIPTS ===
        // Calcular el total de air_sale_price de los paquetes asociados
        const totalSaleRes = await client.query(`
            SELECT COALESCE(SUM(air_sale_price), 0) as total_sale
            FROM packages 
            WHERE china_receipt_id = $1 AND air_sale_price IS NOT NULL
        `, [receiptId]);
        const totalSale = parseFloat(totalSaleRes.rows[0].total_sale) || 0;
        
        // Actualizar con el total de precios o estimar con peso
        if (totalSale > 0) {
            await client.query(`
                UPDATE china_receipts 
                SET assigned_cost_mxn = $1, saldo_pendiente = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [totalSale, receiptId]);
            console.log(`   💰 Saldo asignado: $${totalSale.toFixed(2)} USD`);
        } else if (payload.totalWeight > 0) {
            const estimatedCost = payload.totalWeight * 21;
            await client.query(`
                UPDATE china_receipts 
                SET assigned_cost_mxn = $1, saldo_pendiente = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND assigned_cost_mxn IS NULL
            `, [estimatedCost, receiptId]);
            console.log(`   💰 Saldo estimado: $${estimatedCost.toFixed(2)} USD`);
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
