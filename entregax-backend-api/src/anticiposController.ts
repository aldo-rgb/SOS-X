// ============================================
// CONTROLLER: MÓDULO DE ANTICIPOS A PROVEEDORES
// Sistema Ledger para control de saldos a favor
// ============================================

import { Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';
import { uploadToS3, isS3Configured } from './s3Service';
import * as fs from 'fs';
import * as path from 'path';

// ========== PROVEEDORES ==========

// Listar todos los proveedores
export const getProveedoresAnticipos = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT pa.*, 
        COALESCE(SUM(ba.saldo_disponible), 0) as saldo_total_disponible,
        COUNT(ba.id) as total_bolsas
      FROM proveedores_anticipos pa
      LEFT JOIN bolsas_anticipos ba ON ba.proveedor_id = pa.id AND ba.estado = 'con_saldo'
      WHERE pa.is_active = TRUE
      GROUP BY pa.id
      ORDER BY pa.nombre ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching proveedores:', error);
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
};

// Obtener un proveedor con sus bolsas
export const getProveedorById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const proveedorRes = await pool.query('SELECT * FROM proveedores_anticipos WHERE id = $1', [id]);
    if (proveedorRes.rows.length === 0) {
      res.status(404).json({ error: 'Proveedor no encontrado' });
      return;
    }

    const bolsasRes = await pool.query(`
      SELECT * FROM vista_bolsas_anticipos 
      WHERE proveedor_id = $1 
      ORDER BY fecha_pago DESC
    `, [id]);

    res.json({
      proveedor: proveedorRes.rows[0],
      bolsas: bolsasRes.rows
    });
  } catch (error) {
    console.error('Error fetching proveedor:', error);
    res.status(500).json({ error: 'Error al obtener proveedor' });
  }
};

