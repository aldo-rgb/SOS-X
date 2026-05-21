// ============================================
// CONTROLLER: MÓDULO CONTROL DE TRANSPORTES
// Gestión de pagos de transporte por referencia de contenedor
// ============================================

import { Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';
import { uploadToS3, isS3Configured, getSignedUrlForKey, extractKeyFromUrl } from './s3Service';
import * as fs from 'fs';
import * as path from 'path';

const signUrl = async (url: string | null): Promise<string | null> => {
  if (!url) return null;
  if (url.includes('s3.') && url.includes('amazonaws.com')) {
    try {
      const key = extractKeyFromUrl(url);
      if (key) return await getSignedUrlForKey(key, 3600);
    } catch { /* devolver url original */ }
  }
  return url;
};

const uploadFile = async (file: Express.Multer.File, folder: string, prefix: string): Promise<string> => {
  const timestamp = Date.now();
  const ext = path.extname(file.originalname) || '.pdf';
  const filename = `${prefix}_${timestamp}${ext}`;
  if (isS3Configured()) {
    return await uploadToS3(file.buffer, `transporte/${folder}/${filename}`, file.mimetype || 'application/pdf');
  }
  const dir = path.join(__dirname, '..', 'uploads', 'transporte', folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  const base = process.env.API_URL || 'http://localhost:3001';
  return `${base}/uploads/transporte/${folder}/${filename}`;
};

// ── Proveedores ───────────────────────────────────────────────────────────────

export const getProveedoresTransporte = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT pt.*,
        COUNT(bt.id) AS total_bolsas,
        COALESCE(SUM(bt.monto_original), 0) AS total_depositado
      FROM proveedores_transporte pt
      LEFT JOIN bolsas_transporte bt ON bt.proveedor_id = pt.id AND bt.estado != 'eliminado'
      WHERE pt.is_active = TRUE
      GROUP BY pt.id
      ORDER BY pt.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proveedores de transporte' });
  }
};

export const createProveedorTransporte = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nombre, referencia, contacto_nombre, contacto_email, contacto_telefono, banco, cuenta_bancaria, clabe, notas } = req.body;
    if (!nombre) { res.status(400).json({ error: 'El nombre es requerido' }); return; }
    const result = await pool.query(
      `INSERT INTO proveedores_transporte (nombre, referencia, contacto_nombre, contacto_email, contacto_telefono, banco, cuenta_bancaria, clabe, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [nombre, referencia, contacto_nombre, contacto_email, contacto_telefono, banco, cuenta_bancaria, clabe, notas]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
};

export const updateProveedorTransporte = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre, referencia, contacto_nombre, contacto_email, contacto_telefono, banco, cuenta_bancaria, clabe, notas, is_active } = req.body;
    const result = await pool.query(
      `UPDATE proveedores_transporte SET
         nombre=COALESCE($1,nombre), referencia=COALESCE($2,referencia),
         contacto_nombre=COALESCE($3,contacto_nombre), contacto_email=COALESCE($4,contacto_email),
         contacto_telefono=COALESCE($5,contacto_telefono), banco=COALESCE($6,banco),
         cuenta_bancaria=COALESCE($7,cuenta_bancaria), clabe=COALESCE($8,clabe),
         notas=COALESCE($9,notas), is_active=COALESCE($10,is_active), updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [nombre, referencia, contacto_nombre, contacto_email, contacto_telefono, banco, cuenta_bancaria, clabe, notas, is_active, id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Proveedor no encontrado' }); return; }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
};

// ── Bolsas ────────────────────────────────────────────────────────────────────

export const getBolsasTransporte = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { proveedor_id } = req.query;
    let q = `
      SELECT bt.*, pt.nombre AS proveedor_nombre,
        (SELECT COUNT(*) FROM transporte_referencias tr WHERE tr.bolsa_id = bt.id) AS total_referencias
      FROM bolsas_transporte bt
      JOIN proveedores_transporte pt ON pt.id = bt.proveedor_id
      WHERE bt.estado != 'eliminado'
    `;
    const params: any[] = [];
    if (proveedor_id) { q += ` AND bt.proveedor_id = $1`; params.push(Number(proveedor_id)); }
    q += ` ORDER BY bt.fecha_pago DESC, bt.created_at DESC`;
    const result = await pool.query(q, params);

    const rows = await Promise.all(result.rows.map(async (b: any) => ({
      ...b,
      comprobante_url: await signUrl(b.comprobante_url),
      factura_url: await signUrl(b.factura_url),
    })));
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener bolsas de transporte' });
  }
};

