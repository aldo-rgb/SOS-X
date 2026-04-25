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
    OR p.skydropx_label_id = $1
    OR p.dhl_awb = $1
)`;

const DELIVERY_STATUS_SQL = `COALESCE(
    to_jsonb(p)->>'delivery_status',
    to_jsonb(p)->>'status'
)`;

const ASSIGNED_DRIVER_SQL = `to_jsonb(p)->>'assigned_driver_id'`;
const PAYMENT_STATUS_SQL = `COALESCE(LOWER(to_jsonb(p)->>'payment_status'), 'paid')`;
const DELIVERY_ADDRESS_SQL = `COALESCE(to_jsonb(p)->>'delivery_address', to_jsonb(p)->>'destination_address')`;
const DELIVERY_CITY_SQL = `COALESCE(to_jsonb(p)->>'delivery_city', to_jsonb(p)->>'destination_city')`;
const DELIVERY_ZIP_SQL = `COALESCE(to_jsonb(p)->>'delivery_zip', to_jsonb(p)->>'destination_zip')`;
const RECIPIENT_NAME_SQL = `COALESCE(to_jsonb(p)->>'recipient_name', to_jsonb(p)->>'destination_contact')`;
const RECIPIENT_PHONE_SQL = `COALESCE(to_jsonb(p)->>'recipient_phone', to_jsonb(p)->>'destination_phone')`;
const LOADED_AT_SQL = `to_jsonb(p)->>'loaded_at'`;
const HAS_LABEL_SQL = `(
    to_jsonb(p)->>'national_label_url' IS NOT NULL
    OR to_jsonb(p)->>'national_tracking' IS NOT NULL
    OR to_jsonb(p)->>'skydropx_label_id' IS NOT NULL
    OR to_jsonb(p)->>'dhl_awb' IS NOT NULL
)`;

let packageStatusColumnCache: 'delivery_status' | 'status' | null = null;
let packageBranchSqlCache: string | null = null;

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
        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
            ${TRACKING_PUBLIC_SQL} as tracking_number,
                p.assigned_driver_id, 
                ${DELIVERY_STATUS_SQL} as delivery_status,
                p.loaded_at,
                p.client_id,
                p.payment_status,
                p.national_label_url,
                p.national_tracking,
                p.skydropx_label_id,
                p.dhl_awb,
                ${packageBranchSql} as package_branch_id,
                u.full_name as driver_name,
                c.full_name as client_name,
                c.email as client_email
            FROM packages p
            LEFT JOIN users u ON p.assigned_driver_id = u.id
            LEFT JOIN users c ON p.client_id = c.id
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
        if (pkg.assigned_driver_id && pkg.assigned_driver_id !== driverId) {
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
        const validStatusesToLoad = ['in_cedis', 'ready_for_pickup', 'assigned', 'received_mty', 'inspected', 'pending_inspection'];
        if (!validStatusesToLoad.includes(pkg.delivery_status) && pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no puede cargarse. Estado actual: ${pkg.delivery_status}`,
                currentStatus: pkg.delivery_status,
                barcode
            });
        }

        // 5. MARCAR COMO CARGADO (OUT FOR DELIVERY)
        const statusColumn = await getPackageStatusColumn();
        await pool.query(`
            UPDATE packages 
            SET ${statusColumn} = 'out_for_delivery', 
                assigned_driver_id = COALESCE(assigned_driver_id, $2),
                loaded_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
        `, [pkg.id, driverId]);

        // 6. REGISTRAR EN HISTORIAL DE PAQUETE
        await pool.query(`
            INSERT INTO package_history (package_id, status, notes, created_by, created_at)
            VALUES ($1, 'out_for_delivery', 'Paquete cargado en unidad de reparto', $2, NOW())
        `, [pkg.id, driverId]);

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
                  AND ${DELIVERY_STATUS_SQL} IN ('in_cedis', 'ready_for_pickup', 'assigned', 'received_mty', 'inspected', 'pending_inspection')
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
                  AND ${DELIVERY_STATUS_SQL} IN ('in_cedis', 'ready_for_pickup', 'assigned', 'received_mty', 'inspected', 'pending_inspection')
                ORDER BY p.created_at ASC
            `, [driverId]);

        // Obtener lista de paquetes ya cargados (out for delivery)
        const loadedRes = await pool.query(`
            SELECT 
                p.id,
                ${TRACKING_PUBLIC_SQL} as tracking_number,
                ${DELIVERY_STATUS_SQL} as delivery_status,
                ${DELIVERY_ADDRESS_SQL} as delivery_address,
                ${DELIVERY_CITY_SQL} as delivery_city,
                ${DELIVERY_ZIP_SQL} as delivery_zip,
                ${RECIPIENT_NAME_SQL} as recipient_name,
                ${RECIPIENT_PHONE_SQL} as recipient_phone,
                ${LOADED_AT_SQL} as loaded_at
            FROM packages p
            WHERE ${ASSIGNED_DRIVER_SQL} = $1::text
              AND ${DELIVERY_STATUS_SQL} = 'out_for_delivery'
            ORDER BY p.updated_at ASC, p.created_at ASC
        `, [driverId]);

                const deliveredTodayRes = await pool.query(`
                        SELECT COUNT(*) as delivered_today
                        FROM packages p
                        WHERE to_jsonb(p)->>'assigned_driver_id' = $1::text
                            AND COALESCE(to_jsonb(p)->>'delivery_status', to_jsonb(p)->>'status') = 'delivered'
                            AND DATE(p.updated_at) = CURRENT_DATE
                `, [driverId]);

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
                p.assigned_driver_id, 
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
        if (pkg.assigned_driver_id !== driverId) {
            return res.status(403).json({ 
                error: '⛔ Este paquete no estaba asignado a ti.',
                barcode
            });
        }

        // 3. VALIDAR QUE ESTABA EN RUTA
        if (pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no estaba en ruta. Estado: ${pkg.delivery_status}`,
                currentStatus: pkg.delivery_status,
                barcode
            });
        }

        // 4. DEVOLVER A CEDIS
        const statusColumn = await getPackageStatusColumn();
        await pool.query(`
            UPDATE packages 
            SET ${statusColumn} = 'in_cedis', 
                loaded_at = NULL,
                return_reason = $2,
                return_count = COALESCE(return_count, 0) + 1,
                updated_at = NOW()
            WHERE id = $1
        `, [pkg.id, reason]);

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

        await pool.query(`
            INSERT INTO package_history (package_id, status, notes, created_by, created_at)
            VALUES ($1, 'returned_to_cedis', $2, $3, NOW())
        `, [pkg.id, `Retornado a CEDIS: ${reasonLabels[reason] || reason}`, driverId]);

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
        const packagesRes = await pool.query(`
            SELECT 
                                p.id,
                                ${TRACKING_PUBLIC_SQL} as tracking_number,
                                p.delivery_address,
                                p.delivery_city,
                                p.recipient_name,
                                p.loaded_at
                        FROM packages p
                        WHERE p.assigned_driver_id = $1 
                            AND ${DELIVERY_STATUS_SQL} = 'out_for_delivery'
                        ORDER BY p.loaded_at ASC
        `, [driverId]);

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

    if (!barcode) {
        return res.status(400).json({ error: '❌ Código de barras requerido.' });
    }

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        // 1. BUSCAR EL PAQUETE
        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                ${TRACKING_PUBLIC_SQL} as tracking_number,
                p.assigned_driver_id, 
                ${DELIVERY_STATUS_SQL} as delivery_status,
                p.client_id
            FROM packages p
            WHERE ${TRACKING_MATCH_SQL}
        `, [barcode]);

        if (pkgRes.rows.length === 0) {
            return res.status(404).json({ 
                error: '❌ Código no encontrado.',
                barcode 
            });
        }

        const pkg = pkgRes.rows[0];

        // 2. VALIDAR ASIGNACIÓN
        if (pkg.assigned_driver_id !== driverId) {
            return res.status(403).json({ 
                error: '⛔ Este paquete no está asignado a ti.',
                barcode
            });
        }

        // 3. VALIDAR ESTADO
        if (pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no está en ruta. Estado: ${pkg.delivery_status}`,
                barcode
            });
        }

        // 4. MARCAR COMO ENTREGADO
        const statusColumn = await getPackageStatusColumn();
        await pool.query(`
            UPDATE packages 
            SET ${statusColumn} = 'delivered', 
                delivered_at = NOW(),
                delivery_signature = $2,
                delivery_photo = $3,
                delivery_recipient_name = $4,
                delivery_notes = $5,
                updated_at = NOW()
            WHERE id = $1
        `, [pkg.id, signatureBase64, photoBase64, recipientName, notes]);

        // 5. REGISTRAR EN HISTORIAL
        await pool.query(`
            INSERT INTO package_history (package_id, status, notes, created_by, created_at)
            VALUES ($1, 'delivered', $2, $3, NOW())
        `, [pkg.id, `Entregado a: ${recipientName || 'N/A'}. ${notes || ''}`, driverId]);

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
        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                ${TRACKING_PUBLIC_SQL} as tracking_number,
                p.assigned_driver_id, 
                ${DELIVERY_STATUS_SQL} as delivery_status,
                p.delivery_address,
                p.delivery_city,
                p.delivery_zip,
                p.recipient_name,
                p.recipient_phone
            FROM packages p
            WHERE (${TRACKING_MATCH_SQL})
              AND p.assigned_driver_id = $2
        `, [barcode, driverId]);

        if (pkgRes.rows.length === 0) {
            return res.status(404).json({ 
                error: '❌ Paquete no encontrado o no está asignado a ti.',
                barcode 
            });
        }

        const pkg = pkgRes.rows[0];

        // Verificar que esté en estado para entregar
        if (pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no está en ruta. Estado: ${pkg.delivery_status}`,
                currentStatus: pkg.delivery_status,
                barcode
            });
        }

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
                delivery_status: pkg.delivery_status
            }
        });

    } catch (error) {
        console.error('Error en verifyPackageForDelivery:', error);
        res.status(500).json({ error: 'Error al verificar paquete.' });
    }
};