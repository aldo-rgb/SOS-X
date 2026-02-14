// ============================================
// CONTROLADOR DE RECEPCIÓN DE BODEGA
// Paneles por ubicación: China Aéreo, China Marítimo, USA, CEDIS
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import { calculateQuote } from './pricingEngine';

// ============================================
// CONSTANTES DE UBICACIONES
// ============================================

export const WAREHOUSE_LOCATIONS = {
    CHINA_AIR: 'china_air',      // Bodega aérea en China
    CHINA_SEA: 'china_sea',      // Bodega marítima en China  
    USA_POBOX: 'usa_pobox',      // PO Box en USA
    MX_CEDIS: 'mx_cedis',        // CEDIS en México (AA DHL)
    MX_NATIONAL: 'mx_national',  // Nacional México
} as const;

// Mapeo de ubicación a servicios permitidos
export const LOCATION_SERVICES: { [key: string]: string[] } = {
    [WAREHOUSE_LOCATIONS.CHINA_AIR]: ['AIR_CHN_MX'],
    [WAREHOUSE_LOCATIONS.CHINA_SEA]: ['SEA_CHN_MX'],
    [WAREHOUSE_LOCATIONS.USA_POBOX]: ['POBOX_USA', 'NATIONAL'],
    [WAREHOUSE_LOCATIONS.MX_CEDIS]: ['AA_DHL'],
    [WAREHOUSE_LOCATIONS.MX_NATIONAL]: ['NATIONAL'],
};

// ============================================
// ROLES DE BODEGA
// ============================================

export const WAREHOUSE_ROLES = {
    STAFF_CHINA_AIR: 'staff_china_air',
    STAFF_CHINA_SEA: 'staff_china_sea',
    STAFF_USA: 'staff_usa',
    STAFF_CEDIS: 'staff_cedis',
    STAFF_NATIONAL: 'staff_national',
} as const;

// ============================================
// HELPER: Obtener ubicación de bodega del usuario
// ============================================
async function getUserWarehouseLocation(userId: number): Promise<string> {
    const result = await pool.query(
        'SELECT warehouse_location FROM users WHERE id = $1',
        [userId]
    );
    return result.rows[0]?.warehouse_location || 'usa_pobox';
}

// ============================================
// ENDPOINTS
// ============================================

// GET /api/warehouse/services - Servicios disponibles para la ubicación del usuario
export const getWarehouseServices = async (req: Request, res: Response): Promise<any> => {
    try {
        const user = (req as any).user;
        const location = await getUserWarehouseLocation(user.userId);

        const allowedServices = LOCATION_SERVICES[location] || [];
        
        if (allowedServices.length === 0) {
            return res.json([]);
        }

        const result = await pool.query(
            `SELECT id, code, name, calculation_type, requires_dimensions 
             FROM logistics_services 
             WHERE code = ANY($1) AND is_active = TRUE`,
            [allowedServices]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error getting warehouse services:', error);
        res.status(500).json({ error: 'Error al obtener servicios' });
    }
};

// GET /api/warehouse/receipts - Lista de recepciones del usuario
export const getWarehouseReceipts = async (req: Request, res: Response): Promise<any> => {
    try {
        const user = (req as any).user;
        const { status, date_from, date_to, limit = 50 } = req.query;
        const location = await getUserWarehouseLocation(user.userId);

        let query = `
            SELECT wr.*, 
                   u.full_name as client_name, 
                   u.box_id,
                   ls.name as service_name,
                   rb.full_name as received_by_name
            FROM warehouse_receipts wr
            LEFT JOIN users u ON wr.user_id = u.id
            LEFT JOIN logistics_services ls ON wr.service_code = ls.code
            LEFT JOIN users rb ON wr.received_by = rb.id
            WHERE wr.warehouse_location = $1
        `;
        const params: any[] = [location];
        let paramIndex = 2;

        if (status) {
            query += ` AND wr.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (date_from) {
            query += ` AND wr.created_at >= $${paramIndex}`;
            params.push(date_from);
            paramIndex++;
        }

        if (date_to) {
            query += ` AND wr.created_at <= $${paramIndex}`;
            params.push(date_to);
            paramIndex++;
        }

        query += ` ORDER BY wr.created_at DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit as string));

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting warehouse receipts:', error);
        res.status(500).json({ error: 'Error al obtener recepciones' });
    }
};

