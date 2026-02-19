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

// Obtener referencias disponibles (no usadas) - NUEVO SISTEMA
export const getReferenciasDisponibles = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT 
        ar.id,
        ar.bolsa_anticipo_id,
        ar.referencia,
        ar.monto,
        ar.estado,
        ba.fecha_pago,
        pa.nombre as proveedor_nombre,
        pa.id as proveedor_id
      FROM anticipo_referencias ar
      JOIN bolsas_anticipos ba ON ba.id = ar.bolsa_anticipo_id
      JOIN proveedores_anticipos pa ON pa.id = ba.proveedor_id
      WHERE ar.estado = 'disponible'
      ORDER BY pa.nombre, ar.referencia
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching referencias disponibles:', error);
    res.status(500).json({ error: 'Error al obtener referencias disponibles' });
  }
};

// Validar si las referencias existen en el sistema (containers.reference_code)
export const validarReferenciasExisten = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { referencias } = req.body; // Array de strings con las referencias a validar
    
    if (!referencias || !Array.isArray(referencias) || referencias.length === 0) {
      res.status(400).json({ error: 'Se requiere un array de referencias' });
      return;
    }

    const results: { referencia: string; existe: boolean; container_id?: number; container_number?: string }[] = [];
    const notFound: string[] = [];

    for (const ref of referencias) {
      const result = await pool.query(
        'SELECT id, container_number, reference_code FROM containers WHERE reference_code = $1',
        [ref]
      );
      
      if (result.rows.length > 0) {
        results.push({
          referencia: ref,
          existe: true,
          container_id: result.rows[0].id,
          container_number: result.rows[0].container_number
        });
      } else {
        results.push({ referencia: ref, existe: false });
        notFound.push(ref);
      }
    }

    res.json({
      valid: notFound.length === 0,
      results,
      notFound,
      message: notFound.length === 0 
        ? 'Todas las referencias son válidas' 
        : `Referencias no encontradas: ${notFound.join(', ')}`
    });
  } catch (error) {
    console.error('Error validando referencias:', error);
    res.status(500).json({ error: 'Error al validar referencias' });
  }
};

// Obtener todas las referencias válidas del sistema (para autocompletado)
export const getReferenciasValidas = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT reference_code, id as container_id, container_number, week_number
      FROM containers 
      WHERE reference_code IS NOT NULL AND reference_code != ''
      ORDER BY reference_code
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching referencias válidas:', error);
    res.status(500).json({ error: 'Error al obtener referencias válidas' });
  }
};

// Obtener anticipos de un contenedor por su reference_code
export const getAnticiposByContainer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { containerId } = req.params;
    
    // Obtener el reference_code del contenedor
    const containerRes = await pool.query(
      'SELECT id, reference_code, container_number FROM containers WHERE id = $1',
      [containerId]
    );
    
    if (containerRes.rows.length === 0) {
      res.status(404).json({ error: 'Contenedor no encontrado' });
      return;
    }
    
    const { reference_code, container_number } = containerRes.rows[0];
    
    if (!reference_code) {
      res.json({ 
        container_number,
        reference_code: null,
        anticipos: [],
        total: 0,
        message: 'Este contenedor no tiene una referencia asignada'
      });
      return;
    }
    
    // Obtener todos los anticipos para esta referencia
    const result = await pool.query(`
      SELECT 
        ar.id,
        ar.referencia,
        ar.monto,
        ar.estado,
        ar.usado_at,
        ar.created_at,
        ba.id as bolsa_id,
        ba.fecha_pago,
        ba.comprobante_url,
        ba.tipo_pago,
        ba.numero_operacion,
        ba.banco_origen,
        p.nombre as proveedor_nombre
      FROM anticipo_referencias ar
      INNER JOIN bolsas_anticipos ba ON ba.id = ar.bolsa_anticipo_id
      INNER JOIN proveedores_anticipos p ON p.id = ba.proveedor_id
      WHERE ar.referencia = $1
      ORDER BY ar.created_at DESC
    `, [reference_code]);
    
    const total = result.rows.reduce((sum, r) => sum + Number(r.monto), 0);
    
    res.json({
      container_number,
      reference_code,
      anticipos: result.rows,
      total
    });
  } catch (error) {
    console.error('Error fetching anticipos by container:', error);
    res.status(500).json({ error: 'Error al obtener anticipos del contenedor' });
  }
};

