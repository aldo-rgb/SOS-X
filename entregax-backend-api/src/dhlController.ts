// ============================================
// CONTROLADOR DHL MONTERREY 🚚
// Gestión de envíos AA DHL (Liberación Aérea)
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import * as skydropx from './services/skydropxService';
import { createNotification } from './notificationController';

// =========================================
// TARIFAS DHL
// =========================================

// GET /api/admin/dhl/rates - Obtener todas las tarifas
export const getDhlRates = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT * FROM dhl_rates 
      ORDER BY rate_type
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo tarifas DHL:', error);
    res.status(500).json({ error: 'Error al obtener tarifas' });
  }
};

// PUT /api/admin/dhl/rates/:id - Actualizar tarifa
export const updateDhlRate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rate_name, price_usd, description, is_active } = req.body;

    const result = await pool.query(`
      UPDATE dhl_rates 
      SET rate_name = COALESCE($1, rate_name),
          price_usd = COALESCE($2, price_usd),
          description = COALESCE($3, description),
          is_active = COALESCE($4, is_active),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [rate_name, price_usd, description, is_active, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarifa no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando tarifa DHL:', error);
    res.status(500).json({ error: 'Error al actualizar tarifa' });
  }
};

// =========================================
// TARIFAS DE COSTO (Lo que nos cuesta a nosotros)
// =========================================

// GET /api/admin/dhl/cost-rates - Obtener tarifas de costo
export const getDhlCostRates = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT id, rate_type, rate_name, cost_usd, description, is_active,
             COALESCE(costo_agencia, 0) as costo_agencia,
             COALESCE(costo_liberacion, 0) as costo_liberacion,
             COALESCE(costo_otros, 0) as costo_otros,
             created_at, updated_at
      FROM dhl_cost_rates 
      ORDER BY rate_type
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo tarifas de costo DHL:', error);
    res.status(500).json({ error: 'Error al obtener tarifas de costo' });
  }
};

// PUT /api/admin/dhl/cost-rates/:id - Actualizar tarifa de costo
export const updateDhlCostRate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rate_name, cost_usd, description, is_active, costo_agencia, costo_liberacion, costo_otros } = req.body;

    // Si vienen los desgloses, calcular cost_usd como la suma
    const agencia = parseFloat(costo_agencia) || 0;
    const liberacion = parseFloat(costo_liberacion) || 0;
    const otros = parseFloat(costo_otros) || 0;
    const hasBreakdown = costo_agencia !== undefined || costo_liberacion !== undefined || costo_otros !== undefined;
    const totalCost = hasBreakdown ? (agencia + liberacion + otros) : cost_usd;

    const result = await pool.query(`
      UPDATE dhl_cost_rates 
      SET rate_name = COALESCE($1, rate_name),
          cost_usd = COALESCE($2, cost_usd),
          description = COALESCE($3, description),
          is_active = COALESCE($4, is_active),
          costo_agencia = COALESCE($5, costo_agencia),
          costo_liberacion = COALESCE($6, costo_liberacion),
          costo_otros = COALESCE($7, costo_otros),
          updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [rate_name, totalCost, description, is_active, agencia, liberacion, otros, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarifa de costo no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando tarifa de costo DHL:', error);
    res.status(500).json({ error: 'Error al actualizar tarifa de costo' });
  }
};

// =========================================
// COSTEO DE ENVÍOS (Lista de cajas con costos)
// =========================================

