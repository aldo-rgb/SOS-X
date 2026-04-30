// ============================================================================
// ENTANGLED Controller - Integración del motor externo de triangulación.
// ============================================================================
// Mantiene aislada toda la lógica para no afectar el módulo legacy
// supplier_payments. Tabla principal: entangled_payment_requests.
// ============================================================================

import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';
import {
  sendSolicitudPago,
  isEntangledConfigured,
  ENTANGLED_WEBHOOK_SECRET,
  EntangledSolicitudPayload,
} from './entangledService';

const getAuthUserId = (req: Request): number | null => {
  const u = (req as any).user;
  const id = Number(u?.userId ?? u?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
};

// ---------------------------------------------------------------------------
// Helper: validación mínima del payload del cliente final
// ---------------------------------------------------------------------------
const validateClientPayload = (body: any): string | null => {
  if (!body) return 'Payload vacío';
  const cf = body.cliente_final || {};
  const op = body.operacion || {};
  const required: Array<[string, any]> = [
    ['cliente_final.rfc', cf.rfc],
    ['cliente_final.razon_social', cf.razon_social],
    ['cliente_final.regimen_fiscal', cf.regimen_fiscal],
    ['cliente_final.cp', cf.cp],
    ['cliente_final.uso_cfdi', cf.uso_cfdi],
    ['cliente_final.email', cf.email],
    ['operacion.montos', op.montos],
    ['operacion.divisa_destino', op.divisa_destino],
    ['operacion.comprobante_cliente_url', op.comprobante_cliente_url],
  ];
  for (const [k, v] of required) {
    if (v === undefined || v === null || v === '') {
      return `Campo requerido faltante: ${k}`;
    }
  }
  if (Number(op.montos) <= 0) return 'operacion.montos debe ser > 0';
  if (op.conceptos && !Array.isArray(op.conceptos)) {
    return 'operacion.conceptos debe ser un arreglo';
  }
  return null;
};

// ===========================================================================
// FASE 1: Cliente XOX crea la solicitud → enviamos POST a ENTANGLED
// ===========================================================================

export const createPaymentRequest = async (
  req: Request,
  res: Response
): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const validationError = validateClientPayload(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { cliente_final, operacion, comisiones } = req.body as {
    cliente_final: any;
    operacion: any;
    comisiones?: any;
  };

  // Resolver asesor: si el cliente tiene asesor asignado lo tomamos.
  let advisorId: number | null = null;
  let advisorName: string = comisiones?.asesor_nombre || '';
  try {
    const userRow = await pool.query(
      `SELECT u.assigned_advisor_id, a.full_name AS advisor_name
       FROM users u
       LEFT JOIN users a ON a.id = u.assigned_advisor_id
       WHERE u.id = $1`,
      [userId]
    );
    if (userRow.rows.length > 0) {
      advisorId = userRow.rows[0].assigned_advisor_id || null;
      if (!advisorName) advisorName = userRow.rows[0].advisor_name || '';
    }
  } catch (e) {
    // assigned_advisor_id puede no existir en algunas instalaciones; lo ignoramos.
  }

  const comisionAsesor = Number(comisiones?.comision_asesor ?? 0) || 0;
  const comisionXox = Number(comisiones?.comision_xox ?? 0) || 0;

  // 1. Crear el registro local primero (estado pendiente, sin transaccion_id)
  let requestId: number;
  try {
    const insertResult = await pool.query(
      `INSERT INTO entangled_payment_requests (
         user_id, advisor_id,
         cf_rfc, cf_razon_social, cf_regimen_fiscal, cf_cp, cf_uso_cfdi, cf_email,
         op_monto, op_divisa_destino, op_conceptos, op_comprobante_cliente_url,
         comision_asesor, comision_xox,
         estatus_global, estatus_factura, estatus_proveedor
       ) VALUES (
         $1, $2,
         $3, $4, $5, $6, $7, $8,
         $9, $10, $11::jsonb, $12,
         $13, $14,
         'pendiente', 'pendiente', 'pendiente'
       ) RETURNING id`,
      [
        userId,
        advisorId,
        String(cliente_final.rfc).toUpperCase(),
        cliente_final.razon_social,
        cliente_final.regimen_fiscal,
        String(cliente_final.cp),
        cliente_final.uso_cfdi,
        cliente_final.email,
        Number(operacion.montos),
        operacion.divisa_destino,
        JSON.stringify(operacion.conceptos || []),
        operacion.comprobante_cliente_url,
        comisionAsesor,
        comisionXox,
      ]
    );
    requestId = insertResult.rows[0].id;
  } catch (err) {
    console.error('[ENTANGLED] Error creando registro local:', err);
    return res.status(500).json({ error: 'No se pudo crear la solicitud local' });
  }

  // 2. Construir payload exacto y enviarlo a ENTANGLED
  const payload: EntangledSolicitudPayload = {
    cliente_final: {
      rfc: String(cliente_final.rfc).toUpperCase(),
      razon_social: cliente_final.razon_social,
      regimen_fiscal: cliente_final.regimen_fiscal,
      cp: String(cliente_final.cp),
      uso_cfdi: cliente_final.uso_cfdi,
      email: cliente_final.email,
    },
    operacion: {
      montos: Number(operacion.montos),
      divisa_destino: operacion.divisa_destino,
      conceptos: Array.isArray(operacion.conceptos) ? operacion.conceptos : [],
      comprobante_cliente_url: operacion.comprobante_cliente_url,
    },
    comisiones: {
      asesor_id: advisorId ? String(advisorId) : '',
      asesor_nombre: advisorName,
      comision_asesor: comisionAsesor,
      comision_xox: comisionXox,
    },
  };

  if (!isEntangledConfigured()) {
    // Modo "sin API key": dejamos el registro creado pero marcado como error_envio
    // para que admin lo pueda reenviar más tarde.
    await pool.query(
      `UPDATE entangled_payment_requests
       SET estatus_global = 'error_envio',
           error_message = $1,
           updated_at = NOW()
       WHERE id = $2`,
      ['ENTANGLED_API_KEY no configurada', requestId]
    );
    return res.status(202).json({
      message:
        'Solicitud guardada localmente. ENTANGLED no está configurado todavía; el equipo administrativo procesará el envío manualmente.',
      request_id: requestId,
      status: 'error_envio',
    });
  }

  const remote = await sendSolicitudPago(payload);

  if (!remote.ok || !remote.transaccion_id) {
    await pool.query(
      `UPDATE entangled_payment_requests
       SET estatus_global = 'error_envio',
           error_message = $1,
           raw_response = $2::jsonb,
           updated_at = NOW()
       WHERE id = $3`,
      [remote.error || 'Sin transaccion_id', JSON.stringify(remote.raw || {}), requestId]
    );
    return res.status(502).json({
      error:
        remote.error ||
        'ENTANGLED no devolvió un transaccion_id. Reintentar más tarde.',
      request_id: requestId,
    });
  }

  // 3. Guardar transaccion_id y marcar en proceso
  const updated = await pool.query(
    `UPDATE entangled_payment_requests
     SET entangled_transaccion_id = $1,
         estatus_global = 'en_proceso',
         raw_response = $2::jsonb,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [remote.transaccion_id, JSON.stringify(remote.raw || {}), requestId]
  );

  return res.status(201).json({
    message: 'Solicitud enviada a ENTANGLED',
    request: updated.rows[0],
  });
};

// ===========================================================================
// Lecturas: cliente y admin
// ===========================================================================

export const getMyPaymentRequests = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  try {
    const r = await pool.query(
      `SELECT id, entangled_transaccion_id,
              cf_rfc, cf_razon_social, cf_email,
              op_monto, op_divisa_destino,
              estatus_global, estatus_factura, estatus_proveedor,
              factura_url, factura_emitida_at,
              comprobante_proveedor_url, proveedor_pagado_at,
              created_at, updated_at
       FROM entangled_payment_requests
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [userId]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error('[ENTANGLED] getMyPaymentRequests:', err);
    return res.status(500).json({ error: 'Error al listar solicitudes' });
  }
};

export const getPaymentRequestDetail = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  const role = String((req as any).user?.role || '').toLowerCase();
  const isAdmin = ['super_admin', 'admin', 'director'].includes(role);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

  try {
    const r = await pool.query(
      `SELECT * FROM entangled_payment_requests WHERE id = $1`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
    const row = r.rows[0];
    if (!isAdmin && row.user_id !== userId) {
      return res.status(403).json({ error: 'Sin acceso a esta solicitud' });
    }
    return res.json(row);
  } catch (err) {
    console.error('[ENTANGLED] getPaymentRequestDetail:', err);
    return res.status(500).json({ error: 'Error al obtener detalle' });
  }
};

export const getAllPaymentRequests = async (req: Request, res: Response): Promise<any> => {
  const status = (req.query.status as string) || 'all';
  try {
    const params: any[] = [];
    let where = '';
    if (status && status !== 'all') {
      params.push(status);
      where = `WHERE r.estatus_global = $${params.length}`;
    }
    const q = `
      SELECT r.*,
             u.full_name AS client_name, u.email AS client_email,
             a.full_name AS advisor_name
      FROM entangled_payment_requests r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users a ON r.advisor_id = a.id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT 200
    `;
    const r = await pool.query(q, params);
    return res.json(r.rows);
  } catch (err) {
    console.error('[ENTANGLED] getAllPaymentRequests:', err);
    return res.status(500).json({ error: 'Error al listar' });
  }
};

// ===========================================================================
// FASE 2: Webhooks de ENTANGLED
// ===========================================================================
//
// Estos endpoints son PÚBLICOS pero verifican un secreto compartido enviado
// por ENTANGLED en el header `X-Entangled-Signature` (HMAC SHA-256 sobre el
// body raw). Si ENTANGLED_WEBHOOK_SECRET no está configurado, se acepta el
// webhook (modo dev) pero se loggea advertencia.
// ===========================================================================

const verifyWebhookSignature = (req: Request): { ok: boolean; reason?: string } => {
  if (!ENTANGLED_WEBHOOK_SECRET) {
    console.warn('[ENTANGLED] ENTANGLED_WEBHOOK_SECRET no configurado: aceptando webhook sin verificar');
    return { ok: true };
  }
  const signature = (req.headers['x-entangled-signature'] || req.headers['x-signature']) as
    | string
    | undefined;
  if (!signature) return { ok: false, reason: 'Falta cabecera x-entangled-signature' };
  // Si el body llegó como objeto (express.json), reconstruimos JSON string canónico
  const raw = (req as any).rawBody
    ? (req as any).rawBody.toString('utf8')
    : JSON.stringify(req.body || {});
  const expected = crypto
    .createHmac('sha256', ENTANGLED_WEBHOOK_SECRET)
    .update(raw)
    .digest('hex');
  const provided = signature.replace(/^sha256=/, '');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Firma inválida' };
  }
  return { ok: true };
};

