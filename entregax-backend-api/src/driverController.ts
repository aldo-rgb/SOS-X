/**
 * Driver Controller - Controlador para la App del Repartidor
 * Maneja: Carga de unidad (Scan-to-Load), Retorno a bodega, Estado de ruta
 */

import { Request, Response } from 'express';
import { pool } from './db';

// Compatibilidad de esquema: algunos entornos no tienen tracking_number o tracking_provider.
// Con to_jsonb(p)->>'campo' evitamos errores SQL cuando el campo no existe.
const TRACKING_PUBLIC_SQL = `COALESCE(
    to_jsonb(p)->>'tracking_number',
    to_jsonb(p)->>'tracking_internal',
    to_jsonb(p)->>'tracking_provider'
)`;

const TRACKING_MATCH_SQL = `(
    ${TRACKING_PUBLIC_SQL} = $1
    OR to_jsonb(p)->>'skydropx_label_id' = $1
    OR to_jsonb(p)->>'dhl_awb' = $1
    OR REPLACE(UPPER(${TRACKING_PUBLIC_SQL}), '-', '') = REPLACE(UPPER($1), '-', '')
    OR REPLACE(UPPER(COALESCE(to_jsonb(p)->>'skydropx_label_id', '')), '-', '') = REPLACE(UPPER($1), '-', '')
    OR REPLACE(UPPER(COALESCE(to_jsonb(p)->>'dhl_awb', '')), '-', '') = REPLACE(UPPER($1), '-', '')
)`;

const DELIVERY_STATUS_SQL = `COALESCE(
    to_jsonb(p)->>'delivery_status',
    CASE
        WHEN to_jsonb(p)->>'status' = 'in_transit' THEN 'out_for_delivery'
        ELSE to_jsonb(p)->>'status'
    END
)`;

const ASSIGNED_DRIVER_SQL = `to_jsonb(p)->>'assigned_driver_id'`;
const PAYMENT_STATUS_SQL = `COALESCE(LOWER(to_jsonb(p)->>'payment_status'), 'paid')`;
const DELIVERY_ADDRESS_SQL = `COALESCE(to_jsonb(p)->>'delivery_address', to_jsonb(p)->>'destination_address')`;
const DELIVERY_CITY_SQL = `COALESCE(to_jsonb(p)->>'delivery_city', to_jsonb(p)->>'destination_city')`;
const DELIVERY_ZIP_SQL = `COALESCE(to_jsonb(p)->>'delivery_zip', to_jsonb(p)->>'destination_zip')`;
const RECIPIENT_NAME_SQL = `COALESCE(to_jsonb(p)->>'recipient_name', to_jsonb(p)->>'destination_contact')`;
const RECIPIENT_PHONE_SQL = `COALESCE(to_jsonb(p)->>'recipient_phone', to_jsonb(p)->>'destination_phone')`;
const NATIONAL_TRACKING_SQL = `COALESCE(
    to_jsonb(p)->>'national_tracking',
    to_jsonb(p)->>'skydropx_label_id',
    to_jsonb(p)->>'dhl_awb'
)`;
const NATIONAL_CARRIER_SQL = `COALESCE(
    to_jsonb(p)->>'national_carrier',
    to_jsonb(p)->>'carrier'
)`;
const LOADED_AT_SQL = `to_jsonb(p)->>'loaded_at'`;
const HAS_LABEL_SQL = `(
    to_jsonb(p)->>'national_label_url' IS NOT NULL
    OR to_jsonb(p)->>'national_tracking' IS NOT NULL
    OR to_jsonb(p)->>'skydropx_label_id' IS NOT NULL
    OR to_jsonb(p)->>'dhl_awb' IS NOT NULL
)`;

let packageStatusColumnCache: 'delivery_status' | 'status' | null = null;
let packageBranchSqlCache: string | null = null;
const packageColumnsCache = new Set<string>();
let outForDeliveryWriteStatusCache: 'out_for_delivery' | 'in_transit' | null = null;
let inCedisWriteStatusCache: 'in_cedis' | 'received_mty' | null = null;
let sentWriteStatusCache: 'sent' | 'delivered' | null = null;
let pqtxShipmentsTableExistsCache: boolean | null = null;

const getPackageStatusColumn = async (): Promise<'delivery_status' | 'status'> => {
        if (packageStatusColumnCache) return packageStatusColumnCache;

        const result = await pool.query(
                `
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'packages'
                        AND column_name = 'delivery_status'
                    LIMIT 1
                `
        );

        packageStatusColumnCache = result.rows.length > 0 ? 'delivery_status' : 'status';
        return packageStatusColumnCache;
};

