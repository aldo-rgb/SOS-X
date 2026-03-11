// ============================================
// TESORERÍA SUCURSAL CONTROLLER
// Sistema de caja chica independiente por sucursal
// Soporta: Billeteras, Categorías, Movimientos, Cortes de Caja
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
// BILLETERAS
// ============================================

// Obtener billeteras de una sucursal
export const getBilleterasSucursal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sucursalId } = req.params;
    const userBranchId = req.user?.branch_id;
    const userRole = req.user?.role;
    
    // Verificar acceso: solo super_admin puede ver todas, otros solo su sucursal
    const targetBranch = ['super_admin', 'admin', 'director', 'finanzas'].includes(userRole || '') 
      ? sucursalId 
      : userBranchId;
    
    if (!targetBranch) {
      res.status(403).json({ message: 'No tienes acceso a esta sucursal' });
      return;
    }
    
    const result = await pool.query(`
      SELECT 
        b.*,
        br.name as sucursal_nombre,
        br.code as sucursal_codigo,
        (SELECT COUNT(*) FROM movimientos_financieros mf WHERE mf.billetera_id = b.id AND mf.status = 'confirmado') as total_movimientos
      FROM billeteras_sucursal b
      LEFT JOIN branches br ON b.sucursal_id = br.id
      WHERE b.sucursal_id = $1 AND b.is_active = true
      ORDER BY b.is_default DESC, b.nombre ASC
    `, [targetBranch]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getBilleterasSucursal:', error);
    res.status(500).json({ message: 'Error al obtener billeteras' });
  }
};

// Crear nueva billetera
export const createBilletera = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sucursal_id, nombre, tipo, tipo_moneda, cuenta_referencia, icono, color, saldo_inicial } = req.body;
    
    if (!sucursal_id || !nombre || !tipo) {
      res.status(400).json({ message: 'Sucursal, nombre y tipo son requeridos' });
      return;
    }
    
    const result = await pool.query(`
      INSERT INTO billeteras_sucursal 
        (sucursal_id, nombre, tipo, tipo_moneda, cuenta_referencia, icono, color, saldo_actual)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [sucursal_id, nombre, tipo, tipo_moneda || 'MXN', cuenta_referencia, icono || 'account_balance_wallet', color || '#4CAF50', saldo_inicial || 0]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en createBilletera:', error);
    res.status(500).json({ message: 'Error al crear billetera' });
  }
};

// Actualizar billetera
export const updateBilletera = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre, tipo, tipo_moneda, cuenta_referencia, icono, color, is_active, is_default } = req.body;
    
    // Si se marca como default, quitar default de otras billeteras de la misma sucursal
    if (is_default) {
      const billeteraInfo = await pool.query('SELECT sucursal_id FROM billeteras_sucursal WHERE id = $1', [id]);
      if (billeteraInfo.rows.length > 0) {
        await pool.query(
          'UPDATE billeteras_sucursal SET is_default = false WHERE sucursal_id = $1',
          [billeteraInfo.rows[0].sucursal_id]
        );
      }
    }
    
    const result = await pool.query(`
      UPDATE billeteras_sucursal SET
        nombre = COALESCE($2, nombre),
        tipo = COALESCE($3, tipo),
        tipo_moneda = COALESCE($4, tipo_moneda),
        cuenta_referencia = COALESCE($5, cuenta_referencia),
        icono = COALESCE($6, icono),
        color = COALESCE($7, color),
        is_active = COALESCE($8, is_active),
        is_default = COALESCE($9, is_default),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id, nombre, tipo, tipo_moneda, cuenta_referencia, icono, color, is_active, is_default]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en updateBilletera:', error);
    res.status(500).json({ message: 'Error al actualizar billetera' });
  }
};

// ============================================
// CATEGORÍAS FINANCIERAS
// ============================================