export const createBolsaTransporte = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { proveedor_id, fecha_pago, tipo_pago, numero_operacion, banco_origen, notas, referencias, omitir_invalidas } = req.body;
    const files = (req as any).files as { [field: string]: Express.Multer.File[] } | undefined;
    const userId = req.user?.userId;

    let parsedRefs: { referencia: string; monto: number }[] = [];
    if (typeof referencias === 'string') parsedRefs = JSON.parse(referencias);
    else if (Array.isArray(referencias)) parsedRefs = referencias;

    if (!proveedor_id || !fecha_pago || parsedRefs.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Proveedor, fecha y al menos una referencia son requeridos' });
      return;
    }

    const monto_original = parsedRefs.reduce((s, r) => s + Number(r.monto), 0);
    if (monto_original <= 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'El monto total debe ser mayor a 0' });
      return;
    }

    const provRes = await client.query(`SELECT id FROM proveedores_transporte WHERE id=$1 AND is_active=TRUE`, [proveedor_id]);
    if (provRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Proveedor de transporte no encontrado' });
      return;
    }

    // Validar referencias
    const omitir = omitir_invalidas === 'true' || omitir_invalidas === true;
    const invalidas: string[] = [];
    for (const ref of parsedRefs) {
      const cr = await client.query(`SELECT id FROM containers WHERE reference_code=$1`, [ref.referencia]);
      if (cr.rows.length === 0) invalidas.push(ref.referencia);
    }
    if (invalidas.length > 0 && !omitir) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: `Referencias no encontradas: ${invalidas.join(', ')}`, referenciasInvalidas: invalidas });
      return;
    }

    // Subir archivos
    let comprobante_url: string | null = null;
    let factura_url: string | null = null;
    const comprobanteFile = files?.comprobante?.[0];
    const facturaFile = files?.factura?.[0];
    if (comprobanteFile) comprobante_url = await uploadFile(comprobanteFile, 'comprobantes', `comprobante_${proveedor_id}`);
    if (facturaFile) factura_url = await uploadFile(facturaFile, 'facturas', `factura_${proveedor_id}`);

    // Crear bolsa
    const bolsaRes = await client.query(`
      INSERT INTO bolsas_transporte
        (proveedor_id, monto_original, fecha_pago, comprobante_url, factura_url,
         referencia_pago, numero_operacion, banco_origen, tipo_pago, notas, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      proveedor_id, monto_original, fecha_pago, comprobante_url, factura_url,
      parsedRefs.map(r => r.referencia).join(', '),
      tipo_pago === 'transferencia' ? numero_operacion : null,
      tipo_pago === 'transferencia' ? banco_origen : null,
      tipo_pago || 'transferencia', notas, userId
    ]);
    const bolsaId = bolsaRes.rows[0].id;

    // Crear referencias + actualizar container_costs
    for (const ref of parsedRefs) {
      const cr = await client.query(`SELECT id FROM containers WHERE reference_code=$1`, [ref.referencia]);
      const containerId = cr.rows.length > 0 ? cr.rows[0].id : null;
      const estado = containerId ? 'aplicado' : 'no_encontrada';

      await client.query(
        `INSERT INTO transporte_referencias (bolsa_id, referencia, monto, estado, container_id) VALUES ($1,$2,$3,$4,$5)`,
        [bolsaId, ref.referencia, ref.monto, estado, containerId]
      );

      if (containerId) {
        await client.query(`
          INSERT INTO container_costs (container_id, transport_amount, transport_pdf, transport_invoice_pdf)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (container_id) DO UPDATE
            SET transport_amount = COALESCE(container_costs.transport_amount, 0) + EXCLUDED.transport_amount,
                transport_pdf = COALESCE(EXCLUDED.transport_pdf, container_costs.transport_pdf),
                transport_invoice_pdf = COALESCE(EXCLUDED.transport_invoice_pdf, container_costs.transport_invoice_pdf),
                updated_at = NOW()
        `, [containerId, ref.monto, comprobante_url, factura_url]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ ...bolsaRes.rows[0], referencias: parsedRefs });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error createBolsaTransporte:', error);
    res.status(500).json({ error: 'Error al crear bolsa de transporte' });
  } finally {
    client.release();
  }
};

export const deleteBolsaTransporte = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const bolsaRes = await client.query(`SELECT * FROM bolsas_transporte WHERE id=$1 AND estado!='eliminado'`, [id]);
    if (bolsaRes.rows.length === 0) { res.status(404).json({ error: 'Bolsa no encontrada' }); return; }

    // Revertir los montos aplicados a container_costs
    const refs = await client.query(`SELECT * FROM transporte_referencias WHERE bolsa_id=$1 AND estado='aplicado'`, [id]);
    for (const ref of refs.rows) {
      if (ref.container_id) {
        await client.query(`
          UPDATE container_costs
          SET transport_amount = GREATEST(0, COALESCE(transport_amount, 0) - $1), updated_at=NOW()
          WHERE container_id = $2
        `, [ref.monto, ref.container_id]);
      }
    }

    await client.query(`UPDATE bolsas_transporte SET estado='eliminado', updated_at=NOW() WHERE id=$1`, [id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al eliminar bolsa' });
  } finally {
    client.release();
  }
};

export const getReferenciasByBolsaTransporte = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bolsaId } = req.params;
    const result = await pool.query(
      `SELECT tr.*, c.container_number FROM transporte_referencias tr
       LEFT JOIN containers c ON c.id = tr.container_id
       WHERE tr.bolsa_id=$1 ORDER BY tr.created_at`,
      [bolsaId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener referencias' });
  }
};

export const getTransporteByContainer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { containerId } = req.params;
    const cr = await pool.query(`SELECT reference_code, container_number FROM containers WHERE id=$1`, [containerId]);
    if (cr.rows.length === 0) { res.status(404).json({ error: 'Contenedor no encontrado' }); return; }
    const { reference_code, container_number } = cr.rows[0];

    const result = await pool.query(`
      SELECT tr.id, tr.referencia, tr.monto, tr.estado, tr.created_at,
             bt.id AS bolsa_id, bt.fecha_pago, bt.comprobante_url, bt.factura_url,
             bt.tipo_pago, bt.numero_operacion, bt.banco_origen,
             pt.nombre AS proveedor_nombre
      FROM transporte_referencias tr
      JOIN bolsas_transporte bt ON bt.id = tr.bolsa_id
      JOIN proveedores_transporte pt ON pt.id = bt.proveedor_id
      WHERE tr.referencia=$1 AND tr.estado!='eliminado' AND bt.estado!='eliminado'
      ORDER BY tr.created_at DESC
    `, [reference_code]);

    const rows = await Promise.all(result.rows.map(async (r: any) => ({
      ...r,
      comprobante_url: await signUrl(r.comprobante_url),
      factura_url: await signUrl(r.factura_url),
    })));
    const total = result.rows.reduce((s: number, r: any) => s + Number(r.monto), 0);
    res.json({ container_number, reference_code, gastos: rows, total });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener gastos de transporte del contenedor' });
  }
};

export const getReferenciasValidasTransporte = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT reference_code, container_number FROM containers WHERE reference_code IS NOT NULL ORDER BY reference_code`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener referencias' });
  }
};

export const getStatsTransporte = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM proveedores_transporte WHERE is_active=TRUE) AS total_proveedores,
        (SELECT COUNT(*) FROM bolsas_transporte WHERE estado='activo') AS bolsas_activas,
        (SELECT COALESCE(SUM(monto_original),0) FROM bolsas_transporte WHERE estado!='eliminado') AS total_depositado
    `);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};
