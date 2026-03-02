// ============================================
// CONTROLADOR DE TARIFAS FCL POR CLIENTE/RUTA
// Sistema de precios personalizados para FCL
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

/**
 * GET /api/admin/fcl-rates/base-price
 * Obtener el precio base de FCL 40 Pies
 */
export const getFclBasePrice = async (req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT t.price 
      FROM pricing_tiers t
      JOIN pricing_categories c ON t.category_id = c.id
      WHERE c.name = 'FCL 40 Pies' AND t.is_active = true
      LIMIT 1
    `);

    const basePrice = result.rows[0]?.price || '27000.00';

    res.json({
      success: true,
      basePrice: parseFloat(basePrice)
    });
  } catch (error: any) {
    console.error('Error obteniendo precio base FCL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/admin/fcl-rates/clients
 * Obtener todos los clientes legacy con sus tarifas FCL personalizadas
 */
export const getFclClientRates = async (req: Request, res: Response): Promise<any> => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Obtener precio base FCL
    const basePriceResult = await pool.query(`
      SELECT t.price 
      FROM pricing_tiers t
      JOIN pricing_categories c ON t.category_id = c.id
      WHERE c.name = 'FCL 40 Pies' AND t.is_active = true
      LIMIT 1
    `);
    const basePrice = parseFloat(basePriceResult.rows[0]?.price || '27000.00');

    // Query base para clientes
    let whereClause = '';
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE lc.box_id ILIKE $${params.length} OR lc.full_name ILIKE $${params.length}`;
    }

    // Contar total
    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM legacy_clients lc ${whereClause}
    `, params);
    const total = parseInt(countResult.rows[0].total);

    // Obtener clientes con sus tarifas personalizadas
    const clientsResult = await pool.query(`
      SELECT 
        lc.id,
        lc.box_id,
        lc.full_name,
        lc.email,
        COALESCE(
          json_agg(
            json_build_object(
              'id', fcr.id,
              'route_id', fcr.route_id,
              'route_code', mr.code,
              'custom_price', fcr.custom_price_usd,
              'currency', COALESCE(fcr.currency, 'USD'),
              'is_wholesale', fcr.is_wholesale,
              'notes', fcr.notes
            )
          ) FILTER (WHERE fcr.id IS NOT NULL),
          '[]'
        ) as custom_rates
      FROM legacy_clients lc
      LEFT JOIN fcl_client_rates fcr ON fcr.legacy_client_id = lc.id
      LEFT JOIN maritime_routes mr ON mr.id = fcr.route_id
      ${whereClause}
      GROUP BY lc.id, lc.box_id, lc.full_name, lc.email
      ORDER BY lc.box_id ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, Number(limit), offset]);

    // Obtener rutas disponibles
    const routesResult = await pool.query(`
      SELECT id, code, name, fcl_price_usd FROM maritime_routes WHERE is_active = true ORDER BY code
    `);

    res.json({
      success: true,
      clients: clientsResult.rows,
      routes: routesResult.rows,
      basePrice,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    console.error('Error obteniendo tarifas FCL por cliente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/admin/fcl-rates/client
 * Crear o actualizar tarifa FCL para un cliente en una ruta específica
 */
export const upsertFclClientRate = async (req: Request, res: Response): Promise<any> => {
  try {
    const { legacyClientId, routeId, customPrice, currency, isWholesale, notes } = req.body;

    if (!legacyClientId) {
      return res.status(400).json({ success: false, error: 'Se requiere el ID del cliente' });
    }

    // Upsert: insertar o actualizar si ya existe
    const result = await pool.query(`
      INSERT INTO fcl_client_rates (legacy_client_id, route_id, custom_price_usd, currency, is_wholesale, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (legacy_client_id, route_id) 
      DO UPDATE SET 
        custom_price_usd = EXCLUDED.custom_price_usd,
        currency = EXCLUDED.currency,
        is_wholesale = EXCLUDED.is_wholesale,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `, [legacyClientId, routeId || null, customPrice || null, currency || 'USD', isWholesale || false, notes || null]);

    res.json({
      success: true,
      message: 'Tarifa guardada correctamente',
      rate: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error guardando tarifa FCL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * DELETE /api/admin/fcl-rates/client/:id
 * Eliminar tarifa FCL personalizada
 */
export const deleteFclClientRate = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM fcl_client_rates WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Tarifa eliminada correctamente'
    });
  } catch (error: any) {
    console.error('Error eliminando tarifa FCL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/admin/fcl-rates/calculate/:clientId
 * Calcular el precio FCL efectivo para un cliente en una ruta específica
 * Lógica de prioridad:
 * 1. Tarifa cliente+ruta específica
 * 2. Tarifa cliente global (route_id = null)
 * 3. Tarifa de la ruta
 * 4. Tarifa base FCL 40 Pies
 */
export const calculateEffectiveFclPrice = async (req: Request, res: Response): Promise<any> => {
  try {
    const { clientId } = req.params;
    const { routeId } = req.query;

    // 1. Buscar tarifa específica cliente+ruta
    if (routeId) {
      const specificRate = await pool.query(`
        SELECT custom_price_usd, is_wholesale FROM fcl_client_rates 
        WHERE legacy_client_id = $1 AND route_id = $2
      `, [clientId, routeId]);

      if (specificRate.rows.length > 0 && specificRate.rows[0].custom_price_usd) {
        return res.json({
          success: true,
          price: parseFloat(specificRate.rows[0].custom_price_usd),
          isWholesale: specificRate.rows[0].is_wholesale,
          source: 'client_route'
        });
      }
    }

    // 2. Buscar tarifa global del cliente (sin ruta específica)
    const globalRate = await pool.query(`
      SELECT custom_price_usd, is_wholesale FROM fcl_client_rates 
      WHERE legacy_client_id = $1 AND route_id IS NULL
    `, [clientId]);

    if (globalRate.rows.length > 0 && globalRate.rows[0].custom_price_usd) {
      return res.json({
        success: true,
        price: parseFloat(globalRate.rows[0].custom_price_usd),
        isWholesale: globalRate.rows[0].is_wholesale,
        source: 'client_global'
      });
    }

    // 3. Buscar tarifa de la ruta
    if (routeId) {
      const routeRate = await pool.query(`
        SELECT fcl_price_usd FROM maritime_routes WHERE id = $1
      `, [routeId]);

      if (routeRate.rows.length > 0 && routeRate.rows[0].fcl_price_usd) {
        return res.json({
          success: true,
          price: parseFloat(routeRate.rows[0].fcl_price_usd),
          isWholesale: false,
          source: 'route'
        });
      }
    }

    // 4. Precio base FCL 40 Pies
    const basePrice = await pool.query(`
      SELECT t.price 
      FROM pricing_tiers t
      JOIN pricing_categories c ON t.category_id = c.id
      WHERE c.name = 'FCL 40 Pies' AND t.is_active = true
      LIMIT 1
    `);

    res.json({
      success: true,
      price: parseFloat(basePrice.rows[0]?.price || '27000.00'),
      isWholesale: false,
      source: 'base'
    });
  } catch (error: any) {
    console.error('Error calculando precio FCL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
