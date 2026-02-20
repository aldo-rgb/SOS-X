// ============================================
// CAJA CHICA CONTROLLER
// Control de efectivo con soporte para:
// - Pagos parciales
// - Pagos multi-guía (1 pago -> N guías)
// - Asignación automática (FIFO) o manual
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

interface AuthRequest extends Request {
  user?: {
    id: number;
    name: string;
    role: string;
    branch_id?: number;
  };
}

// ============================================
// OBTENER ESTADÍSTICAS DE CAJA CHICA
// ============================================
export const getCajaChicaStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Saldo actual (suma de ingresos - suma de egresos)
    const saldoResult = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) as total_egresos
      FROM caja_chica_transacciones
    `);
    
    const { total_ingresos, total_egresos } = saldoResult.rows[0];
    const saldo_actual = parseFloat(total_ingresos) - parseFloat(total_egresos);
    
    // Transacciones del día
    const hoyResult = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as ingresos_hoy,
        COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) as egresos_hoy,
        COUNT(*) as cantidad_transacciones_hoy
      FROM caja_chica_transacciones
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    
    // Último corte
    const corteResult = await pool.query(`
      SELECT fecha_corte FROM caja_chica_cortes 
      ORDER BY fecha_corte DESC LIMIT 1
    `);
    
    res.json({
      saldo_actual,
      ingresos_hoy: parseFloat(hoyResult.rows[0].ingresos_hoy),
      egresos_hoy: parseFloat(hoyResult.rows[0].egresos_hoy),
      cantidad_transacciones_hoy: parseInt(hoyResult.rows[0].cantidad_transacciones_hoy),
      ultimo_corte: corteResult.rows[0]?.fecha_corte || null,
    });
  } catch (error) {
    console.error('Error en getCajaChicaStats:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas' });
  }
};

// ============================================
// BUSCAR CLIENTE POR NOMBRE O BOX_ID
// ============================================
export const buscarCliente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    
    if (!q || String(q).length < 2) {
      res.json([]);
      return;
    }
    
    const result = await pool.query(`
      SELECT DISTINCT 
        u.id,
        u.full_name,
        u.email,
        u.box_id,
        u.phone,
        (
          SELECT COUNT(*) FROM packages p 
          WHERE p.user_id = u.id 
          AND (p.payment_status = 'pending' OR p.payment_status = 'partial' OR p.payment_status IS NULL)
          AND p.assigned_cost_mxn > 0
        ) as guias_pendientes,
        (
          SELECT COALESCE(SUM(COALESCE(p.saldo_pendiente, p.assigned_cost_mxn)), 0) FROM packages p 
          WHERE p.user_id = u.id 
          AND (p.payment_status = 'pending' OR p.payment_status = 'partial' OR p.payment_status IS NULL)
          AND p.assigned_cost_mxn > 0
        ) as saldo_total_pendiente
      FROM users u
      WHERE u.role = 'client'
        AND (
          u.full_name ILIKE $1
          OR u.box_id ILIKE $1
          OR u.email ILIKE $1
          OR u.phone ILIKE $1
        )
      ORDER BY u.full_name
      LIMIT 20
    `, [`%${q}%`]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en buscarCliente:', error);
    res.status(500).json({ message: 'Error al buscar cliente' });
  }
};

// ============================================
// OBTENER GUÍAS PENDIENTES DE UN CLIENTE
// (Estado de cuenta)
// ============================================
export const getGuiasPendientesCliente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clienteId } = req.params;
    
    // Obtener datos del cliente
    const clienteResult = await pool.query(`
      SELECT id, full_name, email, box_id, phone
      FROM users WHERE id = $1
    `, [clienteId]);
    
    if (clienteResult.rows.length === 0) {
      res.status(404).json({ message: 'Cliente no encontrado' });
      return;
    }
    
    // Obtener guías pendientes ordenadas por fecha (FIFO)
    // Incluye: packages, dhl_shipments, national_shipments, maritime_shipments, china_receipts, maritime_orders
    const guiasResult = await pool.query(`
      SELECT * FROM (
        -- Paquetes POBOX y China
        SELECT 
          p.id,
          'package' as source_type,
          p.tracking_internal as tracking_number,
          COALESCE(p.destination_contact, p.description, 'Paquete') as recipient_name,
          p.service_type::text,
          p.status::text,
          COALESCE(p.assigned_cost_mxn, 0) as assigned_cost_mxn,
          COALESCE(p.saldo_pendiente, p.assigned_cost_mxn, 0) as saldo_pendiente,
          COALESCE(p.monto_pagado, 0) as monto_pagado,
          p.payment_status::text,
          p.created_at,
          p.delivered_at
        FROM packages p
        WHERE p.user_id = $1
          AND (p.payment_status = 'pending' OR p.payment_status = 'partial' OR p.payment_status IS NULL)
        
        UNION ALL
        
        -- DHL Monterrey
        SELECT 
          d.id,
          'dhl' as source_type,
          d.inbound_tracking as tracking_number,
          COALESCE(d.description, 'Paquete DHL') as recipient_name,
          'DHL_MTY' as service_type,
          d.status::text,
          COALESCE(d.total_cost_mxn, 0) as assigned_cost_mxn,
          COALESCE(d.saldo_pendiente, d.total_cost_mxn, 0) as saldo_pendiente,
          COALESCE(d.monto_pagado, 0) as monto_pagado,
          CASE 
            WHEN d.paid_at IS NOT NULL THEN 'paid'
            WHEN COALESCE(d.monto_pagado, 0) > 0 THEN 'partial'
            ELSE 'pending'
          END as payment_status,
          d.created_at,
          d.delivered_at
        FROM dhl_shipments d
        WHERE d.user_id = $1
          AND d.paid_at IS NULL
        
        UNION ALL
        
        -- National Shipments (LOGS)
        SELECT 
          n.id,
          'national' as source_type,
          n.tracking_number,
          COALESCE(n.destination_name, 'Envío Nacional') as recipient_name,
          'LOGS_NAC' as service_type,
          n.status::text,
          COALESCE(n.shipping_cost, 0) as assigned_cost_mxn,
          COALESCE(n.saldo_pendiente, n.shipping_cost, 0) as saldo_pendiente,
          COALESCE(n.monto_pagado, 0) as monto_pagado,
          CASE 
            WHEN n.paid_at IS NOT NULL THEN 'paid'
            WHEN COALESCE(n.monto_pagado, 0) > 0 THEN 'partial'
            ELSE 'pending'
          END as payment_status,
          n.created_at,
          n.delivered_at
        FROM national_shipments n
        WHERE n.user_id = $1
          AND n.paid_at IS NULL
        
        UNION ALL
        
        -- Maritime Shipments (Marítimo consolidado)
        SELECT 
          m.id,
          'maritime' as source_type,
          m.log_number as tracking_number,
          COALESCE(m.shipping_mark, 'Envío Marítimo') as recipient_name,
          'MARITIMO' as service_type,
          m.status::text,
          COALESCE(m.assigned_cost_mxn, m.quoted_mxn, 0) as assigned_cost_mxn,
          COALESCE(m.saldo_pendiente, m.assigned_cost_mxn, m.quoted_mxn, 0) as saldo_pendiente,
          COALESCE(m.monto_pagado, 0) as monto_pagado,
          CASE 
            WHEN m.paid_at IS NOT NULL THEN 'paid'
            WHEN COALESCE(m.monto_pagado, 0) > 0 THEN 'partial'
            ELSE 'pending'
          END as payment_status,
          m.created_at,
          m.delivered_at
        FROM maritime_shipments m
        WHERE m.user_id = $1
          AND m.paid_at IS NULL
        
        UNION ALL
        
        -- China Receipts (Recepciones Aéreo China - AIR)
        SELECT 
          cr.id,
          'china_receipt' as source_type,
          cr.fno as tracking_number,
          COALESCE(cr.shipping_mark, 'Recepción China') as recipient_name,
          'AIR_CHN' as service_type,
          cr.status::text,
          COALESCE(cr.assigned_cost_mxn, 0) as assigned_cost_mxn,
          COALESCE(cr.saldo_pendiente, cr.assigned_cost_mxn, 0) as saldo_pendiente,
          COALESCE(cr.monto_pagado, 0) as monto_pagado,
          CASE 
            WHEN cr.paid_at IS NOT NULL THEN 'paid'
            WHEN COALESCE(cr.monto_pagado, 0) > 0 THEN 'partial'
            ELSE 'pending'
          END as payment_status,
          cr.created_at,
          cr.delivered_at
        FROM china_receipts cr
        WHERE cr.user_id = $1
          AND cr.paid_at IS NULL
        
        UNION ALL
        
        -- Maritime Orders (Pedidos Marítimos China - LOG)
        SELECT 
          mo.id,
          'maritime_order' as source_type,
          mo.ordersn as tracking_number,
          COALESCE(mo.shipping_mark, 'Pedido Marítimo') as recipient_name,
          'MAR_CHN' as service_type,
          mo.status::text,
          COALESCE(mo.assigned_cost_mxn, mo.estimated_cost, 0) as assigned_cost_mxn,
          COALESCE(mo.saldo_pendiente, mo.assigned_cost_mxn, mo.estimated_cost, 0) as saldo_pendiente,
          COALESCE(mo.monto_pagado, 0) as monto_pagado,
          CASE 
            WHEN mo.paid_at IS NOT NULL THEN 'paid'
            WHEN COALESCE(mo.monto_pagado, 0) > 0 THEN 'partial'
            ELSE 'pending'
          END as payment_status,
          mo.created_at,
          mo.delivered_at
        FROM maritime_orders mo
        WHERE mo.user_id = $1
          AND mo.paid_at IS NULL
      ) combined
      ORDER BY created_at ASC
    `, [clienteId]);
    
    // Calcular totales
    const totales = guiasResult.rows.reduce((acc: { total_facturado: number; total_pagado: number; total_pendiente: number }, guia: { assigned_cost_mxn: string; monto_pagado: string; saldo_pendiente: string }) => {
      acc.total_facturado += parseFloat(guia.assigned_cost_mxn) || 0;
      acc.total_pagado += parseFloat(guia.monto_pagado) || 0;
      acc.total_pendiente += parseFloat(guia.saldo_pendiente) || 0;
      return acc;
    }, { total_facturado: 0, total_pagado: 0, total_pendiente: 0 });
    
    res.json({
      cliente: clienteResult.rows[0],
      guias: guiasResult.rows,
      totales,
    });
  } catch (error) {
    console.error('Error en getGuiasPendientesCliente:', error);
    res.status(500).json({ message: 'Error al obtener guías del cliente' });
  }
};

// ============================================
// REGISTRAR PAGO (CON APLICACIÓN MULTI-GUÍA)
// Soporta asignación automática (FIFO) o manual
// ============================================
export const registrarPagoCliente = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  
  try {
    const { 
      cliente_id, 
      monto_total, 
      modo_asignacion, // 'automatico' | 'manual'
      aplicaciones, // Array de { package_id, monto_aplicado } para modo manual
      concepto,
      notas 
    } = req.body;
    
    const userId = req.user?.id;
    const userName = req.user?.name;
    
    if (!cliente_id || !monto_total || monto_total <= 0) {
      res.status(400).json({ message: 'Cliente y monto son requeridos' });
      return;
    }
    
    await client.query('BEGIN');
    
    // Calcular saldo después del movimiento
    const saldoResult = await client.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) as saldo
      FROM caja_chica_transacciones
    `);
    const saldoAnterior = parseFloat(saldoResult.rows[0].saldo);
    const nuevoSaldo = saldoAnterior + parseFloat(monto_total);
    
    // Obtener nombre del cliente
    const clienteResult = await client.query(
      'SELECT full_name FROM users WHERE id = $1',
      [cliente_id]
    );
    const clienteNombre = clienteResult.rows[0]?.full_name || 'Cliente';
    
    // 1. Crear la transacción principal
    const txResult = await client.query(`
      INSERT INTO caja_chica_transacciones 
        (tipo, monto, concepto, cliente_id, admin_id, admin_name, 
         saldo_despues_movimiento, categoria, notas)
      VALUES ('ingreso', $1, $2, $3, $4, $5, $6, 'cobro_guias', $7)
      RETURNING id
    `, [
      monto_total,
      concepto || `Pago de guías - ${clienteNombre}`,
      cliente_id,
      userId,
      userName,
      nuevoSaldo,
      notas
    ]);
    
    const transaccionId = txResult.rows[0].id;
    let aplicacionesFinal: { package_id: number; monto_aplicado: number }[] = [];
    
    // 2. Determinar aplicaciones según modo
    if (modo_asignacion === 'manual' && aplicaciones && aplicaciones.length > 0) {
      // Modo manual: usar las aplicaciones proporcionadas
      aplicacionesFinal = aplicaciones;
      
      // Validar que la suma no exceda el monto total
      const sumaAplicaciones = aplicaciones.reduce(
        (sum: number, a: { monto_aplicado: number }) => sum + parseFloat(String(a.monto_aplicado)), 
        0
      );
      
      if (sumaAplicaciones > parseFloat(monto_total) + 0.01) { // tolerancia de centavos
        await client.query('ROLLBACK');
        res.status(400).json({ 
          message: 'La suma de aplicaciones excede el monto total recibido',
          suma_aplicaciones: sumaAplicaciones,
          monto_total: monto_total
        });
        return;
      }
    } else {
      // Modo automático (FIFO): pagar las guías más antiguas primero
      const guiasPendientes = await client.query(`
        SELECT id, COALESCE(saldo_pendiente, assigned_cost_mxn) as saldo
        FROM packages
        WHERE user_id = $1
          AND (payment_status = 'pending' OR payment_status = 'partial' OR payment_status IS NULL)
          AND assigned_cost_mxn > 0
        ORDER BY created_at ASC
      `, [cliente_id]);
      
      let montoRestante = parseFloat(monto_total);
      
      for (const guia of guiasPendientes.rows) {
        if (montoRestante <= 0) break;
        
        const saldoGuia = parseFloat(guia.saldo);
        const montoAplicar = Math.min(montoRestante, saldoGuia);
        
        if (montoAplicar > 0) {
          aplicacionesFinal.push({
            package_id: guia.id,
            monto_aplicado: montoAplicar
          });
          montoRestante -= montoAplicar;
        }
      }
    }
    
    // 3. Registrar cada aplicación y actualizar guías
    const guiasAfectadas = [];
    
    for (const aplicacion of aplicacionesFinal) {
      const { package_id, monto_aplicado } = aplicacion;
      
      if (monto_aplicado <= 0) continue;
      
      // Insertar en tabla de aplicación
      await client.query(`
        INSERT INTO caja_chica_aplicacion_pagos 
          (transaccion_id, package_id, monto_aplicado)
        VALUES ($1, $2, $3)
      `, [transaccionId, package_id, monto_aplicado]);
      
      // Actualizar el paquete
      const updateResult = await client.query(`
        UPDATE packages 
        SET 
          monto_pagado = COALESCE(monto_pagado, 0) + $1,
          saldo_pendiente = COALESCE(saldo_pendiente, assigned_cost_mxn) - $1,
          payment_status = CASE 
            WHEN COALESCE(saldo_pendiente, assigned_cost_mxn) - $1 <= 0.01 THEN 'paid'
            ELSE 'partial'
          END,
          costing_paid = CASE 
            WHEN COALESCE(saldo_pendiente, assigned_cost_mxn) - $1 <= 0.01 THEN TRUE
            ELSE FALSE
          END,
          costing_paid_at = CASE 
            WHEN COALESCE(saldo_pendiente, assigned_cost_mxn) - $1 <= 0.01 THEN NOW()
            ELSE costing_paid_at
          END
        WHERE id = $2
        RETURNING 
          id, tracking_internal, assigned_cost_mxn, 
          monto_pagado, saldo_pendiente, payment_status
      `, [monto_aplicado, package_id]);
      
      if (updateResult.rows[0]) {
        guiasAfectadas.push({
          ...updateResult.rows[0],
          monto_aplicado_ahora: monto_aplicado
        });
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Pago registrado correctamente',
      transaccion: {
        id: transaccionId,
        monto_total,
        cliente_id,
        cliente_nombre: clienteNombre,
        modo_asignacion: modo_asignacion || 'automatico',
      },
      guias_afectadas: guiasAfectadas,
      resumen: {
        guias_pagadas_completo: guiasAfectadas.filter(g => g.payment_status === 'paid').length,
        guias_con_abono: guiasAfectadas.filter(g => g.payment_status === 'partial').length,
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en registrarPagoCliente:', error);
    res.status(500).json({ message: 'Error al registrar pago' });
  } finally {
    client.release();
  }
};

// ============================================
// REGISTRAR INGRESO GENERAL (sin guía)
// ============================================
export const registrarIngreso = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { monto, concepto, categoria, notas } = req.body;
    const userId = req.user?.id;
    const userName = req.user?.name;
    
    if (!monto || monto <= 0 || !concepto) {
      res.status(400).json({ message: 'Monto y concepto son requeridos' });
      return;
    }
    
    // Calcular saldo después del movimiento
    const saldoResult = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) as saldo
      FROM caja_chica_transacciones
    `);
    const nuevoSaldo = parseFloat(saldoResult.rows[0].saldo) + parseFloat(monto);
    
    const result = await pool.query(`
      INSERT INTO caja_chica_transacciones 
        (tipo, monto, concepto, categoria, admin_id, admin_name, saldo_despues_movimiento, notas)
      VALUES ('ingreso', $1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [monto, concepto, categoria || 'otro_ingreso', userId, userName, nuevoSaldo, notas]);
    
    res.json({
      success: true,
      message: 'Ingreso registrado',
      transaccion: result.rows[0]
    });
  } catch (error) {
    console.error('Error en registrarIngreso:', error);
    res.status(500).json({ message: 'Error al registrar ingreso' });
  }
};

