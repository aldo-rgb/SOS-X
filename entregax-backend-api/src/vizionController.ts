// ============================================
// TRADLINX API - RASTREO DE CONTENEDORES EN TIEMPO REAL
// Integración con Tradlinx Ocean Visibility API
// ============================================

import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from './db';

// Configuración Tradlinx API (se lee dinámicamente)
const TRADLINX_SANDBOX_URL = 'https://sandbox.api.tradlinx.com/v1'; // POC/Sandbox
const TRADLINX_PROD_URL = 'https://api.tradlinx.com/v1'; // Producción

// Funciones para obtener config dinámicamente (después de dotenv)
const getApiKey = () => process.env.TRADLINX_API_KEY;
const getClientId = () => process.env.TRADLINX_CLIENT_ID || 'entregax';
const useSandbox = () => process.env.TRADLINX_USE_SANDBOX === 'true';
const getApiUrl = () => useSandbox() ? TRADLINX_SANDBOX_URL : (process.env.TRADLINX_API_URL || TRADLINX_PROD_URL);

// Códigos SCAC de las navieras más comunes
export const CARRIER_CODES: Record<string, string> = {
    'WAN HAI': 'WHLC',
    'WANHAI': 'WHLC',
    'MAERSK': 'MAEU',
    'MSC': 'MSCU',
    'COSCO': 'COSU',
    'EVERGREEN': 'EGLV',
    'CMA CGM': 'CMDU',
    'HAPAG-LLOYD': 'HLCU',
    'ONE': 'ONEY',
    'YANG MING': 'YMLU',
    'HMM': 'HDMU',
    'ZIM': 'ZIMU',
    'PIL': 'PCIU'
};

/**
 * Detectar código SCAC de naviera por nombre
 */
export const getCarrierCode = (carrierName: string): string => {
    const upperName = (carrierName || '').toUpperCase();
    
    for (const [name, code] of Object.entries(CARRIER_CODES)) {
        if (upperName.includes(name)) {
            return code;
        }
    }
    
    // Default a Wan Hai si no se detecta
    return 'WHLC';
};

/**
 * Suscribir un contenedor a Tradlinx para tracking en tiempo real
 * Se envía master_bl_number o container_number junto con carrier_code
 */
export const subscribeToTradlinx = async (
    containerNumber: string, 
    carrierCode: string = 'WHLC',
    blNumber?: string
): Promise<{ success: boolean; referenceId?: string; error?: string }> => {
    const apiKey = getApiKey();
    
    if (!apiKey) {
        console.log('⚠️ TRADLINX_API_KEY no configurada - tracking simulado');
        return { success: true, referenceId: `SIM-${containerNumber}` };
    }

    try {
        const apiUrl = getApiUrl();
        const isSandbox = useSandbox();
        console.log(`🔗 Conectando a Tradlinx (${isSandbox ? 'SANDBOX' : 'PRODUCTION'})`);
        console.log(`   URL: ${apiUrl}`);
        
        const response = await axios.post(
            `${apiUrl}/shipments/subscribe`,
            {
                // Tradlinx acepta master_bl_number o container_number
                master_bl_number: blNumber || null,
                container_number: containerNumber,
                carrier_code: carrierCode,
                // Webhook para recibir actualizaciones
                callback_url: process.env.TRADLINX_WEBHOOK_URL || `${process.env.API_BASE_URL}/api/webhooks/tradlinx`
            },
            {
                headers: { 
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'X-Client-Id': getClientId()
                }
            }
        );

        const referenceId = response.data?.subscription_id || response.data?.reference_id || response.data?.id;
        
        console.log(`✅ Contenedor ${containerNumber} suscrito a Tradlinx API`);
        console.log(`   Reference ID: ${referenceId}`);
        console.log(`   BL: ${blNumber || 'N/A'}`);
        
        return { success: true, referenceId };

    } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
        console.error(`❌ Error conectando a Tradlinx:`, errorMsg);
        return { success: false, error: errorMsg };
    }
};

// Alias para compatibilidad con código existente
export const subscribeToVizion = subscribeToTradlinx;

/**
 * Cancelar suscripción de un contenedor en Tradlinx
 */