// Crear proveedor
export const createProveedor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nombre, referencia, tipo, contacto_nombre, contacto_email, contacto_telefono, banco, cuenta_bancaria, clabe, notas } = req.body;

    if (!nombre) {
      res.status(400).json({ error: 'El nombre del proveedor es requerido' });
      return;
    }

    const result = await pool.query(`
      INSERT INTO proveedores_anticipos 
      (nombre, referencia, tipo, contacto_nombre, contacto_email, contacto_telefono, banco, cuenta_bancaria, clabe, notas)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [nombre, referencia, tipo || 'agente_aduanal', contacto_nombre, contacto_email, contacto_telefono, banco, cuenta_bancaria, clabe, notas]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating proveedor:', error);
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
};

// Actualizar proveedor
export const updateProveedor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre, referencia, tipo, contacto_nombre, contacto_email, contacto_telefono, banco, cuenta_bancaria, clabe, notas, is_active } = req.body;

    const result = await pool.query(`
      UPDATE proveedores_anticipos SET
        nombre = COALESCE($1, nombre),
        referencia = COALESCE($2, referencia),
        tipo = COALESCE($3, tipo),
        contacto_nombre = COALESCE($4, contacto_nombre),
        contacto_email = COALESCE($5, contacto_email),
        contacto_telefono = COALESCE($6, contacto_telefono),
        banco = COALESCE($7, banco),
        cuenta_bancaria = COALESCE($8, cuenta_bancaria),
        clabe = COALESCE($9, clabe),
        notas = COALESCE($10, notas),
        is_active = COALESCE($11, is_active),
        updated_at = NOW()
      WHERE id = $12
      RETURNING *
    `, [nombre, referencia, tipo, contacto_nombre, contacto_email, contacto_telefono, banco, cuenta_bancaria, clabe, notas, is_active, id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Proveedor no encontrado' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating proveedor:', error);
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
};

// ========== BOLSAS DE ANTICIPOS ==========

// Listar todas las bolsas de anticipos
export const getBolsasAnticipos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { proveedor_id, estado, con_saldo } = req.query;

    let query = 'SELECT * FROM vista_bolsas_anticipos WHERE 1=1';
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (proveedor_id) {
      query += ` AND proveedor_id = $${paramIndex}`;
      params.push(Number(proveedor_id));
      paramIndex++;
    }

    if (estado) {
      query += ` AND estado = $${paramIndex}`;
      params.push(estado as string);
      paramIndex++;
    }

    if (con_saldo === 'true') {
      query += ` AND saldo_disponible > 0`;
    }

    query += ' ORDER BY fecha_pago DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bolsas:', error);
    res.status(500).json({ error: 'Error al obtener bolsas de anticipos' });
  }
};

// Obtener bolsas disponibles para asignar (con saldo > 0)
export const getBolsasDisponibles = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT 
        ba.id,
        ba.proveedor_id,
        pa.nombre as proveedor_nombre,
        ba.monto_original as monto_total,
        ba.saldo_disponible as monto_disponible,
        ba.referencia_pago as referencia,
        ba.fecha_pago as fecha_deposito,
        ba.notas,
        ba.comprobante_url
      FROM bolsas_anticipos ba
      JOIN proveedores_anticipos pa ON pa.id = ba.proveedor_id
      WHERE ba.estado = 'con_saldo' AND ba.saldo_disponible > 0
      ORDER BY pa.nombre, ba.fecha_pago DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bolsas disponibles:', error);
    res.status(500).json({ error: 'Error al obtener bolsas disponibles' });
  }
};

// Crear bolsa de anticipo (nuevo depósito)
export const createBolsaAnticipo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { proveedor_id, monto_original, fecha_pago, referencia_pago, numero_operacion, banco_origen, notas } = req.body;
    const file = (req as any).file as Express.Multer.File | undefined;
    const userId = req.user?.userId;

    if (!proveedor_id || !monto_original || !fecha_pago) {
      res.status(400).json({ error: 'Proveedor, monto y fecha son requeridos' });
      return;
    }

    // Verificar que el proveedor existe
    const provRes = await pool.query('SELECT id FROM proveedores_anticipos WHERE id = $1 AND is_active = TRUE', [proveedor_id]);
    if (provRes.rows.length === 0) {
      res.status(404).json({ error: 'Proveedor no encontrado' });
      return;
    }

    let comprobante_url = null;

    // Subir comprobante si se proporcionó
    if (file) {
      const timestamp = Date.now();
      const ext = path.extname(file.originalname) || '.pdf';
      const filename = `anticipo_${proveedor_id}_${timestamp}${ext}`;

      if (isS3Configured()) {
        console.log('☁️ Subiendo comprobante a S3...');
        const s3Key = `anticipos/${filename}`;
        comprobante_url = await uploadToS3(file.buffer, s3Key, file.mimetype || 'application/pdf');
      } else {
        console.log('💾 Guardando comprobante localmente...');
        const uploadsDir = path.join(__dirname, '..', 'uploads', 'anticipos');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, file.buffer);
        const baseUrl = process.env.API_URL || 'http://localhost:3001';
        comprobante_url = `${baseUrl}/uploads/anticipos/${filename}`;
      }
    }

    const result = await pool.query(`
      INSERT INTO bolsas_anticipos 
      (proveedor_id, monto_original, saldo_disponible, fecha_pago, comprobante_url, referencia_pago, numero_operacion, banco_origen, notas, created_by)
      VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [proveedor_id, monto_original, fecha_pago, comprobante_url, referencia_pago, numero_operacion, banco_origen, notas, userId]);

    // Obtener con info del proveedor
    const fullResult = await pool.query('SELECT * FROM vista_bolsas_anticipos WHERE id = $1', [result.rows[0].id]);

    res.status(201).json(fullResult.rows[0]);
  } catch (error) {
    console.error('Error creating bolsa anticipo:', error);
    res.status(500).json({ error: 'Error al crear bolsa de anticipo' });
  }
};

