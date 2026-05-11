import { Request, Response } from 'express';
import { pool } from './db';

// ============ OBTENER TODOS LOS PROVEEDORES ============
export const getSuppliers = async (_req: Request, res: Response): Promise<void> => {
    try {
        // Obtener proveedores con estadísticas de paquetes
        const result = await pool.query(`
            SELECT 
                s.id, s.name, s.email, s.phone, s.notes, s.active, s.created_at, s.updated_at,
                COALESCE(stats.total_packages, 0) as total_packages,
                COALESCE(stats.pending_payment, 0) as pending_payment,
                COALESCE(stats.total_cost, 0) as total_cost
            FROM suppliers s
            LEFT JOIN (
                SELECT 
                    supplier_id,
                    COUNT(*) as total_packages,
                    COUNT(*) FILTER (WHERE costing_paid IS NULL OR costing_paid = FALSE) as pending_payment,
                    COALESCE(SUM(pobox_service_cost), 0) as total_cost
                FROM packages
                WHERE supplier_id IS NOT NULL
                GROUP BY supplier_id
            ) stats ON s.id = stats.supplier_id
            WHERE s.active = true
            ORDER BY s.name ASC
        `);
        res.json({ suppliers: result.rows });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error('❌ Error obteniendo proveedores:', error);
        res.status(500).json({ error: 'Error al obtener proveedores', details: errorMessage });
    }
};

// ============ OBTENER PROVEEDOR POR ID ============
export const getSupplierById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT id, name, email, phone, notes, active, created_at, updated_at
            FROM suppliers
            WHERE id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Proveedor no encontrado' });
            return;
        }
        
        res.json({ supplier: result.rows[0] });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error('❌ Error obteniendo proveedor:', error);
        res.status(500).json({ error: 'Error al obtener proveedor', details: errorMessage });
    }
};

// ============ CREAR PROVEEDOR ============
export const createSupplier = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, email, phone, notes } = req.body;
        
        if (!name || name.trim() === '') {
            res.status(400).json({ error: 'El nombre es requerido' });
            return;
        }
        
        const result = await pool.query(`
            INSERT INTO suppliers (name, email, phone, notes)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name, email, phone, notes, active, created_at
        `, [name.trim(), email?.trim() || null, phone?.trim() || null, notes?.trim() || null]);
        
        console.log(`✅ [SUPPLIER] Proveedor creado: ${name}`);
        res.status(201).json({ 
            success: true, 
            message: 'Proveedor creado exitosamente',
            supplier: result.rows[0] 
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error('❌ Error creando proveedor:', error);
        res.status(500).json({ error: 'Error al crear proveedor', details: errorMessage });
    }
};

// ============ ACTUALIZAR PROVEEDOR ============
export const updateSupplier = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, email, phone, notes } = req.body;
        
        if (!name || name.trim() === '') {
            res.status(400).json({ error: 'El nombre es requerido' });
            return;
        }
        
        const result = await pool.query(`
            UPDATE suppliers 
            SET name = $1, email = $2, phone = $3, notes = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
            RETURNING id, name, email, phone, notes, active, updated_at
        `, [name.trim(), email?.trim() || null, phone?.trim() || null, notes?.trim() || null, id]);
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Proveedor no encontrado' });
            return;
        }
        
        console.log(`✅ [SUPPLIER] Proveedor actualizado: ${name}`);
        res.json({ 
            success: true, 
            message: 'Proveedor actualizado exitosamente',
            supplier: result.rows[0] 
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error('❌ Error actualizando proveedor:', error);
        res.status(500).json({ error: 'Error al actualizar proveedor', details: errorMessage });
    }
};