const hasPackageColumn = async (columnName: string): Promise<boolean> => {
        if (packageColumnsCache.has(columnName)) return true;

        const result = await pool.query(
                `
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'packages'
                        AND column_name = $1
                    LIMIT 1
                `,
                [columnName]
        );

        const exists = result.rows.length > 0;
        if (exists) packageColumnsCache.add(columnName);
        return exists;
};

    const hasPqtxShipmentsTable = async (): Promise<boolean> => {
        if (pqtxShipmentsTableExistsCache !== null) return pqtxShipmentsTableExistsCache;

        const result = await pool.query(
            `
                SELECT 1
                FROM information_schema.tables
                WHERE table_name = 'pqtx_shipments'
                LIMIT 1
            `
        );

        pqtxShipmentsTableExistsCache = result.rows.length > 0;
        return pqtxShipmentsTableExistsCache;
    };

    const getPaqueteExpressServiceRequestCode = async (nationalTracking: string | null | undefined): Promise<string | null> => {
        const tracking = String(nationalTracking || '').trim();
        if (!tracking) return null;

        const hasTable = await hasPqtxShipmentsTable();
        if (!hasTable) return null;

        try {
            const result = await pool.query(
                `
                    SELECT s.folio_porte
                    FROM pqtx_shipments s
                    WHERE UPPER(s.tracking_number) = UPPER($1)
                      AND COALESCE(s.folio_porte, '') <> ''
                    ORDER BY s.created_at DESC NULLS LAST, s.id DESC
                    LIMIT 1
                `,
                [tracking]
            );

            const rawCode = String(result.rows[0]?.folio_porte || '').trim();
            if (!rawCode) return null;

            const fromToken = rawCode.match(/([A-Z]{2,}\d[A-Z0-9]+)/i);
            const normalized = (fromToken?.[1] || rawCode)
                .replace(/\s+/g, '')
                .toUpperCase();

            return normalized || null;
        } catch (error) {
            console.warn('No se pudo obtener folio_porte desde pqtx_shipments:', error);
            return null;
        }
    };

const getOutForDeliveryWriteStatus = async (): Promise<'out_for_delivery' | 'in_transit'> => {
        const statusColumn = await getPackageStatusColumn();
        if (statusColumn === 'delivery_status') return 'out_for_delivery';

        if (outForDeliveryWriteStatusCache) return outForDeliveryWriteStatusCache;

        const result = await pool.query(
                `
                    SELECT 1
                    FROM pg_type t
                    JOIN pg_enum e ON e.enumtypid = t.oid
                    WHERE t.typname = 'package_status'
                        AND e.enumlabel = 'out_for_delivery'
                    LIMIT 1
                `
        );

        outForDeliveryWriteStatusCache = result.rows.length > 0 ? 'out_for_delivery' : 'in_transit';
        return outForDeliveryWriteStatusCache;
};

const getInCedisWriteStatus = async (): Promise<'in_cedis' | 'received_mty'> => {
        const statusColumn = await getPackageStatusColumn();
        if (statusColumn === 'delivery_status') return 'in_cedis';

        if (inCedisWriteStatusCache) return inCedisWriteStatusCache;

        const result = await pool.query(
                `
                    SELECT 1
                    FROM pg_type t
                    JOIN pg_enum e ON e.enumtypid = t.oid
                    WHERE t.typname = 'package_status'
                        AND e.enumlabel = 'in_cedis'
                    LIMIT 1
                `
        );

        inCedisWriteStatusCache = result.rows.length > 0 ? 'in_cedis' : 'received_mty';
        return inCedisWriteStatusCache;
};

    const getSentWriteStatus = async (): Promise<'sent' | 'delivered'> => {
        const statusColumn = await getPackageStatusColumn();
        if (statusColumn === 'delivery_status') return 'sent';

        if (sentWriteStatusCache) return sentWriteStatusCache;

        const result = await pool.query(
            `
                SELECT 1
                FROM pg_type t
                JOIN pg_enum e ON e.enumtypid = t.oid
                WHERE t.typname = 'package_status'
                AND e.enumlabel = 'sent'
                LIMIT 1
            `
        );

        sentWriteStatusCache = result.rows.length > 0 ? 'sent' : 'delivered';
        return sentWriteStatusCache;
    };

    const getPackageBranchSql = async (alias: string = 'p'): Promise<string> => {
        if (packageBranchSqlCache) {
            return packageBranchSqlCache.split('__ALIAS__').join(alias);
        }

        const result = await pool.query(
            `
              SELECT column_name
              FROM information_schema.columns
              WHERE table_name = 'packages'
                AND column_name IN ('current_branch_id', 'branch_id')
            `
        );

        const cols = new Set(result.rows.map((r: any) => r.column_name));

        if (cols.has('current_branch_id') && cols.has('branch_id')) {
            packageBranchSqlCache = 'COALESCE(__ALIAS__.current_branch_id, __ALIAS__.branch_id)';
        } else if (cols.has('current_branch_id')) {
            packageBranchSqlCache = '__ALIAS__.current_branch_id';
        } else if (cols.has('branch_id')) {
            packageBranchSqlCache = '__ALIAS__.branch_id';
        } else {
            packageBranchSqlCache = 'NULL::int';
        }

        return packageBranchSqlCache.split('__ALIAS__').join(alias);
    };

const getAuthUserId = (req: Request): number | null => {
    const rawId = (req as any).user?.id ?? (req as any).user?.userId;
    const id = Number(rawId);
    return Number.isFinite(id) && id > 0 ? id : null;
};

const getDriverBranchId = async (driverId: number): Promise<number | null> => {
    const userRes = await pool.query('SELECT branch_id FROM users WHERE id = $1', [driverId]);
    const branchId = Number(userRes.rows[0]?.branch_id);
    return Number.isFinite(branchId) && branchId > 0 ? branchId : null;
};

