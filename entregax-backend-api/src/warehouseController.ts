// ============================================
// CONTROLADOR DE RECEPCIÓN DE BODEGA
// Paneles por ubicación: China Aéreo, China Marítimo, USA, CEDIS
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import { calculateQuote } from './pricingEngine';
import * as skydropx from './services/skydropxService';

// ============================================
// CONSTANTES DE UBICACIONES
// ============================================

export const WAREHOUSE_LOCATIONS = {
    CHINA_AIR: 'china_air',      // Bodega aérea en China
    CHINA_SEA: 'china_sea',      // Bodega marítima en China  
    USA_POBOX: 'usa_pobox',      // PO Box en USA
    MX_CEDIS: 'mx_cedis',        // CEDIS en México (AA DHL)
    MX_NATIONAL: 'mx_national',  // Nacional México
    SCANNER_UNIFICADO: 'scanner_unificado', // Panel unificado multi-sucursal
    INVENTARIO_SUCURSAL: 'inventario_sucursal', // Inventario por sucursal
} as const;

// Mapeo de ubicación a servicios permitidos
export const LOCATION_SERVICES: { [key: string]: string[] } = {
    [WAREHOUSE_LOCATIONS.CHINA_AIR]: ['AIR_CHN_MX'],
    [WAREHOUSE_LOCATIONS.CHINA_SEA]: ['SEA_CHN_MX'],
    [WAREHOUSE_LOCATIONS.USA_POBOX]: ['POBOX_USA', 'NATIONAL'],
    [WAREHOUSE_LOCATIONS.MX_CEDIS]: ['AA_DHL'],
    [WAREHOUSE_LOCATIONS.MX_NATIONAL]: ['NATIONAL'],
    [WAREHOUSE_LOCATIONS.SCANNER_UNIFICADO]: ['ALL'], // Acceso a todos los servicios
    [WAREHOUSE_LOCATIONS.INVENTARIO_SUCURSAL]: ['INVENTORY'], // Panel de inventario
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
        const { serviceType } = req.query; // 'usa', 'air', 'maritime', etc.

        const result = await pool.query(`
            SELECT id, full_name, email, box_id, phone,
                   (SELECT name FROM price_lists WHERE id = assigned_price_list_id) as price_list
            FROM users 
            WHERE UPPER(box_id) = UPPER($1) AND role = 'client'
        `, [boxId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const client = result.rows[0];

        // Buscar direcciones del usuario
        const addressesResult = await pool.query(`
            SELECT id, label, country, city, address, zip_code, phone, contact_name, 
                   is_default, default_for_service
            FROM addresses 
            WHERE user_id = $1
            ORDER BY is_default DESC, id ASC
        `, [client.id]);

        client.addresses = addressesResult.rows;

        // Si se especifica un tipo de servicio, buscar la dirección predeterminada para ese servicio
        if (serviceType) {
            const defaultAddress = addressesResult.rows.find((addr: any) => {
                if (!addr.default_for_service) return false;
                const services = addr.default_for_service.split(',').map((s: string) => s.trim().toLowerCase());
                return services.includes(serviceType.toString().toLowerCase()) || services.includes('all');
            });
            client.defaultAddressForService = defaultAddress || null;
        }

        res.json(client);
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

// ============================================
// PANEL UNIFICADO MULTI-SUCURSAL
// ============================================

interface AuthRequest extends Request {
    user?: {
        userId: number;
        email: string;
        role: string;
    };
}

// GET /api/warehouse/branch-info - Obtener info de sucursal del empleado
export const getWorkerBranchInfo = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const workerId = req.user?.userId;
        const { branch_id: selectedBranchId } = req.query; // Super Admin puede seleccionar sucursal

        const result = await pool.query(`
            SELECT 
                u.id as worker_id,
                u.full_name as worker_name,
                u.role,
                u.branch_id,
                b.id as assigned_branch_id,
                b.name as branch_name,
                b.code as branch_code,
                b.city,
                b.allowed_services
            FROM users u 
            LEFT JOIN branches b ON u.branch_id = b.id 
            WHERE u.id = $1
        `, [workerId]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Empleado no encontrado' });
            return;
        }

        const worker = result.rows[0];
        
        // Super Admin y Admin pueden trabajar sin sucursal asignada
        const isAdmin = ['super_admin', 'admin', 'director'].includes(worker.role);
        
        if (!worker.branch_id && !isAdmin) {
            res.status(403).json({ 
                error: 'No tienes una sucursal asignada. Contacta al administrador.',
                needsBranchAssignment: true
            });
            return;
        }

        // Si es admin y seleccionó una sucursal específica, obtener esa info
        if (isAdmin && selectedBranchId) {
            const branchRes = await pool.query(`
                SELECT id as branch_id, name as branch_name, code as branch_code, city, allowed_services
                FROM branches WHERE id = $1
            `, [selectedBranchId]);
            
            if (branchRes.rows.length > 0) {
                const branch = branchRes.rows[0];
                res.json({
                    ...worker,
                    branch_id: branch.branch_id,
                    branch_name: branch.branch_name,
                    branch_code: branch.branch_code,
                    city: branch.city,
                    allowed_services: branch.allowed_services,
                    is_admin_mode: true
                });
                return;
            }
        }

        // Si es admin sin sucursal, obtener la primera sucursal disponible
        if (isAdmin && !worker.branch_id) {
            const defaultBranch = await pool.query(`
                SELECT id as branch_id, name as branch_name, code as branch_code, city, allowed_services
                FROM branches WHERE is_active = TRUE ORDER BY name LIMIT 1
            `);
            
            if (defaultBranch.rows.length > 0) {
                const branch = defaultBranch.rows[0];
                res.json({
                    ...worker,
                    branch_id: branch.branch_id,
                    branch_name: branch.branch_name,
                    branch_code: branch.branch_code,
                    city: branch.city,
                    allowed_services: branch.allowed_services,
                    is_admin_mode: true,
                    can_select_branch: true
                });
                return;
            }
        }

        res.json({
            ...worker,
            is_admin_mode: isAdmin,
            can_select_branch: isAdmin
        });
    } catch (error) {
        console.error('Error obteniendo info de sucursal:', error);
        res.status(500).json({ error: 'Error al obtener información de sucursal' });
    }
};

// POST /api/warehouse/scan - Escáner inteligente de bodega
export const processWarehouseScan = async (req: AuthRequest, res: Response): Promise<void> => {
    const { barcode, scanType, branch_id: selectedBranchId } = req.body; // scanType: 'INGRESO' o 'SALIDA'
    const workerId = req.user?.userId;

    if (!barcode || !scanType) {
        res.status(400).json({ error: 'Código de barras y tipo de escaneo son requeridos' });
        return;
    }

    console.log(`📦 [WAREHOUSE] Escaneo: ${barcode} - Tipo: ${scanType} - Worker: ${workerId}`);

    try {
        // 1. SABER QUIÉN ESCANEA Y EN QUÉ BODEGA ESTÁ
        const workerRes = await pool.query(`
            SELECT u.id, u.full_name, u.branch_id, u.role, b.name as branch_name, b.code as branch_code, b.allowed_services 
            FROM users u 
            LEFT JOIN branches b ON u.branch_id = b.id 
            WHERE u.id = $1
        `, [workerId]);
        
        if (workerRes.rows.length === 0) {
            res.status(403).json({ error: 'Usuario no encontrado' });
            return;
        }

        let { branch_id, branch_name, branch_code, allowed_services, full_name, role } = workerRes.rows[0];
        const isAdmin = ['super_admin', 'admin', 'director'].includes(role);

        // Si es admin y seleccionó una sucursal, usar esa
        if (isAdmin && selectedBranchId) {
            const branchRes = await pool.query(`
                SELECT id, name, code, allowed_services FROM branches WHERE id = $1
            `, [selectedBranchId]);
            if (branchRes.rows.length > 0) {
                branch_id = branchRes.rows[0].id;
                branch_name = branchRes.rows[0].name;
                branch_code = branchRes.rows[0].code;
                allowed_services = branchRes.rows[0].allowed_services;
            }
        }

        // Si es admin sin sucursal, usar la primera disponible
        if (isAdmin && !branch_id) {
            const defaultBranch = await pool.query(`
                SELECT id, name, code, allowed_services FROM branches WHERE is_active = TRUE ORDER BY name LIMIT 1
            `);
            if (defaultBranch.rows.length > 0) {
                branch_id = defaultBranch.rows[0].id;
                branch_name = defaultBranch.rows[0].name;
                branch_code = defaultBranch.rows[0].code;
                allowed_services = defaultBranch.rows[0].allowed_services;
            }
        }
        
        if (!branch_id) {
            res.status(403).json({ error: 'No tienes una sucursal asignada' });
            return;
        }

        // 2. IDENTIFICAR QUÉ TIPO DE PAQUETE ES
        let packageServiceType = '';
        let packageId: number | null = null;
        let tableName = 'packages';
        let packageInfo: any = null;

        // Buscar en packages (tracking interno o de proveedor)
        // 🔎 Match flexible: el scanner de código de barras a veces omite guiones
        // (p.ej. lee "US2722344044" pero en DB está "US-2722344044"). Comparamos
        // ignorando guiones en ambos lados.
        const packageSearch = await pool.query(`
            SELECT id, tracking_internal, tracking_provider, description, user_id, status, service_type,
                   current_branch_id,
                   (SELECT full_name FROM users WHERE id = packages.user_id) as client_name,
                   (SELECT box_id FROM users WHERE id = packages.user_id) as client_box_id
            FROM packages 
            WHERE UPPER(tracking_internal) = UPPER($1) 
               OR UPPER(tracking_provider) = UPPER($1)
               OR UPPER(REPLACE(tracking_internal, '-', '')) = UPPER(REPLACE($1, '-', ''))
               OR UPPER(REPLACE(tracking_provider, '-', '')) = UPPER(REPLACE($1, '-', ''))
            LIMIT 1
        `, [barcode]);

        if (packageSearch.rows.length > 0) {
            packageInfo = packageSearch.rows[0];
            packageId = packageInfo.id;
            
            // Determinar tipo de servicio basado en service_type
            const serviceType = (packageInfo.service_type || 'air').toLowerCase();
            if (serviceType === 'maritime' || serviceType === 'maritimo') {
                packageServiceType = 'maritimo';
            } else if (serviceType === 'china_air' || serviceType === 'aereo' || serviceType === 'air_chn_mx' || serviceType.includes('air')) {
                packageServiceType = 'aereo';
            } else if (serviceType === 'dhl') {
                packageServiceType = 'dhl_liberacion';
            } else {
                packageServiceType = 'po_box';
            }
        }
        
        // Si no encontramos en packages, buscar en china_receipts (paquetes AIR de China)
        if (!packageId) {
            const chinaSearch = await pool.query(`
                SELECT cr.id, cr.fno, cr.shipping_mark, cr.status, cr.user_id,
                       cr.total_qty, cr.total_weight,
                       (SELECT full_name FROM users WHERE id = cr.user_id) as client_name,
                       (SELECT box_id FROM users WHERE id = cr.user_id) as client_box_id
                FROM china_receipts cr
                WHERE UPPER(cr.fno) = UPPER($1)
                   OR UPPER(REPLACE(cr.fno, '-', '')) = UPPER(REPLACE($1, '-', ''))
                LIMIT 1
            `, [barcode]);
            
            if (chinaSearch.rows.length > 0) {
                packageInfo = chinaSearch.rows[0];
                packageId = packageInfo.id;
                tableName = 'china_receipts';
                packageServiceType = 'aereo'; // Paquetes AIR de China son servicio aéreo
                console.log(`📦 Encontrado en china_receipts: ${barcode}`);
            }
        }

        // Si no encontramos el paquete
        if (!packageId) {
            // Registrar escaneo fallido
            await pool.query(`
                INSERT INTO warehouse_scans (barcode, scan_type, branch_id, scanned_by, result, error_message)
                VALUES ($1, $2, $3, $4, 'error', 'Código no encontrado en el sistema')
            `, [barcode, scanType, branch_id, workerId]);

            res.status(404).json({ 
                error: '❌ Código no encontrado',
                message: 'Este código de barras no está registrado en el sistema.',
                barcode,
                suggestion: 'Verifica que el paquete haya sido dado de alta correctamente'
            });
            return;
        }

        // 3. VALIDAR PERMISOS DE LA SUCURSAL
        if (!allowed_services.includes(packageServiceType)) {
            // Registrar escaneo denegado
            await pool.query(`
                INSERT INTO warehouse_scans (barcode, scan_type, package_type, package_id, branch_id, scanned_by, result, error_message)
                VALUES ($1, $2, $3, $4, $5, $6, 'error', $7)
            `, [barcode, scanType, packageServiceType, packageId, branch_id, workerId, 
                `Sucursal sin permisos para ${packageServiceType}`]);

            res.status(403).json({ 
                error: `⛔ Acceso Denegado`,
                message: `La sucursal ${branch_name} no tiene permisos para procesar carga del servicio: ${packageServiceType.toUpperCase()}.`,
                barcode,
                serviceType: packageServiceType,
                allowedServices: allowed_services
            });
            return;
        }

        // 4. EJECUTAR LA ACCIÓN (INGRESO O SALIDA)
        let newStatus = '';
        let actionMessage = '';
        // Variables para guía nacional (solo SALIDA)
        let labelUrl: string | null = null;
        let nationalTracking: string | null = null;
        let nationalCarrier: string | null = null;

        if (scanType === 'INGRESO') {
            // Actualizar según la tabla de origen
            if (tableName === 'china_receipts') {
                // china_receipts usa VARCHAR - podemos poner el nombre de la sucursal
                newStatus = `received_${branch_code.toLowerCase()}`; // ej: received_cdmx, received_mty
                await pool.query(`
                    UPDATE china_receipts 
                    SET status = $1, updated_at = NOW() 
                    WHERE id = $2
                `, [newStatus, packageId]);
            } else {
                // packages usa ENUM - usar valor válido
                newStatus = 'received';
                await pool.query(`
                    UPDATE packages 
                    SET status = $1, current_branch_id = $2, updated_at = NOW() 
                    WHERE id = $3
                `, [newStatus, branch_id, packageId]);
            }

            // 📦 Registrar en branch_inventory (para que aparezca en "Inventario por Sucursal")
            // UPSERT: si el paquete ya estaba en inventario (ej: re-escaneo), actualizar a in_stock
            try {
                const inventoryTrackingNumber = packageInfo?.tracking_internal || packageInfo?.fno || barcode;
                const inventoryPackageType = tableName === 'china_receipts' ? 'china_receipt' : 'package';
                await pool.query(`
                    INSERT INTO branch_inventory (
                        branch_id, package_type, package_id, tracking_number,
                        status, received_at, received_by, released_at, released_by
                    ) VALUES ($1, $2, $3, $4, 'in_stock', NOW(), $5, NULL, NULL)
                    ON CONFLICT (branch_id, package_type, package_id)
                    DO UPDATE SET
                        status = 'in_stock',
                        received_at = NOW(),
                        received_by = EXCLUDED.received_by,
                        released_at = NULL,
                        released_by = NULL,
                        tracking_number = EXCLUDED.tracking_number
                `, [branch_id, inventoryPackageType, packageId, inventoryTrackingNumber, workerId]);
            } catch (invErr) {
                console.warn('⚠️ No se pudo upsert branch_inventory (no bloqueante):', invErr);
            }
            
            actionMessage = `📥 Ingreso registrado en ${branch_name}`;

            // Notificar al cliente
            if (packageInfo?.user_id) {
                const trackingNumber = packageInfo.tracking_internal || packageInfo.fno || barcode;
                await pool.query(`
                    INSERT INTO notifications (user_id, title, message, type, icon, data)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    packageInfo.user_id,
                    '📦 Tu paquete llegó a México',
                    `Tu paquete ${trackingNumber} ha llegado a nuestra sucursal ${branch_name}. Pronto estará listo para entrega.`,
                    'info',
                    'package',
                    JSON.stringify({ packageId, branchName: branch_name, branchCode: branch_code, tableName })
                ]);
            }

            console.log(`✅ [WAREHOUSE] INGRESO exitoso: ${barcode} en ${branch_name} (tabla: ${tableName})`);

        } else if (scanType === 'SALIDA') {
            // Validar que el paquete esté en esta bodega.
            // Self-heal: si current_branch_id viene NULL pero el status indica que
            // ya fue recibido (received_mty / received_<code> / received), asumimos
            // que está en la sucursal del worker y reparamos current_branch_id.
            const statusLc = String(packageInfo?.status || '').toLowerCase();
            const codeLc = String(branch_code || '').toLowerCase();
            const looksReceivedHere =
                packageInfo.current_branch_id == null && (
                    statusLc === `received_${codeLc}` ||
                    statusLc === 'received_mty' ||
                    statusLc === 'received'
                );

            if (looksReceivedHere && tableName === 'packages') {
                console.log(`🧩 [WAREHOUSE] Self-heal: paquete ${barcode} sin current_branch_id pero status='${statusLc}' → fijando branch ${branch_id}`);
                await pool.query(
                    `UPDATE packages SET current_branch_id = $1, updated_at = NOW() WHERE id = $2`,
                    [branch_id, packageId]
                );
                packageInfo.current_branch_id = branch_id;
            }

            if (packageInfo.current_branch_id !== branch_id) {
                await pool.query(`
                    INSERT INTO warehouse_scans (barcode, scan_type, package_type, package_id, branch_id, scanned_by, result, error_message)
                    VALUES ($1, $2, $3, $4, $5, $6, 'error', 'El paquete no está en esta sucursal')
                `, [barcode, scanType, packageServiceType, packageId, branch_id, workerId]);

                res.status(400).json({ 
                    error: '⚠️ El paquete no está aquí',
                    message: 'No puedes dar salida a un paquete que no está físicamente en esta sucursal.',
                    barcode
                });
                return;
            }

            // ============================================
            // 🚚 AUTO-GENERACIÓN DE GUÍA NACIONAL (SKYDROPX)
            // ============================================

            // Verificar si ya tiene guía nacional
            const pkgNational = await pool.query(`
                SELECT national_tracking, national_label_url, national_carrier,
                       assigned_address_id, weight, pkg_length, pkg_width, pkg_height
                FROM packages WHERE id = $1
            `, [packageId]);
            
            const pkgData = pkgNational.rows[0];
            labelUrl = pkgData?.national_label_url;
            nationalTracking = pkgData?.national_tracking;
            nationalCarrier = pkgData?.national_carrier;

            // SI NO TIENE GUÍA, GENERARLA AUTOMÁTICAMENTE
            if (!labelUrl && pkgData?.assigned_address_id) {
                console.log(`🚀 [WAREHOUSE] Generando guía Skydropx para paquete ${packageId}...`);
                
                try {
                    // Obtener dirección de entrega
                    const addrResult = await pool.query(`
                        SELECT a.*, u.wallet_balance 
                        FROM addresses a
                        JOIN packages p ON p.assigned_address_id = a.id
                        LEFT JOIN users u ON p.user_id = u.id
                        WHERE p.id = $1
                    `, [packageId]);
                    
                    const addr = addrResult.rows[0];
                    
                    if (!addr) {
                        throw new Error('No hay dirección de entrega asignada');
                    }

                    // Verificar que el cliente tenga crédito suficiente (mínimo $100 MXN para guía)
                    const creditBalance = parseFloat(addr.wallet_balance || '0');
                    if (creditBalance < 100) {
                        console.warn(`⚠️ [WAREHOUSE] Cliente sin crédito suficiente: $${creditBalance}`);
                        // Continuamos pero no generamos guía - se hará manual
                    } else {
                        // Preparar dirección para Skydropx
                        const addressTo = {
                            name: addr.full_name || 'Cliente',
                            address1: `${addr.street} ${addr.exterior_number || ''}`.trim(),
                            address2: addr.interior_number ? `Int. ${addr.interior_number}` : '',
                            city: addr.city,
                            province: addr.state,
                            zip: addr.zip_code,
                            country: 'MX',
                            phone: addr.phone || '0000000000',
                            email: addr.email || 'cliente@entregax.com'
                        };

                        // Dimensiones del paquete
                        const parcel = {
                            weight: pkgData.weight || 1,
                            length: pkgData.pkg_length || 30,
                            width: pkgData.pkg_width || 30,
                            height: pkgData.pkg_height || 30
                        };

                        // 1. Crear shipment y obtener cotizaciones
                        const shipmentResult = await skydropx.createShipment(addressTo, parcel);
                        
                        if (shipmentResult.success && shipmentResult.rates && shipmentResult.rates.length > 0) {
                            // Seleccionar la tarifa más económica
                            const bestRate = shipmentResult.rates.reduce((prev, curr) => 
                                curr.totalPrice < prev.totalPrice ? curr : prev
                            );

                            console.log(`💰 [WAREHOUSE] Mejor tarifa: ${bestRate.provider} - $${bestRate.totalPrice}`);

                            // 2. Generar etiqueta con la mejor tarifa
                            const labelResult = await skydropx.createLabel(bestRate.id, 'pdf');

                            if (labelResult.success && labelResult.labelUrl) {
                                labelUrl = labelResult.labelUrl;
                                nationalTracking = labelResult.trackingNumber || null;
                                nationalCarrier = bestRate.provider;

                                // 3. Actualizar BD con la guía generada
                                await pool.query(`
                                    UPDATE packages 
                                    SET national_tracking = $1, 
                                        national_label_url = $2, 
                                        national_carrier = $3,
                                        national_label_cost = $4
                                    WHERE id = $5
                                `, [nationalTracking, labelUrl, nationalCarrier, bestRate.totalPrice, packageId]);

                                // 4. Descontar del crédito del cliente
                                await pool.query(`
                                    UPDATE users 
                                    SET wallet_balance = wallet_balance - $1
                                    WHERE id = $2
                                `, [bestRate.totalPrice, packageInfo.user_id]);

                                console.log(`✅ [WAREHOUSE] Guía generada: ${nationalTracking} - ${nationalCarrier}`);
                            }
                        }
                    }
                } catch (skydropxError) {
                    console.error('❌ [WAREHOUSE] Error generando guía Skydropx:', skydropxError);
                    // No fallamos el escaneo, solo no se generó guía automática
                }
            }

            newStatus = 'dispatched_national';
            
            await pool.query(`
                UPDATE packages 
                SET status = $1, current_branch_id = NULL, dispatched_at = NOW(), updated_at = NOW() 
                WHERE id = $2
            `, [newStatus, packageId]);

            // 📤 Marcar como liberado en branch_inventory
            try {
                await pool.query(`
                    UPDATE branch_inventory
                    SET status = 'released', released_at = NOW(), released_by = $1
                    WHERE branch_id = $2 AND package_type = 'package' AND package_id = $3
                `, [workerId, branch_id, packageId]);
            } catch (invErr) {
                console.warn('⚠️ No se pudo actualizar branch_inventory en SALIDA (no bloqueante):', invErr);
            }
            
            actionMessage = labelUrl 
                ? `📤 Salida registrada. Imprimiendo etiqueta ${nationalCarrier?.toUpperCase() || 'Nacional'}...`
                : `📤 Salida registrada desde ${branch_name}`;

            // Notificar al cliente con el tracking de última milla
            if (packageInfo?.user_id) {
                const trackingMsg = nationalTracking 
                    ? `Tu paquete va en camino por ${nationalCarrier?.toUpperCase() || 'paquetería nacional'} con guía ${nationalTracking}.`
                    : `Tu paquete ${packageInfo.tracking_internal} ha salido de nuestra sucursal y está en camino.`;

                await pool.query(`
                    INSERT INTO notifications (user_id, title, message, type, icon, data)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    packageInfo.user_id,
                    '🚚 Tu paquete va en camino',
                    trackingMsg,
                    'info',
                    'truck',
                    JSON.stringify({ 
                        packageId, 
                        nationalTracking, 
                        nationalCarrier,
                        labelUrl 
                    })
                ]);
            }

            console.log(`✅ [WAREHOUSE] SALIDA exitosa: ${barcode} desde ${branch_name}` + 
                       (nationalTracking ? ` - Guía: ${nationalTracking}` : ''));
        }

        // 5. REGISTRAR ESCANEO EXITOSO
        await pool.query(`
            INSERT INTO warehouse_scans (barcode, scan_type, package_type, package_id, branch_id, scanned_by, result)
            VALUES ($1, $2, $3, $4, $5, $6, 'success')
        `, [barcode, scanType, packageServiceType, packageId, branch_id, workerId]);

        // 5b. OBTENER INFO DE CONSOLIDACIÓN (si aplica)
        // El scanner multi-sucursal muestra a qué consolidación pertenece el paquete
        // y su posición dentro de ella (ej: "Consolidación #45 — Paquete 1 de 3")
        let consolidationInfo: {
            id: number;
            totalPackages: number;
            packageIndex: number;
            status?: string;
        } | null = null;
        if (tableName === 'packages' && packageId) {
            try {
                const consolidationRes = await pool.query(`
                    SELECT p.consolidation_id,
                           c.status as cons_status,
                           (SELECT COUNT(*)::int FROM packages WHERE consolidation_id = p.consolidation_id) as total_packages,
                           (SELECT COUNT(*)::int FROM packages 
                              WHERE consolidation_id = p.consolidation_id AND id <= p.id) as package_index
                    FROM packages p
                    LEFT JOIN consolidations c ON c.id = p.consolidation_id
                    WHERE p.id = $1 AND p.consolidation_id IS NOT NULL
                `, [packageId]);
                if (consolidationRes.rows.length > 0) {
                    const r = consolidationRes.rows[0];
                    consolidationInfo = {
                        id: r.consolidation_id,
                        totalPackages: r.total_packages,
                        packageIndex: r.package_index,
                        status: r.cons_status,
                    };
                }
            } catch (consErr) {
                console.warn('⚠️ No se pudo obtener info de consolidación:', consErr);
            }
        }

        // 6. RESPONDER CON TODA LA INFO (incluyendo labelUrl para impresión automática)
        const trackingNumber = packageInfo?.tracking_internal || packageInfo?.fno || barcode;
        res.json({ 
            success: true, 
            message: actionMessage,
            barcode,
            // URL del PDF de la etiqueta para impresión automática
            labelUrl: scanType === 'SALIDA' ? labelUrl : null,
            nationalTracking: scanType === 'SALIDA' ? nationalTracking : null,
            nationalCarrier: scanType === 'SALIDA' ? nationalCarrier : null,
            package: {
                id: packageId,
                tracking: trackingNumber,
                trackingProvider: packageInfo?.tracking_provider,
                description: packageInfo?.description || packageInfo?.shipping_mark,
                clientName: packageInfo?.client_name,
                clientBoxId: packageInfo?.client_box_id,
                serviceType: packageServiceType,
                previousStatus: packageInfo?.status,
                newStatus,
                sourceTable: tableName
            },
            consolidation: consolidationInfo,
            branch: {
                name: branch_name,
                code: branch_code
            },
            scannedBy: full_name,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error procesando escaneo:', error);
        res.status(500).json({ error: 'Error procesando el escaneo. Intenta de nuevo.' });
    }
};

// GET /api/warehouse/scan-history - Historial de escaneos
export const getScanHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const workerId = req.user?.userId;
        const { limit = 50, date, branch_id: selectedBranchId } = req.query;

        // Obtener info del worker
        const workerRes = await pool.query(`
            SELECT branch_id, role FROM users WHERE id = $1
        `, [workerId]);

        let branchId = workerRes.rows[0]?.branch_id;
        const role = workerRes.rows[0]?.role;
        const isAdmin = ['super_admin', 'admin', 'director'].includes(role);

        // Si es admin y seleccionó una sucursal, usar esa
        if (isAdmin && selectedBranchId) {
            branchId = parseInt(selectedBranchId as string);
        }

        // Si es admin sin sucursal, obtener la primera disponible
        if (isAdmin && !branchId) {
            const defaultBranch = await pool.query(`
                SELECT id FROM branches WHERE is_active = TRUE ORDER BY name LIMIT 1
            `);
            branchId = defaultBranch.rows[0]?.id;
        }

        if (!branchId) {
            res.status(403).json({ error: 'No tienes sucursal asignada' });
            return;
        }

        let dateFilter = '';
        const params: any[] = [branchId, limit];

        if (date) {
            dateFilter = 'AND DATE(ws.created_at) = $3';
            params.push(date);
        }

        const result = await pool.query(`
            SELECT 
                ws.id,
                ws.barcode,
                ws.scan_type,
                ws.package_type,
                ws.result,
                ws.error_message,
                ws.created_at,
                u.full_name as scanned_by_name
            FROM warehouse_scans ws
            JOIN users u ON ws.scanned_by = u.id
            WHERE ws.branch_id = $1 ${dateFilter}
            ORDER BY ws.created_at DESC
            LIMIT $2
        `, params);

        res.json({
            scans: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
};

// GET /api/warehouse/daily-stats - Estadísticas del día
export const getDailyStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const workerId = req.user?.userId;
        const { branch_id: selectedBranchId } = req.query;

        // Obtener info del worker
        const workerRes = await pool.query(`
            SELECT branch_id, role FROM users WHERE id = $1
        `, [workerId]);

        let branchId = workerRes.rows[0]?.branch_id;
        const role = workerRes.rows[0]?.role;
        const isAdmin = ['super_admin', 'admin', 'director'].includes(role);

        // Si es admin y seleccionó una sucursal, usar esa
        if (isAdmin && selectedBranchId) {
            branchId = parseInt(selectedBranchId as string);
        }

        // Si es admin sin sucursal, obtener la primera disponible
        if (isAdmin && !branchId) {
            const defaultBranch = await pool.query(`
                SELECT id FROM branches WHERE is_active = TRUE ORDER BY name LIMIT 1
            `);
            branchId = defaultBranch.rows[0]?.id;
        }

        if (!branchId) {
            res.status(403).json({ error: 'No tienes sucursal asignada' });
            return;
        }

        const result = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE scan_type = 'INGRESO' AND result = 'success') as ingresos_exitosos,
                COUNT(*) FILTER (WHERE scan_type = 'SALIDA' AND result = 'success') as salidas_exitosas,
                COUNT(*) FILTER (WHERE result = 'error') as errores,
                COUNT(*) as total_escaneos
            FROM warehouse_scans
            WHERE branch_id = $1 AND DATE(created_at) = CURRENT_DATE
        `, [branchId]);

        // Paquetes actualmente en bodega
        const inventoryRes = await pool.query(`
            SELECT COUNT(*) as en_bodega
            FROM packages
            WHERE current_branch_id = $1
        `, [branchId]);

        res.json({
            today: {
                ingresos: parseInt(result.rows[0].ingresos_exitosos) || 0,
                salidas: parseInt(result.rows[0].salidas_exitosas) || 0,
                errores: parseInt(result.rows[0].errores) || 0,
                total: parseInt(result.rows[0].total_escaneos) || 0
            },
            inventory: {
                packagesInBranch: parseInt(inventoryRes.rows[0].en_bodega) || 0
            }
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};

// GET /api/warehouse/branches - Listar sucursales
export const getBranches = async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query(`
            SELECT id, name, code, city, allowed_services, is_active
            FROM branches
            WHERE is_active = TRUE
            ORDER BY name
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Error obteniendo sucursales:', error);
        res.status(500).json({ error: 'Error al obtener sucursales' });
    }
};

