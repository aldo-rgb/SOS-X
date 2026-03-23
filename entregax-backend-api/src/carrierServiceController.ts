// ============================================
// CONTROLADOR DE OPCIONES DE PAQUETERÍA 📦
// CRUD para carrier_service_options y mapeo a tipos de servicio
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// Tipos de servicio válidos
const VALID_SERVICE_TYPES = ['china_air', 'china_sea', 'usa_pobox', 'dhl', 'mx_national'];

// =========================================
// GET /api/admin/carrier-options
// Lista todas las opciones de paquetería con sus servicios asociados
// =========================================
export const getCarrierOptions = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT co.*,
        COALESCE(
          (SELECT json_agg(cm.service_type ORDER BY cm.service_type)
           FROM carrier_service_type_map cm
           WHERE cm.carrier_option_id = co.id), '[]'
        ) as service_types
      FROM carrier_service_options co
      ORDER BY co.priority ASC, co.id ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching carrier options:', error);
    res.status(500).json({ success: false, error: 'Error al obtener opciones de paquetería' });
  }
};

// =========================================
// GET /api/carrier-options/by-service/:serviceType
// Lista opciones de paquetería activas para un tipo de servicio (para clientes)
// =========================================
export const getCarrierOptionsByService = async (req: Request, res: Response) => {
  try {
    const { serviceType } = req.params;

    const result = await pool.query(`
      SELECT co.carrier_key, co.name, co.description, co.price_label, co.subtext, co.icon, co.priority
      FROM carrier_service_options co
      INNER JOIN carrier_service_type_map cm ON co.id = cm.carrier_option_id
      WHERE cm.service_type = $1
        AND co.is_active = true
      ORDER BY co.priority ASC
    `, [serviceType]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching carrier options by service:', error);
    res.status(500).json({ success: false, error: 'Error al obtener paqueterías' });
  }
};

// =========================================
// POST /api/admin/carrier-options
// Crear nueva opción de paquetería
// =========================================
export const createCarrierOption = async (req: Request, res: Response) => {
  try {
    const { carrier_key, name, description, price_label, subtext, icon, priority, service_types } = req.body;

    if (!carrier_key || !name) {
      return res.status(400).json({ success: false, error: 'carrier_key y name son requeridos' });
    }

    // Verificar que no exista ya
    const existing = await pool.query('SELECT id FROM carrier_service_options WHERE carrier_key = $1', [carrier_key]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Ya existe una paquetería con esa clave' });
    }

    const result = await pool.query(`
      INSERT INTO carrier_service_options (carrier_key, name, description, price_label, subtext, icon, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [carrier_key, name, description || null, price_label || null, subtext || null, icon || '🚛', priority || 0]);

    const carrierId = result.rows[0].id;

    // Insertar mapeo de servicios
    if (service_types && Array.isArray(service_types)) {
      for (const svc of service_types) {
        if (VALID_SERVICE_TYPES.includes(svc)) {
          await pool.query(
            'INSERT INTO carrier_service_type_map (carrier_option_id, service_type) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [carrierId, svc]
          );
        }
      }
    }

    // Retornar con service_types
    const full = await pool.query(`
      SELECT co.*,
        COALESCE(
          (SELECT json_agg(cm.service_type ORDER BY cm.service_type)
           FROM carrier_service_type_map cm
           WHERE cm.carrier_option_id = co.id), '[]'
        ) as service_types
      FROM carrier_service_options co
      WHERE co.id = $1
    `, [carrierId]);

    res.json({ success: true, data: full.rows[0] });
  } catch (error) {
    console.error('Error creating carrier option:', error);
    res.status(500).json({ success: false, error: 'Error al crear opción de paquetería' });
  }
};

// =========================================
// PUT /api/admin/carrier-options/:id
// Actualizar opción de paquetería
// =========================================
export const updateCarrierOption = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { carrier_key, name, description, price_label, subtext, icon, is_active, priority, service_types } = req.body;

    // Verificar que exista
    const existing = await pool.query('SELECT id FROM carrier_service_options WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Opción de paquetería no encontrada' });
    }

    // Si cambia carrier_key, verificar que no colisione
    if (carrier_key) {
      const collision = await pool.query(
        'SELECT id FROM carrier_service_options WHERE carrier_key = $1 AND id != $2',
        [carrier_key, id]
      );
      if (collision.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Ya existe otra paquetería con esa clave' });
      }
    }

    await pool.query(`
      UPDATE carrier_service_options SET
        carrier_key = COALESCE($1, carrier_key),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        price_label = COALESCE($4, price_label),
        subtext = $5,
        icon = COALESCE($6, icon),
        is_active = COALESCE($7, is_active),
        priority = COALESCE($8, priority),
        updated_at = NOW()
      WHERE id = $9
    `, [carrier_key, name, description, price_label, subtext !== undefined ? subtext : null, icon, is_active, priority, id]);

    // Actualizar mapeo de servicios si se proporcionan
    if (service_types && Array.isArray(service_types)) {
      await pool.query('DELETE FROM carrier_service_type_map WHERE carrier_option_id = $1', [id]);
      for (const svc of service_types) {
        if (VALID_SERVICE_TYPES.includes(svc)) {
          await pool.query(
            'INSERT INTO carrier_service_type_map (carrier_option_id, service_type) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [id, svc]
          );
        }
      }
    }

    // Retornar actualizado
    const full = await pool.query(`
      SELECT co.*,
        COALESCE(
          (SELECT json_agg(cm.service_type ORDER BY cm.service_type)
           FROM carrier_service_type_map cm
           WHERE cm.carrier_option_id = co.id), '[]'
        ) as service_types
      FROM carrier_service_options co
      WHERE co.id = $1
    `, [id]);

    res.json({ success: true, data: full.rows[0] });
  } catch (error) {
    console.error('Error updating carrier option:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar opción de paquetería' });
  }
};

// =========================================
// DELETE /api/admin/carrier-options/:id
// Eliminar opción de paquetería
// =========================================
export const deleteCarrierOption = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM carrier_service_options WHERE id = $1 RETURNING carrier_key', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Opción de paquetería no encontrada' });
    }

    res.json({ success: true, message: `Paquetería '${result.rows[0].carrier_key}' eliminada` });
  } catch (error) {
    console.error('Error deleting carrier option:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar opción de paquetería' });
  }
};

// =========================================
// PATCH /api/admin/carrier-options/:id/toggle
// Activar/desactivar opción de paquetería
// =========================================
export const toggleCarrierOption = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE carrier_service_options 
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1
      RETURNING id, carrier_key, is_active
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Opción de paquetería no encontrada' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error toggling carrier option:', error);
    res.status(500).json({ success: false, error: 'Error al cambiar estado de paquetería' });
  }
};