export const unsubscribeFromTradlinx = async (referenceId: string): Promise<boolean> => {
    const apiKey = getApiKey();
    if (!apiKey || referenceId.startsWith('SIM-')) {
        return true;
    }

    try {
        const apiUrl = getApiUrl();
        await axios.delete(
            `${apiUrl}/shipments/unsubscribe/${referenceId}`,
            {
                headers: { 
                    'Authorization': `Bearer ${apiKey}`,
                    'X-Client-Id': getClientId()
                }
            }
        );
        console.log(`✅ Suscripción ${referenceId} cancelada en Tradlinx`);
        return true;
    } catch (error: any) {
        console.error(`❌ Error cancelando suscripción:`, error.message);
        return false;
    }
};

// Alias para compatibilidad
export const unsubscribeFromVizion = unsubscribeFromTradlinx;

/**
 * Obtener estado actual de un contenedor desde Tradlinx
 */
export const getTradlinxStatus = async (referenceId: string): Promise<any> => {
    const apiKey = getApiKey();
    if (!apiKey || referenceId.startsWith('SIM-')) {
        return null;
    }

    try {
        const apiUrl = getApiUrl();
        const response = await axios.get(
            `${apiUrl}/shipments/${referenceId}/status`,
            {
                headers: { 
                    'Authorization': `Bearer ${apiKey}`,
                    'X-Client-Id': getClientId()
                }
            }
        );
        return response.data;
    } catch (error: any) {
        console.error(`❌ Error obteniendo estado de Tradlinx:`, error.message);
        return null;
    }
};

// Alias para compatibilidad
export const getVizionStatus = getTradlinxStatus;

// ============================================
// WEBHOOK - Recibir actualizaciones de Tradlinx
// ============================================

/**
 * Mapeo de eventos de Tradlinx a estados del sistema
 * Eventos clave según integración Tradlinx:
 * - ETA Update: Actualización de fecha estimada de arribo
 * - Discharge: Descarga del barco al puerto
 * - Gate-out: Salida del contenedor del puerto (detona rastreo foráneo)
 * - Empty Return: Retorno de contenedor vacío (cierra Logística Inversa)
 */
const MILESTONE_MAP: Record<string, { status: string; message: string; icon: string; triggerAction?: string }> = {
    // Eventos de Carga
    'LF': { status: 'loaded', message: 'Contenedor cargado en puerto origen', icon: '📦' },
    'LOADED': { status: 'loaded', message: 'Contenedor cargado en puerto origen', icon: '📦' },
    'GI': { status: 'gate_in', message: 'Contenedor ingresó a terminal portuaria', icon: '🚪' },
    'GATE_IN': { status: 'gate_in', message: 'Contenedor ingresó a terminal portuaria', icon: '🚪' },
    
    // Eventos de Navegación
    'VD': { status: 'in_transit', message: 'Tu contenedor ha zarpado de puerto origen', icon: '🚢' },
    'VESSEL_DEPARTURE': { status: 'in_transit', message: 'Tu contenedor ha zarpado de puerto origen', icon: '🚢' },
    'VA': { status: 'arrived_port', message: 'El barco ha arribado al puerto de destino', icon: '⚓' },
    'VESSEL_ARRIVAL': { status: 'arrived_port', message: 'El barco ha arribado al puerto de destino', icon: '⚓' },
    
    // 🎯 EVENTO CLAVE: Actualización ETA Predictiva
    'ETA_UPDATE': { status: 'eta_updated', message: 'ETA actualizada por Tradlinx', icon: '📅' },
    
    // 🎯 EVENTO CLAVE: Descarga (Discharge) - Contenedor baja del barco
    'DS': { status: 'discharged', message: 'Contenedor descargado del barco. En espera de aduana', icon: '🏗️' },
    'DISCHARGE': { status: 'discharged', message: 'Contenedor descargado del barco. En espera de aduana', icon: '🏗️' },
    'DISCHARGED': { status: 'discharged', message: 'Contenedor descargado del barco. En espera de aduana', icon: '🏗️' },
    
    // Eventos de Aduana
    'CR': { status: 'customs_cleared', message: '¡Aduana superada! Tu contenedor ha sido liberado', icon: '✅' },
    'CUSTOMS_RELEASED': { status: 'customs_cleared', message: '¡Aduana superada! Tu contenedor ha sido liberado', icon: '✅' },
    'AV': { status: 'available', message: 'Contenedor disponible para retiro', icon: '📋' },
    'AVAILABLE': { status: 'available', message: 'Contenedor disponible para retiro', icon: '📋' },
    
    // 🎯 EVENTO CLAVE: Gate-Out - Detona inicio de rastreo foráneo
    'GO': { status: 'gate_out', message: 'Contenedor salió del puerto hacia bodega', icon: '🚛', triggerAction: 'START_FOREIGN_TRACKING' },
    'GATE_OUT': { status: 'gate_out', message: 'Contenedor salió del puerto hacia bodega', icon: '🚛', triggerAction: 'START_FOREIGN_TRACKING' },
    'GT': { status: 'in_transit_local', message: 'Contenedor en ruta terrestre hacia CEDIS', icon: '🚛' },
    
    // Eventos de Entrega
    'DV': { status: 'delivered', message: '¡Tu contenedor ha sido entregado!', icon: '🎉' },
    'DELIVERED': { status: 'delivered', message: '¡Tu contenedor ha sido entregado!', icon: '🎉' },
    
    // 🎯 EVENTO CLAVE: Empty Return - Cierra Módulo de Logística Inversa
    'ER': { status: 'empty_return', message: 'Contenedor vacío devuelto a naviera', icon: '↩️', triggerAction: 'CLOSE_REVERSE_LOGISTICS' },
    'EMPTY_RETURN': { status: 'empty_return', message: 'Contenedor vacío devuelto a naviera', icon: '↩️', triggerAction: 'CLOSE_REVERSE_LOGISTICS' }
};