// ============ ELIMINAR PROVEEDOR (SOFT DELETE) ============
export const deleteSupplier = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            UPDATE suppliers 
            SET active = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, name
        `, [id]);
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Proveedor no encontrado' });
            return;
        }
        
        console.log(`✅ [SUPPLIER] Proveedor eliminado: ${result.rows[0].name}`);
        res.json({ 
            success: true, 
            message: 'Proveedor eliminado exitosamente'
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error('❌ Error eliminando proveedor:', error);
        res.status(500).json({ error: 'Error al eliminar proveedor', details: errorMessage });
    }
};

// ============================================
// OBTENER CONSOLIDACIONES PENDIENTES DE PAGO
// (Todas las consolidaciones con paquetes no pagados)
// ============================================
export const getConsolidacionesPendientes = async (_req: Request, res: Response): Promise<void> => {
    try {
        console.log('📋 [CONSOLIDACIONES] Buscando consolidaciones pendientes de pago...');
        
        // Primero verificar si hay consolidaciones con paquetes sin supplier
        const debugResult = await pool.query(`
            SELECT 
                c.id,
                COUNT(p.id) as total_packages,
                COUNT(p.id) FILTER (WHERE p.supplier_id IS NOT NULL) as with_supplier,
                COUNT(p.id) FILTER (WHERE p.costing_paid = FALSE OR p.costing_paid IS NULL) as unpaid
            FROM consolidations c
            JOIN packages p ON p.consolidation_id = c.id
            GROUP BY c.id
            ORDER BY c.id DESC
            LIMIT 5
        `);
        console.log('📋 [DEBUG] Últimas 5 consolidaciones:', debugResult.rows);
        
        // Obtener consolidaciones con al menos un paquete pendiente (ya sea por pagar,
        // faltante o perdido). Los totales incluyen TODAS las guías (pagadas + pendientes)
        // separadas en aggregates para que el frontend pueda mostrar el desglose.
        const result = await pool.query(`
            SELECT 
                c.id,
                c.status,
                c.created_at,
                s.id as supplier_id,
                s.name as supplier_name,
                COUNT(p.id) as package_count,
                COUNT(p.id) FILTER (WHERE COALESCE(p.missing_on_arrival, FALSE) = TRUE AND COALESCE(p.is_lost, FALSE) = FALSE) AS missing_count,
                COUNT(p.id) FILTER (WHERE COALESCE(p.is_lost, FALSE) = TRUE) AS lost_count,
                -- Total PENDIENTE de pago AHORA (unpaid + no missing + no lost)
                COALESCE(SUM(p.pobox_service_cost) FILTER (WHERE COALESCE(p.missing_on_arrival, FALSE) = FALSE AND COALESCE(p.is_lost, FALSE) = FALSE AND COALESCE(p.costing_paid, FALSE) = FALSE), 0) as total_cost_mxn,
                COALESCE(SUM(p.pobox_cost_usd) FILTER (WHERE COALESCE(p.missing_on_arrival, FALSE) = FALSE AND COALESCE(p.is_lost, FALSE) = FALSE AND COALESCE(p.costing_paid, FALSE) = FALSE), 0) as total_cost_usd,
                -- Total YA PAGADO (no missing + no lost + paid)
                COALESCE(SUM(p.pobox_service_cost) FILTER (WHERE COALESCE(p.missing_on_arrival, FALSE) = FALSE AND COALESCE(p.is_lost, FALSE) = FALSE AND COALESCE(p.costing_paid, FALSE) = TRUE), 0) as paid_cost_mxn,
                COALESCE(SUM(p.pobox_cost_usd) FILTER (WHERE COALESCE(p.missing_on_arrival, FALSE) = FALSE AND COALESCE(p.is_lost, FALSE) = FALSE AND COALESCE(p.costing_paid, FALSE) = TRUE), 0) as paid_cost_usd,
                -- Total FALTANTE/PERDIDO (no suma al pago)
                COALESCE(SUM(p.pobox_service_cost) FILTER (WHERE COALESCE(p.missing_on_arrival, FALSE) = TRUE OR COALESCE(p.is_lost, FALSE) = TRUE), 0) as pending_cost_mxn,
                COALESCE(SUM(p.pobox_cost_usd) FILTER (WHERE COALESCE(p.missing_on_arrival, FALSE) = TRUE OR COALESCE(p.is_lost, FALSE) = TRUE), 0) as pending_cost_usd,
                -- Total COMPLETO de la consolidación (todo excepto perdidas/faltantes)
                COALESCE(SUM(p.pobox_service_cost) FILTER (WHERE COALESCE(p.missing_on_arrival, FALSE) = FALSE AND COALESCE(p.is_lost, FALSE) = FALSE), 0) as all_cost_mxn,
                COALESCE(SUM(p.pobox_cost_usd) FILTER (WHERE COALESCE(p.missing_on_arrival, FALSE) = FALSE AND COALESCE(p.is_lost, FALSE) = FALSE), 0) as all_cost_usd
            FROM consolidations c
            JOIN packages p ON p.consolidation_id = c.id
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.supplier_id IS NOT NULL
              -- Excluir guías master que tienen hijas (multi-bulto): sus hijas
              -- ya contienen el costo individual, sumar el master duplicaría.
              AND NOT (COALESCE(p.is_master, FALSE) = TRUE AND COALESCE(p.total_boxes, 1) > 1)
            GROUP BY c.id, c.status, c.created_at, s.id, s.name
            -- Solo consolidaciones que TODAVÍA tienen algo pendiente
            HAVING COUNT(p.id) FILTER (WHERE COALESCE(p.costing_paid, FALSE) = FALSE) > 0
            ORDER BY c.created_at DESC
        `);
        
        // Para cada consolidación, obtener los paquetes pendientes
        const consolidationsWithPackages = await Promise.all(
            result.rows.map(async (consolidation) => {
                const packagesResult = await pool.query(`
                    SELECT 
                        p.id,
                        p.tracking_internal as tracking,
                        p.tracking_provider,
                        p.description,
                        p.weight,
                        p.pkg_length,
                        p.pkg_width,
                        p.pkg_height,
                        p.pobox_service_cost,
                        p.pobox_cost_usd,
                        p.costing_paid,
                        p.status,
                        COALESCE(p.missing_on_arrival, FALSE) AS missing_on_arrival,
                        COALESCE(p.is_lost, FALSE) AS is_lost,
                        COALESCE(p.is_master, FALSE) AS is_master,
                        COALESCE(p.total_boxes, 1) AS total_boxes,
                        u.full_name as client_name,
                        u.box_id as client_box_id
                    FROM packages p
                    LEFT JOIN users u ON p.user_id = u.id
                    WHERE p.consolidation_id = $1 
                    AND p.supplier_id = $2
                    AND NOT (COALESCE(p.is_master, FALSE) = TRUE AND COALESCE(p.total_boxes, 1) > 1)
                    ORDER BY
                        CASE WHEN COALESCE(p.missing_on_arrival, FALSE) = TRUE OR COALESCE(p.is_lost, FALSE) = TRUE THEN 1 ELSE 0 END,
                        p.tracking_internal
                `, [consolidation.id, consolidation.supplier_id]);
                
                return {
                    ...consolidation,
                    has_missing: Number(consolidation.missing_count) > 0 || Number(consolidation.lost_count) > 0,
                    packages: packagesResult.rows
                };
            })
        );
        
        console.log(`💰 [SUPPLIER] Consolidaciones pendientes de pago: ${result.rows.length}`);
        res.json({ consolidations: consolidationsWithPackages });
        
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error('❌ Error obteniendo consolidaciones pendientes:', error);
        res.status(500).json({ error: 'Error al obtener consolidaciones pendientes', details: errorMessage });
    }
};

// ============ OBTENER CONSOLIDACIONES DEL PROVEEDOR ============
export const getSupplierConsolidations = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        
        // Obtener consolidaciones que tienen paquetes asignados a este proveedor
        const result = await pool.query(`
            SELECT DISTINCT
                c.id,
                c.status,
                c.total_weight,
                c.created_at,
                COUNT(p.id) as package_count,
                COALESCE(SUM(p.pobox_service_cost), 0) as total_cost_mxn,
                COALESCE(SUM(p.pobox_cost_usd), 0) as total_cost_usd
            FROM consolidations c
            JOIN packages p ON p.consolidation_id = c.id
            WHERE p.supplier_id = $1
            GROUP BY c.id, c.status, c.total_weight, c.created_at
            ORDER BY c.created_at DESC
        `, [id]);
        
        // Para cada consolidación, obtener los paquetes
        const consolidationsWithPackages = await Promise.all(
            result.rows.map(async (consolidation) => {
                const packagesResult = await pool.query(`
                    SELECT 
                        p.id,
                        p.tracking_internal as tracking,
                        p.tracking_provider,
                        p.description,
                        p.weight,
                        p.pkg_length,
                        p.pkg_width,
                        p.pkg_height,
                        p.status,
                        p.pobox_service_cost,
                        p.pobox_cost_usd,
                        p.costing_paid,
                        p.received_at,
                        u.full_name as client_name,
                        u.box_id as client_box_id
                    FROM packages p
                    LEFT JOIN users u ON p.user_id = u.id
                    WHERE p.consolidation_id = $1 AND p.supplier_id = $2
                    ORDER BY p.tracking_internal
                `, [consolidation.id, id]);
                
                return {
                    ...consolidation,
                    packages: packagesResult.rows
                };
            })
        );
        
        console.log(`📦 [SUPPLIER] Consolidaciones para proveedor ${id}: ${result.rows.length}`);
        res.json({ consolidations: consolidationsWithPackages });
        
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error('❌ Error obteniendo consolidaciones del proveedor:', error);
        res.status(500).json({ error: 'Error al obtener consolidaciones', details: errorMessage });
    }
};

// ============================================
// ACTUALIZAR ESTADO DE CONSOLIDACIÓN Y PAQUETES
// ============================================
export const updateConsolidationStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const consolidationId = parseInt(req.params.consolidationId as string);
        const { status } = req.body;
        
        if (!consolidationId || isNaN(consolidationId)) {
            res.status(400).json({ error: 'ID de consolidación inválido' });
            return;
        }
        
        if (!status) {
            res.status(400).json({ error: 'Status requerido' });
            return;
        }
        
        // Validar status válidos
        const validStatuses = ['received', 'in_transit', 'customs', 'ready_pickup', 'delivered'];
        if (!validStatuses.includes(status)) {
            res.status(400).json({ error: `Status inválido. Valores permitidos: ${validStatuses.join(', ')}` });
            return;
        }
        
        console.log(`📦 [CONSOLIDATION] Actualizando estado de consolidación #${consolidationId} a ${status}`);
        
        // Actualizar estado de la consolidación
        await pool.query(`
            UPDATE consolidations 
            SET status = $1, updated_at = NOW()
            WHERE id = $2
        `, [status, consolidationId]);
        
        // Actualizar estado de todos los paquetes de la consolidación
        const packagesResult = await pool.query(`
            UPDATE packages 
            SET status = $1, updated_at = NOW()
            WHERE consolidation_id = $2
            RETURNING id, tracking_internal
        `, [status, consolidationId]);
        
        console.log(`✅ [CONSOLIDATION] Consolidación #${consolidationId} actualizada - ${packagesResult.rows.length} paquetes`);
        
        res.json({ 
            success: true, 
            message: `Estado actualizado a ${status}`,
            consolidationId,
            packagesUpdated: packagesResult.rows.length,
            packages: packagesResult.rows
        });
        
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error('❌ Error actualizando estado de consolidación:', error);
        res.status(500).json({ error: 'Error al actualizar estado', details: errorMessage });
    }
};
