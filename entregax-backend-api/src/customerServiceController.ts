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
  const { guia_id, guia_tracking, servicio, tipo, monto, moneda, concepto, notas, cliente_id } = req.body;
  const autorizado_por = (req as any).user?.id || null;

  if (!['cargo_extra', 'descuento'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo debe ser cargo_extra o descuento' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO guias_ajustes_financieros 
       (guia_id, guia_tracking, servicio, tipo, monto, moneda, concepto, notas, autorizado_por, cliente_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [guia_id, guia_tracking, servicio, tipo, Math.abs(monto), moneda || 'MXN', concepto, notas, autorizado_por, cliente_id]
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
  let costoExpr = '';
  
  switch (servicio) {
    case 'package':
      tableName = 'packages';
      trackingColumn = 'tracking_internal';
      costoExpr = 'COALESCE(assigned_cost_mxn, 0)';
      break;
    case 'dhl':
      tableName = 'dhl_shipments';
      trackingColumn = 'inbound_tracking';
      costoExpr = 'COALESCE(total_cost_mxn, import_cost_mxn, ROUND(import_cost_usd * COALESCE(exchange_rate, 1), 2), 0)';
      break;
    case 'china_receipt':
      tableName = 'china_receipts';
      trackingColumn = 'fno';
      costoExpr = 'COALESCE(assigned_cost_mxn, 0)';
      break;
    case 'maritime_order':
      tableName = 'maritime_orders';
      trackingColumn = 'ordersn';
      costoExpr = 'COALESCE(assigned_cost_mxn, 0)';
      break;
    case 'maritime':
      tableName = 'maritime_shipments';
      trackingColumn = 'log_number';
      costoExpr = 'COALESCE(assigned_cost_mxn, 0)';
      break;
    case 'national':
      tableName = 'national_shipments';
      trackingColumn = 'tracking_number';
      costoExpr = 'COALESCE(shipping_cost, 0)';
      break;
    default:
      console.log(`actualizarSaldoGuia: servicio no reconocido: ${servicio}`);
      return;
  }

  // Obtener costo base
  const baseResult = await pool.query(
    `SELECT ${costoExpr} as costo_base, COALESCE(monto_pagado, 0) as pagado 
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

    // Resolver nombres faltantes por shipping_mark → box_id
    const guiasCriticasResueltas = await Promise.all(criticas.rows.map(async (g) => {
      if (!g.cliente_nombre && g.descripcion) {
        const clienteByBox = await pool.query(
          'SELECT full_name, phone, email FROM users WHERE UPPER(box_id) = UPPER($1) LIMIT 1',
          [g.descripcion]
        );
        if (clienteByBox.rows[0]) {
          g.cliente_nombre = clienteByBox.rows[0].full_name;
          g.cliente_telefono = clienteByBox.rows[0].phone;
          g.cliente_email = clienteByBox.rows[0].email;
        }
      }
      return { ...g, cliente_nombre: g.cliente_nombre || 'Sin nombre', semaforo: 'rojo' };
    }));

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
      guiasCriticas: guiasCriticasResueltas
    });
  } catch (error: any) {
    console.error('Error getCarteraDashboard:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar guías para CS con filtros (consulta todas las tablas)
export const searchGuiasCS = async (req: Request, res: Response) => {
  const { servicio, tracking, clienteId, semaforo, estatusCobranza } = req.query;
  
  try {
    // Construir query base
    let baseQuery = `
      SELECT * FROM (
        -- PACKAGES (con FNO de china_receipt si existe para AIR_CHN_MX)
        SELECT 
          p.id, 'package' as source_type, 
          CASE 
            WHEN p.service_type = 'AIR_CHN_MX' AND cr.fno IS NOT NULL 
              THEN cr.fno || '-' || REVERSE(SPLIT_PART(REVERSE(p.tracking_internal), '-', 1))
            ELSE p.tracking_internal 
          END as guia_tracking,
          COALESCE(p.service_type, 'POBOX_USA') as servicio, 
          COALESCE(p.user_id, cr.user_id) as cliente_id,
          cr.shipping_mark as shipping_mark,
          COALESCE(p.saldo_pendiente, p.assigned_cost_mxn, p.air_sale_price, cr.assigned_cost_mxn, 0) as saldo_deudor,
          COALESCE(p.assigned_cost_mxn, p.air_sale_price, cr.assigned_cost_mxn, 0) as costo_base,
          GREATEST(EXTRACT(DAY FROM NOW() - COALESCE(p.received_at, p.created_at))::INTEGER, 0) as dias_en_almacen,
          COALESCE(p.payment_status, 'pending') as payment_status,
          p.received_at as fecha_recepcion,
          COALESCE(p.description, p.destination_contact, 'Paquete') as descripcion
        FROM packages p
        LEFT JOIN china_receipts cr ON p.china_receipt_id = cr.id
        WHERE (p.payment_status != 'paid' OR p.payment_status IS NULL)
        
        UNION ALL
        
        -- DHL
        SELECT 
          d.id, 'dhl', d.inbound_tracking, 'DHL_MTY', d.user_id,
          NULL as shipping_mark,
          COALESCE(d.saldo_pendiente, d.total_cost_mxn, d.import_cost_mxn, ROUND(d.import_cost_usd * COALESCE(d.exchange_rate, 17.5), 2), 0),
          COALESCE(d.total_cost_mxn, d.import_cost_mxn, ROUND(d.import_cost_usd * COALESCE(d.exchange_rate, 17.5), 2), 0),
          GREATEST(EXTRACT(DAY FROM NOW() - COALESCE(d.inspected_at, d.created_at))::INTEGER, 0),
          'pending', d.inspected_at, COALESCE(d.description, 'DHL')
        FROM dhl_shipments d WHERE d.paid_at IS NULL
        
        UNION ALL
        
        -- NATIONAL
        SELECT 
          n.id, 'national', n.tracking_number, 'LOGS_NAC', n.user_id,
          NULL as shipping_mark,
          COALESCE(n.saldo_pendiente, n.shipping_cost, 0),
          COALESCE(n.shipping_cost, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - n.created_at)::INTEGER, 0),
          CASE WHEN n.paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END, n.created_at, COALESCE(n.destination_name, 'Nacional')
        FROM national_shipments n WHERE n.paid_at IS NULL
        
        UNION ALL
        
        -- MARITIME_SHIPMENTS (LOG Marítimo - LCL)
        SELECT 
          ms.id, 'maritime', ms.log_number, 'MARITIMO', ms.user_id,
          NULL as shipping_mark,
          COALESCE(ms.saldo_pendiente, ms.assigned_cost_mxn, 0),
          COALESCE(ms.assigned_cost_mxn, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - ms.created_at)::INTEGER, 0),
          COALESCE(ms.payment_status, 'pending'), ms.created_at, 'LOG Marítimo'
        FROM maritime_shipments ms WHERE ms.payment_status != 'paid' OR ms.payment_status IS NULL
        
        UNION ALL
        
        -- CONTAINERS (FCL - Contenedores completos)
        SELECT 
          c.id, 'container', COALESCE(c.bl_number, c.container_number, 'FCL-' || c.id), 'FCL', NULL as user_id,
          lc.box_id as shipping_mark,
          COALESCE(c.sale_price, 0),
          COALESCE(c.sale_price, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - c.created_at)::INTEGER, 0),
          c.status, c.created_at, COALESCE(c.container_number, 'FCL')
        FROM containers c 
        LEFT JOIN legacy_clients lc ON lc.id = c.legacy_client_id
        WHERE c.status NOT IN ('delivered', 'entregado')
        
        UNION ALL
        
        -- CHINA_RECEIPTS (solo mostrar si NO tiene packages hijos - guías padre sin desglosar)
        SELECT 
          cr.id, 'china_receipt', cr.fno, 'AIR_CHN', cr.user_id,
          cr.shipping_mark as shipping_mark,
          COALESCE(cr.saldo_pendiente, cr.assigned_cost_mxn, 0),
          COALESCE(cr.assigned_cost_mxn, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - cr.created_at)::INTEGER, 0),
          'pending', cr.created_at, COALESCE(cr.shipping_mark, 'China')
        FROM china_receipts cr 
        WHERE cr.paid_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.china_receipt_id = cr.id)
        
        UNION ALL
        
        -- MARITIME_ORDERS (LCL China - pedidos dentro de contenedor)
        SELECT 
          mo.id, 'maritime_order', mo.ordersn, 'LCL_CHN', mo.user_id,
          mo.shipping_mark as shipping_mark,
          COALESCE(mo.saldo_pendiente, mo.assigned_cost_mxn, 0),
          COALESCE(mo.assigned_cost_mxn, 0),
          GREATEST(EXTRACT(DAY FROM NOW() - mo.created_at)::INTEGER, 0),
          'pending', mo.created_at, COALESCE(mo.shipping_mark, 'LCL China')
        FROM maritime_orders mo WHERE mo.paid_at IS NULL
      ) combined
    `;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Filtro por servicio (manejar variantes)
    if (servicio && servicio !== 'todos' && servicio !== 'all') {
      // Si se filtra por AIR_CHN_MX, incluir también AIR_CHN (china_receipts sin desglosar)
      if (servicio === 'AIR_CHN_MX') {
        conditions.push(`servicio IN ('AIR_CHN_MX', 'AIR_CHN')`);
      } else if (servicio === 'LCL_CHN') {
        // LCL China (maritime_orders dentro de contenedores)
        conditions.push(`servicio = 'LCL_CHN'`);
      } else {
        conditions.push(`servicio = $${paramIndex++}`);
        params.push(servicio);
      }
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

    // Filtro por estatus de cobranza (basado en días)
    if (estatusCobranza && estatusCobranza !== 'todos') {
      switch (estatusCobranza) {
        case 'al_corriente':
          conditions.push(`dias_en_almacen < 30`);
          break;
        case 'cobranza_agresiva':
          conditions.push(`dias_en_almacen >= 30 AND dias_en_almacen < 60`);
          break;
        case 'pre_abandono':
          conditions.push(`dias_en_almacen >= 60 AND dias_en_almacen < 90`);
          break;
        case 'multa_generada':
          conditions.push(`dias_en_almacen >= 90`);
          break;
      }
    }

    // Agregar WHERE si hay condiciones
    let finalQuery = baseQuery;
    if (conditions.length > 0) {
      finalQuery = `SELECT * FROM (${baseQuery}) filtered WHERE ${conditions.join(' AND ')}`;
    }
    finalQuery += ` ORDER BY dias_en_almacen DESC LIMIT 200`;

    console.log('[searchGuiasCS] Servicio:', servicio, 'Conditions:', conditions, 'Params:', params);
    
    const result = await pool.query(finalQuery, params);

    // Join con usuarios para obtener nombre del cliente
    const guiasConCliente = await Promise.all(result.rows.map(async (g) => {
      let clienteData: any = {};
      
      // Primero intentar por user_id
      if (g.cliente_id) {
        const cliente = await pool.query(
          'SELECT full_name, email, phone, box_id FROM users WHERE id = $1',
          [g.cliente_id]
        );
        clienteData = cliente.rows[0] || {};
      }
      
      // Si no encontró nombre, intentar por shipping_mark como box_id (para China)
      if (!clienteData.full_name && g.shipping_mark) {
        const clienteByBox = await pool.query(
          'SELECT id, full_name, email, phone, box_id FROM users WHERE UPPER(box_id) = UPPER($1) LIMIT 1',
          [g.shipping_mark]
        );
        if (clienteByBox.rows[0]) {
          clienteData = clienteByBox.rows[0];
        }
      }
      
      // Si aún no encontró, intentar por descripcion
      if (!clienteData.full_name && g.descripcion) {
        const clienteByBox = await pool.query(
          'SELECT id, full_name, email, phone, box_id FROM users WHERE UPPER(box_id) = UPPER($1) LIMIT 1',
          [g.descripcion]
        );
        if (clienteByBox.rows[0]) {
          clienteData = clienteByBox.rows[0];
        }
      }
      
      return {
        ...g,
        cliente_nombre: clienteData.full_name || (g.shipping_mark ? `📦 ${g.shipping_mark}` : 'Sin nombre'),
        cliente_email: clienteData.email,
        cliente_telefono: clienteData.phone,
        cliente_box: clienteData.box_id || g.shipping_mark || null,
        semaforo: g.dias_en_almacen < 30 ? 'verde' : g.dias_en_almacen < 60 ? 'amarillo' : 'rojo',
        estatus_cobranza: g.dias_en_almacen < 30 ? 'al_corriente' : g.dias_en_almacen < 60 ? 'cobranza_agresiva' : g.dias_en_almacen < 90 ? 'pre_abandono' : 'multa_generada',
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
  const servicioStr = servicio as string;
  
  try {
    // Obtener datos base de la guía - buscar en todas las tablas relevantes
    let guia: any = null;
    let sourceType = servicioStr;

    // Normalizar servicio a tipo interno
    const serviceMap: Record<string, string> = {
      'DHL_MTY': 'dhl', 'dhl': 'dhl', 'DHL': 'dhl',
      'AIR_CHN_MX': 'package', 'AIR_CHN': 'china_receipt', 'POBOX_USA': 'package',
      'LCL_CHN': 'maritime_order', 'MAR_CHN': 'maritime_order', 'MARITIMO': 'maritime',
      'maritime_order': 'maritime_order',
      'FCL': 'container', 'LOGS_NAC': 'national',
    };
    const normalizedServicio = serviceMap[servicioStr] || servicioStr;

    // Intentar por source_type directo
    const queries: { type: string; query: string }[] = [
      { type: 'package', query: `SELECT id, tracking_internal as tracking_number, service_type as servicio, description, assigned_cost_mxn as costo_base, saldo_pendiente, COALESCE(monto_pagado, 0) as monto_pagado, payment_status, user_id, weight, dimensions, has_gex, gex_folio, destination_address, destination_city, destination_contact, status, created_at, received_at, air_sale_price, air_price_per_kg, air_tariff_type, pobox_venta_usd, single_cbm as cbm, declared_value FROM packages WHERE tracking_internal = $1` },
      { type: 'dhl', query: `SELECT id, inbound_tracking as tracking_number, 'DHL_MTY' as servicio, description, COALESCE(total_cost_mxn, import_cost_mxn, ROUND(import_cost_usd * COALESCE(exchange_rate, 1), 2)) as costo_base, saldo_pendiente, COALESCE(monto_pagado, 0) as monto_pagado, CASE WHEN paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END as payment_status, user_id, weight_kg as weight, product_type, import_cost_usd, import_cost_mxn, exchange_rate, national_cost_mxn, status, created_at, inspected_at as received_at, has_gex, gex_folio, delivery_address_id FROM dhl_shipments WHERE inbound_tracking = $1` },
      { type: 'china_receipt', query: `SELECT id, fno as tracking_number, 'AIR_CHN' as servicio, shipping_mark as description, assigned_cost_mxn as costo_base, saldo_pendiente, COALESCE(monto_pagado, 0) as monto_pagado, CASE WHEN paid_at IS NOT NULL THEN 'paid' ELSE payment_status END as payment_status, user_id, total_weight as weight, total_cbm as cbm, status, created_at, has_gex, gex_folio, delivery_address_id, delivery_instructions FROM china_receipts WHERE fno = $1` },
      { type: 'maritime_order', query: `SELECT id, ordersn as tracking_number, 'MAR_CHN' as servicio, shipping_mark as description, assigned_cost_mxn as costo_base, saldo_pendiente, COALESCE(monto_pagado, 0) as monto_pagado, CASE WHEN paid_at IS NOT NULL THEN 'paid' ELSE payment_status END as payment_status, user_id, weight, volume as cbm, merchandise_type, assigned_cost_usd, status, created_at, has_gex, gex_folio, delivery_address_id, delivery_instructions FROM maritime_orders WHERE ordersn = $1` },
      { type: 'maritime', query: `SELECT id, log_number as tracking_number, 'MARITIMO' as servicio, 'Embarque Marítimo' as description, assigned_cost_mxn as costo_base, saldo_pendiente, COALESCE(monto_pagado, 0) as monto_pagado, payment_status, user_id, weight_kg as weight, volume_cbm as cbm, status, created_at, has_gex, gex_folio FROM maritime_shipments WHERE log_number = $1` },
      { type: 'national', query: `SELECT id, tracking_number, 'LOGS_NAC' as servicio, destination_name as description, shipping_cost as costo_base, saldo_pendiente, COALESCE(monto_pagado, 0) as monto_pagado, CASE WHEN paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END as payment_status, user_id, weight, status, created_at FROM national_shipments WHERE tracking_number = $1` },
      { type: 'container', query: `SELECT c.id, c.bl_number as tracking_number, 'FCL' as servicio, lc.box_id as description, COALESCE(c.sale_price, c.final_cost_mxn, 0) as costo_base, 0 as saldo_pendiente, 0 as monto_pagado, c.status as payment_status, c.legacy_client_id as user_id, c.total_weight_kg as weight, c.total_cbm as cbm, c.status, c.created_at FROM containers c LEFT JOIN legacy_clients lc ON lc.id = c.legacy_client_id WHERE c.bl_number = $1 OR c.container_number = $1` },
    ];

    // Si viene el source_type, buscar directamente en esa tabla
    const targetQuery = queries.find(q => q.type === normalizedServicio);
    if (targetQuery) {
      const result = await pool.query(targetQuery.query, [tracking]);
      if (result.rows.length > 0) {
        guia = result.rows[0];
        sourceType = targetQuery.type;
      }
    }

    // Si no encontró, buscar en todas las tablas
    if (!guia) {
      for (const q of queries) {
        try {
          const result = await pool.query(q.query, [tracking]);
          if (result.rows.length > 0) {
            guia = result.rows[0];
            sourceType = q.type;
            break;
          }
        } catch (e) {
          // Puede fallar si la tabla no tiene todas las columnas, continuar
        }
      }
    }

    if (!guia) {
      return res.status(404).json({ error: 'Guía no encontrada' });
    }

    // Obtener info del cliente
    let clienteInfo: any = {};
    if (guia.user_id) {
      const clienteRes = await pool.query('SELECT id, full_name, email, phone, box_id FROM users WHERE id = $1', [guia.user_id]);
      clienteInfo = clienteRes.rows[0] || {};
    }
    // Buscar por description (que puede ser shipping_mark/box_id)
    if (!clienteInfo.full_name && guia.description) {
      const clienteByBox = await pool.query('SELECT id, full_name, email, phone, box_id FROM users WHERE UPPER(box_id) = UPPER($1) LIMIT 1', [guia.description]);
      if (clienteByBox.rows[0]) clienteInfo = clienteByBox.rows[0];
    }
    // Buscar en legacy_clients si aún no encontramos
    if (!clienteInfo.full_name && guia.description) {
      try {
        const legacyRes = await pool.query('SELECT id, name as full_name, email, phone, box_id FROM legacy_clients WHERE UPPER(box_id) = UPPER($1) LIMIT 1', [guia.description]);
        if (legacyRes.rows[0]) clienteInfo = legacyRes.rows[0];
      } catch (e) { /* ignore */ }
    }

    // Obtener ajustes financieros
    let ajustes: any[] = [];
    try {
      const ajustesResult = await pool.query(
        `SELECT * FROM guias_ajustes_financieros 
         WHERE guia_tracking = $1 AND activo = TRUE
         ORDER BY fecha_registro DESC`,
        [tracking]
      );
      ajustes = ajustesResult.rows;
    } catch (e) {
      // Tabla puede no existir aún
    }

    // Obtener tipo de cambio para servicios aéreos (tdi)
    let tcAereo = 0;
    try {
      // Buscar el TC de TDI para paquetes aéreos
      const tcRes = await pool.query(`
        SELECT COALESCE(tipo_cambio_manual, ultimo_tc_api, 17.77) + COALESCE(sobreprecio, 0) as tc_final
        FROM exchange_rate_config 
        WHERE servicio = 'tdi' AND estado = TRUE
        LIMIT 1
      `);
      if (tcRes.rows.length > 0) {
        tcAereo = parseFloat(tcRes.rows[0].tc_final || 0);
      }
    } catch (e) {
      console.log('No se pudo obtener TC aéreo:', e);
    }

    // Obtener direccion de entrega si hay delivery_address_id
    let deliveryAddress: any = null;
    if (guia.delivery_address_id) {
      try {
        const addrRes = await pool.query(`
          SELECT da.*, 
                 CONCAT(da.street, ' ', COALESCE(da.exterior_number, ''), 
                        CASE WHEN da.interior_number IS NOT NULL THEN CONCAT(' Int. ', da.interior_number) ELSE '' END,
                        ', ', da.neighborhood, ', ', da.city, ', ', da.state, ' CP ', da.postal_code) as full_address
          FROM delivery_addresses da WHERE da.id = $1
        `, [guia.delivery_address_id]);
        deliveryAddress = addrRes.rows[0] || null;
      } catch (e) {
        console.log('Error obteniendo dirección:', e);
      }
    }

    // Calcular costo base en MXN primero (necesitamos TC para convertir ajustes USD)
    let costoBase = parseFloat(guia.costo_base || 0);
    const exchangeRate = parseFloat(guia.exchange_rate || 0);

    // Si costo_base es 0 y hay import_cost_usd, calcular con TC
    if (costoBase === 0 && guia.import_cost_usd) {
      costoBase = exchangeRate > 0 ? parseFloat(guia.import_cost_usd) * exchangeRate : parseFloat(guia.import_cost_mxn || 0);
    }
    // Fallback para otros servicios: air_sale_price
    if (costoBase === 0 && guia.air_sale_price) {
      costoBase = parseFloat(guia.air_sale_price || 0);
    }

    // TC para convertir ajustes en USD a MXN (usar TC del producto, o fallback 1)
    const tcParaAjustes = exchangeRate > 0 ? exchangeRate : 1;

    // Calcular totales (siempre en MXN)
    const cargos = ajustes
      .filter((a: any) => a.tipo === 'cargo_extra')
      .reduce((sum: number, a: any) => {
        const monto = parseFloat(a.monto || 0);
        return sum + (a.moneda === 'USD' ? monto * tcParaAjustes : monto);
      }, 0);
    const descuentos = ajustes
      .filter((a: any) => a.tipo === 'descuento')
      .reduce((sum: number, a: any) => {
        const monto = parseFloat(a.monto || 0);
        return sum + (a.moneda === 'USD' ? monto * tcParaAjustes : monto);
      }, 0);

    const montoPagado = parseFloat(guia.monto_pagado || 0);
    const nationalCost = parseFloat(guia.national_cost_mxn || 0);
    const totalGastos = costoBase + nationalCost + cargos;
    const saldoPendiente = parseFloat(guia.saldo_pendiente || 0) || (totalGastos - descuentos - montoPagado);

    res.json({
      guia: { ...guia, source_type: sourceType, tc_ajustes: tcParaAjustes, tc_aereo: tcAereo },
      cliente: {
        id: clienteInfo.id || guia.user_id,
        nombre: clienteInfo.full_name || 'Sin nombre',
        email: clienteInfo.email || '',
        telefono: clienteInfo.phone || '',
        casillero: clienteInfo.box_id || '',
      },
      deliveryAddress,
      ajustes,
      resumen: {
        costo_base: costoBase,
        national_cost: nationalCost,
        cargos_extra: cargos,
        descuentos: descuentos,
        monto_pagado: montoPagado,
        saldo_pendiente: saldoPendiente,
        total_gastos: totalGastos,
        total_a_pagar: totalGastos - descuentos - montoPagado
      }
    });
  } catch (error: any) {
    console.error('Error getResumenFinancieroGuia:', error);
    res.status(500).json({ error: error.message });
  }
};

// ========== SOLICITUDES DE DESCUENTO (requieren aprobación de director) ==========

// Crear solicitud de descuento (CS agent)
export const createDiscountRequest = async (req: Request, res: Response) => {
  const { guia_tracking, servicio, source_type, monto, moneda, concepto, notas, cliente_id, cliente_nombre } = req.body;
  const solicitado_por = (req as any).user?.id || null;
  const solicitado_nombre = (req as any).user?.full_name || 'Agente CS';

  if (!guia_tracking || !monto || !concepto) {
    return res.status(400).json({ error: 'Faltan campos requeridos: guia_tracking, monto, concepto' });
  }

  try {
    // Crear tabla si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS descuentos_pendientes (
        id SERIAL PRIMARY KEY,
        guia_tracking VARCHAR(100) NOT NULL,
        servicio VARCHAR(50),
        source_type VARCHAR(50),
        monto DECIMAL(12,2) NOT NULL,
        moneda VARCHAR(3) DEFAULT 'MXN',
        concepto VARCHAR(500) NOT NULL,
        notas TEXT,
        cliente_id INTEGER,
        cliente_nombre VARCHAR(200),
        solicitado_por INTEGER,
        solicitado_nombre VARCHAR(200),
        estado VARCHAR(20) DEFAULT 'pendiente',
        aprobado_por INTEGER,
        aprobado_nombre VARCHAR(200),
        motivo_rechazo TEXT,
        fecha_solicitud TIMESTAMP DEFAULT NOW(),
        fecha_resolucion TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const result = await pool.query(
      `INSERT INTO descuentos_pendientes 
       (guia_tracking, servicio, source_type, monto, moneda, concepto, notas, cliente_id, cliente_nombre, solicitado_por, solicitado_nombre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [guia_tracking, servicio, source_type, Math.abs(monto), moneda || 'MXN', concepto, notas, cliente_id, cliente_nombre, solicitado_por, solicitado_nombre]
    );

    res.json({ success: true, descuento: result.rows[0] });
  } catch (error: any) {
    console.error('Error createDiscountRequest:', error);
    res.status(500).json({ error: error.message });
  }
};