// Actualizar bolsa (solo referencia/notas, no montos)
export const updateBolsaAnticipo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { referencia_pago, numero_operacion, banco_origen, notas, estado } = req.body;

    const result = await pool.query(`
      UPDATE bolsas_anticipos SET
        referencia_pago = COALESCE($1, referencia_pago),
        numero_operacion = COALESCE($2, numero_operacion),
        banco_origen = COALESCE($3, banco_origen),
        notas = COALESCE($4, notas),
        estado = COALESCE($5, estado),
        updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [referencia_pago, numero_operacion, banco_origen, notas, estado, id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Bolsa no encontrada' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating bolsa:', error);
    res.status(500).json({ error: 'Error al actualizar bolsa' });
  }
};

// ========== ASIGNACIONES DE ANTICIPOS ==========

// Obtener asignaciones de un contenedor
export const getAsignacionesByContainer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { containerId } = req.params;

    const result = await pool.query(`
      SELECT aa.*, 
        ba.referencia_pago as bolsa_referencia,
        ba.comprobante_url,
        pa.nombre as proveedor_nombre
      FROM asignaciones_anticipos aa
      JOIN bolsas_anticipos ba ON ba.id = aa.bolsa_anticipo_id
      JOIN proveedores_anticipos pa ON pa.id = ba.proveedor_id
      WHERE aa.container_id = $1 AND aa.is_active = TRUE
      ORDER BY aa.campo_anticipo
    `, [containerId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching asignaciones:', error);
    res.status(500).json({ error: 'Error al obtener asignaciones' });
  }
};

// Obtener historial de asignaciones de una bolsa
export const getAsignacionesByBolsa = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bolsaId } = req.params;

    const result = await pool.query(`
      SELECT * FROM vista_asignaciones_anticipos 
      WHERE bolsa_anticipo_id = $1
      ORDER BY fecha_asignacion DESC
    `, [bolsaId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching asignaciones:', error);
    res.status(500).json({ error: 'Error al obtener historial de asignaciones' });
  }
};

// Asignar anticipo a contenedor
export const asignarAnticipo = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  
  try {
    const { bolsa_anticipo_id, container_id, campo_anticipo, monto_asignado, concepto, notas } = req.body;
    const userId = req.user?.userId;

    if (!bolsa_anticipo_id || !container_id || !campo_anticipo || !monto_asignado) {
      res.status(400).json({ error: 'Todos los campos son requeridos' });
      return;
    }

    if (!['advance_1', 'advance_2', 'advance_3', 'advance_4'].includes(campo_anticipo)) {
      res.status(400).json({ error: 'Campo de anticipo inválido' });
      return;
    }

    await client.query('BEGIN');

    // Verificar que la bolsa existe y tiene saldo suficiente
    const bolsaRes = await client.query(
      'SELECT * FROM bolsas_anticipos WHERE id = $1 FOR UPDATE',
      [bolsa_anticipo_id]
    );

    if (bolsaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Bolsa de anticipo no encontrada' });
      return;
    }

    const bolsa = bolsaRes.rows[0];
    const montoSolicitado = parseFloat(monto_asignado);

    if (bolsa.saldo_disponible < montoSolicitado) {
      await client.query('ROLLBACK');
      res.status(400).json({ 
        error: 'Saldo insuficiente en este fondo',
        saldo_disponible: bolsa.saldo_disponible,
        monto_solicitado: montoSolicitado
      });
      return;
    }

    // Verificar que no exista ya una asignación activa para ese campo en ese contenedor
    const existingRes = await client.query(
      'SELECT id FROM asignaciones_anticipos WHERE container_id = $1 AND campo_anticipo = $2 AND is_active = TRUE',
      [container_id, campo_anticipo]
    );

    if (existingRes.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ 
        error: `Ya existe una asignación activa para ${campo_anticipo} en este contenedor. Debe revertirla primero.`
      });
      return;
    }

    // Crear la asignación
    const asignacionRes = await client.query(`
      INSERT INTO asignaciones_anticipos 
      (bolsa_anticipo_id, container_id, campo_anticipo, monto_asignado, concepto, usuario_id, notas)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [bolsa_anticipo_id, container_id, campo_anticipo, montoSolicitado, concepto, userId, notas]);

    // Deducir del saldo de la bolsa
    await client.query(`
      UPDATE bolsas_anticipos 
      SET saldo_disponible = saldo_disponible - $1, updated_at = NOW()
      WHERE id = $2
    `, [montoSolicitado, bolsa_anticipo_id]);

    // Actualizar el monto en container_costs
    const amountField = `${campo_anticipo}_amount`;
    await client.query(`
      INSERT INTO container_costs (container_id, ${amountField})
      VALUES ($1, $2)
      ON CONFLICT (container_id) DO UPDATE SET
        ${amountField} = $2,
        updated_at = NOW()
    `, [container_id, montoSolicitado]);

    await client.query('COMMIT');

    // Obtener la asignación con datos completos
    const fullResult = await pool.query(`
      SELECT aa.*, 
        ba.referencia_pago as bolsa_referencia,
        ba.comprobante_url,
        ba.saldo_disponible as nuevo_saldo_bolsa,
        pa.nombre as proveedor_nombre
      FROM asignaciones_anticipos aa
      JOIN bolsas_anticipos ba ON ba.id = aa.bolsa_anticipo_id
      JOIN proveedores_anticipos pa ON pa.id = ba.proveedor_id
      WHERE aa.id = $1
    `, [asignacionRes.rows[0].id]);

    res.status(201).json({
      message: 'Anticipo asignado correctamente',
      asignacion: fullResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error asignando anticipo:', error);
    res.status(500).json({ error: 'Error al asignar anticipo' });
  } finally {
    client.release();
  }
};