// POST /api/warehouse/receipts - Registrar nueva recepción
export const createWarehouseReceipt = async (req: Request, res: Response): Promise<any> => {
    try {
        const user = (req as any).user;
        const {
            tracking_number,
            service_code,
            box_id,           // Para buscar al cliente
            weight_kg,
            length_cm,
            width_cm,
            height_cm,
            quantity = 1,
            notes,
            photo_url
        } = req.body;

        // Validaciones
        if (!tracking_number || !service_code) {
            return res.status(400).json({ error: 'tracking_number y service_code son requeridos' });
        }

        // Verificar que el servicio está permitido para esta ubicación
        const location = await getUserWarehouseLocation(user.userId);
        const allowedServices = LOCATION_SERVICES[location] || [];
        
        if (!allowedServices.includes(service_code)) {
            return res.status(403).json({ 
                error: `Servicio ${service_code} no permitido en esta ubicación (${location})` 
            });
        }

        // Buscar cliente por box_id
        let clientId = null;
        if (box_id) {
            const clientResult = await pool.query(
                'SELECT id FROM users WHERE box_id = $1',
                [box_id.toUpperCase()]
            );
            if (clientResult.rows.length > 0) {
                clientId = clientResult.rows[0].id;
            }
        }

        // Calcular cotización
        let quoteResult = null;
        try {
            quoteResult = await calculateQuote({
                serviceCode: service_code,
                weightKg: parseFloat(weight_kg) || 0,
                lengthCm: parseFloat(length_cm) || 0,
                widthCm: parseFloat(width_cm) || 0,
                heightCm: parseFloat(height_cm) || 0,
                quantity: parseInt(quantity) || 1,
                userId: clientId || user.userId
            });
        } catch (quoteError: any) {
            console.warn('Quote calculation failed:', quoteError.message);
            // Continuar sin cotización
        }

        // Insertar recepción
        const result = await pool.query(`
            INSERT INTO warehouse_receipts (
                tracking_number, service_code, user_id,
                weight_kg, length_cm, width_cm, height_cm, quantity,
                quoted_usd, quoted_mxn, fx_rate,
                received_by, warehouse_location, notes, photo_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
        `, [
            tracking_number,
            service_code,
            clientId,
            weight_kg || null,
            length_cm || null,
            width_cm || null,
            height_cm || null,
            quantity,
            quoteResult?.usd || null,
            quoteResult?.mxn || null,
            quoteResult?.fxRate || null,
            user.userId,
            location,
            notes || null,
            photo_url || null
        ]);

        // Si hay cliente, notificar (TODO: Push notification)
        if (clientId) {
            console.log(`📦 Notificar a cliente ${clientId}: Nuevo paquete ${tracking_number}`);
        }

        res.status(201).json({
            message: 'Recepción registrada correctamente',
            receipt: result.rows[0],
            quote: quoteResult
        });
    } catch (error: any) {
        console.error('Error creating warehouse receipt:', error);
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Ya existe una recepción con ese tracking' });
        }
        res.status(500).json({ error: 'Error al registrar recepción' });
    }
};

// PUT /api/warehouse/receipts/:id - Actualizar recepción
export const updateWarehouseReceipt = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const {
            weight_kg,
            length_cm,
            width_cm,
            height_cm,
            quantity,
            status,
            notes,
            photo_url
        } = req.body;

        // Recalcular cotización si cambiaron dimensiones
        const currentReceipt = await pool.query(
            'SELECT * FROM warehouse_receipts WHERE id = $1',
            [id]
        );

        if (currentReceipt.rows.length === 0) {
            return res.status(404).json({ error: 'Recepción no encontrada' });
        }

        const receipt = currentReceipt.rows[0];
        let newQuote = null;

        if (weight_kg || length_cm || width_cm || height_cm || quantity) {
            try {
                newQuote = await calculateQuote({
                    serviceCode: receipt.service_code,
                    weightKg: parseFloat(weight_kg) || receipt.weight_kg || 0,
                    lengthCm: parseFloat(length_cm) || receipt.length_cm || 0,
                    widthCm: parseFloat(width_cm) || receipt.width_cm || 0,
                    heightCm: parseFloat(height_cm) || receipt.height_cm || 0,
                    quantity: parseInt(quantity) || receipt.quantity || 1,
                    userId: receipt.user_id || 1
                });
            } catch (e) {
                console.warn('Quote recalculation failed');
            }
        }

        const result = await pool.query(`
            UPDATE warehouse_receipts SET
                weight_kg = COALESCE($1, weight_kg),
                length_cm = COALESCE($2, length_cm),
                width_cm = COALESCE($3, width_cm),
                height_cm = COALESCE($4, height_cm),
                quantity = COALESCE($5, quantity),
                status = COALESCE($6, status),
                notes = COALESCE($7, notes),
                photo_url = COALESCE($8, photo_url),
                quoted_usd = COALESCE($9, quoted_usd),
                quoted_mxn = COALESCE($10, quoted_mxn),
                updated_at = NOW()
            WHERE id = $11 RETURNING *
        `, [
            weight_kg, length_cm, width_cm, height_cm, quantity,
            status, notes, photo_url,
            newQuote?.usd, newQuote?.mxn,
            id
        ]);

        res.json({ 
            message: 'Recepción actualizada',
            receipt: result.rows[0],
            quote: newQuote
        });
    } catch (error) {
        console.error('Error updating warehouse receipt:', error);
        res.status(500).json({ error: 'Error al actualizar recepción' });
    }
};

