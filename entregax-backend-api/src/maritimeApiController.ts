// ============================================
// CONTROLADOR DE API CHINA - FLUJO MARÍTIMO
// Sincronización automática con sistema Yajie
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import { assignPriceToMaritimeOrder } from './pricingEngine';

// Configuración de la API China
const CHINA_API_BASE = 'https://yajie.uxphp.net/api';
const CHINA_APPID = 'fsRiwR8t0jJSMyKy3hMzYhGhie5amMiH';

// ============================================
// INTERFACES
// ============================================

interface ChinaOrderListResponse {
    status: number;
    msg: string;
    data: ChinaOrderItem[];
}

interface ChinaOrderItem {
    id: number;
    ordersn: string;
    goods_type: string;
    goods_name: string;
    goods_num: number;
    weight: string;
    volume: string;
    shipping_mark: string;
    createtime: string;
}

interface ChinaTrackingResponse {
    status: number;
    msg: string;
    data: ChinaTrackingData[];
}

interface ChinaTrackingData {
    order_info: {
        goods_num: number;
        volume: string;
        weight: string;
        shipping_mark: string;
    };
    expresscom: string;
    expresssn: string;
    log_list: ChinaLogItem[];
}

interface ChinaLogItem {
    id: number;
    detail: string;
    track_date: string;
    status: string;
    detail_en: string;
    ship_number: string;
    image: string;
}

// ============================================
// SINCRONIZACIÓN DE ÓRDENES (Get Order List API)
// ============================================

/**
 * Sincroniza órdenes desde la API china
 * Puede ser llamado manualmente o por el Cron Job
 */
export const syncOrdersFromChina = async (
    startTime?: string,
    endTime?: string,
    isManual: boolean = false
): Promise<{
    success: boolean;
    ordersProcessed: number;
    ordersCreated: number;
    ordersUpdated: number;
    errors: string[];
}> => {
    const syncStartTime = Date.now();
    const errors: string[] = [];
    let ordersProcessed = 0;
    let ordersCreated = 0;
    let ordersUpdated = 0;

    // Si no se proporcionan fechas, usar las últimas 24 horas
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const startime = startTime || formatDateForAPI(yesterday);
    const endtime = endTime || formatDateForAPI(now);

    console.log(`🚢 [API China] Sincronizando órdenes: ${startime} → ${endtime}`);

    // Registrar inicio de sincronización
    const syncLogResult = await pool.query(`
        INSERT INTO api_sync_logs (sync_type, api_endpoint, request_params, started_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id
    `, ['order_list', `${CHINA_API_BASE}/getOrderListApi`, JSON.stringify({ startime, endtime })]);
    const syncLogId = syncLogResult.rows[0].id;

    try {
        // Llamar a la API china
        const url = `${CHINA_API_BASE}/getOrderListApi?appid=${CHINA_APPID}&startime=${encodeURIComponent(startime)}&endtime=${encodeURIComponent(endtime)}`;
        
        console.log(`  📡 Llamando API: ${url}`);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json() as ChinaOrderListResponse;

        if (result.status !== 200) {
            throw new Error(`API Error: ${result.msg}`);
        }

        console.log(`  📦 Recibidas ${result.data.length} órdenes de la API`);

        // Filtrar solo órdenes LOG (excluir LVS y otros prefijos que no nos pertenecen)
        const filteredOrders = result.data.filter(order => 
            order.ordersn && order.ordersn.toUpperCase().startsWith('LOG')
        );
        
        console.log(`  🔍 Filtradas ${filteredOrders.length} órdenes LOG (excluidas ${result.data.length - filteredOrders.length} órdenes LVS/otras)`);

        // Procesar cada orden
        for (const order of filteredOrders) {
            try {
                await processOrder(order);
                ordersProcessed++;
                
                // Verificar si es nueva o actualización
                const existing = await pool.query(
                    'SELECT id FROM maritime_orders WHERE ordersn = $1',
                    [order.ordersn]
                );
                
                if (existing.rows.length === 0) {
                    ordersCreated++;
                } else {
                    ordersUpdated++;
                }
            } catch (orderError: any) {
                errors.push(`Error procesando ${order.ordersn}: ${orderError.message}`);
                console.error(`  ❌ Error en orden ${order.ordersn}:`, orderError.message);
            }
        }

        // Actualizar log de sincronización
        await pool.query(`
            UPDATE api_sync_logs 
            SET response_status = $1, records_processed = $2, records_created = $3, 
                records_updated = $4, finished_at = NOW(), 
                duration_ms = $5, error_message = $6
            WHERE id = $7
        `, [
            200,
            ordersProcessed,
            ordersCreated,
            ordersUpdated,
            Date.now() - syncStartTime,
            errors.length > 0 ? errors.join('; ') : null,
            syncLogId
        ]);

        console.log(`  ✅ Sincronización completada: ${ordersCreated} nuevas, ${ordersUpdated} actualizadas`);

        return { success: true, ordersProcessed, ordersCreated, ordersUpdated, errors };

    } catch (error: any) {
        console.error(`  ❌ Error en sincronización:`, error.message);

        // Actualizar log con error
        await pool.query(`
            UPDATE api_sync_logs 
            SET response_status = 500, error_message = $1, 
                finished_at = NOW(), duration_ms = $2
            WHERE id = $3
        `, [error.message, Date.now() - syncStartTime, syncLogId]);

        return { success: false, ordersProcessed, ordersCreated, ordersUpdated, errors: [error.message] };
    }
};

/**
 * Procesa una orden individual de la API china
 */
