// ============================================
// SERVICIO DE BILLETERA DIGITAL
// Sistema de monedero para usuarios B2C
// ============================================

import { pool } from './db';

// ============================================
// INTERFACES
// ============================================

export interface Billetera {
  id: number;
  usuario_id: number;
  saldo_actual: number;
  saldo_pendiente: number;
  moneda: string;
  is_active: boolean;
}

export interface TransaccionBilletera {
  id: number;
  billetera_id: number;
  tipo: 'ingreso' | 'egreso' | 'pendiente' | 'liberacion' | 'expiracion';
  monto: number;
  saldo_anterior: number;
  saldo_posterior: number;
  concepto: string;
  referencia_tipo?: string;
  referencia_id?: number;
  metadata?: Record<string, any>;
  fecha_movimiento: Date;
}

export interface ResultadoTransaccion {
  success: boolean;
  transaccion_id?: number;
  saldo_nuevo?: number;
  error?: string;
}

// ============================================
// OBTENER O CREAR BILLETERA
// ============================================

export const getOrCreateBilletera = async (usuarioId: number): Promise<Billetera | null> => {
  const client = await pool.connect();
  
  try {
    // Buscar billetera existente
    let result = await client.query(
      'SELECT * FROM billetera_digital WHERE usuario_id = $1',
      [usuarioId]
    );
    
    if (result.rows.length > 0) {
      return {
        ...result.rows[0],
        saldo_actual: parseFloat(result.rows[0].saldo_actual),
        saldo_pendiente: parseFloat(result.rows[0].saldo_pendiente),
      };
    }
    
    // Crear billetera si no existe
    result = await client.query(
      `INSERT INTO billetera_digital (usuario_id, saldo_actual, moneda)
       VALUES ($1, 0.00, 'MXN')
       RETURNING *`,
      [usuarioId]
    );
    
    return {
      ...result.rows[0],
      saldo_actual: 0,
      saldo_pendiente: 0,
    };
  } catch (error) {
    console.error('Error en getOrCreateBilletera:', error);
    return null;
  } finally {
    client.release();
  }
};

// ============================================
// OBTENER SALDO
// ============================================

export const getSaldo = async (usuarioId: number): Promise<{
  disponible: number;
  pendiente: number;
  total: number;
  moneda: string;
} | null> => {
  try {
    const billetera = await getOrCreateBilletera(usuarioId);
    
    if (!billetera) return null;
    
    return {
      disponible: billetera.saldo_actual,
      pendiente: billetera.saldo_pendiente,
      total: billetera.saldo_actual + billetera.saldo_pendiente,
      moneda: billetera.moneda,
    };
  } catch (error) {
    console.error('Error en getSaldo:', error);
    return null;
  }
};

// ============================================
// DEPOSITAR (AGREGAR SALDO)
// ============================================

