// ============================================
// CAJA CHICA CONTROLLER
// Control de efectivo con soporte para:
// - Pagos parciales
// - Pagos multi-guía (1 pago -> N guías)
// - Asignación automática (FIFO) o manual
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import { generateCommissionsForPackages } from './commissionService';

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
// Ahora con soporte multi-moneda (USD/MXN)
// Excluye pagos de PO Box
// ============================================
export const getCajaChicaStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Estadísticas por moneda (USD) - excluyendo PO Box
    const saldoUSDResult = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) as total_egresos
      FROM caja_chica_transacciones
      WHERE COALESCE(currency, 'USD') = 'USD'
        AND concepto NOT ILIKE '%PO Box%'
    `);
    
    const saldoUSD = parseFloat(saldoUSDResult.rows[0].total_ingresos) - parseFloat(saldoUSDResult.rows[0].total_egresos);
    
    // Estadísticas por moneda (MXN) - excluyendo PO Box
    const saldoMXNResult = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) as total_egresos
      FROM caja_chica_transacciones
      WHERE currency = 'MXN'
        AND concepto NOT ILIKE '%PO Box%'
    `);
    
    const saldoMXN = parseFloat(saldoMXNResult.rows[0].total_ingresos) - parseFloat(saldoMXNResult.rows[0].total_egresos);
    
    // Transacciones del día por moneda (USD) - excluyendo PO Box
    const hoyUSDResult = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as ingresos_hoy,
        COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) as egresos_hoy,
        COUNT(*) as cantidad_transacciones_hoy
      FROM caja_chica_transacciones
      WHERE DATE(created_at) = CURRENT_DATE
        AND COALESCE(currency, 'USD') = 'USD'
        AND concepto NOT ILIKE '%PO Box%'
    `);
    
    // Transacciones del día por moneda (MXN) - excluyendo PO Box
    const hoyMXNResult = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as ingresos_hoy,
        COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) as egresos_hoy,
        COUNT(*) as cantidad_transacciones_hoy
      FROM caja_chica_transacciones
      WHERE DATE(created_at) = CURRENT_DATE
        AND currency = 'MXN'
        AND concepto NOT ILIKE '%PO Box%'
    `);
    
    // Último corte por moneda
    const corteUSDResult = await pool.query(`
      SELECT fecha_corte FROM caja_chica_cortes 
      WHERE COALESCE(currency, 'USD') = 'USD'
      ORDER BY fecha_corte DESC LIMIT 1
    `);
    
    const corteMXNResult = await pool.query(`
      SELECT fecha_corte FROM caja_chica_cortes 
      WHERE currency = 'MXN'
      ORDER BY fecha_corte DESC LIMIT 1
    `);
    
    // Legacy: también devolver totales combinados para compatibilidad
    const saldo_actual = saldoUSD; // Por defecto USD para PO Box
    
    res.json({
      // Stats USD
      saldo_usd: saldoUSD,
      ingresos_hoy_usd: parseFloat(hoyUSDResult.rows[0].ingresos_hoy),
      egresos_hoy_usd: parseFloat(hoyUSDResult.rows[0].egresos_hoy),
      transacciones_hoy_usd: parseInt(hoyUSDResult.rows[0].cantidad_transacciones_hoy),
      ultimo_corte_usd: corteUSDResult.rows[0]?.fecha_corte || null,
      
      // Stats MXN
      saldo_mxn: saldoMXN,
      ingresos_hoy_mxn: parseFloat(hoyMXNResult.rows[0].ingresos_hoy),
      egresos_hoy_mxn: parseFloat(hoyMXNResult.rows[0].egresos_hoy),
      transacciones_hoy_mxn: parseInt(hoyMXNResult.rows[0].cantidad_transacciones_hoy),
      ultimo_corte_mxn: corteMXNResult.rows[0]?.fecha_corte || null,
      
      // Legacy fields (para compatibilidad)
      saldo_actual,
      ingresos_hoy: parseFloat(hoyUSDResult.rows[0].ingresos_hoy),
      egresos_hoy: parseFloat(hoyUSDResult.rows[0].egresos_hoy),
      cantidad_transacciones_hoy: parseInt(hoyUSDResult.rows[0].cantidad_transacciones_hoy) + parseInt(hoyMXNResult.rows[0].cantidad_transacciones_hoy),
      ultimo_corte: corteUSDResult.rows[0]?.fecha_corte || null,
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
    // Ensure columns that may be missing in older DB instances exist
    await pool.query(`ALTER TABLE caja_chica_transacciones ADD COLUMN IF NOT EXISTS saldo_despues_movimiento NUMERIC(14,2)`).catch(() => {});
    await pool.query(`ALTER TABLE caja_chica_transacciones ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MXN'`).catch(() => {});
    await pool.query(`ALTER TABLE caja_chica_transacciones ADD COLUMN IF NOT EXISTS categoria VARCHAR(50)`).catch(() => {});

    const { monto, concepto, categoria, notas, currency = 'MXN' } = req.body;
    const userId = (req.user as any)?.userId ?? (req.user as any)?.id ?? null;
    const userRow = userId ? await pool.query('SELECT full_name FROM users WHERE id = $1', [userId]).catch(() => ({ rows: [] })) : { rows: [] };
    const userName = (userRow as any).rows[0]?.full_name ?? null;

    if (!monto || monto <= 0 || !concepto) {
      res.status(400).json({ message: 'Monto y concepto son requeridos' });
      return;
    }

    // Calcular saldo después del movimiento (por moneda)
    const saldoResult = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) as saldo
      FROM caja_chica_transacciones
      WHERE COALESCE(currency, 'MXN') = $1
    `, [currency]);
    const nuevoSaldo = parseFloat(saldoResult.rows[0].saldo) + parseFloat(monto);

    const result = await pool.query(`
      INSERT INTO caja_chica_transacciones
        (tipo, monto, concepto, categoria, admin_id, admin_name, saldo_despues_movimiento, notas, currency)
      VALUES ('ingreso', $1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [monto, concepto, categoria || 'otro_ingreso', userId, userName, nuevoSaldo, notas || null, currency]);

    res.json({
      success: true,
      message: `Ingreso en ${currency} registrado`,
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
    const { monto, concepto, categoria, notas, referencia, evidencia_url, currency = 'MXN' } = req.body;
    const userId = (req.user as any)?.userId ?? (req.user as any)?.id ?? null;
    const userRow = userId ? await pool.query('SELECT full_name FROM users WHERE id = $1', [userId]).catch(() => ({ rows: [] })) : { rows: [] };
    const userName = (userRow as any).rows[0]?.full_name ?? null;
    
    if (!monto || monto <= 0 || !concepto) {
      res.status(400).json({ message: 'Monto y concepto son requeridos' });
      return;
    }
    
    // Verificar que hay saldo suficiente en la moneda correspondiente
    const saldoResult = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) as saldo
      FROM caja_chica_transacciones
      WHERE COALESCE(currency, 'MXN') = $1
    `, [currency]);
    const saldoActual = parseFloat(saldoResult.rows[0].saldo);
    
    if (saldoActual < parseFloat(monto)) {
      res.status(400).json({ 
        message: `Saldo insuficiente en caja ${currency}`,
        saldo_actual: saldoActual,
        monto_solicitado: monto
      });
      return;
    }
    
    const nuevoSaldo = saldoActual - parseFloat(monto);
    
    const result = await pool.query(`
      INSERT INTO caja_chica_transacciones 
        (tipo, monto, concepto, categoria, admin_id, admin_name, saldo_despues_movimiento, notas, referencia, evidencia_url, currency)
      VALUES ('egreso', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [monto, concepto, categoria || 'otro_egreso', userId, userName, nuevoSaldo, notas, referencia || null, evidencia_url || null, currency]);
    
    res.json({
      success: true,
      message: `Egreso en ${currency} registrado`,
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

    // Asegurar que la columna `referencia` exista — algunos entornos legacy
    // no corrieron la migración add_caja_chica_evidencia.sql, lo que rompe
    // la subquery de detalle de pagos a proveedor.
    await pool.query(`ALTER TABLE caja_chica_transacciones ADD COLUMN IF NOT EXISTS referencia VARCHAR(100)`).catch(() => {});
    await pool.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS costing_payment_reference VARCHAR(100)`).catch(() => {});

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
        ) as aplicaciones,
        (
          -- Detalle de consolidaciones cubiertas por este pago a proveedor.
          -- Las identificamos a través de packages.costing_payment_reference,
          -- que se setea con el mismo valor de t.referencia (o CAJA-<id> si no
          -- hubo referencia explícita) al pagar una/varias consolidaciones.
          SELECT json_agg(row_to_json(d) ORDER BY d.consolidation_id)
          FROM (
            SELECT
              p.consolidation_id,
              MAX(s.name) AS supplier_name,
              COUNT(p.id)::int AS package_count,
              COALESCE(SUM(p.pobox_service_cost), 0)::numeric AS total_mxn,
              COALESCE(SUM(p.pobox_cost_usd), 0)::numeric AS total_usd
            FROM packages p
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            WHERE t.categoria = 'pago_proveedor'
              AND p.costing_payment_reference = COALESCE(t.referencia, 'CAJA-' || t.id::text)
              AND p.consolidation_id IS NOT NULL
            GROUP BY p.consolidation_id
          ) d
        ) AS consolidaciones
      FROM caja_chica_transacciones t
      LEFT JOIN users u ON u.id = t.cliente_id
      WHERE t.concepto NOT ILIKE '%PO Box%'
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
    
    query += ` ORDER BY t.created_at DESC, CASE WHEN t.tipo = 'egreso' THEN 0 ELSE 1 END ASC LIMIT 200`;
    
    const result = await pool.query(query, params);

    // ====================================================================
    // Agrupar pagos a proveedor disparados en el mismo "click" en una sola
    // fila visual. Criterio: misma categoría=pago_proveedor, mismo admin,
    // mismo proveedor (extraído del concepto) y mismo minuto de created_at.
    // Esto cubre tanto el nuevo endpoint multi (que ya inserta una fila)
    // como datos históricos creados por el endpoint single en bucle.
    // ====================================================================
    const proveedorRegex = /Pago Proveedor:\s*([^-]+?)\s*-\s*Consolidaci[óo]n\s*#?(\d+)/i;
    const groups = new Map<string, any>();
    const ordered: any[] = [];
    for (const row of result.rows) {
      if (row.categoria !== 'pago_proveedor') {
        ordered.push(row);
        continue;
      }
      const m = String(row.concepto || '').match(proveedorRegex);
      const proveedor = m?.[1]?.trim() || 'Proveedor';
      const consolId = m?.[2] ? parseInt(m[2], 10) : null;
      const minute = new Date(row.created_at).toISOString().slice(0, 16);
      const key = `${row.admin_id || 'x'}|${proveedor}|${minute}`;

      if (!groups.has(key)) {
        const seed = {
          ...row,
          monto: Number(row.monto) || 0,
          _proveedor: proveedor,
          _tx_ids: [row.id],
          _consol_ids: new Set<number>(consolId ? [consolId] : []),
          consolidaciones: Array.isArray(row.consolidaciones) ? [...row.consolidaciones] : [],
        };
        groups.set(key, seed);
        ordered.push(seed);
      } else {
        const g = groups.get(key);
        g.monto = Number(g.monto) + (Number(row.monto) || 0);
        g._tx_ids.push(row.id);
        if (consolId) g._consol_ids.add(consolId);
        if (Array.isArray(row.consolidaciones)) {
          const existing = new Set(g.consolidaciones.map((c: any) => c.consolidation_id));
          for (const c of row.consolidaciones) {
            if (!existing.has(c.consolidation_id)) g.consolidaciones.push(c);
          }
        }
        // saldo_despues_movimiento: usar el del último (cronológicamente posterior).
        if (new Date(row.created_at) > new Date(g.created_at)) {
          g.saldo_despues_movimiento = row.saldo_despues_movimiento;
        }
      }
    }

    // Si una fila agrupada no trajo consolidaciones desde SQL (porque las
    // filas históricas no compartían referencia), las construimos desde el
    // concepto: una entrada mínima por consolidation_id detectado.
    for (const g of groups.values()) {
      const consolIds: number[] = Array.from(g._consol_ids);
      if (g.consolidaciones.length === 0 && consolIds.length > 0) {
        // Hidratar con datos reales de packages para cada consolidación.
        try {
          const det = await pool.query(
            `SELECT p.consolidation_id,
                    MAX(s.name) AS supplier_name,
                    COUNT(p.id)::int AS package_count,
                    COALESCE(SUM(p.pobox_service_cost), 0)::numeric AS total_mxn,
                    COALESCE(SUM(p.pobox_cost_usd), 0)::numeric AS total_usd
               FROM packages p
               LEFT JOIN suppliers s ON s.id = p.supplier_id
              WHERE p.consolidation_id = ANY($1::int[])
              GROUP BY p.consolidation_id
              ORDER BY p.consolidation_id`,
            [consolIds]
          );
          g.consolidaciones = det.rows;
        } catch {
          g.consolidaciones = consolIds.map((id) => ({
            consolidation_id: id,
            supplier_name: g._proveedor,
            package_count: null,
            total_mxn: null,
            total_usd: null,
          }));
        }
      }
      // Reescribir concepto agrupado.
      if (g._tx_ids.length > 1 || consolIds.length > 1) {
        const ids = consolIds.sort((a, b) => a - b).map((n) => `#${n}`).join(', ');
        const totalPkgs = g.consolidaciones.reduce(
          (s: number, c: any) => s + (Number(c.package_count) || 0),
          0
        );
        g.concepto = `Pago Proveedor: ${g._proveedor} - ${consolIds.length} consolidación(es) (${ids})${totalPkgs ? ` - ${totalPkgs} paquete(s)` : ''}`;
      }
      delete g._proveedor;
      delete g._tx_ids;
      delete g._consol_ids;
    }

    res.json(ordered);
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
// REALIZAR CORTE DE CAJA (CIEGO - USD Y MXN SEPARADOS)
// ============================================
export const realizarCorte = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  
  try {
    const { saldo_usd, saldo_mxn, notas } = req.body;
    const userId = req.user?.id;
    const userName = req.user?.name;
    
    if ((saldo_usd === undefined || saldo_usd === null) && (saldo_mxn === undefined || saldo_mxn === null)) {
      res.status(400).json({ message: 'Debe ingresar al menos un saldo (USD o MXN)' });
      return;
    }
    
    await client.query('BEGIN');
    
    const resultados: any[] = [];
    
    // ============ CORTE USD ============
    if (saldo_usd !== undefined && saldo_usd !== null) {
      // Obtener último corte USD
      const ultimoCorteUSD = await client.query(`
        SELECT fecha_corte, saldo_final_sistema 
        FROM caja_chica_cortes 
        WHERE COALESCE(currency, 'USD') = 'USD'
        ORDER BY fecha_corte DESC LIMIT 1
      `);
      
      const saldoInicialUSD = ultimoCorteUSD.rows[0]?.saldo_final_sistema || 0;
      const fechaUltimoCorteUSD = ultimoCorteUSD.rows[0]?.fecha_corte || '1970-01-01';
      
      // Calcular movimientos USD desde el último corte
      const movimientosUSD = await client.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as total_ingresos,
          COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) as total_egresos
        FROM caja_chica_transacciones
        WHERE created_at > $1 AND COALESCE(currency, 'USD') = 'USD'
      `, [fechaUltimoCorteUSD]);
      
      const ingresosUSD = parseFloat(movimientosUSD.rows[0].total_ingresos);
      const egresosUSD = parseFloat(movimientosUSD.rows[0].total_egresos);
      const saldoSistemaUSD = parseFloat(saldoInicialUSD) + ingresosUSD - egresosUSD;
      const diferenciaUSD = parseFloat(saldo_usd) - saldoSistemaUSD;
      
      // Insertar corte USD
      const corteUSD = await client.query(`
        INSERT INTO caja_chica_cortes 
          (saldo_inicial, total_ingresos, total_egresos, saldo_final_sistema, 
           saldo_final_entregado, diferencia, admin_id, admin_name, notas, currency)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'USD')
        RETURNING *
      `, [saldoInicialUSD, ingresosUSD, egresosUSD, saldoSistemaUSD, saldo_usd, diferenciaUSD, userId, userName, notas]);
      
      resultados.push({
        currency: 'USD',
        saldo_inicial: parseFloat(saldoInicialUSD),
        total_ingresos: ingresosUSD,
        total_egresos: egresosUSD,
        saldo_esperado: saldoSistemaUSD,
        saldo_contado: parseFloat(saldo_usd),
        diferencia: diferenciaUSD,
        corte: corteUSD.rows[0]
      });
    }
    
    // ============ CORTE MXN ============
    if (saldo_mxn !== undefined && saldo_mxn !== null) {
      // Obtener último corte MXN
      const ultimoCorteMXN = await client.query(`
        SELECT fecha_corte, saldo_final_sistema 
        FROM caja_chica_cortes 
        WHERE currency = 'MXN'
        ORDER BY fecha_corte DESC LIMIT 1
      `);
      
      const saldoInicialMXN = ultimoCorteMXN.rows[0]?.saldo_final_sistema || 0;
      const fechaUltimoCorteMXN = ultimoCorteMXN.rows[0]?.fecha_corte || '1970-01-01';
      
      // Calcular movimientos MXN desde el último corte
      const movimientosMXN = await client.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as total_ingresos,
          COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) as total_egresos
        FROM caja_chica_transacciones
        WHERE created_at > $1 AND currency = 'MXN'
      `, [fechaUltimoCorteMXN]);
      
      const ingresosMXN = parseFloat(movimientosMXN.rows[0].total_ingresos);
      const egresosMXN = parseFloat(movimientosMXN.rows[0].total_egresos);
      const saldoSistemaMXN = parseFloat(saldoInicialMXN) + ingresosMXN - egresosMXN;
      const diferenciaMXN = parseFloat(saldo_mxn) - saldoSistemaMXN;
      
      // Insertar corte MXN
      const corteMXN = await client.query(`
        INSERT INTO caja_chica_cortes 
          (saldo_inicial, total_ingresos, total_egresos, saldo_final_sistema, 
           saldo_final_entregado, diferencia, admin_id, admin_name, notas, currency)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'MXN')
        RETURNING *
      `, [saldoInicialMXN, ingresosMXN, egresosMXN, saldoSistemaMXN, saldo_mxn, diferenciaMXN, userId, userName, notas]);
      
      resultados.push({
        currency: 'MXN',
        saldo_inicial: parseFloat(saldoInicialMXN),
        total_ingresos: ingresosMXN,
        total_egresos: egresosMXN,
        saldo_esperado: saldoSistemaMXN,
        saldo_contado: parseFloat(saldo_mxn),
        diferencia: diferenciaMXN,
        corte: corteMXN.rows[0]
      });
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Corte de caja realizado',
      resultados
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

// ============================================
// BUSCAR PAGO POR REFERENCIA
// ============================================
export const buscarPorReferencia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ref } = req.query;
    
    if (!ref || String(ref).trim().length < 3) {
      res.status(400).json({ error: 'Referencia de pago requerida (mínimo 3 caracteres)' });
      return;
    }
    
    const referencia = String(ref).trim().toUpperCase();
    
    // Buscar en la tabla de pagos pendientes (payment_references o referencias generadas)
    // Primero buscar en packages que tengan esta referencia de pago asignada
    const result = await pool.query(`
      SELECT 
        p.id,
        p.tracking_internal as tracking,
        p.payment_reference as referencia,
        COALESCE(p.saldo_pendiente, p.assigned_cost_mxn) as monto,
        p.assigned_cost_mxn as monto_total,
        p.payment_status,
        p.user_id,
        u.full_name as cliente_nombre,
        u.email as cliente_email,
        u.box_id as cliente_box_id
      FROM packages p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.payment_reference ILIKE $1
        AND p.assigned_cost_mxn > 0
        AND (p.payment_status IS NULL OR p.payment_status IN ('pending', 'partial'))
      ORDER BY p.created_at DESC
    `, [`%${referencia}%`]);
    
    if (result.rows.length === 0) {
      res.json({ found: false, message: 'No se encontró ningún pago pendiente con esa referencia' });
      return;
    }
    
    // Agrupar por cliente y referencia
    const primerPaquete = result.rows[0];
    const guias = result.rows.map(r => ({
      id: r.id,
      tracking: r.tracking,
      monto: parseFloat(r.monto) || 0
    }));
    
    const montoTotal = guias.reduce((sum, g) => sum + g.monto, 0);
    
    res.json({
      found: true,
      referencia: primerPaquete.referencia || referencia,
      monto: montoTotal,
      cliente: {
        id: primerPaquete.user_id,
        nombre: primerPaquete.cliente_nombre,
        email: primerPaquete.cliente_email,
        box_id: primerPaquete.cliente_box_id
      },
      guias
    });
  } catch (error) {
    console.error('Error en buscarPorReferencia:', error);
    res.status(500).json({ error: 'Error al buscar por referencia' });
  }
};