// Obtener referencias de una bolsa específica
export const getReferenciasByBolsa = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bolsaId } = req.params;
    const result = await pool.query(`
      SELECT 
        ar.*,
        c.container_number,
        u.full_name as usado_por_nombre
      FROM anticipo_referencias ar
      LEFT JOIN containers c ON c.id = ar.container_id
      LEFT JOIN users u ON u.id = ar.usado_por
      WHERE ar.bolsa_anticipo_id = $1
      ORDER BY ar.referencia
    `, [bolsaId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching referencias:', error);
    res.status(500).json({ error: 'Error al obtener referencias' });
  }
};

// Asignar una referencia a un contenedor (marcar como usada)
export const asignarReferenciaAContainer = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { referenciaId, containerId } = req.body;
    const userId = req.user?.userId;

    if (!referenciaId || !containerId) {
      res.status(400).json({ error: 'Referencia y contenedor son requeridos' });
      return;
    }

    // Verificar que la referencia existe y está disponible
    const refRes = await client.query(
      'SELECT * FROM anticipo_referencias WHERE id = $1 AND estado = $2',
      [referenciaId, 'disponible']
    );
    
    if (refRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Referencia no encontrada o ya fue utilizada' });
      return;
    }

    const referencia = refRes.rows[0];

    // Marcar referencia como usada
    await client.query(`
      UPDATE anticipo_referencias SET
        estado = 'usada',
        container_id = $1,
        usado_at = NOW(),
        usado_por = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [containerId, userId, referenciaId]);

    // Actualizar saldo disponible de la bolsa
    await client.query(`
      UPDATE bolsas_anticipos SET
        saldo_disponible = saldo_disponible - $1,
        updated_at = NOW()
      WHERE id = $2
    `, [referencia.monto, referencia.bolsa_anticipo_id]);

    // Verificar si la bolsa quedó sin saldo
    const bolsaRes = await client.query('SELECT saldo_disponible FROM bolsas_anticipos WHERE id = $1', [referencia.bolsa_anticipo_id]);
    if (bolsaRes.rows[0].saldo_disponible <= 0) {
      await client.query('UPDATE bolsas_anticipos SET estado = $1 WHERE id = $2', ['agotada', referencia.bolsa_anticipo_id]);
    }

    // Crear registro en asignaciones_anticipos para historial
    await client.query(`
      INSERT INTO asignaciones_anticipos 
      (bolsa_anticipo_id, container_id, campo_anticipo, monto_asignado, concepto, asignado_por)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [referencia.bolsa_anticipo_id, containerId, 'referencia', referencia.monto, `Referencia: ${referencia.referencia}`, userId]);

    await client.query('COMMIT');

    res.json({ 
      success: true, 
      message: `Referencia ${referencia.referencia} asignada exitosamente`,
      monto: referencia.monto
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error asignando referencia:', error);
    res.status(500).json({ error: 'Error al asignar referencia' });
  } finally {
    client.release();
  }
};