export const depositar = async (
  usuarioId: number,
  monto: number,
  concepto: string,
  referenciaTipo?: string,
  referenciaId?: number,
  metadata?: Record<string, any>,
  createdBy?: number
): Promise<ResultadoTransaccion> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Obtener billetera y bloquear fila
    const billeteraRes = await client.query(
      'SELECT * FROM billetera_digital WHERE usuario_id = $1 FOR UPDATE',
      [usuarioId]
    );
    
    if (billeteraRes.rows.length === 0) {
      // Crear billetera si no existe
      const newBilletera = await client.query(
        `INSERT INTO billetera_digital (usuario_id, saldo_actual, moneda)
         VALUES ($1, 0.00, 'MXN')
         RETURNING *`,
        [usuarioId]
      );
      billeteraRes.rows = newBilletera.rows;
    }
    
    const billetera = billeteraRes.rows[0];
    const saldoAnterior = parseFloat(billetera.saldo_actual);
    const saldoNuevo = saldoAnterior + monto;
    
    // Registrar transacción
    const transRes = await client.query(
      `INSERT INTO billetera_transacciones 
       (billetera_id, tipo, monto, saldo_anterior, saldo_posterior, concepto, referencia_tipo, referencia_id, metadata, created_by)
       VALUES ($1, 'ingreso', $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [billetera.id, monto, saldoAnterior, saldoNuevo, concepto, referenciaTipo, referenciaId, metadata || {}, createdBy]
    );
    
    // Actualizar saldo
    await client.query(
      'UPDATE billetera_digital SET saldo_actual = $1, updated_at = NOW() WHERE id = $2',
      [saldoNuevo, billetera.id]
    );
    
    // Sincronizar con wallet_balance en users
    await client.query(
      'UPDATE users SET wallet_balance = $1 WHERE id = $2',
      [saldoNuevo, usuarioId]
    );
    
    await client.query('COMMIT');
    
    return {
      success: true,
      transaccion_id: transRes.rows[0].id,
      saldo_nuevo: saldoNuevo,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error en depositar:', error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
};

// ============================================
// RETIRAR (DESCONTAR SALDO)
// ============================================

export const retirar = async (
  usuarioId: number,
  monto: number,
  concepto: string,
  referenciaTipo?: string,
  referenciaId?: number,
  metadata?: Record<string, any>,
  createdBy?: number
): Promise<ResultadoTransaccion> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Obtener billetera y bloquear fila
    const billeteraRes = await client.query(
      'SELECT * FROM billetera_digital WHERE usuario_id = $1 FOR UPDATE',
      [usuarioId]
    );
    
    if (billeteraRes.rows.length === 0) {
      throw new Error('Usuario no tiene billetera');
    }
    
    const billetera = billeteraRes.rows[0];
    const saldoAnterior = parseFloat(billetera.saldo_actual);
    
    // Validar saldo suficiente
    if (saldoAnterior < monto) {
      throw new Error(`Saldo insuficiente. Disponible: $${saldoAnterior.toFixed(2)}, Requerido: $${monto.toFixed(2)}`);
    }
    
    const saldoNuevo = saldoAnterior - monto;
    
    // Registrar transacción
    const transRes = await client.query(
      `INSERT INTO billetera_transacciones 
       (billetera_id, tipo, monto, saldo_anterior, saldo_posterior, concepto, referencia_tipo, referencia_id, metadata, created_by)
       VALUES ($1, 'egreso', $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [billetera.id, monto, saldoAnterior, saldoNuevo, concepto, referenciaTipo, referenciaId, metadata || {}, createdBy]
    );
    
    // Actualizar saldo
    await client.query(
      'UPDATE billetera_digital SET saldo_actual = $1, updated_at = NOW() WHERE id = $2',
      [saldoNuevo, billetera.id]
    );
    
    // Sincronizar con wallet_balance en users
    await client.query(
      'UPDATE users SET wallet_balance = $1 WHERE id = $2',
      [saldoNuevo, usuarioId]
    );
    
    await client.query('COMMIT');
    
    return {
      success: true,
      transaccion_id: transRes.rows[0].id,
      saldo_nuevo: saldoNuevo,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error en retirar:', error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
};

// ============================================
// APLICAR SALDO A PAGO (CHECKOUT)
// ============================================

export const aplicarSaldoAPago = async (
  usuarioId: number,
  montoTotal: number,
  ordenId: number,
  descripcionOrden: string
): Promise<{
  saldo_aplicado: number;
  restante_a_cobrar: number;
  transaccion_id?: number | undefined;
}> => {
  const saldo = await getSaldo(usuarioId);
  
  if (!saldo || saldo.disponible <= 0) {
    return {
      saldo_aplicado: 0,
      restante_a_cobrar: montoTotal,
    };
  }
  
  // Determinar cuánto saldo aplicar
  const saldoAAplicar = Math.min(saldo.disponible, montoTotal);
  const restante = montoTotal - saldoAAplicar;
  
  // Descontar saldo
  const resultado = await retirar(
    usuarioId,
    saldoAAplicar,
    `Descuento aplicado en ${descripcionOrden}`,
    'orden',
    ordenId,
    { monto_total_orden: montoTotal }
  );
  
  return {
    saldo_aplicado: resultado.success ? saldoAAplicar : 0,
    restante_a_cobrar: resultado.success ? restante : montoTotal,
    transaccion_id: resultado.transaccion_id,
  };
};

// ============================================
// DEPOSITAR SALDO PENDIENTE
// ============================================

export const depositarPendiente = async (
  usuarioId: number,
  monto: number,
  concepto: string,
  referenciaTipo?: string,
  referenciaId?: number,
  metadata?: Record<string, any>
): Promise<ResultadoTransaccion> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const billeteraRes = await client.query(
      'SELECT * FROM billetera_digital WHERE usuario_id = $1 FOR UPDATE',
      [usuarioId]
    );
    
    if (billeteraRes.rows.length === 0) {
      throw new Error('Usuario no tiene billetera');
    }
    
    const billetera = billeteraRes.rows[0];
    const saldoPendienteAnterior = parseFloat(billetera.saldo_pendiente);
    const saldoPendienteNuevo = saldoPendienteAnterior + monto;
    
    // Registrar transacción como pendiente
    const transRes = await client.query(
      `INSERT INTO billetera_transacciones 
       (billetera_id, tipo, monto, saldo_anterior, saldo_posterior, concepto, referencia_tipo, referencia_id, metadata)
       VALUES ($1, 'pendiente', $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [billetera.id, monto, saldoPendienteAnterior, saldoPendienteNuevo, concepto + ' (Pendiente)', referenciaTipo, referenciaId, metadata || {}]
    );
    
    // Actualizar saldo pendiente
    await client.query(
      'UPDATE billetera_digital SET saldo_pendiente = $1, updated_at = NOW() WHERE id = $2',
      [saldoPendienteNuevo, billetera.id]
    );
    
    await client.query('COMMIT');
    
    return {
      success: true,
      transaccion_id: transRes.rows[0].id,
      saldo_nuevo: saldoPendienteNuevo,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error en depositarPendiente:', error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
};

// ============================================
// LIBERAR SALDO PENDIENTE
// ============================================

export const liberarSaldoPendiente = async (
  usuarioId: number,
  monto: number,
  concepto: string,
  referenciaTipo?: string,
  referenciaId?: number
): Promise<ResultadoTransaccion> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const billeteraRes = await client.query(
      'SELECT * FROM billetera_digital WHERE usuario_id = $1 FOR UPDATE',
      [usuarioId]
    );
    
    if (billeteraRes.rows.length === 0) {
      throw new Error('Usuario no tiene billetera');
    }
    
    const billetera = billeteraRes.rows[0];
    const saldoPendiente = parseFloat(billetera.saldo_pendiente);
    const saldoActual = parseFloat(billetera.saldo_actual);
    
    if (saldoPendiente < monto) {
      throw new Error(`Saldo pendiente insuficiente. Pendiente: $${saldoPendiente.toFixed(2)}, A liberar: $${monto.toFixed(2)}`);
    }
    
    const nuevoSaldoPendiente = saldoPendiente - monto;
    const nuevoSaldoActual = saldoActual + monto;
    
    // Registrar liberación
    const transRes = await client.query(
      `INSERT INTO billetera_transacciones 
       (billetera_id, tipo, monto, saldo_anterior, saldo_posterior, concepto, referencia_tipo, referencia_id)
       VALUES ($1, 'liberacion', $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [billetera.id, monto, saldoActual, nuevoSaldoActual, concepto, referenciaTipo, referenciaId]
    );
    
    // Actualizar saldos
    await client.query(
      'UPDATE billetera_digital SET saldo_actual = $1, saldo_pendiente = $2, updated_at = NOW() WHERE id = $3',
      [nuevoSaldoActual, nuevoSaldoPendiente, billetera.id]
    );
    
    // Sincronizar con wallet_balance en users
    await client.query(
      'UPDATE users SET wallet_balance = $1 WHERE id = $2',
      [nuevoSaldoActual, usuarioId]
    );
    
    await client.query('COMMIT');
    
    return {
      success: true,
      transaccion_id: transRes.rows[0].id,
      saldo_nuevo: nuevoSaldoActual,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error en liberarSaldoPendiente:', error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
};

// ============================================
// OBTENER HISTORIAL DE TRANSACCIONES
// ============================================

export const getHistorialTransacciones = async (
  usuarioId: number,
  limit: number = 50,
  offset: number = 0
): Promise<{
  transacciones: TransaccionBilletera[];
  total: number;
}> => {
  try {
    const billetera = await getOrCreateBilletera(usuarioId);
    
    if (!billetera) {
      return { transacciones: [], total: 0 };
    }
    
    const [transacciones, countRes] = await Promise.all([
      pool.query(
        `SELECT * FROM billetera_transacciones 
         WHERE billetera_id = $1 
         ORDER BY fecha_movimiento DESC 
         LIMIT $2 OFFSET $3`,
        [billetera.id, limit, offset]
      ),
      pool.query(
        'SELECT COUNT(*) FROM billetera_transacciones WHERE billetera_id = $1',
        [billetera.id]
      ),
    ]);
    
    return {
      transacciones: transacciones.rows.map(t => ({
        ...t,
        monto: parseFloat(t.monto),
        saldo_anterior: parseFloat(t.saldo_anterior),
        saldo_posterior: parseFloat(t.saldo_posterior),
      })),
      total: parseInt(countRes.rows[0].count),
    };
  } catch (error) {
    console.error('Error en getHistorialTransacciones:', error);
    return { transacciones: [], total: 0 };
  }
};

// ============================================
// OBTENER RESUMEN DE BILLETERA
// ============================================

export const getResumenBilletera = async (usuarioId: number): Promise<{
  saldo: {
    disponible: number;
    pendiente: number;
    total: number;
    moneda: string;
  } | null;
  ultimasTransacciones: TransaccionBilletera[];
  estadisticas: {
    total_ingresos: number;
    total_egresos: number;
    transacciones_este_mes: number;
  };
}> => {
  try {
    const saldo = await getSaldo(usuarioId);
    const { transacciones } = await getHistorialTransacciones(usuarioId, 5);
    
    const billetera = await getOrCreateBilletera(usuarioId);
    
    // Obtener estadísticas
    let estadisticas = {
      total_ingresos: 0,
      total_egresos: 0,
      transacciones_este_mes: 0,
    };
    
    if (billetera) {
      const statsRes = await pool.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN tipo = 'ingreso' OR tipo = 'liberacion' THEN monto ELSE 0 END), 0) as total_ingresos,
           COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) as total_egresos,
           COUNT(CASE WHEN DATE_TRUNC('month', fecha_movimiento) = DATE_TRUNC('month', NOW()) THEN 1 END) as transacciones_este_mes
         FROM billetera_transacciones
         WHERE billetera_id = $1`,
        [billetera.id]
      );
      
      if (statsRes.rows.length > 0) {
        estadisticas = {
          total_ingresos: parseFloat(statsRes.rows[0].total_ingresos),
          total_egresos: parseFloat(statsRes.rows[0].total_egresos),
          transacciones_este_mes: parseInt(statsRes.rows[0].transacciones_este_mes),
        };
      }
    }
    
    return {
      saldo,
      ultimasTransacciones: transacciones,
      estadisticas,
    };
  } catch (error) {
    console.error('Error en getResumenBilletera:', error);
    return {
      saldo: null,
      ultimasTransacciones: [],
      estadisticas: {
        total_ingresos: 0,
        total_egresos: 0,
        transacciones_este_mes: 0,
      },
    };
  }
};

export default {
  getOrCreateBilletera,
  getSaldo,
  depositar,
  retirar,
  aplicarSaldoAPago,
  depositarPendiente,
  liberarSaldoPendiente,
  getHistorialTransacciones,
  getResumenBilletera,
};