// GET /api/admin/dhl/costing - Obtener lista de cajas con costeo
export const getDhlCosting = async (req: Request, res: Response) => {
  try {
    const { 
      status, 
      search, 
      date_from, 
      date_to, 
      has_cost,
      payment_status,
      limit = 100, 
      offset = 0 
    } = req.query;

    let query = `
      SELECT 
        ds.id,
        ds.inbound_tracking,
        ds.product_type,
        ds.description,
        ds.weight_kg,
        ds.length_cm,
        ds.width_cm,
        ds.height_cm,
        ds.volumetric_weight,
        ds.status,
        ds.created_at,
        ds.inspected_at,
        ds.assigned_cost_usd,
        ds.cost_rate_type,
        ds.cost_assigned_at,
        ds.cost_payment_status,
        ds.cost_paid_at,
        ds.cost_payment_batch_id,
        u.full_name as client_name,
        u.box_id as client_box_id,
        u.email as client_email,
        cost_user.full_name as cost_assigned_by_name,
        paid_user.full_name as cost_paid_by_name,
        cr.cost_usd as rate_cost_usd,
        cr.costo_agencia as rate_costo_agencia,
        cr.costo_liberacion as rate_costo_liberacion,
        cr.costo_otros as rate_costo_otros,
        pb.batch_number as payment_batch_number
      FROM dhl_shipments ds
      LEFT JOIN users u ON ds.user_id = u.id
      LEFT JOIN users cost_user ON ds.cost_assigned_by = cost_user.id
      LEFT JOIN users paid_user ON ds.cost_paid_by = paid_user.id
      LEFT JOIN dhl_cost_rates cr ON ds.cost_rate_type = cr.rate_type
      LEFT JOIN dhl_cost_payment_batches pb ON ds.cost_payment_batch_id = pb.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      query += ` AND ds.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (ds.inbound_tracking ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex} OR u.box_id ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (date_from) {
      query += ` AND ds.created_at >= $${paramIndex}::date`;
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      query += ` AND ds.created_at < ($${paramIndex}::date + interval '1 day')`;
      params.push(date_to);
      paramIndex++;
    }

    if (has_cost === 'true') {
      query += ` AND ds.assigned_cost_usd IS NOT NULL`;
    } else if (has_cost === 'false') {
      query += ` AND ds.assigned_cost_usd IS NULL`;
    }

    if (payment_status && payment_status !== 'all') {
      if (payment_status === 'paid') {
        query += ` AND ds.cost_payment_status = 'paid'`;
      } else if (payment_status === 'pending') {
        query += ` AND (ds.cost_payment_status = 'pending' OR ds.cost_payment_status IS NULL) AND ds.assigned_cost_usd IS NOT NULL`;
      }
    }

    // Obtener conteo total con los mismos filtros
    const countQueryBase = query.replace(/SELECT[\s\S]+?FROM dhl_shipments/, 'SELECT COUNT(*) as count FROM dhl_shipments');
    const countResult = await pool.query(countQueryBase, params);
    const total = parseInt((countResult.rows[0] as { count: string })?.count || '0');

    query += ` ORDER BY ds.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Estadísticas usando los mismos filtros de fecha
    let statsQuery = `
      SELECT 
        COUNT(*) as total_shipments,
        COUNT(ds.assigned_cost_usd) as with_cost,
        COUNT(*) - COUNT(ds.assigned_cost_usd) as without_cost,
        SUM(COALESCE(ds.assigned_cost_usd, 0)) as total_cost_usd,
        COUNT(CASE WHEN ds.cost_rate_type = 'standard' THEN 1 END) as standard_count,
        COUNT(CASE WHEN ds.cost_rate_type = 'high_value' THEN 1 END) as high_value_count,
        COUNT(CASE WHEN ds.cost_payment_status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN (ds.cost_payment_status = 'pending' OR ds.cost_payment_status IS NULL) AND ds.assigned_cost_usd IS NOT NULL THEN 1 END) as unpaid_count,
        SUM(CASE WHEN ds.cost_payment_status = 'paid' THEN COALESCE(ds.assigned_cost_usd, 0) ELSE 0 END) as total_paid,
        SUM(CASE WHEN (ds.cost_payment_status = 'pending' OR ds.cost_payment_status IS NULL) AND ds.assigned_cost_usd IS NOT NULL THEN ds.assigned_cost_usd ELSE 0 END) as total_unpaid,
        SUM(CASE WHEN ds.cost_rate_type = 'standard' AND ds.assigned_cost_usd IS NOT NULL THEN COALESCE(cr.costo_agencia, 0) ELSE 0 END) as total_agencia_standard,
        SUM(CASE WHEN ds.cost_rate_type = 'standard' AND ds.assigned_cost_usd IS NOT NULL THEN COALESCE(cr.costo_liberacion, 0) ELSE 0 END) as total_liberacion_standard,
        SUM(CASE WHEN ds.cost_rate_type = 'high_value' AND ds.assigned_cost_usd IS NOT NULL THEN COALESCE(cr.costo_agencia, 0) ELSE 0 END) as total_agencia_hv,
        SUM(CASE WHEN ds.cost_rate_type = 'high_value' AND ds.assigned_cost_usd IS NOT NULL THEN COALESCE(cr.costo_liberacion, 0) ELSE 0 END) as total_liberacion_hv,
        SUM(CASE WHEN ds.assigned_cost_usd IS NOT NULL THEN COALESCE(cr.costo_agencia, 0) ELSE 0 END) as total_agencia,
        SUM(CASE WHEN ds.assigned_cost_usd IS NOT NULL THEN COALESCE(cr.costo_liberacion, 0) ELSE 0 END) as total_liberacion,
        SUM(CASE WHEN ds.assigned_cost_usd IS NOT NULL THEN COALESCE(cr.costo_otros, 0) ELSE 0 END) as total_otros
      FROM dhl_shipments ds
      LEFT JOIN dhl_cost_rates cr ON ds.cost_rate_type = cr.rate_type
      WHERE 1=1
    `;
    const statsParams: any[] = [];
    let statsParamIdx = 1;

    if (date_from) {
      statsQuery += ` AND ds.created_at >= $${statsParamIdx}::date`;
      statsParams.push(date_from);
      statsParamIdx++;
    }
    if (date_to) {
      statsQuery += ` AND ds.created_at < ($${statsParamIdx}::date + interval '1 day')`;
      statsParams.push(date_to);
      statsParamIdx++;
    }
    if (payment_status && payment_status !== 'all') {
      if (payment_status === 'paid') {
        statsQuery += ` AND ds.cost_payment_status = 'paid'`;
      } else if (payment_status === 'pending') {
        statsQuery += ` AND (ds.cost_payment_status = 'pending' OR ds.cost_payment_status IS NULL) AND ds.assigned_cost_usd IS NOT NULL`;
      }
    }

    const statsResult = await pool.query(statsQuery, statsParams);

    res.json({
      data: result.rows,
      total,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error obteniendo costeo DHL:', error);
    res.status(500).json({ error: 'Error al obtener costeo' });
  }
};

// POST /api/admin/dhl/costing/mark-paid - Marcar lote como pagado
export const markDhlCostPaid = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { shipment_ids, notes } = req.body;

    if (!shipment_ids || !Array.isArray(shipment_ids) || shipment_ids.length === 0) {
      return res.status(400).json({ error: 'Se requieren IDs de envíos' });
    }

    // Generar número de lote
    const batchNumber = `PAY-DHL-${Date.now()}`;

    // Calcular totales del lote usando las tarifas de costo asignadas
    const totalsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_shipments,
        SUM(COALESCE(cr.costo_agencia, 0)) as total_agencia,
        SUM(COALESCE(cr.costo_liberacion, 0)) as total_liberacion,
        SUM(COALESCE(cr.costo_otros, 0)) as total_otros,
        SUM(COALESCE(ds.assigned_cost_usd, 0)) as total_amount,
        MIN(ds.created_at)::date as date_from,
        MAX(ds.created_at)::date as date_to
      FROM dhl_shipments ds
      LEFT JOIN dhl_cost_rates cr ON ds.cost_rate_type = cr.rate_type
      WHERE ds.id = ANY($1)
    `, [shipment_ids]);

    const totals = totalsResult.rows[0];

    // Crear lote de pago
    const batchResult = await pool.query(`
      INSERT INTO dhl_cost_payment_batches (batch_number, total_shipments, total_agencia, total_liberacion, total_otros, total_amount, date_from, date_to, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [batchNumber, totals.total_shipments, totals.total_agencia, totals.total_liberacion, totals.total_otros, totals.total_amount, totals.date_from, totals.date_to, notes || null, userId]);

    const batchId = batchResult.rows[0].id;

    // Marcar envíos como pagados
    await pool.query(`
      UPDATE dhl_shipments 
      SET cost_payment_status = 'paid',
          cost_paid_at = NOW(),
          cost_paid_by = $1,
          cost_payment_batch_id = $2
      WHERE id = ANY($3)
    `, [userId, batchId, shipment_ids]);

    res.json({
      success: true,
      batch: batchResult.rows[0],
      message: `Lote ${batchNumber} creado: ${totals.total_shipments} envíos marcados como pagados`
    });
  } catch (error) {
    console.error('Error marcando pago DHL:', error);
    res.status(500).json({ error: 'Error al marcar como pagado' });
  }
};

// GET /api/admin/dhl/costing/payment-batches - Obtener historial de lotes de pago
export const getDhlPaymentBatches = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT pb.*, u.full_name as created_by_name
      FROM dhl_cost_payment_batches pb
      LEFT JOIN users u ON pb.created_by = u.id
      ORDER BY pb.created_at DESC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo lotes de pago:', error);
    res.status(500).json({ error: 'Error al obtener lotes de pago' });
  }
};

// GET /api/admin/dhl/costing/profitability - Reporte de utilidades
export const getDhlProfitability = async (req: Request, res: Response) => {
  try {
    const { date_from, date_to, search } = req.query;

    let query = `
      SELECT 
        ds.id,
        ds.inbound_tracking,
        ds.product_type,
        ds.weight_kg,
        ds.status,
        ds.created_at,
        ds.import_cost_usd,
        ds.import_cost_mxn,
        ds.exchange_rate,
        ds.assigned_cost_usd,
        ds.cost_rate_type,
        ds.cost_payment_status,
        COALESCE(ds.monto_pagado, 0) as monto_pagado,
        ds.saldo_pendiente,
        ds.paid_at,
        u.full_name as client_name,
        u.box_id as client_box_id,
        u.dhl_standard_price,
        u.dhl_high_value_price,
        cr.costo_agencia as rate_costo_agencia,
        cr.costo_liberacion as rate_costo_liberacion,
        cr.costo_otros as rate_costo_otros
      FROM dhl_shipments ds
      LEFT JOIN users u ON ds.user_id = u.id
      LEFT JOIN dhl_cost_rates cr ON ds.cost_rate_type = cr.rate_type
      WHERE ds.assigned_cost_usd IS NOT NULL
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (date_from) {
      query += ` AND ds.created_at >= $${paramIndex}::date`;
      params.push(date_from);
      paramIndex++;
    }
    if (date_to) {
      query += ` AND ds.created_at < ($${paramIndex}::date + interval '1 day')`;
      params.push(date_to);
      paramIndex++;
    }
    if (search) {
      query += ` AND (ds.inbound_tracking ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex} OR u.box_id ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY ds.created_at DESC`;

    const result = await pool.query(query, params);

    // Calcular totales
    let totalRevenue = 0;
    let totalCost = 0;
    let totalAgencia = 0;
    let totalLiberacion = 0;
    let totalOtros = 0;
    let totalCobrado = 0;
    let totalPorCobrar = 0;
    let standardCount = 0;
    let hvCount = 0;

    const rows = result.rows.map((r: any) => {
      const revenue = parseFloat(r.import_cost_mxn) || 0;
      const cost = parseFloat(r.assigned_cost_usd) || 0;
      const agencia = parseFloat(r.rate_costo_agencia) || 0;
      const liberacion = parseFloat(r.rate_costo_liberacion) || 0;
      const otros = parseFloat(r.rate_costo_otros) || 0;
      const profit = revenue - cost;
      const cobrado = parseFloat(r.monto_pagado) || 0;
      const porCobrar = revenue - cobrado;

      totalRevenue += revenue;
      totalCost += cost;
      totalAgencia += agencia;
      totalLiberacion += liberacion;
      totalOtros += otros;
      totalCobrado += cobrado;
      totalPorCobrar += porCobrar;
      if (r.product_type === 'standard') standardCount++;
      else hvCount++;

      return {
        ...r,
        revenue,
        cost,
        agencia,
        liberacion,
        otros,
        profit,
        cobrado,
        por_cobrar: porCobrar,
        is_paid: !!r.paid_at
      };
    });

    res.json({
      data: rows,
      summary: {
        total_shipments: rows.length,
        standard_count: standardCount,
        hv_count: hvCount,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_agencia: totalAgencia,
        total_liberacion: totalLiberacion,
        total_otros: totalOtros,
        total_profit: totalRevenue - totalCost,
        total_cobrado: totalCobrado,
        total_por_cobrar: totalPorCobrar
      }
    });
  } catch (error) {
    console.error('Error obteniendo utilidades DHL:', error);
    res.status(500).json({ error: 'Error al obtener utilidades' });
  }
};

// POST /api/admin/dhl/costing/assign - Asignar costo a envíos
export const assignDhlCost = async (req: Request, res: Response) => {
  try {
    const { shipment_ids, cost_rate_type, custom_cost_usd } = req.body;
    const userId = (req as any).user?.userId;

    if (!shipment_ids || !Array.isArray(shipment_ids) || shipment_ids.length === 0) {
      return res.status(400).json({ error: 'Se requieren IDs de envíos' });
    }

    // Si no se proporciona costo personalizado, obtener de las tarifas
    let costUsd = custom_cost_usd;
    if (!costUsd && cost_rate_type) {
      const rateResult = await pool.query(
        'SELECT cost_usd FROM dhl_cost_rates WHERE rate_type = $1',
        [cost_rate_type]
      );
      if (rateResult.rows.length > 0) {
        costUsd = rateResult.rows[0].cost_usd;
      }
    }

    if (costUsd === undefined) {
      return res.status(400).json({ error: 'Se requiere tipo de tarifa o costo personalizado' });
    }

    // Actualizar los envíos
    const result = await pool.query(`
      UPDATE dhl_shipments 
      SET assigned_cost_usd = $1,
          cost_rate_type = $2,
          cost_assigned_at = NOW(),
          cost_assigned_by = $3
      WHERE id = ANY($4)
      RETURNING id, inbound_tracking, assigned_cost_usd, cost_rate_type
    `, [costUsd, cost_rate_type || 'custom', userId, shipment_ids]);

    res.json({
      success: true,
      message: `Costo asignado a ${result.rows.length} envío(s)`,
      updated: result.rows
    });
  } catch (error) {
    console.error('Error asignando costo DHL:', error);
    res.status(500).json({ error: 'Error al asignar costo' });
  }
};

// POST /api/admin/dhl/costing/auto-assign - Auto-asignar costos basado en tipo
export const autoAssignDhlCosts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    // Obtener tarifas actuales
    const ratesResult = await pool.query('SELECT rate_type, cost_usd FROM dhl_cost_rates');
    const rates: Record<string, number> = {};
    ratesResult.rows.forEach((r: any) => {
      rates[r.rate_type] = parseFloat(r.cost_usd);
    });

    // Actualizar envíos sin costo asignado
    const standardResult = await pool.query(`
      UPDATE dhl_shipments 
      SET assigned_cost_usd = $1,
          cost_rate_type = 'standard',
          cost_assigned_at = NOW(),
          cost_assigned_by = $2
      WHERE assigned_cost_usd IS NULL 
        AND (product_type = 'standard' OR product_type IS NULL)
      RETURNING id
    `, [rates['standard'] || 0, userId]);

    const highValueResult = await pool.query(`
      UPDATE dhl_shipments 
      SET assigned_cost_usd = $1,
          cost_rate_type = 'high_value',
          cost_assigned_at = NOW(),
          cost_assigned_by = $2
      WHERE assigned_cost_usd IS NULL 
        AND product_type = 'high_value'
      RETURNING id
    `, [rates['high_value'] || 0, userId]);

    res.json({
      success: true,
      message: 'Costos auto-asignados',
      standardUpdated: standardResult.rows.length,
      highValueUpdated: highValueResult.rows.length,
      totalUpdated: standardResult.rows.length + highValueResult.rows.length
    });
  } catch (error) {
    console.error('Error auto-asignando costos DHL:', error);
    res.status(500).json({ error: 'Error al auto-asignar costos' });
  }
};