// Crear bolsa de anticipo (nuevo depósito) con referencias múltiples
export const createBolsaAnticipo = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { proveedor_id, fecha_pago, tipo_pago, numero_operacion, banco_origen, notas, referencias } = req.body;
    const file = (req as any).file as Express.Multer.File | undefined;
    const userId = req.user?.userId;

    // Parsear referencias si viene como string
    let parsedReferencias: { referencia: string; monto: number }[] = [];
    if (typeof referencias === 'string') {
      parsedReferencias = JSON.parse(referencias);
    } else if (Array.isArray(referencias)) {
      parsedReferencias = referencias;
    }

    if (!proveedor_id || !fecha_pago || parsedReferencias.length === 0) {
      res.status(400).json({ error: 'Proveedor, fecha y al menos una referencia son requeridos' });
      return;
    }

    // Calcular monto total desde las referencias
    const monto_original = parsedReferencias.reduce((sum, ref) => sum + Number(ref.monto), 0);

    if (monto_original <= 0) {
      res.status(400).json({ error: 'El monto total debe ser mayor a 0' });
      return;
    }

    // Verificar que el proveedor existe
    const provRes = await client.query('SELECT id FROM proveedores_anticipos WHERE id = $1 AND is_active = TRUE', [proveedor_id]);
    if (provRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Proveedor no encontrado' });
      return;
    }

    // VALIDACIÓN: Verificar que las referencias existan en containers.reference_code
    const referenciasNoExisten: string[] = [];
    for (const ref of parsedReferencias) {
      const containerRef = await client.query(
        'SELECT id, container_number FROM containers WHERE reference_code = $1',
        [ref.referencia]
      );
      if (containerRef.rows.length === 0) {
        referenciasNoExisten.push(ref.referencia);
      }
    }

    if (referenciasNoExisten.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ 
        error: `Las siguientes referencias no existen en el sistema: ${referenciasNoExisten.join(', ')}`,
        referenciasInvalidas: referenciasNoExisten
      });
      return;
    }

    // Verificar que las referencias no hayan sido ya registradas como anticipo
    for (const ref of parsedReferencias) {
      const existingRef = await client.query('SELECT id FROM anticipo_referencias WHERE referencia = $1', [ref.referencia]);
      if (existingRef.rows.length > 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: `La referencia ${ref.referencia} ya tiene un anticipo registrado` });
        return;
      }
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

    // Crear la bolsa principal
    const bolsaResult = await client.query(`
      INSERT INTO bolsas_anticipos 
      (proveedor_id, monto_original, saldo_disponible, fecha_pago, comprobante_url, 
       referencia_pago, tipo_pago, numero_operacion, banco_origen, notas, created_by)
      VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      proveedor_id, 
      monto_original, 
      fecha_pago, 
      comprobante_url, 
      parsedReferencias.map(r => r.referencia).join(', '), // Guardar todas las refs como texto
      tipo_pago || 'transferencia',
      tipo_pago === 'transferencia' ? numero_operacion : null,
      tipo_pago === 'transferencia' ? banco_origen : null,
      notas, 
      userId
    ]);

    const bolsaId = bolsaResult.rows[0].id;

    // Crear las referencias individuales (con container_id)
    for (const ref of parsedReferencias) {
      // Obtener el container_id para esta referencia
      const containerRes = await client.query(
        'SELECT id FROM containers WHERE reference_code = $1',
        [ref.referencia]
      );
      const containerId = containerRes.rows.length > 0 ? containerRes.rows[0].id : null;
      
      await client.query(`
        INSERT INTO anticipo_referencias (bolsa_anticipo_id, referencia, monto, estado, container_id)
        VALUES ($1, $2, $3, 'disponible', $4)
      `, [bolsaId, ref.referencia, ref.monto, containerId]);
    }

    await client.query('COMMIT');

    // Obtener con info del proveedor
    const fullResult = await client.query('SELECT * FROM vista_bolsas_anticipos WHERE id = $1', [bolsaId]);

    // Obtener referencias creadas
    const refsResult = await client.query('SELECT * FROM anticipo_referencias WHERE bolsa_anticipo_id = $1', [bolsaId]);

    res.status(201).json({
      ...fullResult.rows[0],
      referencias: refsResult.rows
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating bolsa anticipo:', error);
    res.status(500).json({ error: 'Error al crear bolsa de anticipo' });
  } finally {
    client.release();
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