// ============================================
// CONFIRMAR PAGO POR REFERENCIA
// ============================================
export const confirmarPagoReferencia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { referencia, monto, notas } = req.body;
    const adminId = req.user?.id || 0;
    const adminName = req.user?.name || 'Sistema';
    
    if (!referencia || !monto || monto <= 0) {
      res.status(400).json({ error: 'Referencia y monto son requeridos' });
      return;
    }
    
    // Buscar los paquetes con esa referencia
    const packagesResult = await pool.query(`
      SELECT 
        p.id,
        p.tracking_internal,
        p.user_id,
        COALESCE(p.saldo_pendiente, p.assigned_cost_mxn) as saldo_pendiente,
        p.assigned_cost_mxn,
        u.full_name as cliente_nombre,
        u.box_id as cliente_box_id
      FROM packages p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.payment_reference ILIKE $1
        AND p.assigned_cost_mxn > 0
        AND (p.payment_status IS NULL OR p.payment_status IN ('pending', 'partial'))
      ORDER BY p.created_at ASC
    `, [`%${referencia}%`]);
    
    if (packagesResult.rows.length === 0) {
      res.status(404).json({ error: 'No se encontraron paquetes con esa referencia' });
      return;
    }
    
    const clienteId = packagesResult.rows[0].user_id;
    const clienteBoxId = packagesResult.rows[0].cliente_box_id || '';
    
    // Crear transacción de ingreso
    const txResult = await pool.query(`
      INSERT INTO caja_chica_transacciones (
        tipo, monto, concepto, categoria, cliente_id, admin_id, admin_name, notas
      ) VALUES (
        'ingreso', $1, $2, 'pago_cliente', $3, $4, $5, $6
      ) RETURNING id
    `, [
      monto,
      `Pago Referencia: ${referencia}`,
      clienteId,
      adminId,
      adminName,
      notas || null
    ]);
    
    const transaccionId = txResult.rows[0].id;
    
    // Aplicar pago FIFO a los paquetes
    let montoRestante = parseFloat(monto);
    const aplicaciones = [];
    
    for (const pkg of packagesResult.rows) {
      if (montoRestante <= 0) break;
      
      const saldoPendiente = parseFloat(pkg.saldo_pendiente) || 0;
      const montoAAplicar = Math.min(montoRestante, saldoPendiente);
      
      if (montoAAplicar > 0) {
        // Actualizar el paquete
        const nuevoSaldo = saldoPendiente - montoAAplicar;
        const montoPagadoActual = parseFloat(pkg.assigned_cost_mxn) - saldoPendiente;
        const nuevoMontoPagado = montoPagadoActual + montoAAplicar;
        const nuevoStatus = nuevoSaldo <= 0 ? 'paid' : 'partial';
        
        await pool.query(`
          UPDATE packages SET
            saldo_pendiente = $1,
            monto_pagado = $2,
            payment_status = $3,
            updated_at = NOW()
          WHERE id = $4
        `, [nuevoSaldo, nuevoMontoPagado, nuevoStatus, pkg.id]);
        
        // Registrar aplicación
        await pool.query(`
          INSERT INTO caja_chica_aplicacion_pagos (transaccion_id, package_id, monto_aplicado)
          VALUES ($1, $2, $3)
        `, [transaccionId, pkg.id, montoAAplicar]);
        
        aplicaciones.push({
          tracking: pkg.tracking_internal,
          monto_aplicado: montoAAplicar,
          nuevo_status: nuevoStatus
        });
        
        montoRestante -= montoAAplicar;
      }
    }

    // Generar comisiones para paquetes completamente pagados
    const paidPackageIds = aplicaciones
      .filter(a => a.nuevo_status === 'paid')
      .map(a => packagesResult.rows.find(p => p.tracking_internal === a.tracking)?.id)
      .filter((id): id is number => !!id);
    if (paidPackageIds.length > 0) {
      generateCommissionsForPackages(paidPackageIds).catch(err =>
        console.error('Error generando comisiones (caja chica):', err)
      );
    }
    
    res.json({
      success: true,
      message: `Pago de $${monto} registrado correctamente`,
      transaccion_id: transaccionId,
      aplicaciones,
      sobrante: montoRestante > 0 ? montoRestante : 0
    });
  } catch (error) {
    console.error('Error en confirmarPagoReferencia:', error);
    res.status(500).json({ error: 'Error al confirmar pago' });
  }
};
// ============================================
// PAGAR CONSOLIDACIÓN A PROVEEDOR
// Marca todos los paquetes de una consolidación como pagados al proveedor
// ============================================
export const pagarConsolidacionProveedor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { consolidation_id, monto, referencia, notas } = req.body;
    const adminId = req.user?.id || 1; // Default a admin principal si no hay user
    const adminName = req.user?.name || 'Sistema';

    console.log(`💳 [PAGO PROVEEDOR] Procesando pago - Consolidación #${consolidation_id} - Monto: $${monto} - Admin: ${adminName} (ID: ${adminId})`);

    if (!consolidation_id) {
      res.status(400).json({ error: 'ID de consolidación requerido' });
      return;
    }

    if (!monto || monto <= 0) {
      res.status(400).json({ error: 'Monto inválido' });
      return;
    }

    // Verificar que la consolidación existe y tiene paquetes pendientes de pago
    // Sólo consideramos paquetes que llegaron (no missing, no lost) para el pago
    const consolidacionResult = await pool.query(`
      SELECT 
        c.id,
        s.id as supplier_id,
        s.name as supplier_name,
        COUNT(p.id) as package_count,
        COALESCE(SUM(p.pobox_service_cost), 0) as total_mxn,
        COALESCE(SUM(p.pobox_cost_usd), 0) as total_usd
      FROM consolidations c
      JOIN packages p ON p.consolidation_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE c.id = $1
      AND (p.costing_paid IS NULL OR p.costing_paid = FALSE)
      AND COALESCE(p.missing_on_arrival, FALSE) = FALSE
      AND COALESCE(p.is_lost, FALSE) = FALSE
      GROUP BY c.id, s.id, s.name
    `, [consolidation_id]);

    if (consolidacionResult.rows.length === 0) {
      res.status(404).json({ error: 'Consolidación no encontrada o ya está pagada' });
      return;
    }

    const consolidacion = consolidacionResult.rows[0];

    // Calcular saldo actual antes del movimiento
    const saldoResult = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) as saldo
      FROM caja_chica_transacciones
    `);
    const saldoActual = parseFloat(saldoResult.rows[0].saldo);
    const nuevoSaldo = saldoActual - parseFloat(monto.toString());

    console.log(`💰 [CAJA] Saldo actual: $${saldoActual}, Monto: $${monto}, Nuevo saldo: $${nuevoSaldo}`);

    // Crear transacción de egreso en caja chica
    const transaccionResult = await pool.query(`
      INSERT INTO caja_chica_transacciones 
        (tipo, monto, concepto, categoria, admin_id, admin_name, saldo_despues_movimiento, notas, referencia)
      VALUES 
        ('egreso', $1, $2, 'pago_proveedor', $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      monto,
      `Pago Proveedor: ${consolidacion.supplier_name || 'N/A'} - Consolidación #${consolidation_id} (${consolidacion.package_count} paquetes)`,
      adminId,
      adminName,
      nuevoSaldo,
      `${referencia ? `Ref: ${referencia}` : ''}${notas ? ` | ${notas}` : ''}`.trim() || null,
      referencia || null
    ]);

    const transaccionId = transaccionResult.rows[0].id;

    // Marcar SOLO los paquetes que llegaron como pagados al proveedor
    // (los missing_on_arrival/is_lost quedan pendientes hasta que lleguen o se resuelvan)
    const updateResult = await pool.query(`
      UPDATE packages 
      SET 
        costing_paid = TRUE,
        costing_paid_at = NOW(),
        costing_payment_reference = $1,
        updated_at = NOW()
      WHERE consolidation_id = $2
      AND supplier_id = $3
      AND (costing_paid IS NULL OR costing_paid = FALSE)
      AND COALESCE(missing_on_arrival, FALSE) = FALSE
      AND COALESCE(is_lost, FALSE) = FALSE
      RETURNING id, tracking_internal
    `, [referencia || `CAJA-${transaccionId}`, consolidation_id, consolidacion.supplier_id]);

    // Registrar en historial de pagos para el panel del proveedor
    const packageIds = updateResult.rows.map(p => p.id);
    if (packageIds.length > 0) {
      await pool.query(`
        INSERT INTO pobox_payment_history 
        (package_ids, total_cost, payment_reference, paid_by, paid_at, supplier_id)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
      `, [JSON.stringify(packageIds), monto, referencia || `CAJA-${transaccionId}`, adminId, consolidacion.supplier_id]).catch(async (err) => {
        // Si falta la columna supplier_id, agregarla
        if (err.code === '42703') {
          await pool.query('ALTER TABLE pobox_payment_history ADD COLUMN IF NOT EXISTS supplier_id INTEGER').catch(() => {});
          await pool.query(`
            INSERT INTO pobox_payment_history 
            (package_ids, total_cost, payment_reference, paid_by, paid_at, supplier_id)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
          `, [JSON.stringify(packageIds), monto, referencia || `CAJA-${transaccionId}`, adminId, consolidacion.supplier_id]).catch(() => {});
        }
      });
    }

    console.log(`💰 [CAJA] Pago a proveedor: ${consolidacion.supplier_name} - Consolidación #${consolidation_id} - $${monto} MXN - ${updateResult.rows.length} paquetes`);

    res.json({
      success: true,
      message: `Pago de $${monto} registrado a proveedor ${consolidacion.supplier_name}`,
      transaccion_id: transaccionId,
      consolidation_id: consolidation_id,
      supplier_name: consolidacion.supplier_name,
      packages_updated: updateResult.rows.length,
      packages: updateResult.rows.map(p => p.tracking_internal)
    });

  } catch (error) {
    console.error('Error en pagarConsolidacionProveedor:', error);
    res.status(500).json({ error: 'Error al procesar pago a proveedor' });
  }
};

