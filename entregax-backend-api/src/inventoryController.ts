// ============================================
// CONTROLADOR DE INVENTARIO POR SERVICIO
// Gestión de stock, items, movimientos y alertas
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// Tipos de movimiento de inventario
export const MOVEMENT_TYPES = {
    ENTRY: 'entry',           // Entrada de mercancía
    EXIT: 'exit',             // Salida de mercancía
    ADJUSTMENT: 'adjustment', // Ajuste de inventario
    TRANSFER: 'transfer',     // Transferencia entre ubicaciones
    RESERVE: 'reserve',       // Reserva para pedido
    UNRESERVE: 'unreserve',   // Liberación de reserva
    RETURN: 'return',         // Devolución
    DAMAGE: 'damage',         // Daño/merma
} as const;

// Categorías de items
export const ITEM_CATEGORIES = [
    'empaques',    // Cajas, sobres, contenedores
    'insumos',     // Cinta, plástico burbuja, etc.
    'etiquetas',   // Etiquetas de envío, térmicas
    'documentos',  // Formatos, guías
    'equipo',      // Equipamiento de bodega
    'otros',       // Misceláneos
];

// ============================================
// HELPER: Registrar movimiento de inventario
// ============================================
async function registerMovement(
    itemId: number,
    type: string,
    quantity: number,
    previousStock: number,
    newStock: number,
    userId: number,
    notes?: string,
    referenceType?: string,
    referenceId?: number
) {
    await pool.query(
        `INSERT INTO inventory_movements 
         (item_id, movement_type, quantity, previous_stock, new_stock, 
          reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [itemId, type, quantity, previousStock, newStock, referenceType, referenceId, notes, userId]
    );
}

// ============================================
// GET /api/inventory/:serviceType/items
// Lista items de inventario por servicio
// ============================================
export const getInventoryItems = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;
        const { category, search, low_stock, active_only = 'true' } = req.query;

        let query = `
            SELECT i.*,
                   (i.current_stock - i.reserved_stock) as available_stock,
                   CASE 
                       WHEN i.current_stock <= i.min_stock THEN 'low'
                       WHEN i.current_stock >= i.max_stock THEN 'excess'
                       ELSE 'normal'
                   END as stock_status,
                   (SELECT COUNT(*) FROM inventory_movements WHERE item_id = i.id) as movement_count
            FROM inventory_items i
            WHERE i.service_type = $1
        `;
        const params: any[] = [serviceType];
        let paramIndex = 2;

        if (active_only === 'true') {
            query += ` AND i.is_active = TRUE`;
        }

        if (category) {
            query += ` AND i.category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }

        if (search) {
            query += ` AND (i.name ILIKE $${paramIndex} OR i.sku ILIKE $${paramIndex} OR i.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (low_stock === 'true') {
            query += ` AND i.current_stock <= i.min_stock`;
        }

        query += ` ORDER BY i.category, i.name`;

        const result = await pool.query(query, params);

        // Obtener estadísticas resumidas
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_items,
                COUNT(*) FILTER (WHERE current_stock <= min_stock) as low_stock_count,
                COUNT(*) FILTER (WHERE current_stock >= max_stock) as excess_stock_count,
                SUM(current_stock * cost_price) as total_value
            FROM inventory_items
            WHERE service_type = $1 AND is_active = TRUE
        `, [serviceType]);

        res.json({
            items: result.rows,
            stats: statsResult.rows[0] || {}
        });
    } catch (error) {
        console.error('Error getting inventory items:', error);
        res.status(500).json({ error: 'Error al obtener inventario' });
    }
};