// POST /api/admin/assign-branch - Asignar empleado a sucursal
export const assignWorkerToBranch = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, branchId } = req.body;

        const result = await pool.query(`
            UPDATE users SET branch_id = $1 WHERE id = $2
            RETURNING id, full_name, branch_id
        `, [branchId, userId]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }

        // Obtener nombre de la sucursal
        const branchRes = await pool.query('SELECT name FROM branches WHERE id = $1', [branchId]);

        res.json({ 
            success: true, 
            message: `Empleado asignado a ${branchRes.rows[0]?.name || 'sucursal'} exitosamente`,
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Error asignando empleado:', error);
        res.status(500).json({ error: 'Error al asignar empleado' });
    }
};

// ============================================
// CRUD DE SUCURSALES (BRANCHES)
// ============================================

// GET /api/admin/branches - Listar todas las sucursales (para admin)
export const getAllBranches = async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query(`
            SELECT id, name, code, city, address, phone, allowed_services, is_active, created_at,
                   latitud, longitud, radio_geocerca_metros, wifi_ssid, wifi_validation_enabled, recibe_pagos
            FROM branches
            ORDER BY name
        `);

        res.json({ branches: result.rows });
    } catch (error) {
        console.error('Error obteniendo sucursales:', error);
        res.status(500).json({ error: 'Error al obtener sucursales' });
    }
};