// ============================================
// PAGAR MÚLTIPLES CONSOLIDACIONES EN UNA SOLA TRANSACCIÓN
// ============================================
// Crea UNA sola fila en caja_chica_transacciones que cubre todas las
// consolidaciones del lote. Cada paquete pagado queda etiquetado con
// la misma `costing_payment_reference` para poder rearmar el detalle
// al listar las transacciones.
export const pagarMultiplesConsolidaciones = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { consolidation_ids, referencia, notas } = req.body as {
      consolidation_ids: number[]; referencia?: string | null; notas?: string | null;
    };
    const adminId = req.user?.id;
    const adminName = req.user?.name || 'Sistema';

    if (!Array.isArray(consolidation_ids) || consolidation_ids.length === 0) {
      res.status(400).json({ error: 'Se requiere al menos una consolidación' });
      return;
    }

    await client.query('BEGIN');

    // Cargar consolidaciones pagables (sólo paquetes que llegaron, no pagados aún)
    const consResult = await client.query(`
      SELECT
        c.id AS consolidation_id,
        s.id AS supplier_id,
        s.name AS supplier_name,
        COUNT(p.id)::int AS package_count,
        COALESCE(SUM(p.pobox_service_cost), 0)::numeric AS total_mxn,
        COALESCE(SUM(p.pobox_cost_usd), 0)::numeric AS total_usd
      FROM consolidations c
      JOIN packages p ON p.consolidation_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE c.id = ANY($1::int[])
        AND (p.costing_paid IS NULL OR p.costing_paid = FALSE)
        AND COALESCE(p.missing_on_arrival, FALSE) = FALSE
        AND COALESCE(p.is_lost, FALSE) = FALSE
      GROUP BY c.id, s.id, s.name
    `, [consolidation_ids]);

    if (consResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Las consolidaciones no tienen paquetes pendientes de pago' });
      return;
    }

    const consolidaciones = consResult.rows;
    const totalMonto = consolidaciones.reduce((s, c) => s + Number(c.total_mxn || 0), 0);
    const totalPaquetes = consolidaciones.reduce((s, c) => s + Number(c.package_count || 0), 0);
    const supplierNames = Array.from(new Set(consolidaciones.map(c => c.supplier_name).filter(Boolean)));
    const idsLista = consolidaciones.map(c => `#${c.consolidation_id}`).join(', ');

    // Saldo actual
    const saldoResult = await client.query(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) as saldo
      FROM caja_chica_transacciones
    `);
    const saldoActual = parseFloat(saldoResult.rows[0].saldo);
    const nuevoSaldo = saldoActual - totalMonto;

    const concepto = `Pago Proveedor: ${supplierNames.join(', ') || 'N/A'} - ${consolidaciones.length} consolidación(es) (${idsLista}) - ${totalPaquetes} paquete(s)`;

    const txInsert = await client.query(`
      INSERT INTO caja_chica_transacciones
        (tipo, monto, concepto, categoria, admin_id, admin_name, saldo_despues_movimiento, notas, referencia)
      VALUES ('egreso', $1, $2, 'pago_proveedor', $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      totalMonto,
      concepto,
      adminId,
      adminName,
      nuevoSaldo,
      notas || null,
      referencia || null,
    ]);
    const transaccionId: number = txInsert.rows[0].id;
    const paymentRef = referencia || `CAJA-${transaccionId}`;

    // Marcar paquetes como pagados (sólo los que llegaron)
    const updateRes = await client.query(`
      UPDATE packages
         SET costing_paid = TRUE,
             costing_paid_at = NOW(),
             costing_payment_reference = $1,
             updated_at = NOW()
       WHERE consolidation_id = ANY($2::int[])
         AND (costing_paid IS NULL OR costing_paid = FALSE)
         AND COALESCE(missing_on_arrival, FALSE) = FALSE
         AND COALESCE(is_lost, FALSE) = FALSE
      RETURNING id, consolidation_id, supplier_id
    `, [paymentRef, consolidation_ids]);

    // Historial de pagos por proveedor (igual que pagarConsolidacionProveedor)
    const bySupplier = new Map<number, number[]>();
    for (const row of updateRes.rows) {
      if (!row.supplier_id) continue;
      const arr = bySupplier.get(row.supplier_id) || [];
      arr.push(row.id);
      bySupplier.set(row.supplier_id, arr);
    }
    for (const [supplierId, packageIds] of bySupplier.entries()) {
      const monto = consolidaciones
        .filter(c => Number(c.supplier_id) === Number(supplierId))
        .reduce((s, c) => s + Number(c.total_mxn || 0), 0);
      await client.query(`
        INSERT INTO pobox_payment_history
          (package_ids, total_cost, payment_reference, paid_by, paid_at, supplier_id)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
      `, [JSON.stringify(packageIds), monto, paymentRef, adminId, supplierId]).catch(async (err) => {
        if (err.code === '42703') {
          await client.query('ALTER TABLE pobox_payment_history ADD COLUMN IF NOT EXISTS supplier_id INTEGER').catch(() => {});
          await client.query(`
            INSERT INTO pobox_payment_history
              (package_ids, total_cost, payment_reference, paid_by, paid_at, supplier_id)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
          `, [JSON.stringify(packageIds), monto, paymentRef, adminId, supplierId]).catch(() => {});
        }
      });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Pago de $${totalMonto.toFixed(2)} MXN registrado · ${consolidaciones.length} consolidación(es) · ${updateRes.rows.length} paquete(s)`,
      transaccion_id: transaccionId,
      payment_reference: paymentRef,
      total_monto: totalMonto,
      consolidations: consolidaciones.map(c => ({
        id: c.consolidation_id,
        supplier_name: c.supplier_name,
        package_count: Number(c.package_count),
        monto_mxn: Number(c.total_mxn),
        monto_usd: Number(c.total_usd),
      })),
      packages_updated: updateRes.rows.length,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error en pagarMultiplesConsolidaciones:', error);
    res.status(500).json({ error: 'Error al procesar pago múltiple a proveedor' });
  } finally {
    client.release();
  }
};

// ============================================================
// DELETE /api/caja-chica/transacciones/:id — solo super_admin
// Elimina una entrada específica de caja_chica_transacciones.
// El saldo se recalcula automáticamente (es un SUM dinámico).
// ============================================================
export const deleteTransaccion = async (req: AuthRequest, res: Response): Promise<void> => {
  const txId = parseInt(req.params['id'] as string, 10);
  if (!txId) { res.status(400).json({ error: 'ID inválido' }); return; }
  try {
    const result = await pool.query(
      'DELETE FROM caja_chica_transacciones WHERE id = $1 RETURNING id',
      [txId]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Transacción no encontrada' });
      return;
    }
    res.json({ success: true, message: 'Transacción eliminada' });
  } catch (error) {
    console.error('Error en deleteTransaccion:', error);
    res.status(500).json({ error: 'Error al eliminar transacción' });
  }
};