// ============================================================================
// SCAN TO LOAD - Escaneo para carga de unidad
// ============================================================================

/**
 * Escanear paquete para cargar a la unidad del chofer
 * Valida: existencia, asignación correcta, no duplicados
 */
export const scanPackageToLoad = async (req: Request, res: Response): Promise<any> => {
    const { barcode } = req.body;
    const driverId = getAuthUserId(req);

    if (!barcode) {
        return res.status(400).json({ error: '❌ Código de barras requerido.' });
    }

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const packageBranchSql = await getPackageBranchSql('p');

        // 1. BUSCAR EL PAQUETE POR TRACKING NUMBER O CÓDIGO DE BARRAS
        // Hacemos LEFT JOIN con master para que las hijas hereden payment/label del master.
        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                ${TRACKING_PUBLIC_SQL} as tracking_number,
                ${ASSIGNED_DRIVER_SQL} as assigned_driver_id,
                ${DELIVERY_STATUS_SQL} as delivery_status,
                ${LOADED_AT_SQL} as loaded_at,
                COALESCE(LOWER(to_jsonb(p)->>'payment_status'), LOWER(to_jsonb(m)->>'payment_status'), 'paid') as payment_status,
                COALESCE(to_jsonb(p)->>'national_label_url', to_jsonb(m)->>'national_label_url') as national_label_url,
                COALESCE(to_jsonb(p)->>'national_tracking', to_jsonb(m)->>'national_tracking') as national_tracking,
                COALESCE(to_jsonb(p)->>'skydropx_label_id', to_jsonb(m)->>'skydropx_label_id') as skydropx_label_id,
                COALESCE(to_jsonb(p)->>'dhl_awb', to_jsonb(m)->>'dhl_awb') as dhl_awb,
                ${packageBranchSql} as package_branch_id,
                NULL::text as driver_name,
                NULL::text as client_name,
                NULL::text as client_email
            FROM packages p
            LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
            WHERE ${TRACKING_MATCH_SQL}
        `, [barcode]);

        if (pkgRes.rows.length === 0) {
            return res.status(404).json({ 
                error: '❌ Código no encontrado en el sistema.',
                barcode 
            });
        }

        const pkg = pkgRes.rows[0];

        const isPaid = String(pkg.payment_status || '').toLowerCase() === 'paid';
        const hasLabel = Boolean(pkg.national_label_url || pkg.national_tracking || pkg.skydropx_label_id || pkg.dhl_awb);

        if (!isPaid || !hasLabel) {
            return res.status(400).json({
                error: '⚠️ Este paquete aún no está listo para reparto (debe estar pagado y etiquetado).',
                paymentStatus: pkg.payment_status || 'pending',
                hasLabel,
                barcode
            });
        }

        // 2. REGLA DE SEGURIDAD: ¿Le toca a este chofer?
        if (pkg.assigned_driver_id && Number(pkg.assigned_driver_id) !== driverId) {
            // Obtener nombre del chofer asignado para el mensaje
            const assignedDriverName = pkg.driver_name || 'otro chofer';
            return res.status(403).json({ 
                error: `⛔ ALTO: Este paquete está asignado a ${assignedDriverName}. Devuélvelo a bodega.`,
                assignedTo: assignedDriverName,
                barcode
            });
        }

        // Si no está asignado, permitirlo solo si pertenece a la sucursal del chofer
        if (!pkg.assigned_driver_id) {
            const driverBranchId = await getDriverBranchId(driverId);
            if (!driverBranchId || Number(pkg.package_branch_id) !== driverBranchId) {
                return res.status(403).json({
                    error: '⛔ Este paquete no pertenece a tu sucursal asignada.',
                    barcode
                });
            }
        }

        // 3. REGLA DE DUPLICIDAD: ¿Ya lo había escaneado?
        if (pkg.delivery_status === 'out_for_delivery' && pkg.loaded_at) {
            return res.status(400).json({ 
                error: '⚠️ Este paquete ya está cargado en tu unidad.',
                loadedAt: pkg.loaded_at,
                barcode
            });
        }

        // 4. VALIDAR QUE EL PAQUETE ESTÉ EN ESTADO CORRECTO PARA CARGAR
        const validStatusesToLoad = ['in_cedis', 'ready_for_pickup', 'assigned', 'received_mty', 'inspected', 'pending_inspection', 'returned_to_warehouse'];
        if (!validStatusesToLoad.includes(pkg.delivery_status) && pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no puede cargarse. Estado actual: ${pkg.delivery_status}`,
                currentStatus: pkg.delivery_status,
                barcode
            });
        }

        // 5. MARCAR COMO CARGADO (OUT FOR DELIVERY)
        const statusColumn = await getPackageStatusColumn();
        const outForDeliveryStatus = await getOutForDeliveryWriteStatus();
        const hasAssignedDriverColumn = await hasPackageColumn('assigned_driver_id');
        const hasLoadedAtColumn = await hasPackageColumn('loaded_at');

        const setParts: string[] = [`${statusColumn} = '${outForDeliveryStatus}'`, 'updated_at = NOW()'];
        const values: any[] = [pkg.id];

        if (hasAssignedDriverColumn) {
            values.push(driverId);
            setParts.push(`assigned_driver_id = COALESCE(assigned_driver_id, $${values.length})`);
        }

        if (hasLoadedAtColumn) {
            setParts.push('loaded_at = NOW()');
        }

        await pool.query(
            `UPDATE packages SET ${setParts.join(', ')} WHERE id = $1`,
            values
        );

        // 6. REGISTRAR EN HISTORIAL DE PAQUETE
        try {
            await pool.query(`
                INSERT INTO package_history (package_id, status, notes, created_by, created_at)
                VALUES ($1, 'out_for_delivery', 'Paquete cargado en unidad de reparto', $2, NOW())
            `, [pkg.id, driverId]);
        } catch (historyError) {
            console.warn('No se pudo registrar package_history en scanPackageToLoad:', historyError);
        }

        // TODO: Enviar notificación al cliente
        // await sendPushNotification(pkg.client_id, '🚚 En Camino', 'Tu paquete ha sido cargado en la unidad de reparto.');

        return res.json({ 
            success: true, 
            message: '✅ Paquete cargado correctamente.',
            package: {
                id: pkg.id,
                trackingNumber: pkg.tracking_number,
                clientName: pkg.client_name
            }
        });

    } catch (error) {
        console.error('Error en scanPackageToLoad:', error);
        res.status(500).json({ error: 'Error al procesar la carga.' });
    }
};