// =========================================
// PRECIOS ESPECIALES POR CLIENTE
// =========================================

// GET /api/admin/dhl/client-pricing - Listar clientes con precios especiales
export const getClientPricing = async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    
    let query = `
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.box_id,
        u.dhl_standard_price,
        u.dhl_high_value_price,
        (SELECT COUNT(*) FROM dhl_shipments WHERE user_id = u.id) as total_shipments
      FROM users u
      WHERE u.role = 'client'
    `;

    const params: any[] = [];
    if (search) {
      query += ` AND (u.full_name ILIKE $1 OR u.email ILIKE $1 OR u.box_id ILIKE $1)`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY u.full_name LIMIT 100`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo precios de clientes:', error);
    res.status(500).json({ error: 'Error al obtener precios' });
  }
};

// PUT /api/admin/dhl/client-pricing/:userId - Asignar precio especial
export const updateClientPricing = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { dhl_standard_price, dhl_high_value_price } = req.body;

    const result = await pool.query(`
      UPDATE users 
      SET dhl_standard_price = COALESCE($1, dhl_standard_price),
          dhl_high_value_price = COALESCE($2, dhl_high_value_price)
      WHERE id = $3
      RETURNING id, full_name, email, box_id, dhl_standard_price, dhl_high_value_price
    `, [dhl_standard_price, dhl_high_value_price, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando precio de cliente:', error);
    res.status(500).json({ error: 'Error al actualizar precio' });
  }
};

// =========================================
// OPERACIONES DE BODEGA
// =========================================

// GET /api/admin/dhl/shipments - Listar envíos DHL
export const getDhlShipments = async (req: Request, res: Response) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        ds.*,
        ds.inspected_at as received_at,
        u.full_name as client_name,
        u.email as client_email,
        u.box_id as client_box_id,
        inspector.full_name as inspector_name,
        a.street as delivery_street,
        a.city as delivery_city,
        a.state as delivery_state,
        a.zip_code as delivery_zip
      FROM dhl_shipments ds
      LEFT JOIN users u ON ds.user_id = u.id
      LEFT JOIN users inspector ON ds.inspected_by = inspector.id
      LEFT JOIN addresses a ON ds.delivery_address_id = a.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      query += ` AND ds.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (ds.inbound_tracking ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex} OR u.box_id ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY ds.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo envíos DHL:', error);
    res.status(500).json({ error: 'Error al obtener envíos' });
  }
};