const logWebhook = async (
  transaccionId: string | null,
  evento: string | null,
  payload: any,
  requestId: number | null,
  processError: string | null = null
) => {
  try {
    await pool.query(
      `INSERT INTO entangled_webhook_logs
         (request_id, transaccion_id, evento, payload, processed, process_error)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        requestId,
        transaccionId,
        evento,
        JSON.stringify(payload || {}),
        !processError,
        processError,
      ]
    );
  } catch (err) {
    console.error('[ENTANGLED] No se pudo registrar webhook log:', err);
  }
};

export const webhookFacturaGenerada = async (req: Request, res: Response): Promise<any> => {
  const sig = verifyWebhookSignature(req);
  if (!sig.ok) {
    await logWebhook(null, 'factura_generada', req.body, null, sig.reason || 'firma');
    return res.status(401).json({ error: sig.reason || 'No autorizado' });
  }

  const { transaccion_id, evento, datos } = req.body || {};
  if (!transaccion_id) {
    await logWebhook(null, evento || 'factura_generada', req.body, null, 'transaccion_id faltante');
    return res.status(400).json({ error: 'transaccion_id requerido' });
  }

  try {
    const found = await pool.query(
      `SELECT id FROM entangled_payment_requests WHERE entangled_transaccion_id = $1`,
      [transaccion_id]
    );
    if (found.rows.length === 0) {
      await logWebhook(transaccion_id, evento || 'factura_generada', req.body, null, 'request no encontrada');
      // Respondemos 200 igual para que ENTANGLED no reintente indefinidamente.
      return res.status(200).json({ ok: true, ignored: true });
    }
    const requestId = found.rows[0].id;
    const documentoUrl = datos?.documento_url || null;
    const nombreArchivo = datos?.nombre_archivo || null;

    await pool.query(
      `UPDATE entangled_payment_requests
       SET factura_url = COALESCE($1, factura_url),
           factura_nombre_archivo = COALESCE($2, factura_nombre_archivo),
           factura_emitida_at = NOW(),
           estatus_factura = 'emitida',
           estatus_global = CASE
             WHEN estatus_proveedor = 'completado' THEN 'completado'
             ELSE 'en_proceso'
           END,
           last_webhook_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [documentoUrl, nombreArchivo, requestId]
    );

    await logWebhook(transaccion_id, 'factura_generada', req.body, requestId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[ENTANGLED] webhookFacturaGenerada error:', err);
    await logWebhook(transaccion_id, 'factura_generada', req.body, null, (err as Error).message);
    return res.status(500).json({ error: 'Error procesando webhook' });
  }
};

export const webhookPagoProveedor = async (req: Request, res: Response): Promise<any> => {
  const sig = verifyWebhookSignature(req);
  if (!sig.ok) {
    await logWebhook(null, 'pago_proveedor_enviado', req.body, null, sig.reason || 'firma');
    return res.status(401).json({ error: sig.reason || 'No autorizado' });
  }

  const { transaccion_id, evento, datos } = req.body || {};
  if (!transaccion_id) {
    await logWebhook(null, evento || 'pago_proveedor_enviado', req.body, null, 'transaccion_id faltante');
    return res.status(400).json({ error: 'transaccion_id requerido' });
  }

  try {
    const found = await pool.query(
      `SELECT id FROM entangled_payment_requests WHERE entangled_transaccion_id = $1`,
      [transaccion_id]
    );
    if (found.rows.length === 0) {
      await logWebhook(transaccion_id, evento || 'pago_proveedor_enviado', req.body, null, 'request no encontrada');
      return res.status(200).json({ ok: true, ignored: true });
    }
    const requestId = found.rows[0].id;
    const estatus = String(datos?.estatus || 'completado').toLowerCase();
    const comprobanteUrl = datos?.comprobante_url || null;
    const moneda = datos?.detalles_envio?.moneda_enviada || null;
    const monto = datos?.detalles_envio?.monto_enviado != null
      ? Number(datos.detalles_envio.monto_enviado)
      : null;
    const cuenta = datos?.detalles_envio?.cuenta_destino || null;

    await pool.query(
      `UPDATE entangled_payment_requests
       SET estatus_proveedor = $1,
           comprobante_proveedor_url = COALESCE($2, comprobante_proveedor_url),
           proveedor_moneda_enviada = COALESCE($3, proveedor_moneda_enviada),
           proveedor_monto_enviado = COALESCE($4, proveedor_monto_enviado),
           proveedor_cuenta_destino = COALESCE($5, proveedor_cuenta_destino),
           proveedor_pagado_at = NOW(),
           estatus_global = CASE
             WHEN $1 = 'completado' AND estatus_factura = 'emitida' THEN 'completado'
             WHEN $1 = 'rechazado' THEN 'rechazado'
             ELSE 'en_proceso'
           END,
           last_webhook_at = NOW(),
           updated_at = NOW()
       WHERE id = $6`,
      [estatus, comprobanteUrl, moneda, monto, cuenta, requestId]
    );

    await logWebhook(transaccion_id, 'pago_proveedor_enviado', req.body, requestId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[ENTANGLED] webhookPagoProveedor error:', err);
    await logWebhook(transaccion_id, 'pago_proveedor_enviado', req.body, null, (err as Error).message);
    return res.status(500).json({ error: 'Error procesando webhook' });
  }
};
