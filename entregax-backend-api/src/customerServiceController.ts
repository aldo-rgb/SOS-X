import { Request, Response } from 'express';
import { pool } from './db';
import crypto from 'crypto';
import axios from 'axios';
import { createCustomNotification } from './notificationController';

// Helper: Enviar notificación push via Expo
const sendExpoPushNotification = async (pushToken: string, title: string, body: string, data?: object) => {
  try {
    if (!pushToken || !pushToken.startsWith('ExponentPushToken')) return;
    
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: pushToken,
      title,
      body,
      sound: 'default',
      badge: 1,
      data: data || {}
    });
    console.log(`📲 Push enviado a ${pushToken.substring(0, 30)}...`);
  } catch (error) {
    console.error('Error enviando push:', error);
  }
};

// ========== AJUSTES FINANCIEROS (CARGOS/DESCUENTOS) ==========

// Obtener ajustes de una guía
export const getAjustesGuia = async (req: Request, res: Response) => {
  const { tracking, servicio } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM guias_ajustes_financieros 
       WHERE guia_tracking = $1 AND servicio = $2 AND activo = TRUE
       ORDER BY fecha_registro DESC`,
      [tracking, servicio]
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error getAjustesGuia:', error);
    res.status(500).json({ error: error.message });
  }
};

// Crear ajuste financiero (cargo_extra o descuento)
export const createAjuste = async (req: Request, res: Response) => {
  const { guia_id, guia_tracking, servicio, tipo, monto, concepto, notas, cliente_id } = req.body;
  const autorizado_por = (req as any).user?.id || null;

  if (!['cargo_extra', 'descuento'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo debe ser cargo_extra o descuento' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO guias_ajustes_financieros 
       (guia_id, guia_tracking, servicio, tipo, monto, concepto, notas, autorizado_por, cliente_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [guia_id, guia_tracking, servicio, tipo, Math.abs(monto), concepto, notas, autorizado_por, cliente_id]
    );

    // Actualizar saldo_pendiente en la tabla correspondiente
    await actualizarSaldoGuia(guia_tracking, servicio);

    res.json({ success: true, ajuste: result.rows[0] });
  } catch (error: any) {
    console.error('Error createAjuste:', error);
    res.status(500).json({ error: error.message });
  }
};

// Eliminar ajuste (soft delete)
export const deleteAjuste = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE guias_ajustes_financieros SET activo = FALSE WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length > 0) {
      await actualizarSaldoGuia(result.rows[0].guia_tracking, result.rows[0].servicio);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleteAjuste:', error);
    res.status(500).json({ error: error.message });
  }
};

// Actualiza el saldo_pendiente sumando cargos y restando descuentos
async function actualizarSaldoGuia(tracking: string, servicio: string) {
  // Calcular suma de ajustes
  const ajustesResult = await pool.query(
    `SELECT 
       COALESCE(SUM(CASE WHEN tipo = 'cargo_extra' THEN monto ELSE 0 END), 0) as cargos,
       COALESCE(SUM(CASE WHEN tipo = 'descuento' THEN monto ELSE 0 END), 0) as descuentos
     FROM guias_ajustes_financieros
     WHERE guia_tracking = $1 AND servicio = $2 AND activo = TRUE`,
    [tracking, servicio]
  );
  const { cargos, descuentos } = ajustesResult.rows[0];

  // Obtener costo base según servicio
  let tableName = '';
  let trackingColumn = '';
  let costoColumn = '';
  
  switch (servicio) {
    case 'packages':
      tableName = 'packages';
      trackingColumn = 'tracking_number';
      costoColumn = 'assigned_cost_mxn';
      break;
    case 'dhl':
      tableName = 'dhl_shipments';
      trackingColumn = 'waybill_number';
      costoColumn = 'total_mxn';
      break;
    case 'china':
      tableName = 'china_receipts';
      trackingColumn = 'tracking_number';
      costoColumn = 'assigned_cost_mxn';
      break;
    case 'maritime':
      tableName = 'maritime_orders';
      trackingColumn = 'tracking_number';
      costoColumn = 'assigned_cost_mxn';
      break;
    case 'national':
      tableName = 'national_shipments';
      trackingColumn = 'tracking_number';
      costoColumn = 'total_cost';
      break;
    case 'maritime_ship':
      tableName = 'maritime_shipments';
      trackingColumn = 'tracking_number';
      costoColumn = 'assigned_cost_mxn';
      break;
    default:
      return;
  }

  // Obtener costo base
  const baseResult = await pool.query(
    `SELECT COALESCE(${costoColumn}, 0) as costo_base, COALESCE(monto_pagado, 0) as pagado 
     FROM ${tableName} WHERE ${trackingColumn} = $1`,
    [tracking]
  );

  if (baseResult.rows.length > 0) {
    const { costo_base, pagado } = baseResult.rows[0];
    const nuevoSaldo = parseFloat(costo_base) + parseFloat(cargos) - parseFloat(descuentos) - parseFloat(pagado);
    
    await pool.query(
      `UPDATE ${tableName} SET saldo_pendiente = $1 WHERE ${trackingColumn} = $2`,
      [Math.max(0, nuevoSaldo), tracking]
    );
  }
}

// ========== CARTERA VENCIDA ==========

// Obtener resumen de cartera por cliente
export const getCarteraCliente = async (req: Request, res: Response) => {
  const { clienteId } = req.params;
  try {
    // Consultar todas las tablas de guías
    const result = await pool.query(`
      SELECT * FROM (
        -- PACKAGES (POBOX_USA, AIR_CHN_MX)
        SELECT 
          p.id,
          'package' as source_type,
          p.tracking_internal as guia_tracking,
          COALESCE(p.service_type, 'POBOX_USA') as servicio,
          p.user_id as cliente_id,
          COALESCE(p.saldo_pendiente, p.assigned_cost_mxn, 0) as saldo_pendiente,
          COALESCE(p.assigned_cost_mxn, 0) as costo_base,
          GREATEST(EXTRACT(DAY FROM NOW() - COALESCE(p.received_at, p.created_at))::INTEGER, 0) as dias_en_almacen,
          p.payment_status,
          p.received_at as fecha_recepcion,
          COALESCE(p.description, p.destination_contact, 'Paquete') as descripcion
        FROM packages p
        WHERE p.user_id = $1
          AND (p.payment_status != 'paid' OR p.payment_status IS NULL)
        
        UNION ALL
        
        -- DHL_SHIPMENTS
        SELECT 
          d.id,
          'dhl' as source_type,
          d.inbound_tracking as guia_tracking,
          'DHL_MTY' as servicio,
          d.user_id as cliente_id,
          COALESCE(d.saldo_pendiente, d.total_cost_mxn, 0) as saldo_pendiente,
          COALESCE(d.total_cost_mxn, 0) as costo_base,
          GREATEST(EXTRACT(DAY FROM NOW() - COALESCE(d.inspected_at, d.created_at))::INTEGER, 0) as dias_en_almacen,
          CASE WHEN d.paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END as payment_status,
          d.inspected_at as fecha_recepcion,
          COALESCE(d.description, 'Paquete DHL') as descripcion
        FROM dhl_shipments d
        WHERE d.user_id = $1
          AND d.paid_at IS NULL
        
        UNION ALL
        
        -- NATIONAL_SHIPMENTS
        SELECT 
          n.id,
          'national' as source_type,
          n.tracking_number as guia_tracking,
          'LOGS_NAC' as servicio,
          n.user_id as cliente_id,
          COALESCE(n.saldo_pendiente, n.shipping_cost, 0) as saldo_pendiente,
          COALESCE(n.shipping_cost, 0) as costo_base,
          GREATEST(EXTRACT(DAY FROM NOW() - n.created_at)::INTEGER, 0) as dias_en_almacen,
          CASE WHEN n.paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END as payment_status,
          n.created_at as fecha_recepcion,
          COALESCE(n.destination_name, 'Envío Nacional') as descripcion
        FROM national_shipments n
        WHERE n.user_id = $1
          AND n.paid_at IS NULL
        
        UNION ALL
        
        -- MARITIME_SHIPMENTS
        SELECT 
          ms.id,
          'maritime' as source_type,
          ms.log_number as guia_tracking,
          'MARITIMO' as servicio,
          ms.user_id as cliente_id,
          COALESCE(ms.saldo_pendiente, ms.assigned_cost_mxn, 0) as saldo_pendiente,
          COALESCE(ms.assigned_cost_mxn, 0) as costo_base,
          GREATEST(EXTRACT(DAY FROM NOW() - ms.created_at)::INTEGER, 0) as dias_en_almacen,
          COALESCE(ms.payment_status, 'pending') as payment_status,
          ms.created_at as fecha_recepcion,
          'Embarque Marítimo' as descripcion
        FROM maritime_shipments ms
        WHERE ms.user_id = $1
          AND (ms.payment_status != 'paid' OR ms.payment_status IS NULL)
        
        UNION ALL
        
        -- CHINA_RECEIPTS
        SELECT 
          cr.id,
          'china_receipt' as source_type,
          cr.fno as guia_tracking,
          'AIR_CHN' as servicio,
          cr.user_id as cliente_id,
          COALESCE(cr.saldo_pendiente, cr.assigned_cost_mxn, 0) as saldo_pendiente,
          COALESCE(cr.assigned_cost_mxn, 0) as costo_base,
          GREATEST(EXTRACT(DAY FROM NOW() - cr.created_at)::INTEGER, 0) as dias_en_almacen,
          CASE WHEN cr.paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END as payment_status,
          cr.created_at as fecha_recepcion,
          COALESCE(cr.shipping_mark, 'Recepción China') as descripcion
        FROM china_receipts cr
        WHERE cr.user_id = $1
          AND cr.paid_at IS NULL
        
        UNION ALL
        
        -- MARITIME_ORDERS
        SELECT 
          mo.id,
          'maritime_order' as source_type,
          mo.ordersn as guia_tracking,
          'MAR_CHN' as servicio,
          mo.user_id as cliente_id,
          COALESCE(mo.saldo_pendiente, mo.assigned_cost_mxn, 0) as saldo_pendiente,
          COALESCE(mo.assigned_cost_mxn, 0) as costo_base,
          GREATEST(EXTRACT(DAY FROM NOW() - mo.created_at)::INTEGER, 0) as dias_en_almacen,
          CASE WHEN mo.paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END as payment_status,
          mo.created_at as fecha_recepcion,
          COALESCE(mo.shipping_mark, 'Pedido Marítimo') as descripcion
        FROM maritime_orders mo
        WHERE mo.user_id = $1
          AND mo.paid_at IS NULL
      ) combined
      ORDER BY dias_en_almacen DESC
    `, [clienteId]);

    // Agregar semáforo a cada registro
    const guias = result.rows.map(g => ({
      ...g,
      semaforo: g.dias_en_almacen < 30 ? 'verde' : g.dias_en_almacen < 60 ? 'amarillo' : 'rojo'
    }));

    res.json(guias);
  } catch (error: any) {
    console.error('Error getCarteraCliente:', error);
    res.status(500).json({ error: error.message });
  }
};

// Obtener dashboard general de cartera vencida
export const getCarteraDashboard = async (req: Request, res: Response) => {
  try {
    // Query unificada de todas las tablas
    const allGuias = await pool.query(`
      SELECT * FROM (
        -- PACKAGES
        SELECT 
          p.id, 'package' as source_type, p.tracking_internal as guia_tracking,
          COALESCE(p.service_type, 'POBOX_USA') as servicio, p.user_id as cliente_id,
          COALESCE(p.saldo_pendiente, p.assigned_cost_mxn, 0)::DECIMAL as saldo,
          GREATEST(EXTRACT(DAY FROM NOW() - COALESCE(p.received_at, p.created_at))::INTEGER, 0) as dias
        FROM packages p
        WHERE p.payment_status != 'paid' OR p.payment_status IS NULL
        
        UNION ALL
        
        -- DHL
        SELECT d.id, 'dhl', d.inbound_tracking, 'DHL_MTY', d.user_id,
          COALESCE(d.saldo_pendiente, d.total_cost_mxn, 0)::DECIMAL,
          GREATEST(EXTRACT(DAY FROM NOW() - COALESCE(d.inspected_at, d.created_at))::INTEGER, 0)
        FROM dhl_shipments d WHERE d.paid_at IS NULL
        
        UNION ALL
        
        -- NATIONAL
        SELECT n.id, 'national', n.tracking_number, 'LOGS_NAC', n.user_id,
          COALESCE(n.saldo_pendiente, n.shipping_cost, 0)::DECIMAL,
          GREATEST(EXTRACT(DAY FROM NOW() - n.created_at)::INTEGER, 0)
        FROM national_shipments n WHERE n.paid_at IS NULL
        
        UNION ALL
        
        -- MARITIME_SHIPMENTS
        SELECT ms.id, 'maritime', ms.log_number, 'MARITIMO', ms.user_id,
          COALESCE(ms.saldo_pendiente, ms.assigned_cost_mxn, 0)::DECIMAL,
          GREATEST(EXTRACT(DAY FROM NOW() - ms.created_at)::INTEGER, 0)
        FROM maritime_shipments ms WHERE ms.payment_status != 'paid' OR ms.payment_status IS NULL
        
        UNION ALL
        
        -- CHINA_RECEIPTS
        SELECT cr.id, 'china_receipt', cr.fno, 'AIR_CHN', cr.user_id,
          COALESCE(cr.saldo_pendiente, cr.assigned_cost_mxn, 0)::DECIMAL,
          GREATEST(EXTRACT(DAY FROM NOW() - cr.created_at)::INTEGER, 0)
        FROM china_receipts cr WHERE cr.paid_at IS NULL
        
        UNION ALL
        
        -- MARITIME_ORDERS
        SELECT mo.id, 'maritime_order', mo.ordersn, 'MAR_CHN', mo.user_id,
          COALESCE(mo.saldo_pendiente, mo.assigned_cost_mxn, 0)::DECIMAL,
          GREATEST(EXTRACT(DAY FROM NOW() - mo.created_at)::INTEGER, 0)
        FROM maritime_orders mo WHERE mo.paid_at IS NULL
      ) combined
    `);

    // Calcular estadísticas
    const guias = allGuias.rows;
    
    // Por servicio
    const porServicio: { [key: string]: { total: number; deuda: number } } = {};
    guias.forEach(g => {
      if (!porServicio[g.servicio]) {
        porServicio[g.servicio] = { total: 0, deuda: 0 };
      }
      const entry = porServicio[g.servicio];
      if (entry) {
        entry.total++;
        entry.deuda += parseFloat(g.saldo) || 0;
      }
    });

    // Por semáforo
    const porSemaforo = {
      verde: { total: 0, deuda: 0 },   // < 30 días
      amarillo: { total: 0, deuda: 0 }, // 30-59 días
      rojo: { total: 0, deuda: 0 }      // >= 60 días
    };
    
    guias.forEach(g => {
      const saldo = parseFloat(g.saldo) || 0;
      if (g.dias < 30) {
        porSemaforo.verde.total++;
        porSemaforo.verde.deuda += saldo;
      } else if (g.dias < 60) {
        porSemaforo.amarillo.total++;
        porSemaforo.amarillo.deuda += saldo;
      } else {
        porSemaforo.rojo.total++;
        porSemaforo.rojo.deuda += saldo;
      }
    });

    // Guías críticas (>= 60 días) con info de cliente
    const criticas = await pool.query(`
      SELECT g.*, u.full_name as cliente_nombre, u.phone as cliente_telefono, u.email as cliente_email
      FROM (
        SELECT p.id, 'package' as source_type, p.tracking_internal as guia_tracking,
          COALESCE(p.service_type, 'POBOX_USA') as servicio, p.user_id as cliente_id,
          COALESCE(p.saldo_pendiente, p.assigned_cost_mxn, 0) as saldo,
          GREATEST(EXTRACT(DAY FROM NOW() - COALESCE(p.received_at, p.created_at))::INTEGER, 0) as dias,
          COALESCE(p.description, 'Paquete') as descripcion
        FROM packages p WHERE (p.payment_status != 'paid' OR p.payment_status IS NULL)
          AND EXTRACT(DAY FROM NOW() - COALESCE(p.received_at, p.created_at)) >= 60
        
        UNION ALL
        
        SELECT d.id, 'dhl', d.inbound_tracking, 'DHL_MTY', d.user_id,
          COALESCE(d.saldo_pendiente, d.total_cost_mxn, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - COALESCE(d.inspected_at, d.created_at))::INTEGER, 0),
          COALESCE(d.description, 'DHL')
        FROM dhl_shipments d WHERE d.paid_at IS NULL
          AND EXTRACT(DAY FROM NOW() - COALESCE(d.inspected_at, d.created_at)) >= 60
        
        UNION ALL
        
        SELECT n.id, 'national', n.tracking_number, 'LOGS_NAC', n.user_id,
          COALESCE(n.saldo_pendiente, n.shipping_cost, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - n.created_at)::INTEGER, 0),
          COALESCE(n.destination_name, 'Nacional')
        FROM national_shipments n WHERE n.paid_at IS NULL
          AND EXTRACT(DAY FROM NOW() - n.created_at) >= 60
        
        UNION ALL
        
        SELECT ms.id, 'maritime', ms.log_number, 'MARITIMO', ms.user_id,
          COALESCE(ms.saldo_pendiente, ms.assigned_cost_mxn, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - ms.created_at)::INTEGER, 0), 'Marítimo'
        FROM maritime_shipments ms WHERE (ms.payment_status != 'paid' OR ms.payment_status IS NULL)
          AND EXTRACT(DAY FROM NOW() - ms.created_at) >= 60
        
        UNION ALL
        
        SELECT cr.id, 'china_receipt', cr.fno, 'AIR_CHN', cr.user_id,
          COALESCE(cr.saldo_pendiente, cr.assigned_cost_mxn, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - cr.created_at)::INTEGER, 0),
          COALESCE(cr.shipping_mark, 'China')
        FROM china_receipts cr WHERE cr.paid_at IS NULL
          AND EXTRACT(DAY FROM NOW() - cr.created_at) >= 60
        
        UNION ALL
        
        SELECT mo.id, 'maritime_order', mo.ordersn, 'MAR_CHN', mo.user_id,
          COALESCE(mo.saldo_pendiente, mo.assigned_cost_mxn, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - mo.created_at)::INTEGER, 0),
          COALESCE(mo.shipping_mark, 'Pedido')
        FROM maritime_orders mo WHERE mo.paid_at IS NULL
          AND EXTRACT(DAY FROM NOW() - mo.created_at) >= 60
      ) g
      LEFT JOIN users u ON g.cliente_id = u.id
      ORDER BY g.dias DESC
      LIMIT 50
    `);

    // Total deuda
    const totalDeuda = guias.reduce((sum, g) => sum + (parseFloat(g.saldo) || 0), 0);

    res.json({
      totalGuias: guias.length,
      totalDeuda,
      porServicio: Object.entries(porServicio).map(([servicio, data]) => ({
        servicio,
        total_guias: data.total,
        total_deuda: data.deuda
      })),
      porSemaforo,
      guiasCriticas: criticas.rows.map(g => ({
        ...g,
        cliente_nombre: g.cliente_nombre || 'Sin nombre',
        semaforo: 'rojo'
      }))
    });
  } catch (error: any) {
    console.error('Error getCarteraDashboard:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar guías para CS con filtros (consulta todas las tablas)
export const searchGuiasCS = async (req: Request, res: Response) => {
  const { servicio, tracking, clienteId, semaforo } = req.query;
  
  try {
    // Construir query base
    let baseQuery = `
      SELECT * FROM (
        -- PACKAGES
        SELECT 
          p.id, 'package' as source_type, p.tracking_internal as guia_tracking,
          COALESCE(p.service_type, 'POBOX_USA') as servicio, p.user_id as cliente_id,
          COALESCE(p.saldo_pendiente, p.assigned_cost_mxn, 0) as saldo_pendiente,
          COALESCE(p.assigned_cost_mxn, 0) as costo_base,
          GREATEST(EXTRACT(DAY FROM NOW() - COALESCE(p.received_at, p.created_at))::INTEGER, 0) as dias_en_almacen,
          COALESCE(p.payment_status, 'pending') as payment_status,
          p.received_at as fecha_recepcion,
          COALESCE(p.description, p.destination_contact, 'Paquete') as descripcion
        FROM packages p
        WHERE (p.payment_status != 'paid' OR p.payment_status IS NULL)
        
        UNION ALL
        
        -- DHL
        SELECT 
          d.id, 'dhl', d.inbound_tracking, 'DHL_MTY', d.user_id,
          COALESCE(d.saldo_pendiente, d.total_cost_mxn, 0),
          COALESCE(d.total_cost_mxn, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - COALESCE(d.inspected_at, d.created_at))::INTEGER, 0),
          'pending', d.inspected_at, COALESCE(d.description, 'DHL')
        FROM dhl_shipments d WHERE d.paid_at IS NULL
        
        UNION ALL
        
        -- NATIONAL
        SELECT 
          n.id, 'national', n.tracking_number, 'LOGS_NAC', n.user_id,
          COALESCE(n.saldo_pendiente, n.shipping_cost, 0),
          COALESCE(n.shipping_cost, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - n.created_at)::INTEGER, 0),
          CASE WHEN n.paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END, n.created_at, COALESCE(n.destination_name, 'Nacional')
        FROM national_shipments n WHERE n.paid_at IS NULL
        
        UNION ALL
        
        -- MARITIME_SHIPMENTS
        SELECT 
          ms.id, 'maritime', ms.log_number, 'MARITIMO', ms.user_id,
          COALESCE(ms.saldo_pendiente, ms.assigned_cost_mxn, 0),
          COALESCE(ms.assigned_cost_mxn, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - ms.created_at)::INTEGER, 0),
          COALESCE(ms.payment_status, 'pending'), ms.created_at, 'Embarque Marítimo'
        FROM maritime_shipments ms WHERE ms.payment_status != 'paid' OR ms.payment_status IS NULL
        
        UNION ALL
        
        -- CHINA_RECEIPTS
        SELECT 
          cr.id, 'china_receipt', cr.fno, 'AIR_CHN', cr.user_id,
          COALESCE(cr.saldo_pendiente, cr.assigned_cost_mxn, 0),
          COALESCE(cr.assigned_cost_mxn, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - cr.created_at)::INTEGER, 0),
          'pending', cr.created_at, COALESCE(cr.shipping_mark, 'China')
        FROM china_receipts cr WHERE cr.paid_at IS NULL
        
        UNION ALL
        
        -- MARITIME_ORDERS
        SELECT 
          mo.id, 'maritime_order', mo.ordersn, 'MAR_CHN', mo.user_id,
          COALESCE(mo.saldo_pendiente, mo.assigned_cost_mxn, 0),
          COALESCE(mo.assigned_cost_mxn, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - mo.created_at)::INTEGER, 0),
          'pending', mo.created_at, COALESCE(mo.shipping_mark, 'Pedido')
        FROM maritime_orders mo WHERE mo.paid_at IS NULL
      ) combined
    `;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Filtro por servicio
    if (servicio && servicio !== 'todos') {
      conditions.push(`servicio = $${paramIndex++}`);
      params.push(servicio);
    }

    // Filtro por tracking
    if (tracking) {
      conditions.push(`guia_tracking ILIKE $${paramIndex++}`);
      params.push(`%${tracking}%`);
    }

    // Filtro por cliente
    if (clienteId) {
      conditions.push(`cliente_id = $${paramIndex++}`);
      params.push(clienteId);
    }

    // Filtro por semáforo
    if (semaforo) {
      if (semaforo === 'verde') {
        conditions.push(`dias_en_almacen < 30`);
      } else if (semaforo === 'amarillo') {
        conditions.push(`dias_en_almacen >= 30 AND dias_en_almacen < 60`);
      } else if (semaforo === 'rojo') {
        conditions.push(`dias_en_almacen >= 60`);
      }
    }

    // Agregar WHERE si hay condiciones
    let finalQuery = baseQuery;
    if (conditions.length > 0) {
      finalQuery = `SELECT * FROM (${baseQuery}) filtered WHERE ${conditions.join(' AND ')}`;
    }
    finalQuery += ` ORDER BY dias_en_almacen DESC LIMIT 200`;

    const result = await pool.query(finalQuery, params);

    // Join con usuarios para obtener nombre del cliente
    const guiasConCliente = await Promise.all(result.rows.map(async (g) => {
      const cliente = await pool.query(
        'SELECT full_name, email, phone, box_id FROM users WHERE id = $1',
        [g.cliente_id]
      );
      const clienteData = cliente.rows[0] || {};
      return {
        ...g,
        cliente_nombre: clienteData.full_name || 'Sin nombre',
        cliente_email: clienteData.email,
        cliente_telefono: clienteData.phone,
        cliente_box: clienteData.box_id,
        semaforo: g.dias_en_almacen < 30 ? 'verde' : g.dias_en_almacen < 60 ? 'amarillo' : 'rojo'
      };
    }));

    res.json(guiasConCliente);
  } catch (error: any) {
    console.error('Error searchGuiasCS:', error);
    res.status(500).json({ error: error.message });
  }
};

// ========== ABANDONO Y FIRMA DIGITAL ==========

// Generar documento de abandono para un cliente
export const generarDocumentoAbandono = async (req: Request, res: Response) => {
  const { cliente_id, guias } = req.body; // guias = array de {tracking, servicio, saldo}
  
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const montoTotal = guias.reduce((sum: number, g: any) => sum + parseFloat(g.saldo || 0), 0);

    const result = await pool.query(
      `INSERT INTO abandono_documentos 
       (cliente_id, token_firma, guias_incluidas, monto_total_condonado)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [cliente_id, token, JSON.stringify(guias), montoTotal]
    );

    // Actualizar cartera_vencida_logs con el token
    for (const guia of guias) {
      await pool.query(
        `UPDATE cartera_vencida_logs 
         SET firma_token = $1, estatus_cobranza = 'pre_abandono'
         WHERE guia_tracking = $2 AND servicio = $3`,
        [token, guia.tracking, guia.servicio]
      );
    }

    const firmaUrl = `${process.env.FRONTEND_URL || 'https://admin.entregax.com'}/firma-abandono/${token}`;

    // 📲 ENVIAR NOTIFICACIÓN AL CLIENTE
    try {
      // Obtener datos del cliente
      const clienteResult = await pool.query(
        `SELECT id, full_name, email, push_token FROM users WHERE id = $1`,
        [cliente_id]
      );
      
      if (clienteResult.rows.length > 0) {
        const cliente = clienteResult.rows[0];
        const clienteName = cliente.full_name || 'Cliente';
        const numGuias = guias.length;
        
        // Crear notificación en la base de datos
        await createCustomNotification(
          cliente_id,
          '📋 Documento de Abandono Pendiente',
          `Tienes un documento de abandono por firmar para ${numGuias} guía(s). Monto total: $${montoTotal.toFixed(2)} MXN. Toca para firmar.`,
          'warning',
          'file-document-alert',
          { token, firmaUrl, montoTotal, numGuias },
          `/firma-abandono/${token}`
        );
        
        // Enviar push notification si tiene token
        if (cliente.push_token) {
          await sendExpoPushNotification(
            cliente.push_token,
            '📋 Documento de Abandono Pendiente',
            `Hola ${clienteName}, tienes un documento por firmar para ${numGuias} guía(s). Monto: $${montoTotal.toFixed(2)} MXN`,
            { screen: 'FirmaAbandono', token, firmaUrl }
          );
        }
        
        console.log(`📬 Notificación de abandono enviada a cliente ${cliente_id}`);
      }
    } catch (notifError) {
      console.error('Error enviando notificación de abandono:', notifError);
      // No fallar la operación si la notificación falla
    }

    res.json({ 
      success: true, 
      documento: result.rows[0],
      firmaUrl,
      notificacionEnviada: true 
    });
  } catch (error: any) {
    console.error('Error generarDocumentoAbandono:', error);
    res.status(500).json({ error: error.message });
  }
};