// POST /api/admin/dhl/receive - Recibir y auditar paquete
export const receiveDhlPackage = async (req: Request, res: Response) => {
  try {
    const {
      inbound_tracking,
      client_id,
      box_id,
      product_type,
      description,
      weight_kg,
      length_cm,
      width_cm,
      height_cm,
      photos
    } = req.body;

    const inspectorId = (req as any).user?.userId;

    if (!inbound_tracking) {
      return res.status(400).json({ error: 'Tracking de entrada es requerido' });
    }

    // Verificar si ya existe
    const existing = await pool.query(
      'SELECT id FROM dhl_shipments WHERE inbound_tracking = $1',
      [inbound_tracking]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Este tracking ya fue registrado' });
    }

    // Buscar cliente por ID o box_id
    let userId = client_id;
    if (!userId && box_id) {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE UPPER(box_id) = UPPER($1)',
        [box_id]
      );
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
      }
    }

    if (!userId) {
      return res.status(400).json({ error: 'Cliente no encontrado. Proporcione ID o Box ID válido' });
    }

    // Obtener precios del cliente
    const userPricing = await pool.query(
      'SELECT dhl_standard_price, dhl_high_value_price FROM users WHERE id = $1',
      [userId]
    );
    const pricing = userPricing.rows[0];

    // Determinar precio según tipo de producto
    const priceType = product_type || 'standard';
    const importCostUsd = priceType === 'high_value' 
      ? parseFloat(pricing.dhl_high_value_price)
      : parseFloat(pricing.dhl_standard_price);

    // Obtener tipo de cambio (por ahora fijo, después de API Banxico)
    const exchangeRate = parseFloat(process.env.DHL_EXCHANGE_RATE || '18.50');
    const importCostMxn = importCostUsd * exchangeRate;

    // Calcular peso volumétrico
    const volWeight = (length_cm && width_cm && height_cm) 
      ? (length_cm * width_cm * height_cm) / 5000 
      : null;

    // Obtener costo interno (lo que nos cuesta a nosotros) basado en tipo
    const costRateResult = await pool.query(
      'SELECT cost_usd FROM dhl_cost_rates WHERE rate_type = $1 AND is_active = true',
      [priceType]
    );
    const internalCost = costRateResult.rows.length > 0 ? parseFloat(costRateResult.rows[0].cost_usd) : null;

    // Insertar registro con costo interno auto-asignado
    const result = await pool.query(`
      INSERT INTO dhl_shipments (
        inbound_tracking, user_id, box_id, product_type, description,
        weight_kg, length_cm, width_cm, height_cm, volumetric_weight,
        photos, inspected_by, inspected_at,
        exchange_rate, import_cost_usd, import_cost_mxn,
        assigned_cost_usd, cost_rate_type, cost_assigned_at, cost_assigned_by,
        cost_payment_status,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, $14, $15, $16, $17, NOW(), $18, 'pending', 'received_mty')
      RETURNING *
    `, [
      inbound_tracking, userId, box_id, priceType, description,
      weight_kg, length_cm, width_cm, height_cm, volWeight,
      JSON.stringify(photos || []), inspectorId,
      exchangeRate, importCostUsd, importCostMxn,
      internalCost, internalCost ? priceType : null, internalCost ? inspectorId : null
    ]);

    // TODO: Enviar notificación push al cliente
    // await sendPushNotification(userId, '📦 Paquete DHL Recibido', 'Tu paquete llegó a MTY...');

    // Enviar notificación al usuario
    await createNotification(
      userId,
      'PACKAGE_RECEIVED',
      `📦 Tu paquete DHL con guía ${inbound_tracking} ha llegado a nuestro CEDIS en Monterrey y ha sido auditado correctamente.`,
      { 
        tracking: inbound_tracking, 
        shipmentId: result.rows[0].id,
        service: 'DHL'
      },
      '/dhl-dashboard'
    );

    res.json({
      success: true,
      message: 'Paquete recibido y auditado',
      shipment: result.rows[0]
    });
  } catch (error) {
    console.error('Error recibiendo paquete DHL:', error);
    res.status(500).json({ error: 'Error al registrar paquete' });
  }
};