const processOrder = async (order: ChinaOrderItem): Promise<void> => {
    // Validación: Solo procesar órdenes LOG (descartar LVS y otros)
    if (!order.ordersn || !order.ordersn.toUpperCase().startsWith('LOG')) {
        console.log(`    ⏭️ Descartando orden ${order.ordersn} (no es LOG)`);
        return;
    }
    
    // Buscar cliente por shipping_mark
    let userId: number | null = null;
    
    // El shipping_mark puede ser "S873" o "S96+EDMUNDO MEDINA" o "Carlos Osorio S1739"
    // Intentamos extraer el código S#### del shipping_mark
    const shippingMark = order.shipping_mark || '';
    const boxIdMatch = shippingMark.match(/S\d+/i);
    const fallback = shippingMark.split('+')[0]?.trim() || '';
    const boxId = (boxIdMatch && boxIdMatch[0]) ? boxIdMatch[0].toUpperCase() : fallback;
    
    // Primero buscar en users
    const userResult = await pool.query(
        `SELECT id, full_name FROM users WHERE UPPER(box_id) = $1 LIMIT 1`,
        [boxId.toUpperCase()]
    );
    
    if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
        console.log(`    → Cliente encontrado (users): ${userResult.rows[0].full_name} (${boxId})`);
    } else {
        // Solo verificar si existe en legacy_clients para logging, pero NO crear usuario
        // El usuario se vinculará automáticamente cuando se registre con su box_id
        const legacyResult = await pool.query(
            `SELECT id, box_id, full_name FROM legacy_clients WHERE UPPER(box_id) = $1 LIMIT 1`,
            [boxId.toUpperCase()]
        );
        
        if (legacyResult.rows.length > 0) {
            console.log(`    → Cliente en legacy_clients: ${legacyResult.rows[0].full_name} (${boxId}) - pendiente de registro`);
        } else {
            console.log(`    → Cliente no registrado: ${shippingMark} (boxId extraído: ${boxId})`);
        }
        // userId permanece null - el shipping_mark guardará la referencia
    }

    // Buscar dirección predeterminada para servicio marítimo
    let defaultAddressId: number | null = null;
    if (userId) {
        const addressResult = await pool.query(
            `SELECT id FROM addresses 
             WHERE user_id = $1 
             AND (default_for_service LIKE '%maritime%' OR default_for_service LIKE '%all%')
             ORDER BY id ASC LIMIT 1`,
            [userId]
        );
        if (addressResult.rows.length > 0) {
            defaultAddressId = addressResult.rows[0].id;
            console.log(`    → Dirección predeterminada encontrada: ID ${defaultAddressId}`);
        }
    }

    // Insertar o actualizar la orden
    await pool.query(`
        INSERT INTO maritime_orders 
        (ordersn, user_id, shipping_mark, goods_type, goods_name, goods_num, 
         weight, volume, api_raw_data, sync_source, synced_at,
         delivery_address_id, instructions_assigned_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'api', NOW(), $10, $11)
        ON CONFLICT (ordersn) DO UPDATE SET
            goods_type = EXCLUDED.goods_type,
            goods_name = EXCLUDED.goods_name,
            goods_num = EXCLUDED.goods_num,
            weight = EXCLUDED.weight,
            volume = EXCLUDED.volume,
            api_raw_data = EXCLUDED.api_raw_data,
            synced_at = NOW(),
            updated_at = NOW(),
            -- Solo actualizar dirección si no tiene una asignada manualmente
            delivery_address_id = COALESCE(maritime_orders.delivery_address_id, EXCLUDED.delivery_address_id),
            instructions_assigned_at = COALESCE(maritime_orders.instructions_assigned_at, EXCLUDED.instructions_assigned_at)
    `, [
        order.ordersn,
        userId,
        order.shipping_mark,
        order.goods_type,
        order.goods_name,
        order.goods_num,
        parseFloat(order.weight) || 0,
        parseFloat(order.volume) || 0,
        JSON.stringify(order),
        defaultAddressId,
        defaultAddressId ? new Date() : null
    ]);

    // Si encontramos el cliente y la orden es nueva, notificarlo
    if (userId) {
        const existing = await pool.query(
            'SELECT id FROM maritime_orders WHERE ordersn = $1 AND created_at < NOW() - INTERVAL \'1 minute\'',
            [order.ordersn]
        );
        
        if (existing.rows.length === 0) {
            // Es una orden nueva, notificar al cliente
            const addressNote = defaultAddressId 
                ? ' Se asignó tu dirección predeterminada automáticamente.'
                : ' Asigna una dirección de entrega desde la app.';
            await pool.query(`
                INSERT INTO notifications (user_id, title, message, type, icon, data)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                userId,
                '📦 Nueva Recepción Marítimo',
                `Tu carga ${order.ordersn} ha sido recibida en bodega China.${addressNote}`,
                'info',
                'ship',
                JSON.stringify({ ordersn: order.ordersn, goods_num: order.goods_num, autoAssignedAddress: !!defaultAddressId })
            ]);
        }
    }
};

// ============================================
// ACTUALIZACIÓN DE TRACKING (Get Logistics Tracking API)
// ============================================

/**
 * Actualiza el tracking de una orden específica
 */
export const updateOrderTracking = async (ordersn: string): Promise<{
    success: boolean;
    logsAdded: number;
    latestStatus?: string;
    error?: string;
}> => {
    console.log(`  🔍 Actualizando tracking para: ${ordersn}`);
    
    try {
        const url = `${CHINA_API_BASE}/getOrderDeliveryApi?appid=${CHINA_APPID}&ordersn=${encodeURIComponent(ordersn)}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json() as ChinaTrackingResponse;

        if (result.status !== 200) {
            throw new Error(`API Error: ${result.msg}`);
        }

        if (!result.data || result.data.length === 0) {
            return { success: true, logsAdded: 0, latestStatus: 'No tracking data' };
        }

        const trackingData = result.data[0];
        if (!trackingData) {
            return { success: true, logsAdded: 0, latestStatus: 'No tracking data' };
        }
        
        let logsAdded = 0;
        let latestStatus = '';
        let latestDetail = '';
        let latestDate: Date | null = null;
        let shipNumber = '';

        // Obtener el ID de la orden
        const orderResult = await pool.query(
            'SELECT id FROM maritime_orders WHERE ordersn = $1',
            [ordersn]
        );
        const orderId = orderResult.rows.length > 0 ? orderResult.rows[0].id : null;

        // Procesar cada log de tracking
        const logList = trackingData.log_list || [];
        for (const log of logList) {
            try {
                // Insertar log (ignorar si ya existe por ordersn + api_log_id)
                await pool.query(`
                    INSERT INTO maritime_tracking_logs 
                    (ordersn, maritime_order_id, api_log_id, detail, detail_en, 
                     track_date, status, ship_number, image_url)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (ordersn, api_log_id) DO NOTHING
                `, [
                    ordersn,
                    orderId,
                    log.id,
                    log.detail,
                    log.detail_en || null,
                    log.track_date,
                    log.status,
                    log.ship_number || null,
                    log.image || null
                ]);
                logsAdded++;

                // Determinar el más reciente
                const logDate = new Date(log.track_date);
                if (!latestDate || logDate > latestDate) {
                    latestDate = logDate;
                    latestStatus = log.status;
                    latestDetail = log.detail;
                }
                // Conservar el último ship_number no vacío (es el nombre del buque/voyage)
                // En estados avanzados (Customs, Import Clearence) viene vacío, pero el
                // log "Vessel On Board"/"Arrival at Destination Port" sí lo trae.
                if (log.ship_number && String(log.ship_number).trim() !== '') {
                    shipNumber = String(log.ship_number).trim();
                }
            } catch (logError: any) {
                console.error(`    ⚠️ Error insertando log ${log.id}:`, logError.message);
            }
        }

        // Actualizar la orden con el último estado
        if (orderId && latestStatus) {
            const mappedStatus = mapTrackingStatusToInternal(latestStatus);
            
            await pool.query(`
                UPDATE maritime_orders 
                SET last_tracking_status = $1,
                    last_tracking_detail = $2,
                    last_tracking_date = $3,
                    ship_number = $4,
                    expresscom = $5,
                    status = $6,
                    updated_at = NOW()
                WHERE id = $7
            `, [
                latestStatus,
                latestDetail,
                latestDate,
                shipNumber || trackingData?.expresscom || null,
                trackingData?.expresscom || null,
                mappedStatus,
                orderId
            ]);

            // Notificar al cliente si hay un cambio significativo de estado
            await notifyTrackingUpdate(orderId, latestStatus, latestDetail);
        }

        return { success: true, logsAdded, latestStatus };

    } catch (error: any) {
        console.error(`  ❌ Error actualizando tracking ${ordersn}:`, error.message);
        return { success: false, logsAdded: 0, error: error.message };
    }
};

/**
 * Sincroniza el tracking de todas las órdenes activas
 */
export const syncAllActiveTrackings = async (): Promise<{
    success: boolean;
    ordersUpdated: number;
    errors: string[];
}> => {
    const syncStartTime = Date.now();
    const errors: string[] = [];
    let ordersUpdated = 0;

    console.log(`🚢 [API China] Sincronizando tracking de órdenes activas...`);

    // Registrar inicio de sincronización
    const syncLogResult = await pool.query(`
        INSERT INTO api_sync_logs (sync_type, api_endpoint, request_params, started_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id
    `, ['tracking_update', `${CHINA_API_BASE}/getOrderDeliveryApi`, JSON.stringify({ type: 'bulk_update' })]);
    const syncLogId = syncLogResult.rows[0].id;

    try {
        // Obtener órdenes activas (no entregadas ni canceladas)
        const activeOrders = await pool.query(`
            SELECT ordersn FROM maritime_orders 
            WHERE status NOT IN ('delivered', 'cancelled', 'returned')
            ORDER BY updated_at ASC
            LIMIT 100
        `);

        console.log(`  📦 ${activeOrders.rows.length} órdenes activas para actualizar`);

        for (const order of activeOrders.rows) {
            const result = await updateOrderTracking(order.ordersn);
            if (result.success) {
                ordersUpdated++;
            } else {
                errors.push(`${order.ordersn}: ${result.error}`);
            }
            
            // Pequeña pausa para no sobrecargar la API
            await sleep(500);
        }

        // Actualizar log de sincronización
        await pool.query(`
            UPDATE api_sync_logs 
            SET response_status = 200, records_processed = $1, records_updated = $2,
                finished_at = NOW(), duration_ms = $3, error_message = $4
            WHERE id = $5
        `, [
            activeOrders.rows.length,
            ordersUpdated,
            Date.now() - syncStartTime,
            errors.length > 0 ? errors.join('; ') : null,
            syncLogId
        ]);

        console.log(`  ✅ Tracking actualizado para ${ordersUpdated}/${activeOrders.rows.length} órdenes`);

        return { success: true, ordersUpdated, errors };

    } catch (error: any) {
        console.error(`  ❌ Error en sincronización de tracking:`, error.message);

        await pool.query(`
            UPDATE api_sync_logs 
            SET response_status = 500, error_message = $1, 
                finished_at = NOW(), duration_ms = $2
            WHERE id = $3
        `, [error.message, Date.now() - syncStartTime, syncLogId]);

        return { success: false, ordersUpdated, errors: [error.message] };
    }
};

// ============================================
// ENDPOINTS HTTP
// ============================================

/**
 * POST /api/maritime/sync/orders
 * Sincronización manual de órdenes
 */
export const manualSyncOrders = async (req: Request, res: Response): Promise<any> => {
    try {
        const { startTime, endTime } = req.body;
        
        const result = await syncOrdersFromChina(startTime, endTime, true);
        
        res.json({
            success: result.success,
            message: result.success ? 'Sincronización completada' : 'Sincronización con errores',
            data: {
                ordersProcessed: result.ordersProcessed,
                ordersCreated: result.ordersCreated,
                ordersUpdated: result.ordersUpdated,
                errors: result.errors
            }
        });

    } catch (error: any) {
        console.error('Error en sincronización manual:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/maritime/sync/tracking
 * Sincronización manual de tracking
 */
export const manualSyncTracking = async (req: Request, res: Response): Promise<any> => {
    try {
        const { ordersn } = req.body;
        
        if (ordersn) {
            // Actualizar tracking de una orden específica
            const result = await updateOrderTracking(ordersn);
            res.json({
                success: result.success,
                data: result
            });
        } else {
            // Actualizar todas las órdenes activas
            const result = await syncAllActiveTrackings();
            res.json({
                success: result.success,
                message: result.success ? 'Tracking actualizado' : 'Actualización con errores',
                data: {
                    ordersUpdated: result.ordersUpdated,
                    errors: result.errors
                }
            });
        }

    } catch (error: any) {
        console.error('Error en sincronización de tracking:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/maritime/orders
 * Listar órdenes marítimas
 */
export const getMaritimeOrders = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status, trackingStatus, unassigned, search, limit = '50', offset = '0' } = req.query;
        const limitNum = parseInt(String(limit)) || 50;
        const offsetNum = parseInt(String(offset)) || 0;
        
        // Extraer box_id del shipping_mark usando expresión regular SQL
        // El shipping_mark puede ser "S873", "S96+EDMUNDO MEDINA", "Carlos Osorio S1739", etc.
        let query = `
            SELECT 
                mo.*,
                (mo.api_raw_data->>'id')::bigint as china_id,
                COALESCE(u.full_name, lc.full_name, 
                    CASE 
                        WHEN UPPER(SUBSTRING(mo.shipping_mark FROM 'S[0-9]+')) IS NOT NULL 
                        THEN UPPER(SUBSTRING(mo.shipping_mark FROM 'S[0-9]+'))
                        ELSE NULL 
                    END
                ) as client_name,
                COALESCE(u.email, lc.email) as client_email,
                COALESCE(u.box_id, lc.box_id, 
                    UPPER(SUBSTRING(mo.shipping_mark FROM 'S[0-9]+'))
                ) as client_box_id,
                CASE 
                    WHEN u.id IS NOT NULL THEN true
                    WHEN lc.id IS NOT NULL THEN false
                    ELSE false
                END as is_registered,
                (SELECT COUNT(*) FROM maritime_tracking_logs WHERE ordersn = mo.ordersn) as tracking_count
            FROM maritime_orders mo
            LEFT JOIN users u ON mo.user_id = u.id
            LEFT JOIN legacy_clients lc ON (
                mo.user_id IS NULL 
                AND UPPER(SUBSTRING(mo.shipping_mark FROM 'S[0-9]+')) = UPPER(lc.box_id)
            )
            WHERE mo.ordersn LIKE 'LOG%'
        `;
        const params: any[] = [];
        
        if (status) {
            params.push(String(status));
            query += ` AND mo.status = $${params.length}`;
        }

        if (trackingStatus) {
            params.push(String(trackingStatus));
            query += ` AND UPPER(COALESCE(mo.last_tracking_status, '')) = UPPER($${params.length})`;
        }
        
        // Sin asignar = no tiene user_id Y no se encontró en legacy_clients
        if (unassigned === 'true') {
            query += ` AND mo.user_id IS NULL AND lc.id IS NULL`;
        }

        // Búsqueda libre: ordersn, shipping_mark, ship_number, bl_number, container_number,
        // goods_name, china_id, nombre/email del cliente
        if (search && String(search).trim() !== '') {
            params.push(`%${String(search).trim()}%`);
            const idx = params.length;
            query += ` AND (
                mo.ordersn ILIKE $${idx}
                OR mo.shipping_mark ILIKE $${idx}
                OR COALESCE(mo.ship_number,'') ILIKE $${idx}
                OR COALESCE(mo.bl_number,'') ILIKE $${idx}
                OR COALESCE(mo.container_number,'') ILIKE $${idx}
                OR COALESCE(mo.goods_name,'') ILIKE $${idx}
                OR COALESCE(mo.last_tracking_status,'') ILIKE $${idx}
                OR COALESCE(u.full_name,'') ILIKE $${idx}
                OR COALESCE(u.email,'') ILIKE $${idx}
                OR COALESCE(lc.full_name,'') ILIKE $${idx}
                OR COALESCE((mo.api_raw_data->>'id'),'') ILIKE $${idx}
            )`;
        }

        query += ` ORDER BY mo.created_at DESC`;
        params.push(limitNum, offsetNum);
        query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

        const result = await pool.query(query, params);

        // Contar totales (solo LOG, excluir LVS)
        // "Sin asignar" = no tiene user_id Y no se encuentra en legacy_clients
        const countResult = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE mo.status = 'received_china') as received_china,
                COUNT(*) FILTER (WHERE mo.status = 'in_transit') as in_transit,
                COUNT(*) FILTER (WHERE mo.status = 'customs_mx') as customs_mx,
                COUNT(*) FILTER (WHERE mo.status = 'delivered') as delivered,
                COUNT(*) FILTER (WHERE mo.user_id IS NULL AND lc.id IS NULL) as unassigned
            FROM maritime_orders mo
            LEFT JOIN legacy_clients lc ON (
                mo.user_id IS NULL 
                AND UPPER(SUBSTRING(mo.shipping_mark FROM 'S[0-9]+')) = UPPER(lc.box_id)
            )
            WHERE mo.ordersn LIKE 'LOG%'
        `);

        res.json({
            success: true,
            orders: result.rows,
            totals: countResult.rows[0]
        });

    } catch (error: any) {
        console.error('Error obteniendo órdenes marítimas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/maritime/orders/:ordersn
 * Detalle de una orden con su tracking
 */
export const getMaritimeOrderDetail = async (req: Request, res: Response): Promise<any> => {
    try {
        const { ordersn } = req.params;

        // Obtener orden
        const orderResult = await pool.query(`
            SELECT 
                mo.*,
                u.full_name as client_name,
                u.email as client_email,
                u.phone as client_phone,
                u.box_id as client_box_id
            FROM maritime_orders mo
            LEFT JOIN users u ON mo.user_id = u.id
            WHERE mo.ordersn = $1
        `, [ordersn]);

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }

        // Obtener tracking logs
        const trackingResult = await pool.query(`
            SELECT * FROM maritime_tracking_logs
            WHERE ordersn = $1
            ORDER BY track_date DESC
        `, [ordersn]);

        res.json({
            success: true,
            order: orderResult.rows[0],
            tracking: trackingResult.rows
        });

    } catch (error: any) {
        console.error('Error obteniendo detalle de orden:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/maritime/orders/:ordersn/refresh
 * Refrescar tracking de una orden específica
 */
export const refreshOrderTracking = async (req: Request, res: Response): Promise<any> => {
    try {
        const ordersn = String(req.params.ordersn || '');
        
        if (!ordersn) {
            return res.status(400).json({ success: false, error: 'ordersn es requerido' });
        }

        const result = await updateOrderTracking(ordersn);

        if (result.success) {
            // Obtener datos actualizados
            const orderResult = await pool.query(`
                SELECT * FROM maritime_orders WHERE ordersn = $1
            `, [ordersn]);

            const trackingResult = await pool.query(`
                SELECT * FROM maritime_tracking_logs
                WHERE ordersn = $1
                ORDER BY track_date DESC
            `, [ordersn]);

            res.json({
                success: true,
                message: `Tracking actualizado: ${result.logsAdded} nuevos registros`,
                order: orderResult.rows[0],
                tracking: trackingResult.rows
            });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }

    } catch (error: any) {
        console.error('Error refrescando tracking:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/maritime/orders/:ordersn/assign
 * Asignar orden a un cliente
 */
export const assignOrderToClient = async (req: Request, res: Response): Promise<any> => {
    try {
        const { ordersn } = req.params;
        const { userId, boxId } = req.body;

        let targetUserId = userId;

        // Si se proporciona boxId, buscar el usuario
        if (boxId && !userId) {
            const userResult = await pool.query(
                'SELECT id FROM users WHERE box_id = $1',
                [boxId]
            );
            if (userResult.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    error: `No se encontró cliente con Box ID: ${boxId}` 
                });
            }
            targetUserId = userResult.rows[0].id;
        }

        if (!targetUserId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere userId o boxId' 
            });
        }

        // Actualizar la orden
        const result = await pool.query(`
            UPDATE maritime_orders 
            SET user_id = $1, updated_at = NOW()
            WHERE ordersn = $2
            RETURNING *
        `, [targetUserId, ordersn]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }

        // Notificar al cliente
        await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, icon, data)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            targetUserId,
            '📦 Carga Asignada',
            `Se te ha asignado la carga ${ordersn}. Sube tu Packing List para continuar.`,
            'info',
            'ship',
            JSON.stringify({ ordersn })
        ]);

        res.json({
            success: true,
            message: 'Orden asignada correctamente',
            order: result.rows[0]
        });

    } catch (error: any) {
        console.error('Error asignando orden:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/maritime/sync/logs
 * Ver historial de sincronizaciones
 */
export const getSyncLogs = async (req: Request, res: Response): Promise<any> => {
    try {
        const { type, limit = '50' } = req.query;
        const limitNum = parseInt(String(limit)) || 50;

        let query = `
            SELECT * FROM api_sync_logs
            WHERE 1=1
        `;
        const params: any[] = [];

        if (type) {
            params.push(String(type));
            query += ` AND sync_type = $${params.length}`;
        }

        params.push(limitNum);
        query += ` ORDER BY started_at DESC LIMIT $${params.length}`;

        const result = await pool.query(query, params);

        res.json({
            success: true,
            logs: result.rows
        });

    } catch (error: any) {
        console.error('Error obteniendo logs de sincronización:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/maritime/stats
 * Estadísticas del módulo marítimo
 */
export const getMaritimeStats = async (req: Request, res: Response): Promise<any> => {
    try {
        // Estadísticas generales
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_orders,
                COUNT(*) FILTER (WHERE status = 'received_china') as in_warehouse,
                COUNT(*) FILTER (WHERE status = 'in_transit') as in_transit,
                COUNT(*) FILTER (WHERE status = 'customs_mx') as in_customs,
                COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
                COUNT(*) FILTER (WHERE user_id IS NULL) as unassigned,
                COUNT(*) FILTER (WHERE needs_packing_list = true AND packing_list_url IS NULL) as pending_packing_list
            FROM maritime_orders
        `);

        // Distribución dinámica por status (para filtros en frontend)
        const byStatusResult = await pool.query(`
            SELECT 
                COALESCE(status, 'unknown') as status,
                COUNT(*)::int as count
            FROM maritime_orders
            GROUP BY COALESCE(status, 'unknown')
            ORDER BY COUNT(*) DESC, status ASC
        `);

        const byTrackingStatusResult = await pool.query(`
            SELECT 
                last_tracking_status as status,
                COUNT(*)::int as count
            FROM maritime_orders
            WHERE last_tracking_status IS NOT NULL
              AND last_tracking_status <> ''
            GROUP BY last_tracking_status
            ORDER BY COUNT(*) DESC, last_tracking_status ASC
        `);

        // Última sincronización
        const lastSyncResult = await pool.query(`
            SELECT sync_type, started_at, finished_at, records_processed, records_created
            FROM api_sync_logs
            ORDER BY started_at DESC
            LIMIT 2
        `);

        // Órdenes recientes
        const recentResult = await pool.query(`
            SELECT ordersn, shipping_mark, status, created_at
            FROM maritime_orders
            ORDER BY created_at DESC
            LIMIT 5
        `);

        res.json({
            success: true,
            stats: {
                ...statsResult.rows[0],
                by_status: byStatusResult.rows,
                by_tracking_status: byTrackingStatusResult.rows
            },
            lastSync: lastSyncResult.rows,
            recentOrders: recentResult.rows
        });

    } catch (error: any) {
        console.error('Error obteniendo estadísticas marítimo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// FUNCIONES AUXILIARES
// ============================================

/**
 * Formatea una fecha para la API china
 */
const formatDateForAPI = (date: Date): string => {
    return date.toISOString().slice(0, 19).replace('T', ' ');
};

/**
 * Pausa la ejecución
 */
const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Mapea el estado de tracking de la API al estado interno
 */
const mapTrackingStatusToInternal = (apiStatus: string): string => {
    const statusMap: { [key: string]: string } = {
        // Variantes reales observadas en la API marítima China
        'SHIPMENT GENERATION': 'received_china',
        'GOODS IN WAREHOUSE': 'received_china',
        'WAREHOUSE RECEIVED': 'received_china',
        'GOODS OUT OF WAREHOUSE': 'in_transit',
        'LOADED INTO CONTAINER': 'in_transit',
        'VESSEL ON BOARD': 'in_transit',
        'DEPARTURE FROM CHINA': 'in_transit',
        'IN TRANSIT': 'in_transit',
        'IN TRANSIT BY MEXICO TRUCK': 'in_transit_mx',
        'ARRIVAL AT DESTINATION PORT': 'customs_mx',
        'CUSTOMS CLEARANCE IN PROCESS': 'customs_mx',
        'ARRIVAL AT CUSTOMS': 'customs_mx',
        'IMPORT CLEARENCE FINISHED': 'customs_cleared',
        'IMPORT CLEARANCE STARTED': 'customs_mx',
        'IMPORT CLEARANCE FINISHED': 'customs_cleared',
        'OUT FOR DELIVERY': 'out_for_delivery',
        'DELIVERED': 'delivered',
        'ARRIVAL AT CNEE\'S ADDRESS': 'delivered'
    };

    // Buscar coincidencia (case-insensitive)
    const upperStatus = apiStatus.toUpperCase();
    for (const [key, value] of Object.entries(statusMap)) {
        if (upperStatus.includes(key)) {
            return value;
        }
    }

    return 'in_transit'; // Default
};

/**
 * Notifica al cliente sobre cambios significativos en el tracking
 */
const notifyTrackingUpdate = async (
    orderId: number,
    status: string,
    detail: string
): Promise<void> => {
    try {
        // Obtener orden y cliente
        const orderResult = await pool.query(`
            SELECT mo.ordersn, mo.user_id, mo.last_tracking_status as prev_status
            FROM maritime_orders mo
            WHERE mo.id = $1
        `, [orderId]);

        if (orderResult.rows.length === 0 || !orderResult.rows[0].user_id) {
            return;
        }

        const order = orderResult.rows[0];
        const prevStatus = order.prev_status || '';

        // Solo notificar si el estado cambió significativamente
        const significantStatuses = [
            'DEPARTURE FROM CHINA',
            'ARRIVAL AT CUSTOMS',
            'IMPORT CLEARANCE FINISHED',
            'OUT FOR DELIVERY',
            'DELIVERED'
        ];

        const upperStatus = status.toUpperCase();
        const shouldNotify = significantStatuses.some(s => 
            upperStatus.includes(s) && !prevStatus.toUpperCase().includes(s)
        );

        if (shouldNotify) {
            await pool.query(`
                INSERT INTO notifications (user_id, title, message, type, icon, data)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                order.user_id,
                '🚢 Actualización de Envío',
                `Tu carga ${order.ordersn}: ${detail}`,
                'info',
                'ship',
                JSON.stringify({ ordersn: order.ordersn, status })
            ]);
        }
    } catch (error) {
        console.error('Error notificando actualización de tracking:', error);
    }
};

// ============================================
// CONSOLIDACIONES MARÍTIMAS
// ============================================

/**
 * GET /api/maritime-api/orders/consolidations
 * Obtener órdenes marítimas con datos de consolidación (contenedor, ruta, etc)
 */
export const getConsolidationOrders = async (req: Request, res: Response): Promise<any> => {
    try {
        const { containerId, merchandiseType, hasPackingList, search } = req.query;

        let query = `
            SELECT
                mo.*,
                -- Bultos / peso / volumen "efectivos": prefieren el SUMMARY
                -- (subido manualmente al recibir la mercancía) por encima del
                -- valor del API de China cuando el SUMMARY tiene un número
                -- mayor. Antes el API a veces traía goods_num=1 aunque el BL
                -- amparara docenas de cajas; el SUMMARY es la fuente real.
                GREATEST(COALESCE(mo.summary_boxes, 0), COALESCE(mo.goods_num, 0)) AS effective_boxes,
                GREATEST(COALESCE(mo.summary_weight, 0), COALESCE(mo.weight, 0)) AS effective_weight,
                GREATEST(COALESCE(mo.summary_volume, 0), COALESCE(mo.volume, 0)) AS effective_volume,
                u.full_name as client_name,
                u.email as client_email,
                u.box_id as client_box_id,
                mr.name as route_name,
                mr.code as route_code,
                c.container_number,
                c.bl_number as container_bl_number
            FROM maritime_orders mo
            LEFT JOIN users u ON mo.user_id = u.id
            LEFT JOIN maritime_routes mr ON mo.route_id = mr.id
            LEFT JOIN containers c ON mo.container_id = c.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (containerId && containerId !== 'all') {
            if (containerId === 'unassigned') {
                query += ` AND mo.container_id IS NULL`;
            } else {
                params.push(parseInt(String(containerId)));
                query += ` AND mo.container_id = $${params.length}`;
            }
        }

        if (merchandiseType && merchandiseType !== 'all') {
            params.push(String(merchandiseType));
            query += ` AND mo.merchandise_type = $${params.length}`;
        }

        if (hasPackingList === 'with') {
            query += ` AND mo.packing_list_url IS NOT NULL`;
        } else if (hasPackingList === 'without') {
            query += ` AND mo.packing_list_url IS NULL`;
        }

        if (search) {
            params.push(`%${String(search)}%`);
            query += ` AND (mo.ordersn ILIKE $${params.length} OR mo.shipping_mark ILIKE $${params.length})`;
        }

        query += ` ORDER BY mo.created_at DESC`;

        const result = await pool.query(query, params);

        res.json({
            success: true,
            orders: result.rows
        });

    } catch (error: any) {
        console.error('Error obteniendo órdenes de consolidación:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/maritime-api/consolidations/stats
 * Estadísticas de consolidaciones
 */
export const getConsolidationStats = async (req: Request, res: Response): Promise<any> => {
    try {
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_orders,
                COUNT(*) FILTER (WHERE container_id IS NOT NULL) as assigned_to_container,
                COUNT(*) FILTER (WHERE container_id IS NULL) as pending_assignment,
                COUNT(*) FILTER (WHERE packing_list_url IS NOT NULL) as with_packing_list
            FROM maritime_orders
        `);

        const byTypeResult = await pool.query(`
            SELECT merchandise_type as type, COUNT(*) as count
            FROM maritime_orders
            GROUP BY merchandise_type
        `);

        res.json({
            success: true,
            stats: {
                ...statsResult.rows[0],
                by_merchandise_type: byTypeResult.rows
            }
        });

    } catch (error: any) {
        console.error('Error obteniendo estadísticas de consolidación:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * PUT /api/maritime-api/orders/:ordersn/consolidation
 * Actualizar asignación de consolidación (contenedor, ruta, tipo, BL, características)
 */
export const updateOrderConsolidation = async (req: Request, res: Response): Promise<any> => {
    try {
        const { ordersn } = req.params;
        const { containerId, routeId, merchandiseType, blNumber, notes, hasBattery, hasLiquid, isPickup } = req.body;

        // Verificar que la orden existe
        const orderCheck = await pool.query(
            'SELECT id FROM maritime_orders WHERE ordersn = $1',
            [ordersn]
        );

        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }

        // Actualizar la orden
        const result = await pool.query(`
            UPDATE maritime_orders 
            SET container_id = $1,
                route_id = $2,
                merchandise_type = $3,
                bl_number = $4,
                consolidation_notes = $5,
                has_battery = $6,
                has_liquid = $7,
                is_pickup = $8,
                updated_at = NOW()
            WHERE ordersn = $9
            RETURNING *
        `, [
            containerId || null,
            routeId || null,
            merchandiseType || 'generic',
            blNumber || null,
            notes || null,
            hasBattery || false,
            hasLiquid || false,
            isPickup || false,
            ordersn
        ]);

        const updatedOrder = result.rows[0];

        // Auto-asignar precio si se asignó a un contenedor
        let priceResult = null;
        if (containerId && updatedOrder.id) {
            try {
                const adminUserId = (req as any).user?.id || (req as any).user?.userId || 0;
                priceResult = await assignPriceToMaritimeOrder(updatedOrder.id, adminUserId);
            } catch (priceError: any) {
                console.error(`⚠️ Error auto-pricing orden ${ordersn}:`, priceError.message);
                // No fallar la consolidación si falla el pricing
            }
        }

        res.json({
            success: true,
            message: 'Consolidación actualizada correctamente',
            order: updatedOrder,
            pricing: priceResult
        });

    } catch (error: any) {
        console.error('Error actualizando consolidación:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * PUT /api/maritime-api/orders/:ordersn/mark-client
 * Actualizar MARK y CLIENTE de una orden
 */
export const updateMarkClient = async (req: Request, res: Response): Promise<any> => {
    try {
        const { ordersn } = req.params;
        const { shipping_mark, bl_client_code, bl_client_name } = req.body;

        const result = await pool.query(`
            UPDATE maritime_orders 
            SET shipping_mark = COALESCE($1, shipping_mark),
                bl_client_code = $2,
                bl_client_name = $3,
                updated_at = NOW()
            WHERE ordersn = $4
            RETURNING *
        `, [shipping_mark, bl_client_code, bl_client_name, ordersn]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }

        console.log(`✅ MARK/Cliente actualizado: ${ordersn} → MARK=${shipping_mark}, Cliente=${bl_client_name}(${bl_client_code})`);

        res.json({
            success: true,
            message: 'MARK y Cliente actualizados correctamente',
            order: result.rows[0]
        });

    } catch (error: any) {
        console.error('Error actualizando MARK/Cliente:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/maritime-api/orders/:ordersn/packing-list
 * Subir packing list para una orden
 */
export const uploadPackingList = async (req: Request, res: Response): Promise<any> => {
    try {
        const { ordersn } = req.params;
        
        // Por ahora guardamos la URL directa - en producción usar S3/Cloudinary
        // El archivo vendría en req.file si usamos multer
        const { packingListUrl, packingListType } = req.body;

        if (!packingListUrl) {
            return res.status(400).json({ success: false, error: 'Se requiere la URL del packing list' });
        }

        const result = await pool.query(`
            UPDATE maritime_orders 
            SET packing_list_url = $1,
                packing_list_type = $2,
                needs_packing_list = false,
                updated_at = NOW()
            WHERE ordersn = $3
            RETURNING *
        `, [packingListUrl, packingListType || 'pdf', ordersn]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }

        res.json({
            success: true,
            message: 'Packing list subido correctamente',
            order: result.rows[0]
        });

    } catch (error: any) {
        console.error('Error subiendo packing list:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// RUTAS MARÍTIMAS
// ============================================

/**
 * GET /api/maritime-api/routes
 * Obtener todas las rutas marítimas
 */
export const getMaritimeRoutes = async (req: Request, res: Response): Promise<any> => {
    try {
        // Obtener precio base FCL
        const basePriceResult = await pool.query(`
            SELECT t.price 
            FROM pricing_tiers t
            JOIN pricing_categories c ON t.category_id = c.id
            WHERE c.name = 'FCL 40 Pies' AND t.is_active = true
            LIMIT 1
        `);
        const basePrice = parseFloat(basePriceResult.rows[0]?.price || '27000.00');

        const result = await pool.query(`
            SELECT *, 
              COALESCE(fcl_price_usd, ${basePrice}) as effective_fcl_price
            FROM maritime_routes
            ORDER BY name ASC
        `);

        res.json({
            success: true,
            routes: result.rows,
            basePrice
        });

    } catch (error: any) {
        console.error('Error obteniendo rutas marítimas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/maritime-api/routes
 * Crear nueva ruta marítima
 */
export const createMaritimeRoute = async (req: Request, res: Response): Promise<any> => {
    try {
        const { name, code, origin, waypoints, destination, estimatedDays, email, fclPriceUsd } = req.body;

        if (!name || !code) {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere nombre y código de ruta' 
            });
        }

        // Verificar que no existe el código
        const existing = await pool.query(
            'SELECT id FROM maritime_routes WHERE code = $1',
            [code]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: `Ya existe una ruta con el código ${code}` 
            });
        }

        const result = await pool.query(`
            INSERT INTO maritime_routes 
            (name, code, origin, waypoints, destination, estimated_days, is_active, email, fcl_price_usd)
            VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
            RETURNING *
        `, [
            name,
            code.toUpperCase(),
            origin || 'Shenzhen',
            waypoints || [],
            destination || 'México',
            estimatedDays || 45,
            email || null,
            fclPriceUsd || null
        ]);

        res.json({
            success: true,
            message: 'Ruta creada correctamente',
            route: result.rows[0]
        });

    } catch (error: any) {
        console.error('Error creando ruta marítima:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * PUT /api/maritime-api/routes/:id
 * Actualizar ruta marítima
 */
export const updateMaritimeRoute = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { name, code, origin, waypoints, destination, estimatedDays, isActive, email, fclPriceUsd } = req.body;

        const result = await pool.query(`
            UPDATE maritime_routes 
            SET name = COALESCE($1, name),
                code = COALESCE($2, code),
                origin = COALESCE($3, origin),
                waypoints = COALESCE($4, waypoints),
                destination = COALESCE($5, destination),
                estimated_days = COALESCE($6, estimated_days),
                is_active = COALESCE($7, is_active),
                email = COALESCE($8, email),
                fcl_price_usd = $9,
                updated_at = NOW()
            WHERE id = $10
            RETURNING *
        `, [name, code, origin, waypoints, destination, estimatedDays, isActive, email, fclPriceUsd, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ruta no encontrada' });
        }

        res.json({
            success: true,
            message: 'Ruta actualizada correctamente',
            route: result.rows[0]
        });

    } catch (error: any) {
        console.error('Error actualizando ruta marítima:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * DELETE /api/maritime-api/routes/:id
 * Eliminar ruta marítima
 */
export const deleteMaritimeRoute = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        // Verificar si hay órdenes asignadas a esta ruta
        const ordersUsingRoute = await pool.query(
            'SELECT COUNT(*) as count FROM maritime_orders WHERE route_id = $1',
            [id]
        );

        if (parseInt(ordersUsingRoute.rows[0].count) > 0) {
            return res.status(400).json({
                success: false,
                error: `No se puede eliminar: hay ${ordersUsingRoute.rows[0].count} órdenes asignadas a esta ruta`
            });
        }

        const result = await pool.query(
            'DELETE FROM maritime_routes WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Ruta no encontrada' });
        }

        res.json({
            success: true,
            message: 'Ruta eliminada correctamente'
        });

    } catch (error: any) {
        console.error('Error eliminando ruta marítima:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// INSTRUCCIONES DE ENTREGA - CLIENTE
// ============================================

/**
 * Actualiza las instrucciones de entrega de una orden marítima
 * Endpoint para uso del cliente desde la app móvil
 */
export const updateDeliveryInstructions = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // ID de la orden marítima
        const { deliveryAddressId, deliveryInstructions, carrier, carrierCost, carrierName } = req.body;
        const userId = (req as any).user.userId; // CORREGIDO: usar userId del token

        console.log(`🚢 [Instrucciones Entrega] Usuario ${userId} actualizando orden ${id} - carrier=${carrier} cost=${carrierCost}`);

        // Obtener el box_id del usuario actual
        const userResult = await pool.query(`SELECT box_id FROM users WHERE id = $1`, [userId]);
        const userBoxId = userResult.rows[0]?.box_id;

        // Verificar que la orden existe y pertenece al usuario (por user_id O por shipping_mark/box_id)
        const orderCheck = await pool.query(`
            SELECT mo.id, mo.ordersn, mo.user_id, mo.status, mo.shipping_mark, mo.bl_client_code
            FROM maritime_orders mo
            WHERE mo.id = $1
        `, [id]);

        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Orden marítima no encontrada' 
            });
        }

        const order = orderCheck.rows[0];

        // Verificar que pertenece al usuario por múltiples criterios:
        // 1. user_id coincide directamente
        // 2. shipping_mark contiene el box_id del usuario (ej: "S1" o "S1+NOMBRE")
        // 3. bl_client_code coincide con el box_id
        const shippingMarkBoxId = order.shipping_mark?.split('+')[0]?.trim().toUpperCase();
        const isOwner = 
            order.user_id === userId || 
            (userBoxId && shippingMarkBoxId === userBoxId.toUpperCase()) ||
            (userBoxId && order.bl_client_code?.toUpperCase() === userBoxId.toUpperCase());

        if (!isOwner) {
            console.log(`⚠️ Permiso denegado: user_id=${userId}, boxId=${userBoxId}, order.user_id=${order.user_id}, shipping_mark=${order.shipping_mark}, bl_client_code=${order.bl_client_code}`);
            return res.status(403).json({ 
                success: false, 
                error: 'No tienes permiso para modificar esta orden' 
            });
        }

        // Si la orden no tenía user_id, asignarlo ahora
        if (!order.user_id) {
            await pool.query(`UPDATE maritime_orders SET user_id = $1 WHERE id = $2`, [userId, id]);
            console.log(`✅ Asignado user_id=${userId} a orden ${order.ordersn}`);
        }

        // Verificar que la dirección existe y pertenece al usuario
        if (deliveryAddressId) {
            const addressCheck = await pool.query(`
                SELECT id FROM addresses 
                WHERE id = $1 AND user_id = $2
            `, [deliveryAddressId, userId]);

            if (addressCheck.rows.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Dirección no válida' 
                });
            }
        }

        // Calcular costo estimado si hay dirección asignada
        let estimatedCost = null;
        if (deliveryAddressId) {
            const volumeResult = await pool.query(`
                SELECT COALESCE(volume, 0) as volume, COALESCE(weight, 0) as weight
                FROM maritime_orders WHERE id = $1
            `, [id]);

            if (volumeResult.rows.length > 0) {
                const { volume, weight } = volumeResult.rows[0];
                
                // Obtener tarifa activa
                const rateResult = await pool.query(`
                    SELECT cost_per_cbm, min_cbm, min_charge
                    FROM maritime_rates 
                    WHERE is_active = true
                    ORDER BY created_at DESC LIMIT 1
                `);

                if (rateResult.rows.length > 0) {
                    const rate = rateResult.rows[0];
                    const effectiveVolume = Math.max(parseFloat(volume), parseFloat(rate.min_cbm));
                    estimatedCost = effectiveVolume * parseFloat(rate.cost_per_cbm);
                    estimatedCost = Math.max(estimatedCost, parseFloat(rate.min_charge));
                }
            }
        }

        // Actualizar la orden
        const shippingCostNum = carrierCost != null ? parseFloat(carrierCost) || 0 : null;
        const updateResult = await pool.query(`
            UPDATE maritime_orders
            SET 
                delivery_address_id = $1,
                delivery_instructions = $2,
                estimated_cost = $3,
                national_carrier = COALESCE($4, national_carrier),
                national_shipping_cost = COALESCE($5, national_shipping_cost),
                instructions_assigned_at = NOW(),
                updated_at = NOW()
            WHERE id = $6
            RETURNING *
        `, [deliveryAddressId, deliveryInstructions || null, estimatedCost, carrier || null, shippingCostNum, id]);

        console.log(`✅ [Instrucciones Entrega] Orden ${order.ordersn} actualizada`);

        res.json({
            success: true,
            message: 'Instrucciones de entrega guardadas correctamente',
            order: updateResult.rows[0],
            estimatedCost
        });

    } catch (error: any) {
        console.error('Error actualizando instrucciones de entrega:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Obtiene los detalles de una orden marítima para el cliente
 * Incluye ETA del contenedor y costo estimado
 */
export const getMyMaritimeOrderDetail = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.userId;

        // Obtener box_id del usuario para fallback por shipping_mark / bl_client_code
        const userResult = await pool.query(`SELECT box_id FROM users WHERE id = $1`, [userId]);
        const userBoxId: string | null = userResult.rows[0]?.box_id || null;
        const upperBox = userBoxId ? userBoxId.toUpperCase() : null;

        const fetchOrder = async () => pool.query(`
            SELECT 
                mo.*,
                a.alias as delivery_address_alias,
                a.street as delivery_street,
                a.city as delivery_city,
                a.state as delivery_state,
                c.container_number as container_name,
                c.eta as container_eta
            FROM maritime_orders mo
            LEFT JOIN addresses a ON mo.delivery_address_id = a.id
            LEFT JOIN containers c ON mo.container_id = c.id
            WHERE mo.id = $1
              AND (
                mo.user_id = $2
                OR ($3::text IS NOT NULL AND UPPER(SPLIT_PART(COALESCE(mo.shipping_mark, ''), '+', 1)) = $3::text)
                OR ($3::text IS NOT NULL AND UPPER(COALESCE(mo.bl_client_code, '')) = $3::text)
              )
        `, [id, userId, upperBox]);

        let result = await fetchOrder();

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Orden no encontrada' 
            });
        }

        // 💰 Si la orden ya tiene contenedor asignado pero aún no tiene
        // costo calculado, intentamos calcularlo automáticamente para que el
        // cliente vea el desglose en el detalle.
        const ord = result.rows[0];
        const hasAssignedCost = ord.assigned_cost_mxn != null && parseFloat(ord.assigned_cost_mxn) > 0;
        if (!hasAssignedCost && ord.container_id) {
            try {
                const priceRes = await assignPriceToMaritimeOrder(Number(id), userId);
                if (priceRes) {
                    result = await fetchOrder();
                }
            } catch (e: any) {
                console.warn(`No se pudo calcular precio on-demand para orden ${id}:`, e?.message);
            }
        }

        // 📏 Normalizar peso/volumen efectivos:
        //   - Prefiere summary_* cuando exista (totales consolidados desde BL)
        //   - Si solo hay `weight` por pieza (China API a veces lo trae por caja),
        //     multiplica por goods_num cuando weight × goods_num es más coherente
        //     con el volumen (más de 30 kg/m³ es lo normal).
        const finalOrder: any = { ...result.rows[0] };
        const numGoods = Number(finalOrder.goods_num || finalOrder.summary_boxes || 0);
        const rawWeight = Number(finalOrder.weight || 0);
        const rawVolume = Number(finalOrder.volume || 0);
        const summaryWeight = finalOrder.summary_weight != null ? Number(finalOrder.summary_weight) : null;
        const summaryVolume = finalOrder.summary_volume != null ? Number(finalOrder.summary_volume) : null;

        let effectiveWeight = summaryWeight && summaryWeight > 0 ? summaryWeight : rawWeight;
        const effectiveVolume = summaryVolume && summaryVolume > 0 ? summaryVolume : rawVolume;

        // Si el peso parece ser "por caja" (weight × goods_num da una densidad
        // razonable >= 30 kg/m³), interpretarlo como total
        if ((!summaryWeight || summaryWeight <= 0) && numGoods > 1 && rawWeight > 0 && effectiveVolume > 0) {
            const asTotal = rawWeight;
            const asPerPiece = rawWeight * numGoods;
            const densityTotal = asTotal / effectiveVolume;
            const densityPerPiece = asPerPiece / effectiveVolume;
            // Heurística: si tratar como total da densidad implausible (< 5 kg/m³),
            // y multiplicar por cajas da algo razonable (5..800 kg/m³),
            // asumir que weight era por caja y usar el total.
            if (densityTotal < 5 && densityPerPiece >= 5 && densityPerPiece <= 800) {
                effectiveWeight = asPerPiece;
            }
        }

        finalOrder.weight = effectiveWeight;
        finalOrder.volume = effectiveVolume;
        finalOrder.summary_weight = effectiveWeight;
        finalOrder.summary_volume = effectiveVolume;

        // 🏷️ Para órdenes YA COTIZADAS: derivar categoría aplicada y tarifa USD/m³
        // mediante reverse-lookup en pricing_tiers (fuente de verdad).
        const assignedUsd = finalOrder.assigned_cost_usd != null ? parseFloat(finalOrder.assigned_cost_usd) : 0;
        if (assignedUsd > 0) {
            // CBM cobrable (factor marítimo: kg ÷ 600)
            const volumetricCbm = effectiveWeight / 600;
            let chargeableCbm = Math.max(effectiveVolume, volumetricCbm);
            if (chargeableCbm >= 0.76 && chargeableCbm < 1) chargeableCbm = 1;

            // Tarifa real = costo USD / CBM cobrable
            const ratePerCbm = chargeableCbm > 0 ? assignedUsd / chargeableCbm : 0;

            // Reverse-lookup: encontrar categoría cuyo tier matchee (precio, rango cbm)
            let appliedCategory = 'Generico';
            let isFlatFee = false;
            try {
                const tierMatch = await pool.query(
                    `SELECT pc.name, pt.is_flat_fee
                     FROM pricing_tiers pt
                     JOIN pricing_categories pc ON pt.category_id = pc.id
                     WHERE pt.is_active = TRUE
                       AND $1 >= pt.min_cbm AND $1 <= pt.max_cbm
                       AND ABS(pt.price - $2) < 1
                     LIMIT 1`,
                    [chargeableCbm, ratePerCbm]
                );
                if (tierMatch.rows.length > 0) {
                    appliedCategory = tierMatch.rows[0].name;
                    isFlatFee = !!tierMatch.rows[0].is_flat_fee;
                } else {
                    // Fallback: brand_type / merchandise_type
                    const brand = String(finalOrder.brand_type || '').toLowerCase();
                    const merch = String(finalOrder.merchandise_type || '').toLowerCase();
                    if (brand === 'logo' || merch === 'branded' || merch === 'logo') appliedCategory = 'Logotipo';
                    else if (brand === 'sensitive' || merch === 'sensitive') appliedCategory = 'Sensible';
                    else if (merch === 'startup') appliedCategory = 'StartUp';
                    else if (merch === 'fcl') appliedCategory = 'FCL';
                }
            } catch (e: any) {
                console.warn('No se pudo hacer reverse-lookup de tier:', e?.message);
            }

            finalOrder.applied_category = appliedCategory;
            finalOrder.applied_chargeable_cbm = parseFloat(chargeableCbm.toFixed(4));
            finalOrder.applied_rate_per_cbm_usd = parseFloat(ratePerCbm.toFixed(2));
            finalOrder.applied_is_flat_fee = isFlatFee;

            // 💱 TC vigente del sistema: si la orden NO está pagada todavía,
            // mostrar el TC actual (exchange_rate_config) y recalcular MXN para
            // que el cliente vea el TC correcto en lugar de uno frozen viejo.
            const isPaid = String(finalOrder.payment_status || '') === 'paid';
            const isPartiallyPaid = parseFloat(finalOrder.monto_pagado || 0) > 0;
            if (!isPaid && !isPartiallyPaid) {
                try {
                    const fxCfgRes = await pool.query(
                        `SELECT tipo_cambio_final FROM exchange_rate_config
                         WHERE servicio = 'maritimo' AND estado = true LIMIT 1`
                    );
                    if (fxCfgRes.rows.length > 0) {
                        const currentFx = parseFloat(fxCfgRes.rows[0].tipo_cambio_final);
                        if (currentFx > 0) {
                            const newMxn = assignedUsd * currentFx;
                            finalOrder.assigned_cost_mxn = parseFloat(newMxn.toFixed(2));
                            finalOrder.saldo_pendiente = parseFloat(newMxn.toFixed(2));
                            finalOrder.registered_exchange_rate = parseFloat(currentFx.toFixed(4));
                        }
                    }
                } catch (e: any) {
                    console.warn('No se pudo refrescar TC vigente:', e?.message);
                }
            }
        }

        // 💵 Cálculo de costo estimado para órdenes sin contenedor asignado
        // (cuando todavía no se sabe la ruta/contenedor, mostramos un estimado
        // usando la tarifa LCL Genérico para que el cliente sepa el costo aprox).
        //
        // ⚠️ REGLA: el costo estimado SOLO se calcula cuando la mercancía ya
        // fue recibida/clasificada. Mientras la orden esté en estado previo a
        // recepción, NO devolvemos costo (porque el precio depende de la
        // clasificación: Genérico/Logotipo/Sensible/StartUp).
        const classifiedStatuses = [
            'received_china', 'received', 'in_transit',
            'customs_mx', 'customs', 'consolidated', 'at_port', 'delivered'
        ];
        // Para estar realmente "clasificada" la orden necesita:
        //  1) Status >= received_china
        //  2) Resumen de recepción registrado (summary_weight/volume/boxes)
        //     porque ahí es cuando staff confirma tipo/peso/volumen/cajas.
        // Si el status es received_china pero NO hay summary_*, la mercancía
        // físicamente llegó pero aún no se inspeccionó/clasificó.
        const statusOk = classifiedStatuses.includes(String(finalOrder.status || ''));
        const hasReceptionSummary = (
            finalOrder.summary_weight != null && parseFloat(finalOrder.summary_weight) > 0
        ) || (
            finalOrder.summary_volume != null && parseFloat(finalOrder.summary_volume) > 0
        ) || (
            finalOrder.summary_boxes != null && parseInt(finalOrder.summary_boxes) > 0
        );
        const isClassified = statusOk && hasReceptionSummary;
        const stillNoCost = (finalOrder.assigned_cost_mxn == null || parseFloat(finalOrder.assigned_cost_mxn) <= 0);

        if (stillNoCost && !isClassified) {
            // Marcar como pendiente de clasificación para que el frontend
            // muestre el mensaje correcto y NO un costo provisional.
            finalOrder.pending_classification = true;
        }

        if (stillNoCost && isClassified && effectiveVolume > 0) {
            try {
                // Tipo de cambio: preferir exchange_rate_config (servicio='maritimo')
                // que es el TC que muestra la web admin/cliente. Fallback a
                // exchange_rates si no existe la config.
                let fxRate = 18.00;
                try {
                    const fxCfgRes = await pool.query(
                        `SELECT tipo_cambio_final FROM exchange_rate_config
                         WHERE servicio = 'maritimo' AND estado = true LIMIT 1`
                    );
                    if (fxCfgRes.rows.length > 0) {
                        fxRate = parseFloat(fxCfgRes.rows[0].tipo_cambio_final) || 18.00;
                    } else {
                        const fxRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
                        fxRate = parseFloat(fxRes.rows[0]?.rate || '18.00');
                    }
                } catch {
                    const fxRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
                    fxRate = parseFloat(fxRes.rows[0]?.rate || '18.00');
                }

                // CBM cobrable (factor marítimo: kg ÷ 600)
                const volumetricCbm = effectiveWeight / 600;
                let chargeableCbm = Math.max(effectiveVolume, volumetricCbm);

                // Reglas StartUp / redondeo
                let categoryName = 'Generico';
                if (chargeableCbm <= 0.75) {
                    categoryName = 'StartUp';
                } else if (chargeableCbm >= 0.76 && chargeableCbm < 1) {
                    chargeableCbm = 1;
                }

                const catRes = await pool.query(
                    'SELECT id FROM pricing_categories WHERE name = $1',
                    [categoryName]
                );

                if (catRes.rows.length > 0) {
                    const categoryId = catRes.rows[0].id;
                    const tierRes = await pool.query(
                        `SELECT price, is_flat_fee FROM pricing_tiers
                         WHERE category_id = $1 AND is_active = TRUE
                           AND $2 >= min_cbm AND $2 <= max_cbm
                         LIMIT 1`,
                        [categoryId, chargeableCbm]
                    );
                    if (tierRes.rows.length > 0) {
                        const tier = tierRes.rows[0];
                        const ratePerCbm = parseFloat(tier.price);
                        // Tarifas en pricing_tiers están en USD/CBM
                        const estimatedUsd = tier.is_flat_fee ? ratePerCbm : chargeableCbm * ratePerCbm;
                        const estimatedMxn = estimatedUsd * fxRate;
                        finalOrder.estimated_cost = parseFloat(estimatedMxn.toFixed(2));
                        finalOrder.estimated_cost_usd = parseFloat(estimatedUsd.toFixed(2));
                        finalOrder.estimated_fx_rate = parseFloat(fxRate.toFixed(4));
                        finalOrder.estimated_category = categoryName;
                        finalOrder.estimated_chargeable_cbm = parseFloat(chargeableCbm.toFixed(4));
                        finalOrder.estimated_rate_per_cbm_usd = parseFloat(ratePerCbm.toFixed(2));
                        finalOrder.estimated_is_flat_fee = !!tier.is_flat_fee;
                    }
                }
            } catch (e: any) {
                console.warn(`No se pudo calcular costo estimado para orden ${id}:`, e?.message);
            }
        }

        res.json({
            success: true,
            order: finalOrder
        });

    } catch (error: any) {
        console.error('Error obteniendo detalle de orden:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// ASIGNACIÓN MASIVA DE PRECIOS
// Para órdenes que ya tienen contenedor pero no tienen precio
// ============================================
export const bulkAssignPricing = async (req: Request, res: Response): Promise<any> => {
    try {
        const adminUserId = (req as any).user?.userId || 'system';
        const { containerId } = req.query; // Opcional: solo un contenedor específico

        // Buscar órdenes que tienen contenedor pero no tienen precio asignado
        let query = `
            SELECT id, ordersn, container_id, summary_volume, summary_boxes
            FROM maritime_orders 
            WHERE container_id IS NOT NULL 
              AND (assigned_cost_usd IS NULL OR assigned_cost_usd = 0)
        `;
        const params: any[] = [];
        
        if (containerId) {
            query += ` AND container_id = $1`;
            params.push(containerId);
        }
        
        query += ` ORDER BY id`;
        
        const ordersResult = await pool.query(query, params);
        
        if (ordersResult.rows.length === 0) {
            return res.json({
                success: true,
                message: 'No hay órdenes pendientes de asignación de precio',
                processed: 0,
                results: []
            });
        }

        console.log(`[BULK PRICING] Procesando ${ordersResult.rows.length} órdenes sin precio...`);

        const results: any[] = [];
        let successCount = 0;
        let errorCount = 0;

        for (const order of ordersResult.rows) {
            try {
                const priceResult = await assignPriceToMaritimeOrder(order.id, adminUserId);
                if (priceResult) {
                    results.push({
                        orderId: order.id,
                        ordersn: order.ordersn,
                        success: true,
                        costUsd: priceResult.assigned_cost_usd,
                        costMxn: priceResult.assigned_cost_mxn,
                        category: priceResult.applied_category,
                        rate: priceResult.applied_rate,
                        cbm: priceResult.chargeable_cbm,
                        breakdown: priceResult.breakdown
                    });
                    successCount++;
                } else {
                    results.push({
                        orderId: order.id,
                        ordersn: order.ordersn,
                        success: false,
                        error: 'Precio ya asignado o sin datos suficientes'
                    });
                    errorCount++;
                }
            } catch (err: any) {
                results.push({
                    orderId: order.id,
                    ordersn: order.ordersn,
                    success: false,
                    error: err.message
                });
                errorCount++;
            }
        }

        console.log(`[BULK PRICING] Completado: ${successCount} exitosos, ${errorCount} errores de ${ordersResult.rows.length} total`);

        res.json({
            success: true,
            processed: ordersResult.rows.length,
            successCount,
            errorCount,
            results
        });

    } catch (error: any) {
        console.error('Error en asignación masiva de precios:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export default {
    syncOrdersFromChina,
    updateOrderTracking,
    syncAllActiveTrackings,
    manualSyncOrders,
    manualSyncTracking,
    getMaritimeOrders,
    getMaritimeOrderDetail,
    refreshOrderTracking,
    assignOrderToClient,
    getSyncLogs,
    getMaritimeStats,
    // Consolidaciones
    getConsolidationOrders,
    getConsolidationStats,
    updateOrderConsolidation,
    uploadPackingList,
    updateMarkClient,
    // Rutas
    getMaritimeRoutes,
    createMaritimeRoute,
    updateMaritimeRoute,
    deleteMaritimeRoute,
    // Instrucciones de entrega (cliente)
    updateDeliveryInstructions,
    getMyMaritimeOrderDetail,
    // Asignación masiva de precios
    bulkAssignPricing
};