// POST /api/admin/branches - Crear nueva sucursal
export const createBranch = async (req: Request, res: Response): Promise<void> => {
    try {
        const { 
            name, code, city, address, phone, allowed_services, is_active,
            latitud, longitud, radio_geocerca_metros, wifi_ssid, wifi_validation_enabled
        } = req.body;

        if (!name || !code || !city) {
            res.status(400).json({ error: 'Nombre, código y ciudad son requeridos' });
            return;
        }

        // Verificar que el código no exista
        const existingCode = await pool.query('SELECT id FROM branches WHERE UPPER(code) = UPPER($1)', [code]);
        if (existingCode.rows.length > 0) {
            res.status(400).json({ error: 'Ya existe una sucursal con ese código' });
            return;
        }

        const { recibe_pagos } = req.body;
        
        const result = await pool.query(`
            INSERT INTO branches (name, code, city, address, phone, allowed_services, is_active,
                                  latitud, longitud, radio_geocerca_metros, wifi_ssid, wifi_validation_enabled, recibe_pagos)
            VALUES ($1, UPPER($2), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            name, code, city, address || '', phone || '', allowed_services || [], is_active !== false,
            latitud || null, longitud || null, radio_geocerca_metros || 100, wifi_ssid || null, wifi_validation_enabled || false,
            recibe_pagos !== false
        ]);

        res.json({ 
            success: true, 
            message: 'Sucursal creada exitosamente',
            branch: result.rows[0]
        });
    } catch (error: any) {
        console.error('Error creando sucursal:', error);
        res.status(500).json({ error: 'Error al crear sucursal', details: error.message });
    }
};

// PUT /api/admin/branches/:id - Actualizar sucursal
export const updateBranch = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { 
            name, code, city, address, phone, allowed_services, is_active,
            latitud, longitud, radio_geocerca_metros, wifi_ssid, wifi_validation_enabled, recibe_pagos
        } = req.body;

        console.log('Updating branch:', id, 'with data:', JSON.stringify(req.body));

        // Verificar que el código no exista en otra sucursal
        if (code) {
            const existingCode = await pool.query(
                'SELECT id FROM branches WHERE UPPER(code) = UPPER($1) AND id != $2', 
                [code, id]
            );
            if (existingCode.rows.length > 0) {
                res.status(400).json({ error: 'Ya existe otra sucursal con ese código' });
                return;
            }
        }

        // Convertir allowed_services a array si es necesario
        const servicesArray = Array.isArray(allowed_services) ? allowed_services : 
            (allowed_services ? [allowed_services] : null);

        const result = await pool.query(`
            UPDATE branches SET
                name = COALESCE($1, name),
                code = COALESCE(UPPER($2), code),
                city = COALESCE($3, city),
                address = COALESCE($4, address),
                phone = COALESCE($5, phone),
                allowed_services = COALESCE($6, allowed_services),
                is_active = COALESCE($7, is_active),
                latitud = $8,
                longitud = $9,
                radio_geocerca_metros = COALESCE($10, radio_geocerca_metros),
                wifi_ssid = $11,
                wifi_validation_enabled = COALESCE($12, wifi_validation_enabled),
                recibe_pagos = COALESCE($13, recibe_pagos)
            WHERE id = $14
            RETURNING *
        `, [name, code, city, address, phone, servicesArray, is_active, 
            latitud || null, longitud || null, radio_geocerca_metros, wifi_ssid || null, wifi_validation_enabled, recibe_pagos, id]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Sucursal no encontrada' });
            return;
        }

        res.json({ 
            success: true, 
            message: 'Sucursal actualizada exitosamente',
            branch: result.rows[0]
        });
    } catch (error: any) {
        console.error('Error actualizando sucursal:', error);
        res.status(500).json({ 
            error: 'Error al actualizar sucursal',
            details: error.message || String(error)
        });
    }
};

// DELETE /api/admin/branches/:id - Eliminar sucursal
export const deleteBranch = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Primero remover asignaciones de usuarios
        await pool.query('UPDATE users SET branch_id = NULL WHERE branch_id = $1', [id]);

        // Eliminar la sucursal
        const result = await pool.query('DELETE FROM branches WHERE id = $1 RETURNING name', [id]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Sucursal no encontrada' });
            return;
        }

        res.json({ 
            success: true, 
            message: `Sucursal "${result.rows[0].name}" eliminada exitosamente`
        });
    } catch (error) {
        console.error('Error eliminando sucursal:', error);
        res.status(500).json({ error: 'Error al eliminar sucursal' });
    }
};

// ===========================================
// GEOCERCA - VALIDACIÓN DE UBICACIÓN
// ===========================================

/**
 * Fórmula de Haversine para calcular distancia entre dos puntos geográficos
 * @param lat1 Latitud punto 1
 * @param lon1 Longitud punto 1
 * @param lat2 Latitud punto 2
 * @param lon2 Longitud punto 2
 * @returns Distancia en metros
 */
export const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Radio de la Tierra en metros
    
    const toRad = (deg: number) => deg * (Math.PI / 180);
    
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c; // Distancia en metros
};

// POST /api/attendance/validate-geofence - Validar si el empleado está dentro de la geocerca
export const validateGeofence = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { latitud, longitud, mockLocationDetected, wifiSSID } = req.body;

        if (!userId) {
            res.status(401).json({ error: 'Usuario no autenticado' });
            return;
        }

        if (latitud === undefined || longitud === undefined) {
            res.status(400).json({ error: 'Se requiere latitud y longitud' });
            return;
        }

        // Detectar Mock Location (ubicación falsa)
        if (mockLocationDetected === true) {
            res.status(403).json({ 
                error: '🚫 Se detectó una ubicación simulada (Fake GPS). El check-in no está permitido.',
                code: 'MOCK_LOCATION_DETECTED'
            });
            return;
        }

        // Obtener sucursal del empleado
        const userResult = await pool.query(`
            SELECT u.branch_id, b.name as branch_name, b.latitud as branch_lat, b.longitud as branch_lon,
                   b.radio_geocerca_metros, b.wifi_ssid, b.wifi_validation_enabled
            FROM users u
            JOIN branches b ON u.branch_id = b.id
            WHERE u.id = $1
        `, [userId]);

        if (userResult.rows.length === 0) {
            res.status(400).json({ 
                error: 'No tienes una sucursal asignada. Contacta a tu administrador.',
                code: 'NO_BRANCH_ASSIGNED'
            });
            return;
        }

        const branch = userResult.rows[0];

        // Si la sucursal no tiene coordenadas configuradas, permitir check-in (modo sin geocerca)
        if (!branch.branch_lat || !branch.branch_lon) {
            res.json({
                success: true,
                validated: true,
                method: 'no_geofence',
                message: 'La sucursal no tiene geocerca configurada. Check-in permitido.',
                branch_name: branch.branch_name,
                distance_meters: null
            });
            return;
        }

        // Calcular distancia usando Haversine
        const distanceMeters = haversineDistance(
            latitud, 
            longitud, 
            parseFloat(branch.branch_lat), 
            parseFloat(branch.branch_lon)
        );

        const radioPermitido = branch.radio_geocerca_metros || 100;
        const dentroDelRadio = distanceMeters <= radioPermitido;

        // Plan B: Validación por WiFi si está habilitada
        let validatedByWifi = false;
        if (!dentroDelRadio && branch.wifi_validation_enabled && branch.wifi_ssid && wifiSSID) {
            if (wifiSSID.toLowerCase() === branch.wifi_ssid.toLowerCase()) {
                validatedByWifi = true;
            }
        }

        const isValid = dentroDelRadio || validatedByWifi;

        if (isValid) {
            res.json({
                success: true,
                validated: true,
                method: validatedByWifi ? 'wifi' : 'gps',
                message: validatedByWifi 
                    ? `✅ Validado por conexión WiFi (${branch.wifi_ssid})`
                    : `✅ Estás a ${Math.round(distanceMeters)}m de la sucursal. Check-in permitido.`,
                branch_name: branch.branch_name,
                distance_meters: Math.round(distanceMeters),
                radio_permitido: radioPermitido
            });
        } else {
            res.status(403).json({
                success: false,
                validated: false,
                method: 'gps',
                error: `📍 Parece que no estás en la sucursal. Estás a ${Math.round(distanceMeters)}m (máximo permitido: ${radioPermitido}m). Acércate para registrar tu entrada.`,
                code: 'OUTSIDE_GEOFENCE',
                branch_name: branch.branch_name,
                distance_meters: Math.round(distanceMeters),
                radio_permitido: radioPermitido,
                coordinates: {
                    employee: { lat: latitud, lon: longitud },
                    branch: { lat: parseFloat(branch.branch_lat), lon: parseFloat(branch.branch_lon) }
                }
            });
        }
    } catch (error) {
        console.error('Error validando geocerca:', error);
        res.status(500).json({ error: 'Error al validar ubicación' });
    }
};

// GET /api/branches/:id/geofence - Obtener info de geocerca de una sucursal
export const getBranchGeofence = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT id, name, latitud, longitud, radio_geocerca_metros, 
                   wifi_ssid, wifi_validation_enabled
            FROM branches
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Sucursal no encontrada' });
            return;
        }

        const branch = result.rows[0];
        res.json({
            success: true,
            geofence: {
                branch_id: branch.id,
                branch_name: branch.name,
                latitud: branch.latitud ? parseFloat(branch.latitud) : null,
                longitud: branch.longitud ? parseFloat(branch.longitud) : null,
                radio_metros: branch.radio_geocerca_metros || 100,
                wifi_ssid: branch.wifi_ssid,
                wifi_enabled: branch.wifi_validation_enabled,
                configured: !!(branch.latitud && branch.longitud)
            }
        });
    } catch (error) {
        console.error('Error obteniendo geocerca:', error);
        res.status(500).json({ error: 'Error al obtener información de geocerca' });
    }
};

// ============================================
// VALIDACIÓN DE SUPERVISOR Y RECEPCIÓN DHL
// ============================================

// POST /api/warehouse/validate-supervisor - Validar PIN de supervisor
export const validateSupervisor = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { pin, branch_id, action_type } = req.body;
        const requesterId = req.user?.userId;
        
        if (!pin) {
            res.status(400).json({ error: 'PIN requerido' });
            return;
        }
        
        // Buscar usuario supervisor/gerente con ese PIN en la sucursal
        // El PIN es el campo supervisor_pin en la tabla users
        // Cualquier usuario con PIN válido puede autorizar, sin importar quién esté logueado
        const result = await pool.query(`
            SELECT u.id, u.full_name, u.email, u.role, u.branch_id
            FROM users u
            WHERE u.supervisor_pin = $1
              AND u.role IN ('super_admin', 'admin', 'director', 'gerente_sucursal', 'branch_manager')
            LIMIT 1
        `, [pin]);
        
        if (result.rows.length === 0) {
            console.log(`🔐 [SUPERVISOR] PIN inválido intentado por usuario ${requesterId}`);
            
            // Registrar intento fallido
            await pool.query(`
                INSERT INTO supervisor_authorizations (requester_id, branch_id, action_type, success, ip_address, created_at)
                VALUES ($1, $2, $3, FALSE, $4, NOW())
            `, [requesterId, branch_id || null, action_type || 'dhl_reception', req.ip]);
            
            res.json({ valid: false, message: 'PIN de supervisor incorrecto' });
            return;
        }
        
        const supervisor = result.rows[0];
        console.log(`🔐 [SUPERVISOR] Autorización exitosa: ${supervisor.full_name} (${supervisor.email})`);
        
        // Registrar autorización exitosa
        await pool.query(`
            INSERT INTO supervisor_authorizations (supervisor_id, supervisor_name, requester_id, branch_id, action_type, success, ip_address, created_at)
            VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW())
        `, [supervisor.id, supervisor.full_name, requesterId, branch_id || supervisor.branch_id, action_type || 'dhl_reception', req.ip]);
        
        res.json({
            valid: true,
            supervisor: {
                id: supervisor.id,
                name: supervisor.full_name,
                email: supervisor.email,
                role: supervisor.role
            }
        });
    } catch (error) {
        console.error('Error validando supervisor:', error);
        res.status(500).json({ error: 'Error al validar supervisor' });
    }
};

// POST /api/warehouse/update-supervisor-pin - Actualizar PIN de supervisor
export const updateSupervisorPin = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { current_pin, new_pin } = req.body;
        
        if (!new_pin || new_pin.length < 4) {
            res.status(400).json({ error: 'El nuevo PIN debe tener al menos 4 dígitos' });
            return;
        }
        
        // Verificar que el usuario tiene rol de supervisor/gerente
        const userResult = await pool.query(`
            SELECT id, full_name, role, supervisor_pin 
            FROM users 
            WHERE id = $1 AND role IN ('super_admin', 'admin', 'director', 'gerente_sucursal')
        `, [userId]);
        
        if (userResult.rows.length === 0) {
            res.status(403).json({ error: 'No tienes permisos para tener un PIN de supervisor' });
            return;
        }
        
        const user = userResult.rows[0];
        
        // Si ya tiene PIN, verificar el actual
        if (user.supervisor_pin && current_pin !== user.supervisor_pin) {
            res.status(400).json({ error: 'PIN actual incorrecto' });
            return;
        }
        
        // Verificar que el nuevo PIN no esté en uso por otro supervisor
        const duplicateCheck = await pool.query(`
            SELECT id FROM users WHERE supervisor_pin = $1 AND id != $2
        `, [new_pin, userId]);
        
        if (duplicateCheck.rows.length > 0) {
            res.status(400).json({ error: 'Este PIN ya está en uso por otro supervisor' });
            return;
        }
        
        // Actualizar PIN
        await pool.query(`
            UPDATE users SET supervisor_pin = $1 WHERE id = $2
        `, [new_pin, userId]);
        
        console.log(`🔐 [PIN] ${user.full_name} actualizó su PIN de supervisor`);
        
        res.json({ 
            success: true, 
            message: 'PIN actualizado correctamente'
        });
    } catch (error) {
        console.error('Error actualizando PIN:', error);
        res.status(500).json({ error: 'Error al actualizar PIN' });
    }
};

// GET /api/warehouse/supervisor-authorizations - Historial de autorizaciones
export const getSupervisorAuthorizations = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { branch_id, date_from, date_to, limit = 50 } = req.query;
        const userId = req.user?.userId;
        
        // Verificar permisos (solo admins o gerentes de la sucursal)
        const userResult = await pool.query(`
            SELECT role, branch_id FROM users WHERE id = $1
        `, [userId]);
        
        const { role, branch_id: userBranch } = userResult.rows[0] || {};
        const isAdmin = ['super_admin', 'admin'].includes(role);
        
        let query = `
            SELECT 
                sa.*,
                s.full_name as supervisor_name,
                s.email as supervisor_email,
                r.full_name as requester_name,
                b.name as branch_name
            FROM supervisor_authorizations sa
            LEFT JOIN users s ON sa.supervisor_id = s.id
            LEFT JOIN users r ON sa.requester_id = r.id
            LEFT JOIN branches b ON sa.branch_id = b.id
            WHERE 1=1
        `;
        
        const params: any[] = [];
        let paramIndex = 1;
        
        // Si no es admin, solo ver su sucursal o autorizaciones propias
        if (!isAdmin) {
            query += ` AND (sa.branch_id = $${paramIndex} OR sa.supervisor_id = $${paramIndex + 1})`;
            params.push(userBranch, userId);
            paramIndex += 2;
        } else if (branch_id) {
            query += ` AND sa.branch_id = $${paramIndex}`;
            params.push(branch_id);
            paramIndex++;
        }
        
        if (date_from) {
            query += ` AND sa.created_at >= $${paramIndex}`;
            params.push(date_from);
            paramIndex++;
        }
        
        if (date_to) {
            query += ` AND sa.created_at <= $${paramIndex}`;
            params.push(date_to);
            paramIndex++;
        }
        
        query += ` ORDER BY sa.created_at DESC LIMIT $${paramIndex}`;
        params.push(limit);
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            authorizations: result.rows
        });
    } catch (error) {
        console.error('Error obteniendo autorizaciones:', error);
        res.status(500).json({ error: 'Error al obtener autorizaciones' });
    }
};

// POST /api/warehouse/dhl-reception - Recepción rápida de paquete DHL
export const processDhlReception = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { 
            tracking, 
            weight, 
            pieces, 
            client_name, 
            client_phone, 
            description, 
            branch_id,
            scan_type 
        } = req.body;
        
        const workerId = req.user?.userId;
        
        if (!tracking) {
            res.status(400).json({ error: 'Tracking requerido' });
            return;
        }
        
        console.log(`📦 [DHL] Recepción rápida: ${tracking} - Worker: ${workerId}`);
        
        // Verificar que es una guía DHL válida (10 dígitos)
        if (!/^\d{10}$/.test(tracking)) {
            res.status(400).json({ error: 'Formato de guía DHL inválido. Debe ser 10 dígitos.' });
            return;
        }
        
        // Verificar si ya existe esta guía
        const existing = await pool.query(`
            SELECT id FROM dhl_packages WHERE tracking_number = $1
        `, [tracking]);
        
        if (existing.rows.length > 0) {
            res.status(400).json({ error: 'Esta guía DHL ya fue registrada anteriormente' });
            return;
        }
        
        // Obtener info del trabajador
        const workerRes = await pool.query(`
            SELECT full_name, branch_id FROM users WHERE id = $1
        `, [workerId]);
        
        const workerBranchId = branch_id || workerRes.rows[0]?.branch_id;
        
        // Insertar en tabla de paquetes DHL
        const insertRes = await pool.query(`
            INSERT INTO dhl_packages (
                tracking_number,
                weight_kg,
                pieces,
                client_name,
                client_phone,
                description,
                branch_id,
                received_by,
                received_at,
                status,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'received', NOW())
            RETURNING id
        `, [
            tracking,
            weight || null,
            pieces || 1,
            client_name || 'Cliente DHL',
            client_phone || null,
            description || null,
            workerBranchId,
            workerId
        ]);
        
        const packageId = insertRes.rows[0].id;
        
        // Registrar en historial de escaneos
        await pool.query(`
            INSERT INTO warehouse_scan_history (
                package_id, package_type, tracking_number, scan_type,
                branch_id, scanned_by, scanned_at, notes
            ) VALUES ($1, 'dhl', $2, $3, $4, $5, NOW(), $6)
        `, [
            packageId,
            tracking,
            scan_type || 'INGRESO',
            workerBranchId,
            workerId,
            `Recepción DHL - ${pieces || 1} pieza(s), ${weight || 'peso no especificado'} kg`
        ]);
        
        // Registrar en inventario de sucursal
        await pool.query(`
            INSERT INTO branch_inventory (
                branch_id, package_type, package_id, tracking_number,
                status, received_at, received_by
            ) VALUES ($1, 'dhl', $2, $3, 'in_stock', NOW(), $4)
        `, [workerBranchId, packageId, tracking, workerId]);
        
        console.log(`✅ [DHL] Paquete ${tracking} registrado exitosamente - ID: ${packageId}`);
        
        res.json({
            success: true,
            message: `✅ Paquete DHL ${tracking} recibido correctamente`,
            package: {
                id: packageId,
                tracking,
                client_name: client_name || 'Cliente DHL',
                service_type: 'DHL Express',
                status: 'received'
            }
        });
    } catch (error) {
        console.error('Error en recepción DHL:', error);
        res.status(500).json({ error: 'Error al procesar recepción DHL' });
    }
};

// GET /api/warehouse/inventory - Obtener inventario de sucursal
export const getBranchInventory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { branch_id, status, package_type, needs_instructions, limit = 100, offset = 0 } = req.query;
        const workerId = req.user?.userId;
        
        // Obtener sucursal del usuario o usar la seleccionada
        let branchId = branch_id as string;
        
        if (!branchId) {
            const workerRes = await pool.query(`
                SELECT branch_id, role FROM users WHERE id = $1
            `, [workerId]);
            
            const { branch_id: userBranch, role } = workerRes.rows[0] || {};
            
            if (['super_admin', 'admin'].includes(role) && !userBranch) {
                // Admins pueden ver todo
                branchId = '';
            } else {
                branchId = userBranch;
            }
        }
        
        let query = `
            SELECT 
                bi.id,
                bi.package_type,
                bi.package_id,
                bi.tracking_number,
                bi.status,
                bi.received_at,
                bi.released_at,
                b.name as branch_name,
                b.code as branch_code,
                COALESCE(
                    (SELECT full_name FROM users WHERE id = bi.received_by),
                    'Sistema'
                ) as received_by_name,
                CASE 
                    WHEN bi.package_type = 'dhl' THEN (SELECT client_name FROM dhl_packages WHERE id = bi.package_id)
                    WHEN bi.package_type = 'package' THEN (SELECT u.full_name FROM packages p JOIN users u ON p.user_id = u.id WHERE p.id = bi.package_id)
                    ELSE 'N/A'
                END as client_name,
                CASE 
                    WHEN bi.package_type = 'dhl' THEN (SELECT weight_kg FROM dhl_packages WHERE id = bi.package_id)
                    WHEN bi.package_type = 'package' THEN (SELECT weight FROM packages WHERE id = bi.package_id)
                    ELSE NULL
                END as weight,
                CASE
                    WHEN bi.package_type = 'package' THEN COALESCE((SELECT needs_instructions FROM packages WHERE id = bi.package_id), FALSE)
                    ELSE FALSE
                END as needs_instructions
            FROM branch_inventory bi
            JOIN branches b ON bi.branch_id = b.id
            WHERE 1=1
        `;
        
        const params: any[] = [];
        let paramIndex = 1;
        
        if (branchId) {
            query += ` AND bi.branch_id = $${paramIndex}`;
            params.push(branchId);
            paramIndex++;
        }
        
        if (status) {
            // branch_inventory no tiene in_transit items - esos vienen del UNION
            if (status === 'in_transit') {
                query += ` AND FALSE`; // No hay in_transit en branch_inventory
            } else {
                query += ` AND bi.status = $${paramIndex}`;
                params.push(status);
                paramIndex++;
            }
        } else {
            // En vista "Todos" no incluir paquetes en tránsito
            query += ` AND COALESCE(bi.status, 'in_stock') <> 'in_transit'`;
        }
        
        // Filtro por needs_instructions o package_type (legacy)
        if (needs_instructions === 'true') {
            query += ` AND bi.package_type = 'package' AND EXISTS (SELECT 1 FROM packages WHERE id = bi.package_id AND needs_instructions = TRUE)`;
        } else if (needs_instructions === 'false') {
            query += ` AND (bi.package_type <> 'package' OR NOT EXISTS (SELECT 1 FROM packages WHERE id = bi.package_id AND needs_instructions = TRUE))`;
        } else if (package_type) {
            query += ` AND bi.package_type = $${paramIndex}`;
            params.push(package_type);
            paramIndex++;
        }

        // 🔄 UNION con paquetes que tienen current_branch_id pero aún no están en branch_inventory
        // (retro-compat para paquetes escaneados antes de implementar el upsert)
        query += `
            UNION ALL
            SELECT
                -p.id as id,
                'package' as package_type,
                p.id as package_id,
                COALESCE(p.tracking_internal, ('PKG-' || p.id::text)) as tracking_number,
                CASE
                    WHEN p.status::text IN ('in_transit', 'in_transit_mty') THEN 'in_transit'
                    ELSE 'in_stock'
                END as status,
                COALESCE(p.updated_at, p.created_at) as received_at,
                NULL::timestamp as released_at,
                COALESCE(
                    b2.name,
                    (SELECT name FROM branches WHERE UPPER(code) = 'MTY' AND is_active = TRUE ORDER BY id ASC LIMIT 1),
                    'En tránsito'
                ) as branch_name,
                COALESCE(
                    b2.code,
                    (SELECT code FROM branches WHERE UPPER(code) = 'MTY' AND is_active = TRUE ORDER BY id ASC LIMIT 1),
                    'MTY'
                ) as branch_code,
                'Sistema' as received_by_name,
                (SELECT u.full_name FROM users u WHERE u.id = p.user_id) as client_name,
                p.weight as weight,
                COALESCE(p.needs_instructions, FALSE) as needs_instructions
            FROM packages p
            LEFT JOIN branches b2 ON p.current_branch_id = b2.id
            WHERE (p.current_branch_id IS NOT NULL OR p.status::text IN ('in_transit', 'in_transit_mty'))
                            AND (
                                p.status::text <> 'in_transit'
                                OR COALESCE(UPPER(p.destination_city), '') LIKE '%MONTERREY%'
                                OR COALESCE(UPPER(p.destination_city), '') = 'MTY'
                            )
              AND NOT EXISTS (
                  SELECT 1 FROM branch_inventory bi2
                  WHERE bi2.package_type = 'package' AND bi2.package_id = p.id
              )
        `;
        if (branchId) {
            query += `
              AND (
                p.current_branch_id = $${paramIndex}
                                OR (
                                    (
                                        p.status::text = 'in_transit_mty'
                                        OR (
                                            p.status::text = 'in_transit'
                                            AND (
                                                COALESCE(UPPER(p.destination_city), '') LIKE '%MONTERREY%'
                                                OR COALESCE(UPPER(p.destination_city), '') = 'MTY'
                                            )
                                        )
                                    )
                  AND EXISTS (
                    SELECT 1 FROM branches bx
                    WHERE bx.id = $${paramIndex} AND UPPER(bx.code) = 'MTY'
                  )
                )
              )
            `;
            params.push(branchId);
            paramIndex++;
        }
        if (status === 'in_stock') {
            query += ` AND COALESCE(p.status::text, '') NOT IN ('in_transit', 'in_transit_mty')`;
                } else if (status === 'in_transit') {
                        query += `
                            AND (
                                p.status::text = 'in_transit_mty'
                                OR (
                                    p.status::text = 'in_transit'
                                    AND (
                                        COALESCE(UPPER(p.destination_city), '') LIKE '%MONTERREY%'
                                        OR COALESCE(UPPER(p.destination_city), '') = 'MTY'
                                    )
                                )
                            )
                        `;
        } else if (!status) {
            // En vista "Todos" no incluir en tránsito
            query += ` AND COALESCE(p.status::text, '') NOT IN ('in_transit', 'in_transit_mty')`;
        } else if (status) {
            // En este UNION solo hay in_stock / in_transit
            query += ` AND FALSE`;
        }
        
        // Filtro needs_instructions para UNION
        if (needs_instructions === 'true') {
            query += ` AND p.needs_instructions = TRUE`;
        } else if (needs_instructions === 'false') {
            query += ` AND COALESCE(p.needs_instructions, FALSE) = FALSE`;
        } else if (package_type && package_type !== 'package') {
            query += ` AND FALSE`;
        }
        
        query += ` ORDER BY received_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        const result = await pool.query(query, params);
        
        // Obtener conteos (incluye branch_inventory + paquetes con current_branch_id)
        let countQuery = `
            WITH unified AS (
                SELECT status, package_type, branch_id FROM branch_inventory WHERE status <> 'in_transit'
                UNION ALL
                SELECT
                    CASE
                        WHEN p.status::text IN ('in_transit', 'in_transit_mty') THEN 'in_transit'::varchar
                        ELSE 'in_stock'::varchar
                    END as status,
                    'package'::varchar as package_type,
                    CASE
                        WHEN p.current_branch_id IS NOT NULL THEN p.current_branch_id
                        WHEN p.status::text IN ('in_transit', 'in_transit_mty') THEN (
                            SELECT id FROM branches WHERE UPPER(code) = 'MTY' AND is_active = TRUE ORDER BY id ASC LIMIT 1
                        )
                        ELSE NULL
                    END as branch_id
                FROM packages p
                                WHERE (p.current_branch_id IS NOT NULL OR p.status::text IN ('in_transit', 'in_transit_mty'))
                                    AND (
                                        p.status::text <> 'in_transit'
                                        OR COALESCE(UPPER(p.destination_city), '') LIKE '%MONTERREY%'
                                        OR COALESCE(UPPER(p.destination_city), '') = 'MTY'
                                    )
                  AND NOT EXISTS (
                      SELECT 1 FROM branch_inventory bi2
                      WHERE bi2.package_type = 'package' AND bi2.package_id = p.id
                  )
            )
            SELECT 
                COUNT(*) FILTER (WHERE status <> 'in_transit') as total,
                COUNT(*) FILTER (WHERE status = 'in_stock') as in_stock,
                COUNT(*) FILTER (WHERE status = 'released') as released,
                COUNT(*) FILTER (WHERE status = 'in_transit') as in_transit,
                COUNT(*) FILTER (WHERE package_type = 'dhl') as dhl_count,
                COUNT(*) FILTER (WHERE package_type = 'package') as package_count
            FROM unified
            WHERE 1=1
        `;
        
        const countParams: any[] = [];
        if (branchId) {
            countQuery += ` AND branch_id = $1`;
            countParams.push(branchId);
        }
        
        const countResult = await pool.query(countQuery, countParams);
        const counts = countResult.rows[0];
        
        res.json({
            success: true,
            inventory: result.rows,
            summary: {
                total: parseInt(counts.total),
                in_stock: parseInt(counts.in_stock),
                released: parseInt(counts.released),
                in_transit: parseInt(counts.in_transit),
                by_type: {
                    dhl: parseInt(counts.dhl_count),
                    packages: parseInt(counts.package_count)
                }
            }
        });
    } catch (error) {
        console.error('Error obteniendo inventario:', error);
        res.status(500).json({ error: 'Error al obtener inventario' });
    }
};