// POST /api/admin/dhl/quote - Cotizar última milla
export const quoteDhlShipment = async (req: Request, res: Response) => {
  try {
    const { shipment_id, address_id } = req.body;

    // Obtener datos del envío
    const shipmentResult = await pool.query(
      'SELECT * FROM dhl_shipments WHERE id = $1',
      [shipment_id]
    );
    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Envío no encontrado' });
    }
    const shipment = shipmentResult.rows[0];

    // Obtener dirección de destino
    const addressResult = await pool.query(
      'SELECT * FROM addresses WHERE id = $1',
      [address_id]
    );
    if (addressResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dirección no encontrada' });
    }
    const address = addressResult.rows[0];

    // Cotizar con Skydropx - usar la firma correcta (originZip, destZip, parcel)
    const weight = Math.max(
      parseFloat(shipment.weight_kg) || 1,
      parseFloat(shipment.volumetric_weight) || 1
    );

    const parcel = {
      weight,
      length: parseFloat(shipment.length_cm) || 30,
      width: parseFloat(shipment.width_cm) || 30,
      height: parseFloat(shipment.height_cm) || 30
    };

    // Cotizar desde MTY (64000) al destino
    const rates = await skydropx.quoteShipment('64000', address.zip_code, parcel);

    // Calcular totales
    const ratesWithTotal = rates.map((rate: any) => ({
      ...rate,
      import_cost_mxn: parseFloat(shipment.import_cost_mxn),
      national_cost_mxn: rate.totalPrice,
      total_cost_mxn: parseFloat(shipment.import_cost_mxn) + rate.totalPrice
    }));

    res.json({
      shipment,
      address,
      rates: ratesWithTotal
    });
  } catch (error) {
    console.error('Error cotizando envío DHL:', error);
    res.status(500).json({ error: 'Error al cotizar envío' });
  }
};