// GET /api/warehouse/search-client/:boxId - Buscar cliente por Box ID
export const searchClientByBoxId = async (req: Request, res: Response): Promise<any> => {
    try {
        const { boxId } = req.params;

        const result = await pool.query(`
            SELECT id, full_name, email, box_id, phone,
                   (SELECT name FROM price_lists WHERE id = assigned_price_list_id) as price_list
            FROM users 
            WHERE UPPER(box_id) = UPPER($1) AND role = 'client'
        `, [boxId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error searching client:', error);
        res.status(500).json({ error: 'Error al buscar cliente' });
    }
};

// GET /api/warehouse/stats - Estadísticas de la bodega
export const getWarehouseStats = async (req: Request, res: Response): Promise<any> => {
    try {
        const user = (req as any).user;
        const location = await getUserWarehouseLocation(user.userId);

        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_today,
                COUNT(*) FILTER (WHERE status = 'received') as pending,
                COUNT(*) FILTER (WHERE status = 'in_transit') as in_transit,
                COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
                COUNT(*) FILTER (WHERE payment_status = 'pending') as pending_payment,
                COALESCE(SUM(quoted_usd), 0) as total_usd_today
            FROM warehouse_receipts
            WHERE warehouse_location = $1
            AND DATE(created_at) = CURRENT_DATE
        `, [location]);

        const recentActivity = await pool.query(`
            SELECT wr.id, wr.tracking_number, wr.status, wr.created_at,
                   u.full_name as client_name, ls.name as service_name
            FROM warehouse_receipts wr
            LEFT JOIN users u ON wr.user_id = u.id
            LEFT JOIN logistics_services ls ON wr.service_code = ls.code
            WHERE wr.warehouse_location = $1
            ORDER BY wr.created_at DESC
            LIMIT 10
        `, [location]);

        res.json({
            stats: stats.rows[0],
            recentActivity: recentActivity.rows
        });
    } catch (error) {
        console.error('Error getting warehouse stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};

// ============================================
// ADMIN: Gestión de ubicaciones de usuarios
// ============================================

// PUT /api/admin/users/:id/warehouse-location
export const assignWarehouseLocation = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { warehouse_location } = req.body;

        const validLocations = Object.values(WAREHOUSE_LOCATIONS);
        if (warehouse_location && !validLocations.includes(warehouse_location)) {
            return res.status(400).json({ 
                error: 'Ubicación inválida',
                valid_locations: validLocations
            });
        }

        const result = await pool.query(
            'UPDATE users SET warehouse_location = $1 WHERE id = $2 RETURNING id, full_name, warehouse_location',
            [warehouse_location || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ message: 'Ubicación asignada', user: result.rows[0] });
    } catch (error) {
        console.error('Error assigning warehouse location:', error);
        res.status(500).json({ error: 'Error al asignar ubicación' });
    }
};

// GET /api/admin/warehouse-locations - Lista de ubicaciones disponibles
export const getWarehouseLocations = async (_req: Request, res: Response): Promise<any> => {
    res.json({
        locations: Object.entries(WAREHOUSE_LOCATIONS).map(([key, value]) => ({
            code: value,
            name: key.replace(/_/g, ' '),
            services: LOCATION_SERVICES[value] || []
        }))
    });
};