// Obtener documento de abandono por token (público)
export const getDocumentoAbandono = async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const result = await pool.query(
      `SELECT ad.*, u.full_name as cliente_nombre, u.email as cliente_email
       FROM abandono_documentos ad
       LEFT JOIN users u ON ad.cliente_id = u.id
       WHERE ad.token_firma = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const doc = result.rows[0];
    if (doc.estatus === 'firmado') {
      return res.status(400).json({ error: 'Este documento ya fue firmado' });
    }
    if (doc.estatus === 'expirado') {
      return res.status(400).json({ error: 'Este documento ha expirado' });
    }

    res.json(doc);
  } catch (error: any) {
    console.error('Error getDocumentoAbandono:', error);
    res.status(500).json({ error: error.message });
  }
};

// Firmar documento de abandono (público)
export const firmarDocumentoAbandono = async (req: Request, res: Response) => {
  const { token } = req.params;
  const { firma_base64 } = req.body;
  const ip = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  try {
    // Verificar documento existe y está pendiente
    const docResult = await pool.query(
      `SELECT * FROM abandono_documentos WHERE token_firma = $1`,
      [token]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const doc = docResult.rows[0];
    if (doc.estatus !== 'pendiente') {
      return res.status(400).json({ error: 'Este documento no puede ser firmado' });
    }

    // Actualizar documento con firma
    await pool.query(
      `UPDATE abandono_documentos 
       SET firma_base64 = $1, fecha_firma = NOW(), ip_firma = $2, user_agent_firma = $3, estatus = 'firmado'
       WHERE token_firma = $4`,
      [firma_base64, ip, userAgent, token]
    );

    // Actualizar todas las guías incluidas
    const guias = doc.guias_incluidas;
    for (const guia of guias) {
      // Marcar como abandono aplicado en cartera
      await pool.query(
        `UPDATE cartera_vencida_logs 
         SET estatus_cobranza = 'abandono_aplicado', firma_fecha = NOW()
         WHERE guia_tracking = $1 AND servicio = $2`,
        [guia.tracking, guia.servicio]
      );

      // Poner saldo en $0 en la tabla original
      await condonarSaldoGuia(guia.tracking, guia.servicio);
    }

    res.json({ success: true, message: 'Documento firmado exitosamente' });
  } catch (error: any) {
    console.error('Error firmarDocumentoAbandono:', error);
    res.status(500).json({ error: error.message });
  }
};

// Condonar saldo de una guía (poner en $0)
async function condonarSaldoGuia(tracking: string, servicio: string) {
  let tableName = '';
  let trackingColumn = '';
  
  switch (servicio) {
    case 'packages': tableName = 'packages'; trackingColumn = 'tracking_number'; break;
    case 'dhl': tableName = 'dhl_shipments'; trackingColumn = 'waybill_number'; break;
    case 'china': tableName = 'china_receipts'; trackingColumn = 'tracking_number'; break;
    case 'maritime': tableName = 'maritime_orders'; trackingColumn = 'tracking_number'; break;
    case 'national': tableName = 'national_shipments'; trackingColumn = 'tracking_number'; break;
    case 'maritime_ship': tableName = 'maritime_shipments'; trackingColumn = 'tracking_number'; break;
    default: return;
  }

  await pool.query(
    `UPDATE ${tableName} SET saldo_pendiente = 0, payment_status = 'condonado' WHERE ${trackingColumn} = $1`,
    [tracking]
  );
}

// ========== CRON JOB HELPERS ==========

// Actualizar días en almacén y estatus de cobranza (llamado por cron)
export const actualizarCarteraVencida = async () => {
  console.log('[CRON] Actualizando cartera vencida...');
  
  try {
    // Actualizar días en almacén
    await pool.query(`
      UPDATE cartera_vencida_logs
      SET dias_en_almacen = EXTRACT(DAY FROM NOW() - fecha_llegada_cedis)::INTEGER,
          updated_at = NOW()
      WHERE estatus_cobranza NOT IN ('abandono_aplicado', 'pagado')
    `);

    // Día 30: Cambiar a cobranza_agresiva
    const dia30 = await pool.query(`
      UPDATE cartera_vencida_logs
      SET estatus_cobranza = 'cobranza_agresiva'
      WHERE dias_en_almacen >= 30 
        AND dias_en_almacen < 60
        AND estatus_cobranza = 'al_corriente'
        AND notificacion_dia30_enviada = FALSE
      RETURNING *
    `);
    
    if (dia30.rows.length > 0) {
      console.log(`[CRON] ${dia30.rows.length} guías pasaron a cobranza_agresiva`);
      // TODO: Enviar notificaciones día 30
      await pool.query(`
        UPDATE cartera_vencida_logs
        SET notificacion_dia30_enviada = TRUE
        WHERE id = ANY($1)
      `, [dia30.rows.map((r: any) => r.id)]);
    }

    // Día 60: Cambiar a pre_abandono
    const dia60 = await pool.query(`
      UPDATE cartera_vencida_logs
      SET estatus_cobranza = 'pre_abandono'
      WHERE dias_en_almacen >= 60 
        AND dias_en_almacen < 90
        AND estatus_cobranza = 'cobranza_agresiva'
        AND notificacion_dia60_enviada = FALSE
      RETURNING *
    `);
    
    if (dia60.rows.length > 0) {
      console.log(`[CRON] ${dia60.rows.length} guías pasaron a pre_abandono`);
      // TODO: Generar documentos de abandono y enviar links
      await pool.query(`
        UPDATE cartera_vencida_logs
        SET notificacion_dia60_enviada = TRUE
        WHERE id = ANY($1)
      `, [dia60.rows.map((r: any) => r.id)]);
    }

    // Día 90: Aplicar multa del 50%
    const dia90 = await pool.query(`
      SELECT * FROM cartera_vencida_logs
      WHERE dias_en_almacen >= 90 
        AND estatus_cobranza = 'pre_abandono'
        AND notificacion_dia90_enviada = FALSE
    `);
    
    for (const guia of dia90.rows) {
      // Verificar si firmó documento de abandono
      const firmaCheck = await pool.query(
        `SELECT * FROM abandono_documentos 
         WHERE token_firma = $1 AND estatus = 'firmado'`,
        [guia.firma_token]
      );

      if (firmaCheck.rows.length === 0) {
        // No firmó: aplicar multa del 50%
        const multaAmount = parseFloat(guia.saldo_deudor) * 0.5;
        await pool.query(`
          UPDATE cartera_vencida_logs
          SET estatus_cobranza = 'multa_generada',
              multa_aplicada = $1,
              notificacion_dia90_enviada = TRUE
          WHERE id = $2
        `, [multaAmount, guia.id]);
        console.log(`[CRON] Multa de $${multaAmount} aplicada a guía ${guia.guia_tracking}`);
      }
    }

    console.log('[CRON] Cartera vencida actualizada exitosamente');
  } catch (error) {
    console.error('[CRON] Error actualizando cartera:', error);
  }
};

// Sincronizar guías a cartera_vencida_logs (para guías en CEDIS sin pagar)
export const sincronizarCartera = async () => {
  console.log('[CRON] Sincronizando cartera...');
  
  try {
    // Packages en CEDIS no pagados
    await pool.query(`
      INSERT INTO cartera_vencida_logs (guia_id, guia_tracking, servicio, cliente_id, fecha_llegada_cedis, saldo_deudor)
      SELECT p.id, p.tracking_number, 'packages', p.user_id, COALESCE(p.delivered_at, p.updated_at), COALESCE(p.saldo_pendiente, 0)
      FROM packages p
      WHERE p.package_status IN ('in_warehouse', 'ready_for_pickup')
        AND COALESCE(p.payment_status, 'pending') != 'paid'
        AND NOT EXISTS (SELECT 1 FROM cartera_vencida_logs cv WHERE cv.guia_tracking = p.tracking_number AND cv.servicio = 'packages')
    `);

    // DHL en CEDIS no pagados
    await pool.query(`
      INSERT INTO cartera_vencida_logs (guia_id, guia_tracking, servicio, cliente_id, fecha_llegada_cedis, saldo_deudor)
      SELECT d.id, d.waybill_number, 'dhl', d.user_id, COALESCE(d.delivered_at, d.created_at), COALESCE(d.saldo_pendiente, 0)
      FROM dhl_shipments d
      WHERE d.status IN ('delivered_cedis', 'ready_for_pickup')
        AND COALESCE(d.payment_status, 'pending') != 'paid'
        AND NOT EXISTS (SELECT 1 FROM cartera_vencida_logs cv WHERE cv.guia_tracking = d.waybill_number AND cv.servicio = 'dhl')
    `);

    // China receipts en CEDIS
    await pool.query(`
      INSERT INTO cartera_vencida_logs (guia_id, guia_tracking, servicio, cliente_id, fecha_llegada_cedis, saldo_deudor)
      SELECT c.id, c.tracking_number, 'china', c.user_id, COALESCE(c.delivered_at, c.created_at), COALESCE(c.saldo_pendiente, 0)
      FROM china_receipts c
      WHERE c.status IN ('delivered_cedis', 'ready_for_pickup', 'in_warehouse')
        AND COALESCE(c.payment_status, 'pending') != 'paid'
        AND NOT EXISTS (SELECT 1 FROM cartera_vencida_logs cv WHERE cv.guia_tracking = c.tracking_number AND cv.servicio = 'china')
    `);

    // Maritime orders en CEDIS
    await pool.query(`
      INSERT INTO cartera_vencida_logs (guia_id, guia_tracking, servicio, cliente_id, fecha_llegada_cedis, saldo_deudor)
      SELECT m.id, m.tracking_number, 'maritime', m.user_id, COALESCE(m.delivered_at, m.created_at), COALESCE(m.saldo_pendiente, 0)
      FROM maritime_orders m
      WHERE m.status IN ('delivered_cedis', 'ready_for_pickup', 'in_warehouse')
        AND COALESCE(m.payment_status, 'pending') != 'paid'
        AND NOT EXISTS (SELECT 1 FROM cartera_vencida_logs cv WHERE cv.guia_tracking = m.tracking_number AND cv.servicio = 'maritime')
    `);

    console.log('[CRON] Cartera sincronizada');
  } catch (error) {
    console.error('[CRON] Error sincronizando cartera:', error);
  }
};

// ========== UTILIDADES ==========

// Obtener resumen financiero de una guía
export const getResumenFinancieroGuia = async (req: Request, res: Response) => {
  const { tracking, servicio } = req.params;
  
  try {
    // Obtener datos base de la guía
    let query = '';
    switch (servicio) {
      case 'packages':
        query = `SELECT id, tracking_number, assigned_cost_mxn as costo_base, saldo_pendiente, monto_pagado, payment_status, user_id FROM packages WHERE tracking_number = $1`;
        break;
      case 'dhl':
        query = `SELECT id, waybill_number as tracking_number, total_mxn as costo_base, saldo_pendiente, monto_pagado, payment_status, user_id FROM dhl_shipments WHERE waybill_number = $1`;
        break;
      case 'china':
        query = `SELECT id, tracking_number, assigned_cost_mxn as costo_base, saldo_pendiente, monto_pagado, payment_status, user_id FROM china_receipts WHERE tracking_number = $1`;
        break;
      case 'maritime':
        query = `SELECT id, tracking_number, assigned_cost_mxn as costo_base, saldo_pendiente, monto_pagado, payment_status, user_id FROM maritime_orders WHERE tracking_number = $1`;
        break;
      default:
        return res.status(400).json({ error: 'Servicio no válido' });
    }

    const guiaResult = await pool.query(query, [tracking]);
    if (guiaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada' });
    }
    const guia = guiaResult.rows[0];

    // Obtener ajustes
    const ajustesResult = await pool.query(
      `SELECT * FROM guias_ajustes_financieros 
       WHERE guia_tracking = $1 AND servicio = $2 AND activo = TRUE
       ORDER BY fecha_registro DESC`,
      [tracking, servicio]
    );

    // Obtener info de cartera
    const carteraResult = await pool.query(
      `SELECT * FROM cartera_vencida_logs WHERE guia_tracking = $1 AND servicio = $2`,
      [tracking, servicio]
    );

    // Calcular totales
    const cargos = ajustesResult.rows
      .filter((a: any) => a.tipo === 'cargo_extra')
      .reduce((sum: number, a: any) => sum + parseFloat(a.monto), 0);
    const descuentos = ajustesResult.rows
      .filter((a: any) => a.tipo === 'descuento')
      .reduce((sum: number, a: any) => sum + parseFloat(a.monto), 0);

    res.json({
      guia,
      ajustes: ajustesResult.rows,
      cartera: carteraResult.rows[0] || null,
      resumen: {
        costo_base: parseFloat(guia.costo_base || 0),
        cargos_extra: cargos,
        descuentos: descuentos,
        monto_pagado: parseFloat(guia.monto_pagado || 0),
        saldo_pendiente: parseFloat(guia.saldo_pendiente || 0),
        total_a_pagar: parseFloat(guia.costo_base || 0) + cargos - descuentos - parseFloat(guia.monto_pagado || 0)
      }
    });
  } catch (error: any) {
    console.error('Error getResumenFinancieroGuia:', error);
    res.status(500).json({ error: error.message });
  }
};