// ============================================================================
// ROUTE INFO - Información de la ruta del día
// ============================================================================

/**
 * Obtener resumen de la ruta del chofer para hoy
 * Incluye: total asignados, cargados, entregados, pendientes
 */
export const getDriverRouteToday = async (req: Request, res: Response): Promise<any> => {
    const driverId = getAuthUserId(req);

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const driverBranchId = await getDriverBranchId(driverId);
        const packageBranchSql = await getPackageBranchSql('p');
        const hasAssignedDriverColumn = await hasPackageColumn('assigned_driver_id');

        // Si el repartidor tiene sucursal, mostrar paquetes listos de su CEDIS
        // (pagados + etiquetados) tal como se ve en panel de etiquetado.
        const pendingRes = driverBranchId
            ? await pool.query(`
                SELECT 
                    p.id,
                    ${TRACKING_PUBLIC_SQL} as tracking_number,
                    ${DELIVERY_STATUS_SQL} as delivery_status,
                    ${DELIVERY_ADDRESS_SQL} as delivery_address,
                    ${DELIVERY_CITY_SQL} as delivery_city,
                    ${DELIVERY_ZIP_SQL} as delivery_zip,
                    ${RECIPIENT_NAME_SQL} as recipient_name,
                    ${RECIPIENT_PHONE_SQL} as recipient_phone
                FROM packages p
                WHERE ${packageBranchSql} = $1
                  AND ${DELIVERY_STATUS_SQL} IN ('in_cedis', 'ready_for_pickup', 'assigned', 'received_mty', 'inspected', 'pending_inspection', 'returned_to_warehouse')
                  AND ${PAYMENT_STATUS_SQL} = 'paid'
                                    AND ${HAS_LABEL_SQL}
                ORDER BY p.updated_at ASC NULLS LAST, p.created_at ASC
            `, [driverBranchId])
            : await pool.query(`
                SELECT 
                    p.id,
                    ${TRACKING_PUBLIC_SQL} as tracking_number,
                    ${DELIVERY_STATUS_SQL} as delivery_status,
                    ${DELIVERY_ADDRESS_SQL} as delivery_address,
                    ${DELIVERY_CITY_SQL} as delivery_city,
                    ${DELIVERY_ZIP_SQL} as delivery_zip,
                    ${RECIPIENT_NAME_SQL} as recipient_name,
                    ${RECIPIENT_PHONE_SQL} as recipient_phone
                FROM packages p
                WHERE ${ASSIGNED_DRIVER_SQL} = $1::text
                  AND ${DELIVERY_STATUS_SQL} IN ('in_cedis', 'ready_for_pickup', 'assigned', 'received_mty', 'inspected', 'pending_inspection', 'returned_to_warehouse')
                ORDER BY p.created_at ASC
            `, [driverId]);

        // Obtener lista de paquetes ya cargados (out for delivery)
        const loadedRes = hasAssignedDriverColumn
            ? await pool.query(`
                SELECT 
                    p.id,
                    ${TRACKING_PUBLIC_SQL} as tracking_number,
                    ${DELIVERY_STATUS_SQL} as delivery_status,
                    ${DELIVERY_ADDRESS_SQL} as delivery_address,
                    ${DELIVERY_CITY_SQL} as delivery_city,
                    ${DELIVERY_ZIP_SQL} as delivery_zip,
                    ${RECIPIENT_NAME_SQL} as recipient_name,
                    ${RECIPIENT_PHONE_SQL} as recipient_phone,
                    ${LOADED_AT_SQL} as loaded_at,
                    ${NATIONAL_TRACKING_SQL} as national_tracking,
                    ${NATIONAL_CARRIER_SQL} as national_carrier
                FROM packages p
                WHERE ${ASSIGNED_DRIVER_SQL} = $1::text
                  AND ${DELIVERY_STATUS_SQL} = 'out_for_delivery'
                ORDER BY p.updated_at ASC, p.created_at ASC
            `, [driverId])
            : driverBranchId
                ? await pool.query(`
                    SELECT 
                        p.id,
                        ${TRACKING_PUBLIC_SQL} as tracking_number,
                        ${DELIVERY_STATUS_SQL} as delivery_status,
                        ${DELIVERY_ADDRESS_SQL} as delivery_address,
                        ${DELIVERY_CITY_SQL} as delivery_city,
                        ${DELIVERY_ZIP_SQL} as delivery_zip,
                        ${RECIPIENT_NAME_SQL} as recipient_name,
                        ${RECIPIENT_PHONE_SQL} as recipient_phone,
                        ${LOADED_AT_SQL} as loaded_at,
                        ${NATIONAL_TRACKING_SQL} as national_tracking,
                        ${NATIONAL_CARRIER_SQL} as national_carrier
                    FROM packages p
                    WHERE ${packageBranchSql} = $1
                      AND ${DELIVERY_STATUS_SQL} = 'out_for_delivery'
                    ORDER BY p.updated_at ASC, p.created_at ASC
                `, [driverBranchId])
                : { rows: [] as any[] };

                const deliveredTodayRes = hasAssignedDriverColumn
                    ? await pool.query(`
                            SELECT COUNT(*) as delivered_today
                            FROM packages p
                            WHERE to_jsonb(p)->>'assigned_driver_id' = $1::text
                                AND COALESCE(to_jsonb(p)->>'delivery_status', to_jsonb(p)->>'status') IN ('delivered', 'sent')
                                AND DATE(p.updated_at) = CURRENT_DATE
                    `, [driverId])
                    : { rows: [{ delivered_today: '0' }] };

                const deliveredToday = parseInt(deliveredTodayRes.rows[0]?.delivered_today) || 0;
                const pendingToLoad = pendingRes.rows.length;
                const loadedToday = loadedRes.rows.length;
                const totalAssigned = pendingToLoad + loadedToday + deliveredToday;

        return res.json({
            success: true,
            route: {
                                totalAssigned,
                                loadedToday,
                                deliveredToday,
                                pendingToLoad,
                pendingPackages: pendingRes.rows,
                loadedPackages: loadedRes.rows
            }
        });

    } catch (error) {
        console.error('Error en getDriverRouteToday:', error);
        res.status(500).json({ error: 'Error al obtener información de ruta.' });
    }
};