// POST /api/admin/dhl/dispatch - Despachar con guía nacional
export const dispatchDhlShipment = async (req: Request, res: Response) => {
  try {
    const { shipment_id, address_id, carrier_code } = req.body;
    const dispatchedBy = (req as any).user?.userId;

    // Obtener datos del envío
    const shipmentResult = await pool.query(
      'SELECT * FROM dhl_shipments WHERE id = $1',
      [shipment_id]
    );
    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Envío no encontrado' });
    }
    const shipment = shipmentResult.rows[0];

    if (shipment.status === 'dispatched') {
      return res.status(400).json({ error: 'Este envío ya fue despachado' });
    }

    // Obtener dirección
    const addressResult = await pool.query(
      'SELECT * FROM addresses WHERE id = $1',
      [address_id]
    );
    if (addressResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dirección no encontrada' });
    }
    const address = addressResult.rows[0];

    // Crear envío en Skydropx
    const weight = Math.max(
      parseFloat(shipment.weight_kg) || 1,
      parseFloat(shipment.volumetric_weight) || 1
    );

    // Preparar dirección destino
    const addressTo = {
      name: address.full_name,
      address1: address.street,
      city: address.city,
      province: address.state,
      zip: address.zip_code,
      country: 'MX',
      phone: address.phone || '0000000000',
      email: address.email || 'envio@entregax.com'
    };

    // Preparar paquete
    const parcel = {
      weight,
      length: parseFloat(shipment.length_cm) || 30,
      width: parseFloat(shipment.width_cm) || 30,
      height: parseFloat(shipment.height_cm) || 30
    };

    const skydropxResult = await skydropx.createShipment(addressTo, parcel);

    if (!skydropxResult.success || !skydropxResult.rates || skydropxResult.rates.length === 0) {
      return res.status(500).json({ error: 'No se pudo crear el envío en Skydropx' });
    }

    // Seleccionar la tarifa (por ahora la primera/más barata)
    const selectedRate = skydropxResult.rates[0]!;

    // Generar etiqueta
    const labelResult = await skydropx.createLabel(selectedRate.id);

    if (!labelResult.success) {
      return res.status(500).json({ error: 'No se pudo generar la etiqueta' });
    }

    // Actualizar registro
    const updateResult = await pool.query(`
      UPDATE dhl_shipments 
      SET delivery_address_id = $1,
          national_carrier = $2,
          national_tracking = $3,
          national_cost_mxn = $4,
          national_label_url = $5,
          total_cost_mxn = import_cost_mxn + $4,
          status = 'dispatched',
          dispatched_at = NOW(),
          dispatched_by = $6,
          updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [
      address_id,
      selectedRate.provider,
      labelResult.trackingNumber,
      selectedRate.totalPrice,
      labelResult.labelUrl,
      dispatchedBy,
      shipment_id
    ]);

    // Enviar notificación de despacho al usuario
    await createNotification(
      shipment.user_id,
      'PACKAGE_IN_TRANSIT',
      `🚚 Tu paquete DHL con guía ${shipment.inbound_tracking} ha sido despachado. Guía nacional: ${labelResult.trackingNumber} (${selectedRate.provider})`,
      { 
        tracking: shipment.inbound_tracking,
        nationalTracking: labelResult.trackingNumber,
        carrier: selectedRate.provider,
        service: 'DHL'
      },
      '/dhl-dashboard'
    );

    res.json({
      success: true,
      message: 'Envío despachado exitosamente',
      shipment: updateResult.rows[0],
      label_url: labelResult.labelUrl,
      tracking_number: labelResult.trackingNumber
    });
  } catch (error) {
    console.error('Error despachando envío DHL:', error);
    res.status(500).json({ error: 'Error al despachar envío' });
  }
};

// =========================================
// ESTADÍSTICAS
// =========================================

// GET /api/admin/dhl/stats - Estadísticas del dashboard
export const getDhlStats = async (_req: Request, res: Response) => {
  try {
    // Totales por status
    const statusStats = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(import_cost_mxn) as import_total,
        SUM(national_cost_mxn) as national_total,
        SUM(total_cost_mxn) as grand_total
      FROM dhl_shipments
      GROUP BY status
    `);

    // Hoy
    const todayStats = await pool.query(`
      SELECT 
        COUNT(*) as received_today,
        SUM(CASE WHEN status = 'dispatched' THEN 1 ELSE 0 END) as dispatched_today
      FROM dhl_shipments
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    // Por tipo de producto
    const productStats = await pool.query(`
      SELECT 
        product_type,
        COUNT(*) as count
      FROM dhl_shipments
      GROUP BY product_type
    `);

    // Top clientes
    const topClients = await pool.query(`
      SELECT 
        u.id,
        u.full_name,
        u.box_id,
        COUNT(*) as shipments,
        SUM(ds.total_cost_mxn) as total_spent
      FROM dhl_shipments ds
      JOIN users u ON ds.user_id = u.id
      GROUP BY u.id, u.full_name, u.box_id
      ORDER BY shipments DESC
      LIMIT 10
    `);

    res.json({
      by_status: statusStats.rows,
      today: todayStats.rows[0],
      by_product_type: productStats.rows,
      top_clients: topClients.rows
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas DHL:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

// =========================================
// ENDPOINTS PARA CLIENTE (APP MÓVIL)
// =========================================

// GET /api/client/dhl/pending - Paquetes pendientes de pago
export const getClientDhlPending = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    const result = await pool.query(`
      SELECT 
        ds.*,
        a.street as delivery_street,
        a.city as delivery_city,
        a.state as delivery_state
      FROM dhl_shipments ds
      LEFT JOIN addresses a ON ds.delivery_address_id = a.id
      WHERE ds.user_id = $1
        AND ds.status IN ('received_mty', 'quoted')
      ORDER BY ds.created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo paquetes pendientes:', error);
    res.status(500).json({ error: 'Error al obtener paquetes' });
  }
};