// Listar solicitudes pendientes (para director/admin)
export const getDiscountRequests = async (req: Request, res: Response) => {
  const { estado } = req.query;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS descuentos_pendientes (
        id SERIAL PRIMARY KEY,
        guia_tracking VARCHAR(100) NOT NULL,
        servicio VARCHAR(50),
        source_type VARCHAR(50),
        monto DECIMAL(12,2) NOT NULL,
        moneda VARCHAR(3) DEFAULT 'MXN',
        concepto VARCHAR(500) NOT NULL,
        notas TEXT,
        cliente_id INTEGER,
        cliente_nombre VARCHAR(200),
        solicitado_por INTEGER,
        solicitado_nombre VARCHAR(200),
        estado VARCHAR(20) DEFAULT 'pendiente',
        aprobado_por INTEGER,
        aprobado_nombre VARCHAR(200),
        motivo_rechazo TEXT,
        fecha_solicitud TIMESTAMP DEFAULT NOW(),
        fecha_resolucion TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const filter = estado && estado !== 'all' ? `WHERE estado = $1` : '';
    const params = filter ? [estado] : [];
    const result = await pool.query(
      `SELECT * FROM descuentos_pendientes ${filter} ORDER BY fecha_solicitud DESC LIMIT 100`,
      params
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error getDiscountRequests:', error);
    res.status(500).json({ error: error.message });
  }
};

// Estadísticas de descuentos para el panel
export const getDiscountStats = async (_req: Request, res: Response) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS descuentos_pendientes (
        id SERIAL PRIMARY KEY,
        guia_tracking VARCHAR(100),
        servicio VARCHAR(50),
        source_type VARCHAR(50),
        monto DECIMAL(12,2),
        moneda VARCHAR(3) DEFAULT 'MXN',
        concepto VARCHAR(500),
        notas TEXT,
        cliente_id INTEGER,
        cliente_nombre VARCHAR(200),
        solicitado_por INTEGER,
        solicitado_nombre VARCHAR(200),
        estado VARCHAR(20) DEFAULT 'pendiente',
        aprobado_por INTEGER,
        aprobado_nombre VARCHAR(200),
        motivo_rechazo TEXT,
        fecha_solicitud TIMESTAMP DEFAULT NOW(),
        fecha_resolucion TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes,
        COUNT(*) FILTER (WHERE estado = 'aprobado') as aprobados,
        COUNT(*) FILTER (WHERE estado = 'rechazado') as rechazados,
        COALESCE(SUM(monto) FILTER (WHERE estado = 'pendiente'), 0) as monto_pendiente,
        COALESCE(SUM(monto) FILTER (WHERE estado = 'aprobado'), 0) as monto_aprobado
      FROM descuentos_pendientes
    `);
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error getDiscountStats:', error);
    res.json({ pendientes: 0, aprobados: 0, rechazados: 0, monto_pendiente: 0, monto_aprobado: 0 });
  }
};

// Aprobar/Rechazar descuento (requiere PIN de director)
export const resolveDiscountRequest = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { accion, pin, motivo_rechazo } = req.body;
  const resuelto_por = (req as any).user?.id || null;
  const resuelto_nombre = (req as any).user?.full_name || '';

  if (!['aprobar', 'rechazar'].includes(accion)) {
    return res.status(400).json({ error: 'Acción debe ser aprobar o rechazar' });
  }

  try {
    // Verificar PIN de director/super_admin
    const pinResult = await pool.query(
      `SELECT id, full_name, role FROM users WHERE supervisor_pin = $1 AND role IN ('director', 'super_admin')`,
      [pin]
    );
    if (pinResult.rows.length === 0) {
      return res.status(403).json({ error: 'PIN de autorización inválido. Se requiere PIN de director.' });
    }
    const autorizador = pinResult.rows[0];

    // Obtener la solicitud
    const solicitud = await pool.query('SELECT * FROM descuentos_pendientes WHERE id = $1', [id]);
    if (solicitud.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }
    const desc = solicitud.rows[0];

    if (desc.estado !== 'pendiente') {
      return res.status(400).json({ error: `Solicitud ya fue ${desc.estado}` });
    }

    if (accion === 'aprobar') {
      // Actualizar solicitud
      await pool.query(
        `UPDATE descuentos_pendientes SET estado = 'aprobado', aprobado_por = $1, aprobado_nombre = $2, fecha_resolucion = NOW() WHERE id = $3`,
        [autorizador.id, autorizador.full_name, id]
      );

      // Aplicar el descuento como ajuste financiero
      try {
        await pool.query(
          `INSERT INTO guias_ajustes_financieros 
           (guia_tracking, servicio, tipo, monto, concepto, notas, autorizado_por, cliente_id)
           VALUES ($1, $2, 'descuento', $3, $4, $5, $6, $7)`,
          [desc.guia_tracking, desc.servicio || desc.source_type, desc.monto, 
           desc.concepto, `Aprobado por ${autorizador.full_name}. ${desc.notas || ''}`, 
           autorizador.id, desc.cliente_id]
        );
      } catch (e) {
        // guias_ajustes_financieros might not exist yet
        console.log('Could not create ajuste, table might not exist');
      }

      res.json({ success: true, message: `Descuento de $${desc.monto} ${desc.moneda} aprobado por ${autorizador.full_name}` });
    } else {
      // Rechazar
      await pool.query(
        `UPDATE descuentos_pendientes SET estado = 'rechazado', aprobado_por = $1, aprobado_nombre = $2, motivo_rechazo = $3, fecha_resolucion = NOW() WHERE id = $4`,
        [autorizador.id, autorizador.full_name, motivo_rechazo || 'Sin motivo', id]
      );
      res.json({ success: true, message: 'Solicitud rechazada' });
    }
  } catch (error: any) {
    console.error('Error resolveDiscountRequest:', error);
    res.status(500).json({ error: error.message });
  }
};