// ============================================================================
// RETURN TO WAREHOUSE - Escaneo de retorno a bodega
// ============================================================================

/**
 * Escanear paquete al regresar a bodega (no entregado)
 * Devuelve el paquete al inventario del CEDIS
 */
export const scanPackageReturn = async (req: Request, res: Response): Promise<any> => {
    const { barcode, returnReason } = req.body;
    const driverId = getAuthUserId(req);

    if (!barcode) {
        return res.status(400).json({ error: '❌ Código de barras requerido.' });
    }

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    // Razones válidas de retorno
    const validReasons = [
        'client_not_home',      // Cliente no estaba
        'wrong_address',        // Dirección incorrecta
        'client_refused',       // Cliente rechazó
        'damaged_package',      // Paquete dañado
        'reschedule_requested', // Reprogramación solicitada
        'access_denied',        // No se pudo acceder
        'other'                 // Otro
    ];

    const reason = returnReason || 'client_not_home';

    try {
        const packageBranchSql = await getPackageBranchSql('p');

        // 1. BUSCAR EL PAQUETE
        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                ${TRACKING_PUBLIC_SQL} as tracking_number,
                ${ASSIGNED_DRIVER_SQL} as assigned_driver_id,
                ${DELIVERY_STATUS_SQL} as delivery_status,
                ${packageBranchSql} as package_branch_id
            FROM packages p
            WHERE ${TRACKING_MATCH_SQL}
        `, [barcode]);

        if (pkgRes.rows.length === 0) {
            return res.status(404).json({ 
                error: '❌ Código no encontrado en el sistema.',
                barcode 
            });
        }

        const pkg = pkgRes.rows[0];

        // 2. VALIDAR QUE SEA DEL CHOFER QUE LO TENÍA
        if (pkg.assigned_driver_id && Number(pkg.assigned_driver_id) !== driverId) {
            return res.status(403).json({ 
                error: '⛔ Este paquete no estaba asignado a ti.',
                barcode
            });
        }

        if (!pkg.assigned_driver_id) {
            const driverBranchId = await getDriverBranchId(driverId);
            if (!driverBranchId || Number(pkg.package_branch_id) !== driverBranchId) {
                return res.status(403).json({
                    error: '⛔ Este paquete no pertenece a tu sucursal asignada.',
                    barcode
                });
            }
        }

        // 3. VALIDAR QUE ESTABA EN RUTA
        if (pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no estaba en ruta. Estado: ${pkg.delivery_status}`,
                currentStatus: pkg.delivery_status,
                barcode
            });
        }

        // 4. DEVOLVER A BODEGA
        const statusColumn = await getPackageStatusColumn();
        const returnStatus = 'returned_to_warehouse';
        const hasLoadedAtColumn = await hasPackageColumn('loaded_at');
        const hasReturnReasonColumn = await hasPackageColumn('return_reason');
        const hasReturnCountColumn = await hasPackageColumn('return_count');

        const setParts: string[] = [`${statusColumn} = '${returnStatus}'`, 'updated_at = NOW()'];
        const values: any[] = [pkg.id];

        if (hasLoadedAtColumn) {
            setParts.push('loaded_at = NULL');
        }

        if (hasReturnReasonColumn) {
            values.push(reason);
            setParts.push(`return_reason = $${values.length}`);
        }

        if (hasReturnCountColumn) {
            setParts.push('return_count = COALESCE(return_count, 0) + 1');
        }

        await pool.query(
            `UPDATE packages SET ${setParts.join(', ')} WHERE id = $1`,
            values
        );

        // 5. REGISTRAR EN HISTORIAL
        const reasonLabels: Record<string, string> = {
            'client_not_home': 'Cliente no estaba en domicilio',
            'wrong_address': 'Dirección incorrecta o no encontrada',
            'client_refused': 'Cliente rechazó el paquete',
            'damaged_package': 'Paquete dañado',
            'reschedule_requested': 'Cliente solicitó reprogramación',
            'access_denied': 'No se pudo acceder al domicilio',
            'other': 'Otro motivo'
        };

        try {
            await pool.query(`
                INSERT INTO package_history (package_id, status, notes, created_by, created_at)
                VALUES ($1, 'returned_to_warehouse', $2, $3, NOW())
            `, [pkg.id, `Retornado a CEDIS: ${reasonLabels[reason] || reason}`, driverId]);
        } catch (historyError) {
            console.warn('No se pudo registrar package_history en scanPackageReturn:', historyError);
        }

        return res.json({ 
            success: true, 
            message: '✅ Paquete devuelto a bodega correctamente.',
            package: {
                id: pkg.id,
                trackingNumber: pkg.tracking_number,
                returnReason: reason,
                reasonLabel: reasonLabels[reason] || reason
            }
        });

    } catch (error) {
        console.error('Error en scanPackageReturn:', error);
        res.status(500).json({ error: 'Error al procesar el retorno.' });
    }
};