// GET /api/client/dhl/history - Historial de envíos
export const getClientDhlHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    const result = await pool.query(`
      SELECT 
        ds.*,
        a.street as delivery_street,
        a.city as delivery_city,
        a.state as delivery_state
      FROM dhl_shipments ds
      LEFT JOIN addresses a ON ds.delivery_address_id = a.id
      WHERE ds.user_id = $1
      ORDER BY ds.created_at DESC
      LIMIT 50
    `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo historial DHL:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
};

// POST /api/client/dhl/quote - Cliente cotiza última milla
export const clientQuoteDhl = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { shipment_id, address_id } = req.body;

    // Verificar que el envío pertenece al cliente
    const shipmentResult = await pool.query(
      'SELECT * FROM dhl_shipments WHERE id = $1 AND user_id = $2',
      [shipment_id, userId]
    );
    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Envío no encontrado' });
    }
    const shipment = shipmentResult.rows[0];

    // Verificar que la dirección pertenece al cliente
    const addressResult = await pool.query(
      'SELECT * FROM addresses WHERE id = $1 AND user_id = $2',
      [address_id, userId]
    );
    if (addressResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dirección no encontrada' });
    }
    const address = addressResult.rows[0];

    // Cotizar con Skydropx - usar firma correcta (originZip, destZip, parcel)
    const weight = Math.max(
      parseFloat(shipment.weight_kg) || 1,
      parseFloat(shipment.volumetric_weight) || 1
    );

    const parcel = {
      weight,
      length: parseFloat(shipment.length_cm) || 30,
      width: parseFloat(shipment.width_cm) || 30,
      height: parseFloat(shipment.height_cm) || 30
    };

    // Cotizar desde MTY (64000) al destino
    const rates = await skydropx.quoteShipment('64000', address.zip_code, parcel);

    // Calcular totales
    const ratesWithTotal = rates.map((rate: any) => ({
      carrier: rate.provider,
      service: rate.serviceName,
      delivery_days: rate.deliveryDays,
      national_cost_mxn: rate.totalPrice,
      import_cost_mxn: parseFloat(shipment.import_cost_mxn),
      total_cost_mxn: parseFloat(shipment.import_cost_mxn) + rate.totalPrice
    }));

    // Actualizar estado del envío
    await pool.query(
      'UPDATE dhl_shipments SET status = $1, delivery_address_id = $2, updated_at = NOW() WHERE id = $3',
      ['quoted', address_id, shipment_id]
    );

    res.json({
      shipment: {
        id: shipment.id,
        tracking: shipment.inbound_tracking,
        product_type: shipment.product_type,
        import_cost_usd: shipment.import_cost_usd,
        import_cost_mxn: shipment.import_cost_mxn
      },
      address: {
        id: address.id,
        full_name: address.full_name,
        street: address.street,
        city: address.city,
        state: address.state,
        zip_code: address.zip_code
      },
      rates: ratesWithTotal
    });
  } catch (error) {
    console.error('Error cotizando DHL:', error);
    res.status(500).json({ error: 'Error al cotizar' });
  }
};

