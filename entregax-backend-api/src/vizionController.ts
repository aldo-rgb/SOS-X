// ============================================
// VIZION API - RASTREO DE CONTENEDORES EN TIEMPO REAL
// Integración con Vizion API para tracking satelital
// ============================================

import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from './db';

const VIZION_API_KEY = process.env.VIZION_API_KEY;
const VIZION_API_URL = 'https://v2.api.vizionapi.com';

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
 * Suscribir un contenedor a Vizion para tracking en tiempo real
 */
export const subscribeToVizion = async (
    containerNumber: string, 
    carrierCode: string = 'WHLC',
    blNumber?: string
): Promise<{ success: boolean; referenceId?: string; error?: string }> => {
    if (!VIZION_API_KEY) {
        console.log('⚠️ VIZION_API_KEY no configurada - tracking simulado');
        return { success: true, referenceId: `SIM-${containerNumber}` };
    }

    try {
        const response = await axios.post(
            `${VIZION_API_URL}/references`,
            {
                reference_number: containerNumber,
                carrier_code: carrierCode,
                // Opcional: también podemos trackear por BL
                ...(blNumber && { bill_of_lading: blNumber })
            },
            {
                headers: { 
                    'X-API-Key': VIZION_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        const referenceId = response.data?.id || response.data?.reference_id;
        
        console.log(`✅ Contenedor ${containerNumber} suscrito a Vizion API`);
        console.log(`   Reference ID: ${referenceId}`);
        
        return { success: true, referenceId };

    } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message;
        console.error(`❌ Error conectando a Vizion:`, errorMsg);
        return { success: false, error: errorMsg };
    }
};

/**
 * Cancelar suscripción de un contenedor en Vizion
 */
export const unsubscribeFromVizion = async (referenceId: string): Promise<boolean> => {
    if (!VIZION_API_KEY || referenceId.startsWith('SIM-')) {
        return true;
    }

    try {
        await axios.delete(
            `${VIZION_API_URL}/references/${referenceId}`,
            {
                headers: { 'X-API-Key': VIZION_API_KEY }
            }
        );
        console.log(`✅ Suscripción ${referenceId} cancelada en Vizion`);
        return true;
    } catch (error: any) {
        console.error(`❌ Error cancelando suscripción:`, error.message);
        return false;
    }
};

/**
 * Obtener estado actual de un contenedor desde Vizion
 */
export const getVizionStatus = async (referenceId: string): Promise<any> => {
    if (!VIZION_API_KEY || referenceId.startsWith('SIM-')) {
        return null;
    }

    try {
        const response = await axios.get(
            `${VIZION_API_URL}/references/${referenceId}`,
            {
                headers: { 'X-API-Key': VIZION_API_KEY }
            }
        );
        return response.data;
    } catch (error: any) {
        console.error(`❌ Error obteniendo estado:`, error.message);
        return null;
    }
};

// ============================================
// WEBHOOK - Recibir actualizaciones de Vizion
// ============================================

/**
 * Mapeo de milestones de Vizion a estados del sistema
 */
const MILESTONE_MAP: Record<string, { status: string; message: string; icon: string }> = {
    // Eventos de Carga
    'LF': { status: 'loaded', message: 'Contenedor cargado en puerto origen', icon: '📦' },
    'GI': { status: 'gate_in', message: 'Contenedor ingresó a terminal portuaria', icon: '🚪' },
    
    // Eventos de Navegación
    'VD': { status: 'in_transit', message: 'Tu contenedor ha zarpado de puerto origen', icon: '🚢' },
    'VA': { status: 'arrived_port', message: 'El barco ha arribado al puerto de destino', icon: '⚓' },
    
    // Eventos de Puerto Destino
    'DS': { status: 'discharged', message: 'Contenedor descargado del barco. En espera de aduana', icon: '🏗️' },
    'CR': { status: 'customs_cleared', message: '¡Aduana superada! Tu contenedor ha sido liberado', icon: '✅' },
    'AV': { status: 'available', message: 'Contenedor disponible para retiro', icon: '📋' },
    
    // Eventos de Salida
    'GO': { status: 'gate_out', message: 'Contenedor salió del puerto hacia bodega', icon: '🚛' },
    'GT': { status: 'in_transit_local', message: 'Contenedor en ruta terrestre hacia CEDIS', icon: '🚛' },
    
    // Eventos de Entrega
    'DV': { status: 'delivered', message: '¡Tu contenedor ha sido entregado!', icon: '🎉' },
    'ER': { status: 'empty_return', message: 'Contenedor vacío devuelto a naviera', icon: '↩️' }
};

/**
 * POST /api/webhooks/vizion
 * Webhook para recibir actualizaciones de Vizion
 */
export const handleVizionWebhook = async (req: Request, res: Response): Promise<any> => {
    try {
        const payload = req.body;
        
        console.log('📡 Webhook Vizion recibido:', JSON.stringify(payload, null, 2));

        // Vizion envía la información del evento
        const containerNumber = payload.reference_number || payload.container_number;
        const milestone = payload.milestone || payload.event_code;
        const eventDate = payload.time_actual || payload.event_time || new Date().toISOString();
        const location = payload.location?.name || payload.port_name || '';
        const vessel = payload.vessel?.name || payload.vessel_name || '';
        const voyage = payload.vessel?.voyage || payload.voyage_number || '';

        if (!containerNumber) {
            console.log('⚠️ Webhook sin container_number, ignorando');
            return res.status(200).send('OK - No container number');
        }

        // Buscar el contenedor en nuestra base de datos
        const containerResult = await pool.query(
            `SELECT c.id, c.status, ms.id as shipment_id 
             FROM containers c
             LEFT JOIN maritime_shipments ms ON ms.container_id = c.id
             WHERE c.container_number = $1`,
            [containerNumber]
        );

        if (containerResult.rows.length === 0) {
            console.log(`⚠️ Contenedor ${containerNumber} no encontrado en BD`);
            return res.status(200).send('OK - Container not found');
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
            await pool.query(
                `UPDATE containers 
                 SET status = $1, 
                     last_tracking_event = $2,
                     last_tracking_date = $3,
                     last_tracking_location = $4,
                     updated_at = NOW() 
                 WHERE id = $5`,
                [milestoneInfo.status, milestoneInfo.message, eventDate, location, container.id]
            );

            console.log(`✅ Contenedor ${containerNumber} actualizado: ${milestoneInfo.status}`);

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

        res.status(200).send('Webhook procesado correctamente');

    } catch (error: any) {
        console.error("❌ Error en Webhook Vizion:", error);
        res.status(500).send('Error interno');
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
 * POST /api/admin/vizion/subscribe
 * Suscribir manualmente un contenedor a Vizion
 */
export const subscribeContainer = async (req: Request, res: Response): Promise<any> => {
    try {
        const { containerId, containerNumber, carrierCode, blNumber } = req.body;

        if (!containerNumber) {
            return res.status(400).json({ success: false, error: 'containerNumber requerido' });
        }

        const carrier = carrierCode || 'WHLC';
        const result = await subscribeToVizion(containerNumber, carrier, blNumber);

        if (result.success) {
            // Guardar el reference ID en la base de datos
            if (containerId) {
                await pool.query(
                    `UPDATE containers SET vizion_reference_id = $1, vizion_subscribed_at = NOW() WHERE id = $2`,
                    [result.referenceId, containerId]
                );
            }

            res.json({ 
                success: true, 
                message: `Contenedor ${containerNumber} suscrito a tracking`,
                referenceId: result.referenceId 
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