/**
 * Obtener resumen de paquetes a retornar
 * Lista todos los paquetes que el chofer tiene como out_for_delivery
 */
export const getPackagesToReturn = async (req: Request, res: Response): Promise<any> => {
    const driverId = getAuthUserId(req);

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const hasAssignedDriverColumn = await hasPackageColumn('assigned_driver_id');
        const driverBranchId = await getDriverBranchId(driverId);
        const packageBranchSql = await getPackageBranchSql('p');

        const packagesRes = hasAssignedDriverColumn
            ? await pool.query(`
                SELECT 
                    p.id,
                    ${TRACKING_PUBLIC_SQL} as tracking_number,
                    ${DELIVERY_ADDRESS_SQL} as delivery_address,
                    ${DELIVERY_CITY_SQL} as delivery_city,
                    ${RECIPIENT_NAME_SQL} as recipient_name,
                    ${LOADED_AT_SQL} as loaded_at
                FROM packages p
                WHERE ${ASSIGNED_DRIVER_SQL} = $1::text
                    AND ${DELIVERY_STATUS_SQL} = 'out_for_delivery'
                ORDER BY p.updated_at ASC, p.created_at ASC
            `, [driverId])
            : driverBranchId
                ? await pool.query(`
                    SELECT 
                        p.id,
                        ${TRACKING_PUBLIC_SQL} as tracking_number,
                        ${DELIVERY_ADDRESS_SQL} as delivery_address,
                        ${DELIVERY_CITY_SQL} as delivery_city,
                        ${RECIPIENT_NAME_SQL} as recipient_name,
                        ${LOADED_AT_SQL} as loaded_at
                    FROM packages p
                    WHERE ${packageBranchSql} = $1
                        AND ${DELIVERY_STATUS_SQL} = 'out_for_delivery'
                    ORDER BY p.updated_at ASC, p.created_at ASC
                `, [driverBranchId])
                : { rows: [] as any[] };

        return res.json({
            success: true,
            totalToReturn: packagesRes.rows.length,
            packages: packagesRes.rows
        });

    } catch (error) {
        console.error('Error en getPackagesToReturn:', error);
        res.status(500).json({ error: 'Error al obtener paquetes pendientes.' });
    }
};

// ============================================================================
// DELIVERY CONFIRMATION - Confirmar entrega
// ============================================================================

/**
 * Confirmar entrega de un paquete
 * Incluye: firma digital, foto de evidencia
 */