// ============================================
// REGISTRAR EGRESO
// ============================================
export const registrarEgreso = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { monto, concepto, categoria, notas } = req.body;
    const userId = req.user?.id;
    const userName = req.user?.name;
    
    if (!monto || monto <= 0 || !concepto) {
      res.status(400).json({ message: 'Monto y concepto son requeridos' });
      return;
    }
    
    // Verificar que hay saldo suficiente
    const saldoResult = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) as saldo
      FROM caja_chica_transacciones
    `);
    const saldoActual = parseFloat(saldoResult.rows[0].saldo);
    
    if (saldoActual < parseFloat(monto)) {
      res.status(400).json({ 
        message: 'Saldo insuficiente en caja',
        saldo_actual: saldoActual,
        monto_solicitado: monto
      });
      return;
    }
    
    const nuevoSaldo = saldoActual - parseFloat(monto);
    
    const result = await pool.query(`
      INSERT INTO caja_chica_transacciones 
        (tipo, monto, concepto, categoria, admin_id, admin_name, saldo_despues_movimiento, notas)
      VALUES ('egreso', $1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [monto, concepto, categoria || 'otro_egreso', userId, userName, nuevoSaldo, notas]);
    
    res.json({
      success: true,
      message: 'Egreso registrado',
      transaccion: result.rows[0]
    });
  } catch (error) {
    console.error('Error en registrarEgreso:', error);
    res.status(500).json({ message: 'Error al registrar egreso' });
  }
};