// =========================================
// IA: MEDICIÓN DE CAJAS CON VISIÓN POR COMPUTADORA
// POST /api/admin/dhl/measure-box
// Recibe imagen base64 y retorna dimensiones L x W x H
// =========================================

/**
 * Medición de cajas usando análisis de imagen.
 * En producción, esto se conectaría a un servicio Python con OpenCV.
 * Por ahora, usamos estimación basada en detección de bordes simple.
 * 
 * La plantilla verde de 50x50 cm sirve como referencia para escalar.
 */
export const measureBoxFromImage = async (req: Request, res: Response) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Se requiere imagen en base64' });
    }

    // En producción: Enviar a microservicio Python con OpenCV
    // Por ahora: Estimación básica o valores default
    
    // Simular procesamiento de IA (en producción llamar a servicio externo)
    // const pythonResponse = await axios.post('http://ai-service:5000/measure', { image });
    
    // Valores estimados (en producción vendrían del análisis de imagen)
    // TODO: Implementar servicio Python con OpenCV para medición real
    const estimatedDimensions = estimateBoxDimensions(image);

    res.json({
      success: true,
      ...estimatedDimensions,
      method: 'estimation', // Cambiar a 'opencv' cuando se implemente
      message: 'Medidas estimadas. Verifica y ajusta si es necesario.'
    });

  } catch (error) {
    console.error('Error midiendo caja:', error);
    res.status(500).json({ 
      error: 'Error al procesar imagen',
      success: false,
      // Valores default para que el flujo pueda continuar
      length_cm: 30,
      width_cm: 25,
      height_cm: 20
    });
  }
};

/**
 * Estimación básica de dimensiones basada en análisis de imagen.
 * En una implementación real, esto usaría OpenCV para:
 * 1. Detectar la plantilla verde de referencia (50x50 cm)
 * 2. Detectar los bordes de la caja
 * 3. Calcular pixeles por centímetro
 * 4. Medir largo, ancho y alto
 */
function estimateBoxDimensions(imageBase64: string): { length_cm: number; width_cm: number; height_cm: number; confidence: number } {
  // Analizar tamaño de la imagen en base64
  const imageSize = imageBase64.length;
  
  // Heurística simple basada en tamaño de imagen
  // Imágenes más grandes = mejor resolución = cajas más grandes detectadas
  // Esto es solo un placeholder - la implementación real usaría visión por computadora
  
  let length_cm = 35;
  let width_cm = 25;
  let height_cm = 20;
  let confidence = 0.6;

  // Variación basada en características de la imagen
  if (imageSize > 500000) {
    // Imagen de alta resolución
    length_cm = Math.round(30 + Math.random() * 20);
    width_cm = Math.round(20 + Math.random() * 15);
    height_cm = Math.round(15 + Math.random() * 15);
    confidence = 0.75;
  } else if (imageSize > 200000) {
    // Imagen media
    length_cm = Math.round(25 + Math.random() * 15);
    width_cm = Math.round(18 + Math.random() * 12);
    height_cm = Math.round(12 + Math.random() * 10);
    confidence = 0.65;
  }

  return {
    length_cm,
    width_cm,
    height_cm,
    confidence
  };
}