// ============================================
// GET /api/inventory/:serviceType/stats
// Estadísticas de inventario por servicio
// ============================================
export const getInventoryStats = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;

        // Stats generales
        const generalStats = await pool.query(`
            SELECT 
                COUNT(*) as total_items,
                COUNT(*) FILTER (WHERE is_active = TRUE) as active_items,
                COUNT(*) FILTER (WHERE current_stock <= min_stock AND is_active = TRUE) as low_stock_items,
                COUNT(*) FILTER (WHERE current_stock >= max_stock AND is_active = TRUE) as excess_stock_items,
                SUM(current_stock) as total_units,
                SUM(reserved_stock) as reserved_units,
                SUM(current_stock * cost_price) as inventory_cost_value,
                SUM(current_stock * sale_price) as inventory_sale_value
            FROM inventory_items
            WHERE service_type = $1
        `, [serviceType]);

        // Stats por categoría
        const categoryStats = await pool.query(`
            SELECT 
                category,
                COUNT(*) as item_count,
                SUM(current_stock) as total_stock,
                SUM(current_stock * cost_price) as category_value
            FROM inventory_items
            WHERE service_type = $1 AND is_active = TRUE
            GROUP BY category
            ORDER BY category
        `, [serviceType]);

        // Movimientos recientes (últimos 7 días)
        const movementStats = await pool.query(`
            SELECT 
                DATE(m.created_at) as date,
                m.movement_type,
                COUNT(*) as count,
                SUM(ABS(m.quantity)) as total_quantity
            FROM inventory_movements m
            JOIN inventory_items i ON m.item_id = i.id
            WHERE i.service_type = $1 
              AND m.created_at >= NOW() - INTERVAL '7 days'
            GROUP BY DATE(m.created_at), m.movement_type
            ORDER BY date DESC
        `, [serviceType]);

        // Items con stock bajo
        const lowStockItems = await pool.query(`
            SELECT id, sku, name, current_stock, min_stock, category
            FROM inventory_items
            WHERE service_type = $1 
              AND is_active = TRUE 
              AND current_stock <= min_stock
            ORDER BY (current_stock::float / NULLIF(min_stock, 0)) ASC
            LIMIT 10
        `, [serviceType]);

        res.json({
            general: generalStats.rows[0] || {},
            byCategory: categoryStats.rows,
            recentMovements: movementStats.rows,
            lowStockAlerts: lowStockItems.rows
        });
    } catch (error) {
        console.error('Error getting inventory stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};

// ============================================
// POST /api/inventory/:serviceType/items
// Crear nuevo item de inventario
// ============================================
export const createInventoryItem = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;
        const user = (req as any).user;
        const {
            sku, name, description, category, unit = 'pza',
            min_stock = 0, max_stock = 999999, initial_stock = 0,
            cost_price = 0, sale_price = 0, location, barcode, notes
        } = req.body;

        // Validar campos requeridos
        if (!sku || !name) {
            return res.status(400).json({ error: 'SKU y nombre son requeridos' });
        }

        // Verificar SKU único
        const existing = await pool.query('SELECT id FROM inventory_items WHERE sku = $1', [sku]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'El SKU ya existe' });
        }

        const result = await pool.query(`
            INSERT INTO inventory_items 
            (service_type, sku, name, description, category, unit, 
             min_stock, max_stock, current_stock, cost_price, sale_price, 
             location, barcode, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `, [serviceType, sku, name, description, category, unit, 
            min_stock, max_stock, initial_stock, cost_price, sale_price, 
            location, barcode, notes]);

        const newItem = result.rows[0];

        // Si hay stock inicial, registrar movimiento
        if (initial_stock > 0) {
            await registerMovement(
                newItem.id, MOVEMENT_TYPES.ENTRY, initial_stock,
                0, initial_stock, user.userId, 'Stock inicial al crear item'
            );
        }

        res.status(201).json(newItem);
    } catch (error) {
        console.error('Error creating inventory item:', error);
        res.status(500).json({ error: 'Error al crear item' });
    }
};

// ============================================
// PUT /api/inventory/:serviceType/items/:id
// Actualizar item de inventario
// ============================================
export const updateInventoryItem = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const {
            name, description, category, unit, min_stock, max_stock,
            cost_price, sale_price, location, barcode, is_active, notes
        } = req.body;

        const result = await pool.query(`
            UPDATE inventory_items SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                category = COALESCE($3, category),
                unit = COALESCE($4, unit),
                min_stock = COALESCE($5, min_stock),
                max_stock = COALESCE($6, max_stock),
                cost_price = COALESCE($7, cost_price),
                sale_price = COALESCE($8, sale_price),
                location = COALESCE($9, location),
                barcode = COALESCE($10, barcode),
                is_active = COALESCE($11, is_active),
                notes = COALESCE($12, notes),
                updated_at = NOW()
            WHERE id = $13
            RETURNING *
        `, [name, description, category, unit, min_stock, max_stock,
            cost_price, sale_price, location, barcode, is_active, notes, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating inventory item:', error);
        res.status(500).json({ error: 'Error al actualizar item' });
    }
};