// Revertir asignación (devolver fondos a la bolsa)
export const revertirAsignacion = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    await client.query('BEGIN');

    // Obtener la asignación
    const asignacionRes = await client.query(
      'SELECT * FROM asignaciones_anticipos WHERE id = $1 AND is_active = TRUE FOR UPDATE',
      [id]
    );

    if (asignacionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Asignación no encontrada o ya fue revertida' });
      return;
    }

    const asignacion = asignacionRes.rows[0];

    // Marcar la asignación como inactiva
    await client.query(`
      UPDATE asignaciones_anticipos 
      SET is_active = FALSE, revertido_at = NOW(), revertido_por = $1
      WHERE id = $2
    `, [userId, id]);

    // Devolver el monto a la bolsa
    await client.query(`
      UPDATE bolsas_anticipos 
      SET saldo_disponible = saldo_disponible + $1, updated_at = NOW()
      WHERE id = $2
    `, [asignacion.monto_asignado, asignacion.bolsa_anticipo_id]);

    // Actualizar container_costs (poner en 0)
    const amountField = `${asignacion.campo_anticipo}_amount`;
    await client.query(`
      UPDATE container_costs 
      SET ${amountField} = 0, updated_at = NOW()
      WHERE container_id = $1
    `, [asignacion.container_id]);

    await client.query('COMMIT');

    // Obtener el nuevo saldo de la bolsa
    const bolsaRes = await pool.query('SELECT saldo_disponible FROM bolsas_anticipos WHERE id = $1', [asignacion.bolsa_anticipo_id]);

    res.json({
      message: 'Asignación revertida correctamente',
      monto_devuelto: asignacion.monto_asignado,
      nuevo_saldo_bolsa: bolsaRes.rows[0].saldo_disponible
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error revirtiendo asignación:', error);
    res.status(500).json({ error: 'Error al revertir asignación' });
  } finally {
    client.release();
  }
};

// Eliminar bolsa de anticipo (revierta asignaciones primero)
export const deleteBolsaAnticipo = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    await client.query('BEGIN');

    // Verificar que la bolsa existe
    const bolsaRes = await client.query(
      'SELECT * FROM bolsas_anticipos WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (bolsaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Bolsa no encontrada' });
      return;
    }

    // Obtener todas las asignaciones activas de esta bolsa
    const asignacionesRes = await client.query(
      'SELECT * FROM asignaciones_anticipos WHERE bolsa_anticipo_id = $1 AND is_active = TRUE',
      [id]
    );

    // Revertir cada asignación
    for (const asig of asignacionesRes.rows) {
      // Marcar como revertida
      await client.query(`
        UPDATE asignaciones_anticipos 
        SET is_active = FALSE, revertido_at = NOW(), revertido_por = $1, notas = COALESCE(notas, '') || ' [Bolsa eliminada]'
        WHERE id = $2
      `, [userId, asig.id]);

      // Actualizar container_costs (poner en 0)
      const amountField = `${asig.campo_anticipo}_amount`;
      await client.query(`
        UPDATE container_costs 
        SET ${amountField} = 0, updated_at = NOW()
        WHERE container_id = $1
      `, [asig.container_id]);
    }

    // Eliminar la bolsa (soft delete)
    await client.query(`
      UPDATE bolsas_anticipos 
      SET estado = 'eliminado', saldo_disponible = 0, updated_at = NOW()
      WHERE id = $1
    `, [id]);

    await client.query('COMMIT');

    res.json({
      message: 'Bolsa eliminada correctamente',
      asignaciones_revertidas: asignacionesRes.rows.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error eliminando bolsa:', error);
    res.status(500).json({ error: 'Error al eliminar bolsa' });
  } finally {
    client.release();
  }
};

// Obtener estadísticas de anticipos
export const getAnticiposStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM proveedores_anticipos WHERE is_active = TRUE) as total_proveedores,
        (SELECT COUNT(*) FROM bolsas_anticipos WHERE estado != 'eliminado') as bolsas_activas,
        (SELECT COALESCE(SUM(saldo_disponible), 0) FROM bolsas_anticipos WHERE estado != 'eliminado') as saldo_total_disponible,
        (SELECT COALESCE(SUM(monto_original), 0) FROM bolsas_anticipos WHERE estado != 'eliminado') as total_depositado,
        (SELECT COUNT(*) FROM asignaciones_anticipos WHERE is_active = TRUE) as total_asignaciones_activas,
        (SELECT COALESCE(SUM(monto_asignado), 0) FROM asignaciones_anticipos WHERE is_active = TRUE) as total_asignado
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};