export const confirmDelivery = async (req: Request, res: Response): Promise<any> => {
    const { barcode, signatureBase64, photoBase64, recipientName, notes } = req.body;
    const driverId = getAuthUserId(req);
    const recipientNameTrimmed = String(recipientName || '').trim();

    if (!barcode) {
        return res.status(400).json({ error: '❌ Código de barras requerido.' });
    }

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const packageBranchSql = await getPackageBranchSql('p');

        // 1. BUSCAR EL PAQUETE (con herencia de master para hijas)
        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                ${TRACKING_PUBLIC_SQL} as tracking_number,
                ${ASSIGNED_DRIVER_SQL} as assigned_driver_id,
                ${DELIVERY_STATUS_SQL} as delivery_status,
                ${packageBranchSql} as package_branch_id,
                COALESCE(
                    to_jsonb(p)->>'national_tracking',
                    to_jsonb(p)->>'skydropx_label_id',
                    to_jsonb(p)->>'dhl_awb',
                    to_jsonb(m)->>'national_tracking',
                    to_jsonb(m)->>'skydropx_label_id',
                    to_jsonb(m)->>'dhl_awb'
                ) as national_tracking,
                COALESCE(
                    to_jsonb(p)->>'national_carrier',
                    to_jsonb(p)->>'carrier',
                    to_jsonb(m)->>'national_carrier',
                    to_jsonb(m)->>'carrier'
                ) as national_carrier,
                NULL::int as client_id
            FROM packages p
            LEFT JOIN packages m ON m.id = (to_jsonb(p)->>'master_id')::int
            WHERE ${TRACKING_MATCH_SQL}
        `, [barcode]);

        if (pkgRes.rows.length === 0) {
            return res.status(404).json({ 
                error: '❌ Código no encontrado.',
                barcode 
            });
        }

        const pkg = pkgRes.rows[0];
        const nationalCarrier = String(pkg.national_carrier || '').toLowerCase();
        const isEntregaLocal = nationalCarrier.includes('entregax') || nationalCarrier.includes('local');
        const requiresCarrierGuideScan = !!pkg.national_tracking && !isEntregaLocal;

        if (!requiresCarrierGuideScan && !recipientNameTrimmed) {
            return res.status(400).json({ error: '❌ El nombre de quien recibe es obligatorio.' });
        }

        // 2. VALIDAR ASIGNACIÓN
        if (pkg.assigned_driver_id && Number(pkg.assigned_driver_id) !== driverId) {
            return res.status(403).json({ 
                error: '⛔ Este paquete no está asignado a ti.',
                barcode
            });
        }

        if (!pkg.assigned_driver_id) {
            const driverBranchId = await getDriverBranchId(driverId);
            if (!driverBranchId || Number(pkg.package_branch_id) !== driverBranchId) {
                return res.status(403).json({
                    error: '⛔ Este paquete no pertenece a tu sucursal asignada.',
                    barcode
                });
            }
        }

        // 3. VALIDAR ESTADO
        if (pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no está en ruta. Estado: ${pkg.delivery_status}`,
                barcode
            });
        }

        // 4. MARCAR COMO ENTREGADO (compatible con esquema legacy)
        // Para paquetería externa usar 'sent' cuando el esquema lo soporte; en legacy usar 'delivered'.
        const finalStatus = requiresCarrierGuideScan
            ? await getSentWriteStatus()
            : 'delivered';
        const statusColumn = await getPackageStatusColumn();
        const hasDeliveredAtColumn = await hasPackageColumn('delivered_at');
        const hasDeliverySignatureColumn = await hasPackageColumn('delivery_signature');
        const hasDeliveryPhotoColumn = await hasPackageColumn('delivery_photo');
        const hasDeliveryRecipientNameColumn = await hasPackageColumn('delivery_recipient_name');
        const hasDeliveryNotesColumn = await hasPackageColumn('delivery_notes');

        const setParts: string[] = [`${statusColumn} = '${finalStatus}'`, 'updated_at = NOW()'];
        const values: any[] = [pkg.id];

        if (hasDeliveredAtColumn) {
            setParts.push('delivered_at = NOW()');
        }

        if (hasDeliverySignatureColumn && signatureBase64) {
            values.push(signatureBase64);
            setParts.push(`delivery_signature = $${values.length}`);
        }

        if (hasDeliveryPhotoColumn && photoBase64) {
            values.push(photoBase64);
            setParts.push(`delivery_photo = $${values.length}`);
        }

        if (hasDeliveryRecipientNameColumn && recipientNameTrimmed) {
            values.push(recipientNameTrimmed);
            setParts.push(`delivery_recipient_name = $${values.length}`);
        }

        if (hasDeliveryNotesColumn && notes) {
            values.push(notes);
            setParts.push(`delivery_notes = $${values.length}`);
        }

        await pool.query(
            `UPDATE packages SET ${setParts.join(', ')} WHERE id = $1`,
            values
        );

        // 5. REGISTRAR EN HISTORIAL
        try {
            const historyNote = requiresCarrierGuideScan
                ? `Entrega validada con guía de paquetería: ${pkg.national_tracking}. ${notes || ''}`
                : `Entregado a: ${recipientNameTrimmed}. ${notes || ''}`;

            await pool.query(`
                INSERT INTO package_history (package_id, status, notes, created_by, created_at)
                VALUES ($1, $2, $3, $4, NOW())
            `, [pkg.id, finalStatus, historyNote, driverId]);
        } catch (historyError) {
            console.warn('No se pudo registrar package_history en confirmDelivery:', historyError);
        }

        // TODO: Notificar al cliente
        // await sendDeliveryConfirmationEmail(pkg.client_id, pkg.tracking_number);

        return res.json({ 
            success: true, 
            message: '✅ Entrega confirmada exitosamente.',
            package: {
                id: pkg.id,
                trackingNumber: pkg.tracking_number,
                deliveredAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error en confirmDelivery:', error);
        res.status(500).json({ error: 'Error al confirmar entrega.' });
    }
};

/**
 * Obtener historial de entregas del día
 */
export const getDeliveriesToday = async (req: Request, res: Response): Promise<any> => {
    const driverId = getAuthUserId(req);

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const deliveriesRes = await pool.query(`
            SELECT 
                                p.id,
                                ${TRACKING_PUBLIC_SQL} as tracking_number,
                                p.delivery_address,
                                p.delivery_city,
                                p.recipient_name,
                                p.delivery_recipient_name,
                                p.delivered_at
                        FROM packages p
                        WHERE p.assigned_driver_id = $1 
                            AND ${DELIVERY_STATUS_SQL} = 'delivered'
                            AND DATE(p.delivered_at) = CURRENT_DATE
                        ORDER BY p.delivered_at DESC
        `, [driverId]);

        return res.json({
            success: true,
            totalDelivered: deliveriesRes.rows.length,
            deliveries: deliveriesRes.rows
        });

    } catch (error) {
        console.error('Error en getDeliveriesToday:', error);
        res.status(500).json({ error: 'Error al obtener entregas.' });
    }
};