// ============================================
// OBTENER TRANSACCIONES CON FILTROS
// ============================================
export const getTransacciones = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fecha_desde, fecha_hasta, tipo, cliente_id } = req.query;
    
    let query = `
      SELECT 
        t.*,
        u.full_name as cliente_nombre,
        u.box_id as cliente_box_id,
        (
          SELECT json_agg(json_build_object(
            'package_id', ap.package_id,
            'monto_aplicado', ap.monto_aplicado,
            'tracking_number', p.tracking_internal
          ))
          FROM caja_chica_aplicacion_pagos ap
          JOIN packages p ON p.id = ap.package_id
          WHERE ap.transaccion_id = t.id
        ) as aplicaciones
      FROM caja_chica_transacciones t
      LEFT JOIN users u ON u.id = t.cliente_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let paramIndex = 1;
    
    if (fecha_desde) {
      query += ` AND DATE(t.created_at) >= $${paramIndex}`;
      params.push(fecha_desde as string);
      paramIndex++;
    }
    
    if (fecha_hasta) {
      query += ` AND DATE(t.created_at) <= $${paramIndex}`;
      params.push(fecha_hasta as string);
      paramIndex++;
    }
    
    if (tipo && tipo !== 'todos') {
      query += ` AND t.tipo = $${paramIndex}`;
      params.push(tipo as string);
      paramIndex++;
    }
    
    if (cliente_id) {
      query += ` AND t.cliente_id = $${paramIndex}`;
      params.push(parseInt(cliente_id as string));
      paramIndex++;
    }
    
    query += ` ORDER BY t.created_at DESC LIMIT 200`;
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getTransacciones:', error);
    res.status(500).json({ message: 'Error al obtener transacciones' });
  }
};

// ============================================
// OBTENER DETALLE DE UNA TRANSACCIÓN
// ============================================
export const getDetalleTransaccion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Transacción principal
    const txResult = await pool.query(`
      SELECT 
        t.*,
        u.full_name as cliente_nombre,
        u.box_id as cliente_box_id,
        u.email as cliente_email
      FROM caja_chica_transacciones t
      LEFT JOIN users u ON u.id = t.cliente_id
      WHERE t.id = $1
    `, [id]);
    
    if (txResult.rows.length === 0) {
      res.status(404).json({ message: 'Transacción no encontrada' });
      return;
    }
    
    // Aplicaciones (desglose de pagos)
    const aplicacionesResult = await pool.query(`
      SELECT 
        ap.*,
        p.tracking_internal,
        p.recipient_name,
        p.assigned_cost_mxn,
        p.saldo_pendiente,
        p.payment_status
      FROM caja_chica_aplicacion_pagos ap
      JOIN packages p ON p.id = ap.package_id
      WHERE ap.transaccion_id = $1
      ORDER BY ap.created_at
    `, [id]);
    
    res.json({
      transaccion: txResult.rows[0],
      aplicaciones: aplicacionesResult.rows
    });
  } catch (error) {
    console.error('Error en getDetalleTransaccion:', error);
    res.status(500).json({ message: 'Error al obtener detalle' });
  }
};

// ============================================
// REALIZAR CORTE DE CAJA
// ============================================
export const realizarCorte = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  
  try {
    const { saldo_real, notas } = req.body;
    const userId = req.user?.id;
    const userName = req.user?.name;
    
    if (saldo_real === undefined || saldo_real === null) {
      res.status(400).json({ message: 'El saldo real es requerido' });
      return;
    }
    
    await client.query('BEGIN');
    
    // Obtener último corte
    const ultimoCorteResult = await client.query(`
      SELECT fecha_corte, saldo_final_sistema 
      FROM caja_chica_cortes 
      ORDER BY fecha_corte DESC LIMIT 1
    `);
    
    const saldoInicial = ultimoCorteResult.rows[0]?.saldo_final_sistema || 0;
    const fechaUltimoCorte = ultimoCorteResult.rows[0]?.fecha_corte || '1970-01-01';
    
    // Calcular movimientos desde el último corte
    const movimientosResult = await client.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) as total_egresos
      FROM caja_chica_transacciones
      WHERE created_at > $1
    `, [fechaUltimoCorte]);
    
    const { total_ingresos, total_egresos } = movimientosResult.rows[0];
    const saldoFinalSistema = parseFloat(saldoInicial) + parseFloat(total_ingresos) - parseFloat(total_egresos);
    const diferencia = parseFloat(saldo_real) - saldoFinalSistema;
    
    // Insertar corte
    const corteResult = await client.query(`
      INSERT INTO caja_chica_cortes 
        (saldo_inicial, total_ingresos, total_egresos, saldo_final_sistema, 
         saldo_final_entregado, diferencia, admin_id, admin_name, notas)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      saldoInicial,
      total_ingresos,
      total_egresos,
      saldoFinalSistema,
      saldo_real,
      diferencia,
      userId,
      userName,
      notas
    ]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Corte de caja realizado',
      corte: corteResult.rows[0],
      resumen: {
        saldo_inicial: parseFloat(saldoInicial),
        total_ingresos: parseFloat(total_ingresos),
        total_egresos: parseFloat(total_egresos),
        saldo_esperado: saldoFinalSistema,
        saldo_real: parseFloat(saldo_real),
        diferencia: diferencia
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en realizarCorte:', error);
    res.status(500).json({ message: 'Error al realizar corte' });
  } finally {
    client.release();
  }
};

// ============================================
// OBTENER HISTORIAL DE CORTES
// ============================================
export const getCortes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT * FROM caja_chica_cortes
      ORDER BY fecha_corte DESC
      LIMIT 50
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getCortes:', error);
    res.status(500).json({ message: 'Error al obtener cortes' });
  }
};

// ============================================
// BUSCAR GUÍA PARA COBRO RÁPIDO
// ============================================
export const buscarGuiaParaCobro = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tracking } = req.query;
    
    if (!tracking) {
      res.json([]);
      return;
    }
    
    const result = await pool.query(`
      SELECT 
        p.id,
        p.tracking_internal as tracking_number,
        p.recipient_name,
        p.assigned_cost_mxn,
        COALESCE(p.saldo_pendiente, p.assigned_cost_mxn) as saldo_pendiente,
        COALESCE(p.monto_pagado, 0) as monto_pagado,
        p.service_type,
        p.status,
        p.payment_status,
        p.user_id,
        u.full_name as cliente_nombre,
        u.box_id as cliente_box_id
      FROM packages p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.tracking_internal ILIKE $1
        AND p.assigned_cost_mxn > 0
      ORDER BY p.created_at DESC
      LIMIT 10
    `, [`%${tracking}%`]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en buscarGuiaParaCobro:', error);
    res.status(500).json({ message: 'Error al buscar guía' });
  }
};

// ============================================
// HISTORIAL DE PAGOS DE UN CLIENTE
// ============================================
export const getHistorialPagosCliente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clienteId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        t.*,
        (
          SELECT json_agg(json_build_object(
            'tracking_number', p.tracking_internal,
            'monto_aplicado', ap.monto_aplicado,
            'payment_status', p.payment_status
          ))
          FROM caja_chica_aplicacion_pagos ap
          JOIN packages p ON p.id = ap.package_id
          WHERE ap.transaccion_id = t.id
        ) as guias_pagadas
      FROM caja_chica_transacciones t
      WHERE t.cliente_id = $1
        AND t.tipo = 'ingreso'
      ORDER BY t.created_at DESC
      LIMIT 50
    `, [clienteId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getHistorialPagosCliente:', error);
    res.status(500).json({ message: 'Error al obtener historial' });
  }
};