export const getCategoriasFinancieras = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tipo } = req.query; // 'ingreso' o 'egreso' o undefined para todas
    
    let query = `
      SELECT * FROM categorias_financieras 
      WHERE is_active = true
    `;
    const params: string[] = [];
    
    if (tipo) {
      query += ` AND tipo = $1`;
      params.push(String(tipo));
    }
    
    query += ` ORDER BY is_system DESC, nombre ASC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getCategoriasFinancieras:', error);
    res.status(500).json({ message: 'Error al obtener categorías' });
  }
};

export const createCategoriaFinanciera = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tipo, nombre, descripcion, icono, color, empresa_id } = req.body;
    
    if (!tipo || !nombre) {
      res.status(400).json({ message: 'Tipo y nombre son requeridos' });
      return;
    }
    
    const result = await pool.query(`
      INSERT INTO categorias_financieras (tipo, nombre, descripcion, icono, color, empresa_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [tipo, nombre, descripcion, icono || 'category', color || '#9E9E9E', empresa_id]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en createCategoriaFinanciera:', error);
    res.status(500).json({ message: 'Error al crear categoría' });
  }
};

// ============================================
// MOVIMIENTOS FINANCIEROS
// ============================================

// Obtener dashboard/estadísticas de tesorería
export const getTesoreriaDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sucursalId } = req.params;
    const userBranchId = req.user?.branch_id;
    const userRole = req.user?.role;
    
    // Verificar acceso
    const targetBranch = ['super_admin', 'admin', 'director', 'finanzas'].includes(userRole || '') 
      ? sucursalId 
      : userBranchId;
    
    if (!targetBranch) {
      res.status(403).json({ message: 'No tienes acceso a esta sucursal' });
      return;
    }
    
    // Obtener billeteras con saldos
    const billeterasResult = await pool.query(`
      SELECT id, nombre, tipo, saldo_actual, tipo_moneda, icono, color, is_default
      FROM billeteras_sucursal
      WHERE sucursal_id = $1 AND is_active = true
      ORDER BY is_default DESC, nombre
    `, [targetBranch]);
    
    // Calcular totales del día
    const hoyResult = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo_movimiento = 'ingreso' THEN monto ELSE 0 END), 0) as ingresos_hoy,
        COALESCE(SUM(CASE WHEN tipo_movimiento = 'egreso' THEN monto ELSE 0 END), 0) as egresos_hoy,
        COUNT(*) FILTER (WHERE tipo_movimiento IN ('ingreso', 'egreso')) as transacciones_hoy
      FROM movimientos_financieros
      WHERE sucursal_id = $1 
        AND DATE(created_at) = CURRENT_DATE
        AND status = 'confirmado'
    `, [targetBranch]);
    
    // Calcular totales del mes
    const mesResult = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo_movimiento = 'ingreso' THEN monto ELSE 0 END), 0) as ingresos_mes,
        COALESCE(SUM(CASE WHEN tipo_movimiento = 'egreso' THEN monto ELSE 0 END), 0) as egresos_mes
      FROM movimientos_financieros
      WHERE sucursal_id = $1 
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
        AND status = 'confirmado'
    `, [targetBranch]);
    
    // Distribución de gastos por categoría (para gráfica de pastel)
    const gastosCategoriaResult = await pool.query(`
      SELECT 
        cf.id,
        cf.nombre,
        cf.color,
        cf.icono,
        COALESCE(SUM(mf.monto), 0) as total
      FROM categorias_financieras cf
      LEFT JOIN movimientos_financieros mf ON cf.id = mf.categoria_id 
        AND mf.sucursal_id = $1 
        AND mf.tipo_movimiento = 'egreso'
        AND mf.status = 'confirmado'
        AND DATE_TRUNC('month', mf.created_at) = DATE_TRUNC('month', CURRENT_DATE)
      WHERE cf.tipo = 'egreso' AND cf.is_active = true
      GROUP BY cf.id, cf.nombre, cf.color, cf.icono
      HAVING COALESCE(SUM(mf.monto), 0) > 0
      ORDER BY total DESC
      LIMIT 10
    `, [targetBranch]);
    
    // Distribución de ingresos por categoría
    const ingresosCategoriaResult = await pool.query(`
      SELECT 
        cf.id,
        cf.nombre,
        cf.color,
        cf.icono,
        COALESCE(SUM(mf.monto), 0) as total
      FROM categorias_financieras cf
      LEFT JOIN movimientos_financieros mf ON cf.id = mf.categoria_id 
        AND mf.sucursal_id = $1 
        AND mf.tipo_movimiento = 'ingreso'
        AND mf.status = 'confirmado'
        AND DATE_TRUNC('month', mf.created_at) = DATE_TRUNC('month', CURRENT_DATE)
      WHERE cf.tipo = 'ingreso' AND cf.is_active = true
      GROUP BY cf.id, cf.nombre, cf.color, cf.icono
      HAVING COALESCE(SUM(mf.monto), 0) > 0
      ORDER BY total DESC
      LIMIT 10
    `, [targetBranch]);
    
    // Último corte de caja
    const ultimoCorteResult = await pool.query(`
      SELECT * FROM cortes_caja_sucursal
      WHERE sucursal_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [targetBranch]);
    
    // Corte abierto actual
    const corteAbiertoResult = await pool.query(`
      SELECT * FROM cortes_caja_sucursal
      WHERE sucursal_id = $1 AND estatus = 'abierto'
      ORDER BY created_at DESC
      LIMIT 1
    `, [targetBranch]);
    
    // Saldo total de todas las billeteras
    const saldoTotal = billeterasResult.rows.reduce((acc: number, b: { saldo_actual: string }) => 
      acc + parseFloat(b.saldo_actual || '0'), 0);
    
    res.json({
      billeteras: billeterasResult.rows,
      saldo_total: saldoTotal,
      hoy: {
        ingresos: parseFloat(hoyResult.rows[0].ingresos_hoy),
        egresos: parseFloat(hoyResult.rows[0].egresos_hoy),
        transacciones: parseInt(hoyResult.rows[0].transacciones_hoy),
      },
      mes: {
        ingresos: parseFloat(mesResult.rows[0].ingresos_mes),
        egresos: parseFloat(mesResult.rows[0].egresos_mes),
      },
      gastos_por_categoria: gastosCategoriaResult.rows,
      ingresos_por_categoria: ingresosCategoriaResult.rows,
      ultimo_corte: ultimoCorteResult.rows[0] || null,
      corte_abierto: corteAbiertoResult.rows[0] || null,
    });
  } catch (error) {
    console.error('Error en getTesoreriaDashboard:', error);
    res.status(500).json({ message: 'Error al obtener dashboard' });
  }
};

// Obtener movimientos de una sucursal
export const getMovimientosFinancieros = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sucursalId } = req.params;
    const { billetera_id, tipo, categoria_id, desde, hasta, status, limit = 50, offset = 0 } = req.query;
    const userBranchId = req.user?.branch_id;
    const userRole = req.user?.role;
    
    // Verificar acceso
    const targetBranch = ['super_admin', 'admin', 'director', 'finanzas'].includes(userRole || '') 
      ? sucursalId 
      : userBranchId;
    
    if (!targetBranch) {
      res.status(403).json({ message: 'No tienes acceso a esta sucursal' });
      return;
    }
    
    let query = `
      SELECT 
        mf.*,
        bs.nombre as billetera_nombre,
        bs.tipo as billetera_tipo,
        cf.nombre as categoria_nombre,
        cf.color as categoria_color,
        cf.icono as categoria_icono,
        bd.nombre as billetera_destino_nombre
      FROM movimientos_financieros mf
      LEFT JOIN billeteras_sucursal bs ON mf.billetera_id = bs.id
      LEFT JOIN categorias_financieras cf ON mf.categoria_id = cf.id
      LEFT JOIN billeteras_sucursal bd ON mf.billetera_destino_id = bd.id
      WHERE mf.sucursal_id = $1
    `;
    const params: (string | number)[] = [targetBranch as string];
    let paramIndex = 2;
    
    if (billetera_id) {
      query += ` AND mf.billetera_id = $${paramIndex++}`;
      params.push(String(billetera_id));
    }
    
    if (tipo) {
      query += ` AND mf.tipo_movimiento = $${paramIndex++}`;
      params.push(String(tipo));
    }
    
    if (categoria_id) {
      query += ` AND mf.categoria_id = $${paramIndex++}`;
      params.push(String(categoria_id));
    }
    
    if (desde) {
      query += ` AND mf.created_at >= $${paramIndex++}`;
      params.push(String(desde));
    }
    
    if (hasta) {
      query += ` AND mf.created_at <= $${paramIndex++}`;
      params.push(String(hasta));
    }
    
    if (status) {
      query += ` AND mf.status = $${paramIndex++}`;
      params.push(String(status));
    } else {
      query += ` AND mf.status != 'cancelado'`;
    }
    
    // Contar total
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await pool.query(countQuery, params);
    
    query += ` ORDER BY mf.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(Number(limit));
    params.push(Number(offset));
    
    const result = await pool.query(query, params);
    
    res.json({
      movimientos: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('Error en getMovimientosFinancieros:', error);
    res.status(500).json({ message: 'Error al obtener movimientos' });
  }
};

// Registrar nuevo movimiento (ingreso o egreso)
export const registrarMovimiento = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  
  try {
    const {
      billetera_id,
      categoria_id,
      tipo_movimiento, // 'ingreso' o 'egreso'
      monto,
      nota_descriptiva,
      referencia,
      evidencia_url,
      evidencia_url_2,
      evidencia_url_3,
    } = req.body;
    
    // Obtener sucursal_id del body o de los params de URL
    const sucursal_id = req.body.sucursal_id || req.params.sucursalId;
    
    const userId = req.user?.id;
    const userName = req.user?.name;
    const userRole = req.user?.role;
    const userBranchId = req.user?.branch_id;
    
    // Validaciones básicas
    if (!billetera_id || !tipo_movimiento || !monto || monto <= 0) {
      res.status(400).json({ message: 'Billetera, tipo y monto son requeridos' });
      return;
    }
    
    // REGLA DE NEGOCIO: Evidencia obligatoria para egresos
    if (tipo_movimiento === 'egreso' && !evidencia_url) {
      res.status(400).json({ 
        message: 'La evidencia (foto del ticket/factura) es obligatoria para registrar gastos',
        code: 'EVIDENCIA_REQUERIDA'
      });
      return;
    }
    
    await client.query('BEGIN');
    
    // Obtener billetera y verificar pertenencia a sucursal
    const billeteraResult = await client.query(
      'SELECT * FROM billeteras_sucursal WHERE id = $1 AND is_active = true',
      [billetera_id]
    );
    
    if (billeteraResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Billetera no encontrada' });
      return;
    }
    
    const billetera = billeteraResult.rows[0];
    
    // Verificar acceso a la sucursal
    if (!['super_admin', 'admin', 'director', 'finanzas'].includes(userRole || '') && 
        billetera.sucursal_id !== userBranchId) {
      await client.query('ROLLBACK');
      res.status(403).json({ message: 'No tienes acceso a esta billetera' });
      return;
    }
    
    // Verificar saldo suficiente para egresos
    if (tipo_movimiento === 'egreso' && parseFloat(billetera.saldo_actual) < monto) {
      await client.query('ROLLBACK');
      res.status(400).json({ 
        message: 'Saldo insuficiente en la billetera',
        saldo_actual: parseFloat(billetera.saldo_actual),
        monto_solicitado: monto
      });
      return;
    }
    
    const saldoAntes = parseFloat(billetera.saldo_actual);
    const saldoDespues = tipo_movimiento === 'ingreso' 
      ? saldoAntes + parseFloat(monto)
      : saldoAntes - parseFloat(monto);
    
    // Insertar movimiento
    const result = await client.query(`
      INSERT INTO movimientos_financieros (
        sucursal_id, billetera_id, categoria_id, tipo_movimiento, monto,
        monto_antes, monto_despues, nota_descriptiva, referencia,
        evidencia_url, evidencia_url_2, evidencia_url_3,
        usuario_id, usuario_nombre, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'confirmado')
      RETURNING *
    `, [
      billetera.sucursal_id, billetera_id, categoria_id, tipo_movimiento, monto,
      saldoAntes, saldoDespues, nota_descriptiva, referencia,
      evidencia_url, evidencia_url_2, evidencia_url_3,
      userId, userName
    ]);
    
    await client.query('COMMIT');
    
    // Obtener datos completos del movimiento
    const movimientoCompleto = await pool.query(`
      SELECT 
        mf.*,
        bs.nombre as billetera_nombre,
        cf.nombre as categoria_nombre,
        cf.color as categoria_color
      FROM movimientos_financieros mf
      LEFT JOIN billeteras_sucursal bs ON mf.billetera_id = bs.id
      LEFT JOIN categorias_financieras cf ON mf.categoria_id = cf.id
      WHERE mf.id = $1
    `, [result.rows[0].id]);
    
    res.json({
      message: tipo_movimiento === 'ingreso' ? 'Ingreso registrado exitosamente' : 'Gasto registrado exitosamente',
      movimiento: movimientoCompleto.rows[0],
      nuevo_saldo: saldoDespues
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en registrarMovimiento:', error);
    res.status(500).json({ message: 'Error al registrar movimiento' });
  } finally {
    client.release();
  }
};

// Registrar transferencia entre billeteras
export const registrarTransferencia = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  
  try {
    const {
      sucursal_id,
      billetera_origen_id,
      billetera_destino_id,
      monto,
      nota_descriptiva,
    } = req.body;
    
    const userId = req.user?.id;
    const userName = req.user?.name;
    
    if (!billetera_origen_id || !billetera_destino_id || !monto || monto <= 0) {
      res.status(400).json({ message: 'Billeteras origen/destino y monto son requeridos' });
      return;
    }
    
    if (billetera_origen_id === billetera_destino_id) {
      res.status(400).json({ message: 'La billetera origen y destino no pueden ser la misma' });
      return;
    }
    
    await client.query('BEGIN');
    
    // Obtener ambas billeteras
    const billeterasResult = await client.query(
      'SELECT * FROM billeteras_sucursal WHERE id IN ($1, $2) AND is_active = true',
      [billetera_origen_id, billetera_destino_id]
    );
    
    if (billeterasResult.rows.length !== 2) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Una o ambas billeteras no encontradas' });
      return;
    }
    
    const billeteraOrigen = billeterasResult.rows.find((b: { id: number }) => b.id === billetera_origen_id);
    const billeteraDestino = billeterasResult.rows.find((b: { id: number }) => b.id === billetera_destino_id);
    
    // Verificar saldo suficiente
    if (parseFloat(billeteraOrigen.saldo_actual) < monto) {
      await client.query('ROLLBACK');
      res.status(400).json({ 
        message: 'Saldo insuficiente en la billetera origen',
        saldo_actual: parseFloat(billeteraOrigen.saldo_actual)
      });
      return;
    }
    
    const saldoAntesOrigen = parseFloat(billeteraOrigen.saldo_actual);
    const saldoDespuesOrigen = saldoAntesOrigen - parseFloat(monto);
    const saldoAntesDestino = parseFloat(billeteraDestino.saldo_actual);
    const saldoDespuesDestino = saldoAntesDestino + parseFloat(monto);
    
    // Crear movimiento de SALIDA
    const salidaResult = await client.query(`
      INSERT INTO movimientos_financieros (
        sucursal_id, billetera_id, tipo_movimiento, monto,
        monto_antes, monto_despues, nota_descriptiva,
        billetera_destino_id, usuario_id, usuario_nombre, status
      ) VALUES ($1, $2, 'transferencia_salida', $3, $4, $5, $6, $7, $8, $9, 'confirmado')
      RETURNING id
    `, [
      billeteraOrigen.sucursal_id, billetera_origen_id, monto,
      saldoAntesOrigen, saldoDespuesOrigen, 
      nota_descriptiva || `Transferencia a ${billeteraDestino.nombre}`,
      billetera_destino_id, userId, userName
    ]);
    
    // Crear movimiento de ENTRADA
    const entradaResult = await client.query(`
      INSERT INTO movimientos_financieros (
        sucursal_id, billetera_id, tipo_movimiento, monto,
        monto_antes, monto_despues, nota_descriptiva,
        billetera_destino_id, movimiento_relacionado_id, usuario_id, usuario_nombre, status
      ) VALUES ($1, $2, 'transferencia_entrada', $3, $4, $5, $6, $7, $8, $9, $10, 'confirmado')
      RETURNING id
    `, [
      billeteraDestino.sucursal_id, billetera_destino_id, monto,
      saldoAntesDestino, saldoDespuesDestino,
      nota_descriptiva || `Transferencia desde ${billeteraOrigen.nombre}`,
      billetera_origen_id, salidaResult.rows[0].id, userId, userName
    ]);
    
    // Actualizar relación en movimiento de salida
    await client.query(
      'UPDATE movimientos_financieros SET movimiento_relacionado_id = $1 WHERE id = $2',
      [entradaResult.rows[0].id, salidaResult.rows[0].id]
    );
    
    await client.query('COMMIT');
    
    res.json({
      message: 'Transferencia realizada exitosamente',
      origen: {
        billetera: billeteraOrigen.nombre,
        saldo_anterior: saldoAntesOrigen,
        saldo_nuevo: saldoDespuesOrigen
      },
      destino: {
        billetera: billeteraDestino.nombre,
        saldo_anterior: saldoAntesDestino,
        saldo_nuevo: saldoDespuesDestino
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en registrarTransferencia:', error);
    res.status(500).json({ message: 'Error al registrar transferencia' });
  } finally {
    client.release();
  }
};

// ============================================
// CORTES DE CAJA
// ============================================

// Abrir corte de caja
export const abrirCorteCaja = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  
  try {
    const { sucursal_id, billetera_id, notas_apertura } = req.body;
    const userId = req.user?.id;
    const userName = req.user?.name;
    
    if (!sucursal_id || !billetera_id) {
      res.status(400).json({ message: 'Sucursal y billetera son requeridos' });
      return;
    }
    
    await client.query('BEGIN');
    
    // Verificar que no haya un corte abierto
    const corteAbiertoResult = await client.query(
      'SELECT id FROM cortes_caja_sucursal WHERE sucursal_id = $1 AND billetera_id = $2 AND estatus = $3',
      [sucursal_id, billetera_id, 'abierto']
    );
    
    if (corteAbiertoResult.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Ya existe un corte de caja abierto. Debe cerrarlo primero.' });
      return;
    }
    
    // Obtener saldo actual de la billetera
    const billeteraResult = await client.query(
      'SELECT saldo_actual FROM billeteras_sucursal WHERE id = $1',
      [billetera_id]
    );
    
    const saldoInicial = parseFloat(billeteraResult.rows[0]?.saldo_actual || 0);
    
    // Crear corte
    const result = await client.query(`
      INSERT INTO cortes_caja_sucursal (
        sucursal_id, billetera_id, usuario_id, usuario_nombre,
        fecha_apertura, saldo_inicial_calculado, notas_apertura, estatus
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6, 'abierto')
      RETURNING *
    `, [sucursal_id, billetera_id, userId, userName, saldoInicial, notas_apertura]);
    
    await client.query('COMMIT');
    
    res.json({
      message: 'Corte de caja abierto exitosamente',
      corte: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en abrirCorteCaja:', error);
    res.status(500).json({ message: 'Error al abrir corte de caja' });
  } finally {
    client.release();
  }
};

// Cerrar corte de caja (Sistema Ciego)
export const cerrarCorteCaja = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  
  try {
    const { corte_id, saldo_declarado, conteo_billetes, notas_cierre } = req.body;
    const userId = req.user?.id;
    
    if (!corte_id || saldo_declarado === undefined) {
      res.status(400).json({ message: 'ID del corte y saldo declarado son requeridos' });
      return;
    }
    
    await client.query('BEGIN');
    
    // Obtener corte abierto
    const corteResult = await client.query(
      'SELECT * FROM cortes_caja_sucursal WHERE id = $1 AND estatus = $2',
      [corte_id, 'abierto']
    );
    
    if (corteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Corte de caja no encontrado o ya cerrado' });
      return;
    }
    
    const corte = corteResult.rows[0];
    
    // Calcular totales del período del corte
    const movimientosResult = await client.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo_movimiento IN ('ingreso', 'transferencia_entrada') THEN monto ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN tipo_movimiento IN ('egreso', 'transferencia_salida') THEN monto ELSE 0 END), 0) as total_egresos
      FROM movimientos_financieros
      WHERE billetera_id = $1 
        AND created_at >= $2
        AND status = 'confirmado'
    `, [corte.billetera_id, corte.fecha_apertura]);
    
    const totalIngresos = parseFloat(movimientosResult.rows[0].total_ingresos);
    const totalEgresos = parseFloat(movimientosResult.rows[0].total_egresos);
    const saldoInicial = parseFloat(corte.saldo_inicial_calculado);
    
    // Saldo esperado = inicial + ingresos - egresos
    const saldoEsperado = saldoInicial + totalIngresos - totalEgresos;
    const diferencia = parseFloat(saldo_declarado) - saldoEsperado;
    
    // Determinar estatus basado en diferencia
    const estatus = Math.abs(diferencia) < 0.01 ? 'cerrado' : 'con_discrepancia';
    
    // Actualizar corte
    const updateQuery = `
      UPDATE cortes_caja_sucursal SET
        fecha_cierre = CURRENT_TIMESTAMP,
        total_ingresos = $1,
        total_egresos = $2,
        saldo_final_esperado = $3,
        saldo_final_declarado = $4,
        diferencia = $5,
        notas_cierre = $6,
        estatus = $7,
        ${conteo_billetes ? `
          conteo_billetes_1000 = $8,
          conteo_billetes_500 = $9,
          conteo_billetes_200 = $10,
          conteo_billetes_100 = $11,
          conteo_billetes_50 = $12,
          conteo_billetes_20 = $13,
          conteo_monedas_20 = $14,
          conteo_monedas_10 = $15,
          conteo_monedas_5 = $16,
          conteo_monedas_2 = $17,
          conteo_monedas_1 = $18,
          conteo_monedas_050 = $19,
        ` : ''}
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $${conteo_billetes ? 20 : 8}
      RETURNING *
    `;
    
    const params = conteo_billetes 
      ? [
          totalIngresos, totalEgresos, saldoEsperado, saldo_declarado, diferencia, notas_cierre, estatus,
          conteo_billetes.b1000 || 0, conteo_billetes.b500 || 0, conteo_billetes.b200 || 0,
          conteo_billetes.b100 || 0, conteo_billetes.b50 || 0, conteo_billetes.b20 || 0,
          conteo_billetes.m20 || 0, conteo_billetes.m10 || 0, conteo_billetes.m5 || 0,
          conteo_billetes.m2 || 0, conteo_billetes.m1 || 0, conteo_billetes.m050 || 0,
          corte_id
        ]
      : [totalIngresos, totalEgresos, saldoEsperado, saldo_declarado, diferencia, notas_cierre, estatus, corte_id];
    
    const resultUpdate = await client.query(updateQuery, params);
    
    // Marcar movimientos con el corte_id
    await client.query(`
      UPDATE movimientos_financieros SET corte_id = $1
      WHERE billetera_id = $2 AND created_at >= $3 AND corte_id IS NULL
    `, [corte_id, corte.billetera_id, corte.fecha_apertura]);
    
    await client.query('COMMIT');
    
    // IMPORTANTE: NO mostrar el saldo esperado al usuario antes de que declare
    // Solo después de cerrar mostramos la comparación
    res.json({
      message: estatus === 'cerrado' 
        ? '✅ Corte cerrado correctamente. La caja cuadra.' 
        : `⚠️ Corte cerrado con discrepancia de $${diferencia.toFixed(2)}`,
      corte: resultUpdate.rows[0],
      resumen: {
        saldo_inicial: saldoInicial,
        total_ingresos: totalIngresos,
        total_egresos: totalEgresos,
        saldo_esperado: saldoEsperado,
        saldo_declarado: parseFloat(saldo_declarado),
        diferencia: diferencia,
        tipo_diferencia: diferencia > 0 ? 'SOBRANTE' : diferencia < 0 ? 'FALTANTE' : 'CUADRADO'
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en cerrarCorteCaja:', error);
    res.status(500).json({ message: 'Error al cerrar corte de caja' });
  } finally {
    client.release();
  }
};

// Obtener historial de cortes
export const getHistorialCortes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sucursalId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        c.*,
        b.name as sucursal_nombre,
        bs.nombre as billetera_nombre
      FROM cortes_caja_sucursal c
      LEFT JOIN branches b ON c.sucursal_id = b.id
      LEFT JOIN billeteras_sucursal bs ON c.billetera_id = bs.id
      WHERE c.sucursal_id = $1
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3
    `, [sucursalId, limit, offset]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getHistorialCortes:', error);
    res.status(500).json({ message: 'Error al obtener historial de cortes' });
  }
};

// Auditar/Aprobar corte con discrepancia
export const auditarCorte = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { corte_id, aprobado, notas_auditoria } = req.body;
    const userId = req.user?.id;
    const userName = req.user?.name;
    
    const result = await pool.query(`
      UPDATE cortes_caja_sucursal SET
        estatus = $1,
        auditado_por = $2,
        auditado_nombre = $3,
        auditado_at = CURRENT_TIMESTAMP,
        auditado_notas = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [aprobado ? 'aprobado' : 'auditado', userId, userName, notas_auditoria, corte_id]);
    
    res.json({
      message: aprobado ? 'Corte aprobado' : 'Corte auditado',
      corte: result.rows[0]
    });
  } catch (error) {
    console.error('Error en auditarCorte:', error);
    res.status(500).json({ message: 'Error al auditar corte' });
  }
};

// ============================================
// INTEGRACIÓN CON OPENPAY (Ingresos Automáticos)
// ============================================

// Registrar ingreso automático desde Openpay
export const registrarIngresoAutomatico = async (
  sucursalId: number,
  monto: number,
  concepto: string,
  openpayTransactionId: string,
  clienteId?: number
): Promise<void> => {
  try {
    // Buscar billetera SPEI de la sucursal
    const billeteraResult = await pool.query(`
      SELECT id, saldo_actual FROM billeteras_sucursal 
      WHERE sucursal_id = $1 AND tipo = 'spei' AND is_active = true
      ORDER BY is_default DESC
      LIMIT 1
    `, [sucursalId]);
    
    if (billeteraResult.rows.length === 0) {
      console.log(`No se encontró billetera SPEI para sucursal ${sucursalId}`);
      return;
    }
    
    const billetera = billeteraResult.rows[0];
    const saldoAntes = parseFloat(billetera.saldo_actual);
    const saldoDespues = saldoAntes + monto;
    
    // Buscar categoría de depósito bancario
    const categoriaResult = await pool.query(
      "SELECT id FROM categorias_financieras WHERE nombre = 'Depósito Bancario' AND tipo = 'ingreso' LIMIT 1"
    );
    
    await pool.query(`
      INSERT INTO movimientos_financieros (
        sucursal_id, billetera_id, categoria_id, tipo_movimiento, monto,
        monto_antes, monto_despues, nota_descriptiva,
        pago_automatico, openpay_transaction_id, cliente_id,
        usuario_id, usuario_nombre, status
      ) VALUES ($1, $2, $3, 'ingreso', $4, $5, $6, $7, true, $8, $9, 0, 'Sistema Openpay', 'confirmado')
    `, [
      sucursalId, billetera.id, categoriaResult.rows[0]?.id, monto,
      saldoAntes, saldoDespues, concepto,
      openpayTransactionId, clienteId
    ]);
    
    console.log(`Ingreso automático registrado: $${monto} en sucursal ${sucursalId}`);
  } catch (error) {
    console.error('Error en registrarIngresoAutomatico:', error);
  }
};

// Exportar todas las funciones
export default {
  getBilleterasSucursal,
  createBilletera,
  updateBilletera,
  getCategoriasFinancieras,
  createCategoriaFinanciera,
  getTesoreriaDashboard,
  getMovimientosFinancieros,
  registrarMovimiento,
  registrarTransferencia,
  abrirCorteCaja,
  cerrarCorteCaja,
  getHistorialCortes,
  auditarCorte,
  registrarIngresoAutomatico,
};
