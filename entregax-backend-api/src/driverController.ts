/**
 * Driver Controller - Controlador para la App del Repartidor
 * Maneja: Carga de unidad (Scan-to-Load), Retorno a bodega, Estado de ruta
 */

import { Request, Response } from 'express';
import { pool } from './db';

// ============================================================================
// SCAN TO LOAD - Escaneo para carga de unidad
// ============================================================================

/**
 * Escanear paquete para cargar a la unidad del chofer
 * Valida: existencia, asignación correcta, no duplicados
 */
export const scanPackageToLoad = async (req: Request, res: Response): Promise<any> => {
    const { barcode } = req.body;
    const driverId = (req as any).user?.id;

    if (!barcode) {
        return res.status(400).json({ error: '❌ Código de barras requerido.' });
    }

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        // 1. BUSCAR EL PAQUETE POR TRACKING NUMBER O CÓDIGO DE BARRAS
        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                p.tracking_number,
                p.assigned_driver_id, 
                p.delivery_status,
                p.loaded_at,
                p.client_id,
                u.full_name as driver_name,
                c.full_name as client_name,
                c.email as client_email
            FROM packages p
            LEFT JOIN users u ON p.assigned_driver_id = u.id
            LEFT JOIN users c ON p.client_id = c.id
            WHERE p.tracking_number = $1 
               OR p.skydropx_label_id = $1
               OR p.dhl_awb = $1
        `, [barcode]);

        if (pkgRes.rows.length === 0) {
            return res.status(404).json({ 
                error: '❌ Código no encontrado en el sistema.',
                barcode 
            });
        }

        const pkg = pkgRes.rows[0];

        // 2. REGLA DE SEGURIDAD: ¿Le toca a este chofer?
        if (pkg.assigned_driver_id !== driverId) {
            // Obtener nombre del chofer asignado para el mensaje
            const assignedDriverName = pkg.driver_name || 'otro chofer';
            return res.status(403).json({ 
                error: `⛔ ALTO: Este paquete está asignado a ${assignedDriverName}. Devuélvelo a bodega.`,
                assignedTo: assignedDriverName,
                barcode
            });
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
        const validStatusesToLoad = ['in_cedis', 'ready_for_pickup', 'assigned'];
        if (!validStatusesToLoad.includes(pkg.delivery_status) && pkg.delivery_status !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: `⚠️ Este paquete no puede cargarse. Estado actual: ${pkg.delivery_status}`,
                currentStatus: pkg.delivery_status,
                barcode
            });
        }

        // 5. MARCAR COMO CARGADO (OUT FOR DELIVERY)
        await pool.query(`
            UPDATE packages 
            SET delivery_status = 'out_for_delivery', 
                loaded_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
        `, [pkg.id]);

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
    const driverId = (req as any).user?.id;

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        // Obtener estadísticas de paquetes asignados hoy
        const statsRes = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE assigned_driver_id = $1 AND DATE(created_at) = CURRENT_DATE) as total_assigned,
                COUNT(*) FILTER (WHERE assigned_driver_id = $1 AND delivery_status = 'out_for_delivery' AND DATE(loaded_at) = CURRENT_DATE) as loaded_today,
                COUNT(*) FILTER (WHERE assigned_driver_id = $1 AND delivery_status = 'delivered' AND DATE(updated_at) = CURRENT_DATE) as delivered_today,
                COUNT(*) FILTER (WHERE assigned_driver_id = $1 AND delivery_status IN ('in_cedis', 'ready_for_pickup', 'assigned')) as pending_to_load
            FROM packages
            WHERE assigned_driver_id = $1
        `, [driverId]);

        // Obtener lista de paquetes asignados pendientes de cargar
        const pendingRes = await pool.query(`
            SELECT 
                id,
                tracking_number,
                delivery_status,
                delivery_address,
                delivery_city,
                delivery_zip,
                recipient_name,
                recipient_phone
            FROM packages
            WHERE assigned_driver_id = $1 
              AND delivery_status IN ('in_cedis', 'ready_for_pickup', 'assigned')
            ORDER BY created_at ASC
        `, [driverId]);

        // Obtener lista de paquetes ya cargados (out for delivery)
        const loadedRes = await pool.query(`
            SELECT 
                id,
                tracking_number,
                delivery_status,
                delivery_address,
                delivery_city,
                delivery_zip,
                recipient_name,
                recipient_phone,
                loaded_at
            FROM packages
            WHERE assigned_driver_id = $1 
              AND delivery_status = 'out_for_delivery'
            ORDER BY loaded_at ASC
        `, [driverId]);

        const stats = statsRes.rows[0];

        return res.json({
            success: true,
            route: {
                totalAssigned: parseInt(stats.total_assigned) || 0,
                loadedToday: parseInt(stats.loaded_today) || 0,
                deliveredToday: parseInt(stats.delivered_today) || 0,
                pendingToLoad: parseInt(stats.pending_to_load) || 0,
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
    const driverId = (req as any).user?.id;

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
        // 1. BUSCAR EL PAQUETE
        const pkgRes = await pool.query(`
            SELECT 
                p.id, 
                p.tracking_number,
                p.assigned_driver_id, 
                p.delivery_status,
                p.branch_id
            FROM packages p
            WHERE p.tracking_number = $1 
               OR p.skydropx_label_id = $1
               OR p.dhl_awb = $1
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
        await pool.query(`
            UPDATE packages 
            SET delivery_status = 'in_cedis', 
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
    const driverId = (req as any).user?.id;

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const packagesRes = await pool.query(`
            SELECT 
                id,
                tracking_number,
                delivery_address,
                delivery_city,
                recipient_name,
                loaded_at
            FROM packages
            WHERE assigned_driver_id = $1 
              AND delivery_status = 'out_for_delivery'
            ORDER BY loaded_at ASC
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
    const driverId = (req as any).user?.id;

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
                p.tracking_number,
                p.assigned_driver_id, 
                p.delivery_status,
                p.client_id
            FROM packages p
            WHERE p.tracking_number = $1 
               OR p.skydropx_label_id = $1
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
        await pool.query(`
            UPDATE packages 
            SET delivery_status = 'delivered', 
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
    const driverId = (req as any).user?.id;

    if (!driverId) {
        return res.status(401).json({ error: '❌ Sesión no válida.' });
    }

    try {
        const deliveriesRes = await pool.query(`
            SELECT 
                id,
                tracking_number,
                delivery_address,
                delivery_city,
                recipient_name,
                delivery_recipient_name,
                delivered_at
            FROM packages
            WHERE assigned_driver_id = $1 
              AND delivery_status = 'delivered'
              AND DATE(delivered_at) = CURRENT_DATE
            ORDER BY delivered_at DESC
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
    const driverId = (req as any).user?.id;

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
                p.tracking_number,
                p.assigned_driver_id, 
                p.delivery_status,
                p.delivery_address,
                p.delivery_city,
                p.delivery_zip,
                p.recipient_name,
                p.recipient_phone
            FROM packages p
            WHERE (p.tracking_number = $1 
               OR p.skydropx_label_id = $1
               OR p.dhl_awb = $1)
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