// ============================================================================
// VERIFY PACKAGE - Verificar paquete para entrega
// ============================================================================

/**
 * Verificar que un paquete existe y está asignado al repartidor
 * Se usa antes de iniciar el proceso de confirmación de entrega
 */
export const verifyPackageForDelivery = async (req: Request, res: Response): Promise<any> => {
    const { barcode } = req.params;
    const driverId = getAuthUserId(req);

    if (!barcode) {
        return res.status(400).json({ error: '❌ Código de barras requerido.' });
    }

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const packageBranchSql = await getPackageBranchSql('p');

        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                ${TRACKING_PUBLIC_SQL} as tracking_number,
                ${ASSIGNED_DRIVER_SQL} as assigned_driver_id,
                ${DELIVERY_STATUS_SQL} as delivery_status,
                ${packageBranchSql} as package_branch_id,
                ${DELIVERY_ADDRESS_SQL} as delivery_address,
                ${DELIVERY_CITY_SQL} as delivery_city,
                ${DELIVERY_ZIP_SQL} as delivery_zip,
                ${RECIPIENT_NAME_SQL} as recipient_name,
                ${RECIPIENT_PHONE_SQL} as recipient_phone,
                ${NATIONAL_TRACKING_SQL} as national_tracking,
                ${NATIONAL_CARRIER_SQL} as national_carrier
            FROM packages p
            WHERE (${TRACKING_MATCH_SQL})
        `, [barcode]);

        if (pkgRes.rows.length === 0) {
            return res.status(404).json({ 
                error: '❌ Paquete no encontrado o no está asignado a ti.',
                barcode 
            });
        }

        const pkg = pkgRes.rows[0];

        if (pkg.assigned_driver_id && Number(pkg.assigned_driver_id) !== driverId) {
            return res.status(403).json({ 
                error: '⛔ Este paquete no está asignado a ti.',
                barcode
            });
        }

        if (!pkg.assigned_driver_id) {
            const driverBranchId = await getDriverBranchId(driverId);
            if (!driverBranchId || Number(pkg.package_branch_id) !== driverBranchId) {
                return res.status(403).json({
                    error: '⛔ Este paquete no pertenece a tu sucursal asignada.',
                    barcode
                });
            }
        }

        // Verificar que esté en estado para entregar
        if (pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no está en ruta. Estado: ${pkg.delivery_status}`,
                currentStatus: pkg.delivery_status,
                barcode
            });
        }

        const nationalCarrier = String(pkg.national_carrier || '').toLowerCase();
        const isEntregaLocal = nationalCarrier.includes('entregax') || nationalCarrier.includes('local');
        const requiresCarrierGuideScan = !!pkg.national_tracking && !isEntregaLocal;
        const isPaqueteExpress = nationalCarrier.includes('paquete express') || nationalCarrier.includes('paquetexpress');
        const carrierServiceRequestCode = isPaqueteExpress
            ? await getPaqueteExpressServiceRequestCode(pkg.national_tracking)
            : null;

        return res.json({
            success: true,
            package: {
                id: pkg.id,
                tracking_number: pkg.tracking_number,
                recipient_name: pkg.recipient_name,
                recipient_phone: pkg.recipient_phone,
                delivery_address: pkg.delivery_address,
                delivery_city: pkg.delivery_city,
                delivery_zip: pkg.delivery_zip,
                delivery_status: pkg.delivery_status,
                national_tracking: pkg.national_tracking,
                national_carrier: pkg.national_carrier,
                carrier_service_request_code: carrierServiceRequestCode,
                requires_carrier_scan: requiresCarrierGuideScan
            }
        });

    } catch (error) {
        console.error('Error en verifyPackageForDelivery:', error);
        res.status(500).json({ error: 'Error al verificar paquete.' });
    }
};