// ============================================
// DELETE /api/inventory/:serviceType/items/:id
// Eliminar (desactivar) item de inventario
// ============================================
export const deleteInventoryItem = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        // Soft delete - solo desactivar
        const result = await pool.query(`
            UPDATE inventory_items SET is_active = FALSE, updated_at = NOW()
            WHERE id = $1
            RETURNING id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        res.json({ message: 'Item desactivado correctamente' });
    } catch (error) {
        console.error('Error deleting inventory item:', error);
        res.status(500).json({ error: 'Error al eliminar item' });
    }
};

// ============================================
// POST /api/inventory/:serviceType/movement
// Registrar movimiento de inventario
// ============================================
export const registerInventoryMovement = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;
        const user = (req as any).user;
        const { item_id, movement_type, quantity, notes, reference_type, reference_id } = req.body;

        // Validar
        if (!item_id || !movement_type || !quantity) {
            return res.status(400).json({ error: 'item_id, movement_type y quantity son requeridos' });
        }

        if (quantity <= 0) {
            return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
        }

        // Verificar que el item existe y pertenece al servicio
        const itemResult = await pool.query(
            'SELECT * FROM inventory_items WHERE id = $1 AND service_type = $2',
            [item_id, serviceType]
        );

        if (itemResult.rows.length === 0) {
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        const item = itemResult.rows[0];
        const previousStock = item.current_stock;
        let newStock = previousStock;
        let reservedChange = 0;

        // Calcular nuevo stock según tipo de movimiento
        switch (movement_type) {
            case MOVEMENT_TYPES.ENTRY:
            case MOVEMENT_TYPES.RETURN:
            case MOVEMENT_TYPES.UNRESERVE:
                newStock = previousStock + quantity;
                if (movement_type === MOVEMENT_TYPES.UNRESERVE) {
                    reservedChange = -quantity;
                }
                break;

            case MOVEMENT_TYPES.EXIT:
            case MOVEMENT_TYPES.DAMAGE:
                if (previousStock < quantity) {
                    return res.status(400).json({ error: 'Stock insuficiente' });
                }
                newStock = previousStock - quantity;
                break;

            case MOVEMENT_TYPES.RESERVE:
                const availableStock = previousStock - item.reserved_stock;
                if (availableStock < quantity) {
                    return res.status(400).json({ error: 'Stock disponible insuficiente para reservar' });
                }
                reservedChange = quantity;
                break;

            case MOVEMENT_TYPES.ADJUSTMENT:
                // El quantity es el nuevo stock absoluto
                newStock = quantity;
                break;

            default:
                return res.status(400).json({ error: 'Tipo de movimiento no válido' });
        }

        // Actualizar stock
        await pool.query(
            `UPDATE inventory_items SET 
             current_stock = $1, 
             reserved_stock = reserved_stock + $2,
             updated_at = NOW()
             WHERE id = $3`,
            [newStock, reservedChange, item_id]
        );

        // Registrar movimiento
        await registerMovement(
            item_id, movement_type, 
            movement_type === MOVEMENT_TYPES.ADJUSTMENT ? quantity : (newStock - previousStock),
            previousStock, newStock, user.userId, notes, reference_type, reference_id
        );

        res.json({
            message: 'Movimiento registrado',
            previous_stock: previousStock,
            new_stock: newStock,
            movement_type
        });
    } catch (error) {
        console.error('Error registering movement:', error);
        res.status(500).json({ error: 'Error al registrar movimiento' });
    }
};

// ============================================
// GET /api/inventory/:serviceType/movements
// Lista movimientos de inventario
// ============================================
export const getInventoryMovements = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;
        const { item_id, movement_type, date_from, date_to, limit = 100 } = req.query;

        let query = `
            SELECT m.*, 
                   i.sku, i.name as item_name,
                   u.full_name as created_by_name
            FROM inventory_movements m
            JOIN inventory_items i ON m.item_id = i.id
            LEFT JOIN users u ON m.created_by = u.id
            WHERE i.service_type = $1
        `;
        const params: any[] = [serviceType];
        let paramIndex = 2;

        if (item_id) {
            query += ` AND m.item_id = $${paramIndex}`;
            params.push(item_id);
            paramIndex++;
        }

        if (movement_type) {
            query += ` AND m.movement_type = $${paramIndex}`;
            params.push(movement_type);
            paramIndex++;
        }

        if (date_from) {
            query += ` AND m.created_at >= $${paramIndex}`;
            params.push(date_from);
            paramIndex++;
        }

        if (date_to) {
            query += ` AND m.created_at <= $${paramIndex}`;
            params.push(date_to);
            paramIndex++;
        }

        query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit as string));

        const result = await pool.query(query, params);

        res.json(result.rows);
    } catch (error) {
        console.error('Error getting movements:', error);
        res.status(500).json({ error: 'Error al obtener movimientos' });
    }
};

// ============================================
// GET /api/inventory/:serviceType/categories
// Lista categorías disponibles
// ============================================
export const getInventoryCategories = async (_req: Request, res: Response): Promise<any> => {
    try {
        res.json(ITEM_CATEGORIES);
    } catch (error) {
        console.error('Error getting categories:', error);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
};

// ============================================
// GET /api/inventory/:serviceType/alerts
// Obtener alertas de stock bajo
// ============================================
export const getInventoryAlerts = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;

        const result = await pool.query(`
            SELECT i.*,
                   (i.current_stock - i.reserved_stock) as available_stock,
                   ROUND(i.current_stock::numeric / NULLIF(i.min_stock, 0) * 100, 1) as stock_percentage
            FROM inventory_items i
            WHERE i.service_type = $1 
              AND i.is_active = TRUE
              AND i.current_stock <= i.min_stock
            ORDER BY (i.current_stock::float / NULLIF(i.min_stock, 0)) ASC
        `, [serviceType]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error getting alerts:', error);
        res.status(500).json({ error: 'Error al obtener alertas' });
    }
};

// ============================================
// POST /api/inventory/:serviceType/bulk-movement
// Movimiento masivo (múltiples items)
// ============================================
export const bulkInventoryMovement = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;
        const user = (req as any).user;
        const { movements, notes, reference_type, reference_id } = req.body;

        if (!Array.isArray(movements) || movements.length === 0) {
            return res.status(400).json({ error: 'Se requiere un array de movimientos' });
        }

        const results: any[] = [];
        const errors: any[] = [];

        for (const mov of movements) {
            try {
                const { item_id, movement_type, quantity } = mov;

                const itemResult = await pool.query(
                    'SELECT * FROM inventory_items WHERE id = $1 AND service_type = $2',
                    [item_id, serviceType]
                );

                if (itemResult.rows.length === 0) {
                    errors.push({ item_id, error: 'Item no encontrado' });
                    continue;
                }

                const item = itemResult.rows[0];
                const previousStock = item.current_stock;
                let newStock: number;

                if (movement_type === 'entry') {
                    newStock = previousStock + quantity;
                } else if (movement_type === 'exit') {
                    if (previousStock < quantity) {
                        errors.push({ item_id, sku: item.sku, error: 'Stock insuficiente' });
                        continue;
                    }
                    newStock = previousStock - quantity;
                } else {
                    errors.push({ item_id, error: 'Tipo de movimiento no válido para bulk' });
                    continue;
                }

                await pool.query(
                    'UPDATE inventory_items SET current_stock = $1, updated_at = NOW() WHERE id = $2',
                    [newStock, item_id]
                );

                await registerMovement(
                    item_id, movement_type, movement_type === 'entry' ? quantity : -quantity,
                    previousStock, newStock, user.userId, notes, reference_type, reference_id
                );

                results.push({ item_id, sku: item.sku, previous: previousStock, new: newStock });
            } catch (err) {
                errors.push({ item_id: mov.item_id, error: 'Error interno' });
            }
        }

        res.json({
            success: results,
            errors,
            summary: {
                processed: results.length,
                failed: errors.length
            }
        });
    } catch (error) {
        console.error('Error in bulk movement:', error);
        res.status(500).json({ error: 'Error en movimiento masivo' });
    }
};