/**
 * POST /api/webhooks/tradlinx
 * Webhook para recibir actualizaciones de Tradlinx Ocean Visibility
 * Eventos clave: ETA Update, Discharge, Gate-out, Empty Return
 */
export const handleTradlinxWebhook = async (req: Request, res: Response): Promise<any> => {
    try {
        const payload = req.body;
        
        console.log('📡 Webhook Tradlinx recibido:', JSON.stringify(payload, null, 2));

        // Tradlinx envía la información del evento
        const containerNumber = payload.container_number || payload.reference_number;
        const blNumber = payload.master_bl_number || payload.bl_number;
        const milestone = payload.event_type || payload.milestone || payload.event_code;
        const eventDate = payload.event_timestamp || payload.time_actual || new Date().toISOString();
        const location = payload.location?.name || payload.port_name || payload.location || '';
        const vessel = payload.vessel?.name || payload.vessel_name || '';
        const voyage = payload.vessel?.voyage || payload.voyage_number || '';
        
        // Datos adicionales de Tradlinx
        const predictedEta = payload.predicted_eta || payload.eta;
        const carrierCode = payload.carrier_code;

        if (!containerNumber && !blNumber) {
            console.log('⚠️ Webhook sin container_number ni bl_number, ignorando');
            return res.status(200).send('OK - No container/bl number');
        }

        // Buscar el contenedor en nuestra base de datos (por container o BL)
        const containerResult = await pool.query(
            `SELECT c.id, c.status, c.eta, ms.id as shipment_id 
             FROM containers c
             LEFT JOIN maritime_shipments ms ON ms.container_id = c.id
             WHERE c.container_number = $1 OR c.bl_number = $2`,
            [containerNumber, blNumber]
        );

        if (containerResult.rows.length === 0) {
            console.log(`⚠️ Contenedor ${containerNumber || blNumber} no encontrado en BD`);
            return res.status(200).send('OK - Container not found');
        }
        
        // Log para evento ETA si viene actualización predictiva
        if (predictedEta) {
            console.log(`📅 ETA Predictiva de Tradlinx: ${predictedEta}`);
        }

        const container = containerResult.rows[0];
        const milestoneInfo = MILESTONE_MAP[milestone];

        // Guardar el evento en el log de tracking
        await pool.query(`
            INSERT INTO container_tracking_logs 
            (container_id, event_code, event_description, event_date, location, vessel_name, voyage_number, raw_payload)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            container.id,
            milestone,
            milestoneInfo?.message || `Evento: ${milestone}`,
            eventDate,
            location,
            vessel,
            voyage,
            JSON.stringify(payload)
        ]);

        // Si hay un cambio de estatus importante, actualizar el contenedor
        if (milestoneInfo) {
            // Actualizar ETA si viene en el payload
            const etaUpdate = predictedEta ? `, eta = '${predictedEta}'` : '';
            
            await pool.query(
                `UPDATE containers 
                 SET status = $1, 
                     last_tracking_event = $2,
                     last_tracking_date = $3,
                     last_tracking_location = $4${etaUpdate ? ', eta = $6' : ''},
                     updated_at = NOW() 
                 WHERE id = $5`,
                predictedEta 
                    ? [milestoneInfo.status, milestoneInfo.message, eventDate, location, container.id, predictedEta]
                    : [milestoneInfo.status, milestoneInfo.message, eventDate, location, container.id]
            );

            console.log(`✅ Contenedor ${containerNumber} actualizado: ${milestoneInfo.status}`);
            
            // 🎯 Ejecutar acciones automáticas según el evento
            if (milestoneInfo.triggerAction) {
                await handleTradlinxTriggerAction(milestoneInfo.triggerAction, container.id, containerNumber);
            }

            // Buscar usuarios asociados a este contenedor para notificarles
            const usersResult = await pool.query(`
                SELECT DISTINCT u.id, u.full_name, u.expo_push_token
                FROM users u
                JOIN maritime_orders mo ON mo.user_id = u.id
                WHERE mo.container_id = $1 AND u.expo_push_token IS NOT NULL
            `, [container.id]);

            // Enviar notificaciones push a los clientes
            for (const user of usersResult.rows) {
                try {
                    await pool.query(`
                        INSERT INTO notifications (user_id, title, message, type, icon, data)
                        VALUES ($1, $2, $3, 'tracking', 'ship', $4)
                    `, [
                        user.id,
                        `${milestoneInfo.icon} Actualización de Embarque`,
                        milestoneInfo.message,
                        JSON.stringify({ containerNumber, milestone, location })
                    ]);

                    // Si tiene Expo push token, enviar notificación push
                    if (user.expo_push_token) {
                        await sendExpoPushNotification(
                            user.expo_push_token,
                            `${milestoneInfo.icon} Actualización de Embarque`,
                            milestoneInfo.message
                        );
                    }
                } catch (notifError) {
                    console.error(`Error enviando notificación a usuario ${user.id}:`, notifError);
                }
            }
        }

        res.status(200).send('Webhook Tradlinx procesado correctamente');

    } catch (error: any) {
        console.error("❌ Error en Webhook Tradlinx:", error);
        res.status(500).send('Error interno');
    }
};

// Alias para compatibilidad con rutas existentes
export const handleVizionWebhook = handleTradlinxWebhook;

/**
 * 🎯 Manejar acciones automáticas según eventos de Tradlinx
 * - START_FOREIGN_TRACKING: Cuando sale del puerto (Gate-Out), inicia rastreo foráneo
 * - CLOSE_REVERSE_LOGISTICS: Cuando se devuelve vacío (Empty Return), cierra logística inversa
 */
const handleTradlinxTriggerAction = async (action: string, containerId: number, containerNumber: string) => {
    console.log(`🎯 Ejecutando acción automática: ${action} para contenedor ${containerNumber}`);
    
    try {
        switch (action) {
            case 'START_FOREIGN_TRACKING':
                // Gate-Out: Contenedor salió del puerto, iniciar rastreo terrestre foráneo
                console.log(`🚛 Gate-Out detectado: Iniciando rastreo foráneo para ${containerNumber}`);
                await pool.query(`
                    UPDATE containers 
                    SET foreign_tracking_started = true, 
                        foreign_tracking_start_date = NOW(),
                        status = 'in_transit_foreign'
                    WHERE id = $1
                `, [containerId]);
                
                // Crear registro en tracking_foraneo si existe la tabla
                try {
                    await pool.query(`
                        INSERT INTO foreign_tracking_logs (container_id, event_type, event_date, notes)
                        VALUES ($1, 'STARTED', NOW(), 'Iniciado automáticamente por evento Gate-Out de Tradlinx')
                        ON CONFLICT DO NOTHING
                    `, [containerId]);
                } catch (e) {
                    // La tabla puede no existir aún
                }
                break;
                
            case 'CLOSE_REVERSE_LOGISTICS':
                // Empty Return: Contenedor vacío devuelto, cerrar módulo de logística inversa
                console.log(`↩️ Empty Return detectado: Cerrando logística inversa para ${containerNumber}`);
                await pool.query(`
                    UPDATE containers 
                    SET reverse_logistics_closed = true, 
                        reverse_logistics_close_date = NOW(),
                        empty_return_date = NOW(),
                        status = 'completed'
                    WHERE id = $1
                `, [containerId]);
                
                // Actualizar el shipment si existe
                await pool.query(`
                    UPDATE maritime_shipments 
                    SET status = 'completed', 
                        completed_at = NOW()
                    WHERE container_id = $1
                `, [containerId]);
                break;
                
            default:
                console.log(`⚠️ Acción desconocida: ${action}`);
        }
    } catch (error: any) {
        console.error(`❌ Error ejecutando acción ${action}:`, error.message);
    }
};

/**
 * Enviar notificación push via Expo
 */
const sendExpoPushNotification = async (pushToken: string, title: string, body: string) => {
    try {
        await axios.post('https://exp.host/--/api/v2/push/send', {
            to: pushToken,
            title,
            body,
            sound: 'default',
            badge: 1
        });
    } catch (error) {
        console.error('Error enviando push:', error);
    }
};

// ============================================
// ENDPOINTS API
// ============================================

/**
 * POST /api/admin/vizion/subscribe (o /api/admin/tradlinx/subscribe)
 * Suscribir manualmente un contenedor a Tradlinx Ocean Visibility
 * Parámetros de entrada:
 * - containerNumber (o container_number): Número del contenedor (ej. WHSU8015030)
 * - blNumber (o master_bl_number): Número de BL
 * - carrierCode (o carrier_code): Código SCAC de la naviera
 */
export const subscribeContainer = async (req: Request, res: Response): Promise<any> => {
    try {
        const { containerId, containerNumber, carrierCode, blNumber } = req.body;

        if (!containerNumber && !blNumber) {
            return res.status(400).json({ success: false, error: 'containerNumber o blNumber requerido' });
        }

        const carrier = carrierCode || 'WHLC';
        const result = await subscribeToTradlinx(containerNumber, carrier, blNumber);

        if (result.success) {
            // Guardar el reference ID en la base de datos
            if (containerId) {
                await pool.query(
                    `UPDATE containers 
                     SET tradlinx_reference_id = $1, 
                         tradlinx_subscribed_at = NOW(),
                         vizion_reference_id = $1,
                         vizion_subscribed_at = NOW()
                     WHERE id = $2`,
                    [result.referenceId, containerId]
                );
            }

            res.json({ 
                success: true, 
                message: `Contenedor ${containerNumber || blNumber} suscrito a Tradlinx Ocean Visibility`,
                referenceId: result.referenceId,
                provider: 'tradlinx'
            });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }

    } catch (error: any) {
        console.error('Error suscribiendo contenedor:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/admin/containers/:id/tracking
 * Obtener historial de tracking de un contenedor
 */
export const getContainerTracking = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        // Obtener info del contenedor
        const containerResult = await pool.query(`
            SELECT c.*, r.name as route_name, r.code as route_code
            FROM containers c
            LEFT JOIN maritime_routes r ON c.route_id = r.id
            WHERE c.id = $1
        `, [id]);

        if (containerResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Contenedor no encontrado' });
        }

        // Obtener historial de tracking
        const trackingResult = await pool.query(`
            SELECT * FROM container_tracking_logs
            WHERE container_id = $1
            ORDER BY event_date DESC
        `, [id]);

        res.json({
            success: true,
            container: containerResult.rows[0],
            tracking: trackingResult.rows
        });

    } catch (error: any) {
        console.error('Error obteniendo tracking:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/admin/containers/:id/tracking/sync-carrier
 * Sincronizar tracking directamente desde la naviera (Wan Hai, etc.)
 */
export const syncCarrierTracking = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        // Obtener info del contenedor
        const containerResult = await pool.query(`
            SELECT container_number, bl_number FROM containers WHERE id = $1
        `, [id]);

        if (containerResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Contenedor no encontrado' });
        }

        const { container_number, bl_number } = containerResult.rows[0];

        if (!bl_number) {
            return res.status(400).json({ success: false, error: 'El contenedor no tiene número de BL' });
        }

        console.log(`🔄 Sincronizando tracking para BL: ${bl_number}`);

        // Detectar naviera por prefijo del contenedor
        let trackingEvents: any[] = [];
        
        if (container_number?.startsWith('WHSU') || container_number?.startsWith('WHLC')) {
            // Wan Hai - Usar su API de tracking
            trackingEvents = await fetchWanHaiTracking(bl_number);
        } else {
            // Para otras navieras, intentar con Wan Hai como default (ruta China-México)
            trackingEvents = await fetchWanHaiTracking(bl_number);
        }

        if (trackingEvents.length === 0) {
            return res.json({ 
                success: false, 
                message: 'No se pudieron obtener eventos de la naviera. Usa el botón "Abrir Tracking Naviera" para ver el tracking en la web oficial y registra los eventos manualmente.',
                events: []
            });
        }

        // Limpiar eventos anteriores que no sean manuales (para evitar duplicados)
        await pool.query(`
            DELETE FROM container_tracking_logs 
            WHERE container_id = $1 AND (is_manual = false OR is_manual IS NULL)
        `, [id]);

        // Insertar nuevos eventos
        for (const event of trackingEvents) {
            await pool.query(`
                INSERT INTO container_tracking_logs 
                (container_id, event_code, event_description, event_date, location, vessel_name, voyage_number, is_manual)
                VALUES ($1, $2, $3, $4, $5, $6, $7, false)
            `, [
                id,
                event.code || 'CARRIER',
                event.description,
                event.date,
                event.location || '',
                event.vessel || null,
                event.voyage || null
            ]);
        }

        // Actualizar último evento en el contenedor
        const lastEvent = trackingEvents[0]; // El más reciente
        await pool.query(`
            UPDATE containers 
            SET last_tracking_event = $1, last_tracking_date = $2, last_tracking_location = $3, updated_at = NOW()
            WHERE id = $4
        `, [lastEvent.description, lastEvent.date, lastEvent.location || '', id]);

        console.log(`✅ Sincronizados ${trackingEvents.length} eventos de tracking`);

        res.json({ 
            success: true, 
            message: `Se sincronizaron ${trackingEvents.length} eventos de tracking`,
            events: trackingEvents
        });

    } catch (error: any) {
        console.error('Error sincronizando tracking:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Obtener tracking de Wan Hai Lines
 */
async function fetchWanHaiTracking(blNumber: string): Promise<any[]> {
    try {
        console.log(`🔍 Consultando tracking Wan Hai para BL: ${blNumber}`);
        
        // Wan Hai tiene un servicio JSON que podemos usar
        // Primera opción: API de tracking
        try {
            const apiResponse = await axios.post(
                'https://www.wanhai.com/ws/VoyageTrackWS/getCargoTracking',
                {
                    bno: blNumber,
                    bnoType: 'BL',
                    lang: 'EN'
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Origin': 'https://www.wanhai.com',
                        'Referer': 'https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml'
                    },
                    timeout: 15000
                }
            );

            if (apiResponse.data && apiResponse.data.eventList) {
                return apiResponse.data.eventList.map((event: any) => ({
                    code: event.eventCode || 'WH',
                    description: event.eventDescription || event.status || 'Evento',
                    date: event.eventDate ? new Date(event.eventDate) : new Date(),
                    location: event.location || event.port || '',
                    vessel: event.vesselName || null,
                    voyage: event.voyageNumber || null
                }));
            }
        } catch (apiError: any) {
            console.log('⚠️ API de Wan Hai no disponible, intentando alternativa...');
        }

        // Segunda opción: Servicio alternativo de tracking
        try {
            const trackResponse = await axios.get(
                `https://www.wanhai.com/views/cargoTrack/ajax/getCntrTrackInfo.xhtml`,
                {
                    params: {
                        bno: blNumber,
                        searchType: 'BL'
                    },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': '*/*',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    timeout: 15000
                }
            );

            if (trackResponse.data && Array.isArray(trackResponse.data)) {
                return trackResponse.data.map((event: any) => ({
                    code: event.eventCd || 'WH',
                    description: event.eventDesc || event.statusDesc || 'Evento',
                    date: event.eventDt ? new Date(event.eventDt) : new Date(),
                    location: event.locNm || event.portNm || '',
                    vessel: event.vslNm || null,
                    voyage: event.voyNo || null
                }));
            }
        } catch (altError: any) {
            console.log('⚠️ Servicio alternativo no disponible');
        }

        // Tercera opción: Scraping básico de la página
        const response = await axios.get(
            `https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml`,
            {
                params: { bno: blNumber },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                timeout: 15000
            }
        );

        const html = response.data;
        const events: any[] = [];
        
        // Buscar datos JSON embebidos en variables JavaScript
        const dataPatterns = [
            /var\s+trackingData\s*=\s*(\[[\s\S]*?\]);/,
            /var\s+eventList\s*=\s*(\[[\s\S]*?\]);/,
            /trackingEvents\s*:\s*(\[[\s\S]*?\])/,
            /"events"\s*:\s*(\[[\s\S]*?\])/
        ];

        for (const pattern of dataPatterns) {
            const match = html.match(pattern);
            if (match) {
                try {
                    const data = JSON.parse(match[1]);
                    if (Array.isArray(data) && data.length > 0) {
                        return data.map((item: any) => ({
                            code: item.eventCode || item.code || 'WH',
                            description: item.eventDescription || item.description || item.status,
                            date: new Date(item.eventDate || item.date || Date.now()),
                            location: item.location || item.port || '',
                            vessel: item.vesselName || item.vessel,
                            voyage: item.voyageNumber || item.voyage
                        }));
                    }
                } catch (e) {
                    // Continuar con el siguiente patrón
                }
            }
        }

        // Si llegamos aquí, no pudimos extraer datos automáticamente
        console.log('⚠️ No se pudieron extraer eventos automáticamente de Wan Hai');
        console.log('💡 El usuario puede usar el botón "Abrir Tracking Naviera" para ver el tracking directo');
        
        return events;

    } catch (error: any) {
        console.error('Error consultando Wan Hai:', error.message);
        return [];
    }
}

/**
 * POST /api/admin/containers/:id/tracking/tradlinx
 * Obtener tracking de Tradlinx API y guardarlo en historial
 * Este es el endpoint que se llama al hacer clic en "Ver Tracking Tradlinx"
 */
export const fetchTradlinxTracking = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const apiKey = getApiKey();
        
        // Obtener info del contenedor
        const containerResult = await pool.query(`
            SELECT container_number, bl_number, tradlinx_reference_id FROM containers WHERE id = $1
        `, [id]);

        if (containerResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Contenedor no encontrado' });
        }

        const { container_number, bl_number, tradlinx_reference_id } = containerResult.rows[0];
        const searchValue = bl_number || container_number;

        if (!searchValue) {
            return res.status(400).json({ success: false, error: 'El contenedor no tiene número de BL ni contenedor' });
        }

        // Si no hay API key, devolver mensaje informativo
        if (!apiKey) {
            return res.json({ 
                success: false, 
                message: 'API de Tradlinx no configurada. Contacta a Tradlinx para obtener credenciales de API.',
                simulated: true,
                events: []
            });
        }

        console.log(`🔄 Consultando Tradlinx API para: ${searchValue}`);

        const apiUrl = getApiUrl();
        let trackingEvents: any[] = [];

        try {
            // Opción 1: Si ya tenemos reference_id, obtener estado del shipment
            if (tradlinx_reference_id && !tradlinx_reference_id.startsWith('SIM-')) {
                const statusResponse = await axios.get(
                    `${apiUrl}/shipments/${tradlinx_reference_id}`,
                    {
                        headers: { 
                            'Authorization': `Bearer ${apiKey}`,
                            'X-Client-Id': getClientId()
                        },
                        timeout: 15000
                    }
                );

                if (statusResponse.data?.events) {
                    trackingEvents = statusResponse.data.events;
                } else if (statusResponse.data?.milestones) {
                    trackingEvents = statusResponse.data.milestones;
                }
            }

            // Opción 2: Buscar por BL/Container si no tenemos reference o no encontró eventos
            if (trackingEvents.length === 0) {
                const searchResponse = await axios.get(
                    `${apiUrl}/shipments/search`,
                    {
                        params: {
                            query: searchValue,
                            type: bl_number ? 'bl' : 'container'
                        },
                        headers: { 
                            'Authorization': `Bearer ${apiKey}`,
                            'X-Client-Id': getClientId()
                        },
                        timeout: 15000
                    }
                );

                if (searchResponse.data?.shipments?.length > 0) {
                    const shipment = searchResponse.data.shipments[0];
                    trackingEvents = shipment.events || shipment.milestones || [];
                    
                    // Guardar el reference_id si lo obtuvimos
                    if (shipment.id || shipment.reference_id) {
                        await pool.query(
                            `UPDATE containers SET tradlinx_reference_id = $1 WHERE id = $2`,
                            [shipment.id || shipment.reference_id, id]
                        );
                    }
                }
            }

            // Opción 3: Endpoint de tracking directo
            if (trackingEvents.length === 0) {
                const trackResponse = await axios.get(
                    `${apiUrl}/tracking`,
                    {
                        params: {
                            bl_number: bl_number || undefined,
                            container_number: container_number || undefined
                        },
                        headers: { 
                            'Authorization': `Bearer ${apiKey}`,
                            'X-Client-Id': getClientId()
                        },
                        timeout: 15000
                    }
                );

                trackingEvents = trackResponse.data?.events || trackResponse.data?.tracking || [];
            }

        } catch (apiError: any) {
            console.error('❌ Error consultando Tradlinx API:', apiError.response?.data || apiError.message);
            
            // Si es error de autenticación o no encontrado
            if (apiError.response?.status === 401) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'API Key de Tradlinx inválida o expirada',
                    message: 'Verifica que TRADLINX_API_KEY esté correctamente configurada'
                });
            }
            
            if (apiError.response?.status === 404) {
                return res.json({ 
                    success: false, 
                    message: `No se encontró tracking para ${searchValue} en Tradlinx. El embarque puede no estar registrado aún.`,
                    events: []
                });
            }

            return res.status(500).json({ 
                success: false, 
                error: apiError.response?.data?.message || apiError.message 
            });
        }

        if (trackingEvents.length === 0) {
            return res.json({ 
                success: false, 
                message: `No se encontraron eventos de tracking para ${searchValue}`,
                events: []
            });
        }

        console.log(`✅ Tradlinx devolvió ${trackingEvents.length} eventos`);

        // Limpiar eventos anteriores de Tradlinx (no manuales)
        await pool.query(`
            DELETE FROM container_tracking_logs 
            WHERE container_id = $1 AND source = 'tradlinx'
        `, [id]);

        // Normalizar e insertar eventos
        const normalizedEvents: any[] = [];
        
        for (const event of trackingEvents) {
            const normalizedEvent = {
                code: event.event_code || event.milestone_code || event.code || 'TLX',
                description: event.event_description || event.description || event.status || 'Evento Tradlinx',
                date: new Date(event.event_timestamp || event.timestamp || event.date || event.actual_time || Date.now()),
                location: event.location?.name || event.port_name || event.location || '',
                vessel: event.vessel?.name || event.vessel_name || null,
                voyage: event.vessel?.voyage || event.voyage_number || null,
                eta: event.predicted_eta || event.eta || null
            };

            normalizedEvents.push(normalizedEvent);

            await pool.query(`
                INSERT INTO container_tracking_logs 
                (container_id, event_code, event_description, event_date, location, vessel_name, voyage_number, source)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'tradlinx')
            `, [
                id,
                normalizedEvent.code,
                normalizedEvent.description,
                normalizedEvent.date,
                normalizedEvent.location,
                normalizedEvent.vessel,
                normalizedEvent.voyage
            ]);
        }

        // Actualizar último evento en el contenedor
        const lastEvent = normalizedEvents.sort((a, b) => b.date.getTime() - a.date.getTime())[0];
        
        // Buscar ETA en los eventos
        const etaEvent = trackingEvents.find((e: any) => e.predicted_eta || e.eta);
        const newEta = etaEvent?.predicted_eta || etaEvent?.eta || null;
        
        await pool.query(`
            UPDATE containers 
            SET last_tracking_event = $1, 
                last_tracking_date = $2, 
                last_tracking_location = $3,
                ${newEta ? 'eta = $5,' : ''}
                updated_at = NOW()
            WHERE id = $4
        `, newEta 
            ? [lastEvent.description, lastEvent.date, lastEvent.location, id, newEta]
            : [lastEvent.description, lastEvent.date, lastEvent.location, id]
        );

        console.log(`✅ Guardados ${normalizedEvents.length} eventos de Tradlinx en historial`);

        res.json({ 
            success: true, 
            message: `Se obtuvieron ${normalizedEvents.length} eventos de Tradlinx`,
            events: normalizedEvents,
            source: 'tradlinx'
        });

    } catch (error: any) {
        console.error('Error obteniendo tracking de Tradlinx:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/admin/containers/:id/tracking/manual
 * Agregar evento de tracking manualmente
 */
export const addManualTrackingEvent = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { eventCode, eventDescription, eventDate, location } = req.body;

        await pool.query(`
            INSERT INTO container_tracking_logs 
            (container_id, event_code, event_description, event_date, location, is_manual)
            VALUES ($1, $2, $3, $4, $5, true)
        `, [id, eventCode || 'MANUAL', eventDescription, eventDate || new Date(), location || '']);

        // Actualizar último evento en el contenedor
        await pool.query(`
            UPDATE containers 
            SET last_tracking_event = $1, last_tracking_date = $2, last_tracking_location = $3, updated_at = NOW()
            WHERE id = $4
        `, [eventDescription, eventDate || new Date(), location || '', id]);

        res.json({ success: true, message: 'Evento de tracking agregado' });

    } catch (error: any) {
        console.error('Error agregando tracking manual:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
