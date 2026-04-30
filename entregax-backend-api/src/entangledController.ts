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
// Helper: validación mínima del payload del cliente final (flujo v2)
// - Factura es opcional (requiere_factura)
// - Comprobante se sube DESPUÉS, ya no es requerido aquí
// - Conceptos sólo si requiere_factura
// ---------------------------------------------------------------------------
const validateClientPayload = (body: any): string | null => {
  if (!body) return 'Payload vacío';
  const op = body.operacion || {};
  const requiereFactura = body.requiere_factura !== false;

  // Operación: sólo monto y divisa son obligatorios
  if (op.montos === undefined || op.montos === null || op.montos === '') {
    return 'Campo requerido faltante: operacion.montos';
  }
  if (Number(op.montos) <= 0) return 'operacion.montos debe ser > 0';
  if (!op.divisa_destino) return 'Campo requerido faltante: operacion.divisa_destino';
  if (!['USD', 'RMB'].includes(String(op.divisa_destino).toUpperCase())) {
    return 'operacion.divisa_destino debe ser USD o RMB';
  }
  if (op.conceptos && !Array.isArray(op.conceptos)) {
    return 'operacion.conceptos debe ser un arreglo';
  }

  // Datos fiscales sólo si pidió factura
  if (requiereFactura) {
    const cf = body.cliente_final || {};
    const required: Array<[string, any]> = [
      ['cliente_final.rfc', cf.rfc],
      ['cliente_final.razon_social', cf.razon_social],
      ['cliente_final.regimen_fiscal', cf.regimen_fiscal],
      ['cliente_final.cp', cf.cp],
      ['cliente_final.uso_cfdi', cf.uso_cfdi],
      ['cliente_final.email', cf.email],
    ];
    for (const [k, v] of required) {
      if (v === undefined || v === null || v === '') {
        return `Campo requerido faltante: ${k}`;
      }
    }
  }

  // Proveedor de envío: mínimo nombre, cuenta y banco
  const sup = body.proveedor_envio || {};
  if (!sup.nombre_beneficiario) return 'Falta proveedor de envío: nombre del beneficiario';
  if (!sup.numero_cuenta) return 'Falta proveedor de envío: número de cuenta';
  if (!sup.banco_nombre) return 'Falta proveedor de envío: banco receptor';
  if (String(op.divisa_destino).toUpperCase() === 'RMB' && !sup.nombre_chino) {
    return 'Para RMB es obligatorio el nombre en chino del beneficiario';
  }
  return null;
};

// ---------------------------------------------------------------------------
// Helper: cotización aplicando pricing config
// ---------------------------------------------------------------------------
const computeQuote = async (
  monto: number,
  divisa: string
): Promise<{
  tipo_cambio: number;
  porcentaje_compra: number;
  monto_mxn_base: number;
  monto_mxn_total: number;
}> => {
  const r = await pool.query(
    `SELECT tipo_cambio_usd, tipo_cambio_rmb, porcentaje_compra
     FROM entangled_pricing_config WHERE id = 1`
  );
  const row = r.rows[0] || { tipo_cambio_usd: 18.5, tipo_cambio_rmb: 2.85, porcentaje_compra: 6 };
  const div = String(divisa).toUpperCase();
  const tc = Number(div === 'RMB' ? row.tipo_cambio_rmb : row.tipo_cambio_usd);
  const pct = Number(row.porcentaje_compra);
  const base = Number(monto) * tc;
  const total = base * (1 + pct / 100);
  return {
    tipo_cambio: tc,
    porcentaje_compra: pct,
    monto_mxn_base: Number(base.toFixed(2)),
    monto_mxn_total: Number(total.toFixed(2)),
  };
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
    cliente_final?: any;
    operacion: any;
    comisiones?: any;
  };
  const requiereFactura = req.body.requiere_factura !== false;
  const proveedor = (req.body as any).proveedor_envio || null;

  // Calcular cotización con TC + porcentaje configurados
  const quote = await computeQuote(Number(operacion.montos), operacion.divisa_destino);

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
         requiere_factura,
         cf_rfc, cf_razon_social, cf_regimen_fiscal, cf_cp, cf_uso_cfdi, cf_email,
         op_monto, op_divisa_destino, op_conceptos, op_comprobante_cliente_url,
         tipo_cambio_aplicado, porcentaje_compra_aplicado, monto_mxn_base, monto_mxn_total,
         comision_asesor, comision_xox,
         estatus_global, estatus_factura, estatus_proveedor,
         supplier_id,
         sup_nombre_beneficiario, sup_nombre_chino, sup_direccion,
         sup_numero_cuenta, sup_iban,
         sup_banco_nombre, sup_banco_direccion,
         sup_swift_bic, sup_aba_routing,
         sup_banco_intermediario_nombre, sup_banco_intermediario_swift,
         sup_motivo, sup_foto_url
       ) VALUES (
         $1, $2,
         $3,
         $4, $5, $6, $7, $8, $9,
         $10, $11, $12::jsonb, NULL,
         $13, $14, $15, $16,
         $17, $18,
         'pendiente', $19, 'pendiente',
         $20,
         $21, $22, $23,
         $24, $25,
         $26, $27,
         $28, $29,
         $30, $31,
         $32, $33
       ) RETURNING id`,
      [
        userId,
        advisorId,
        requiereFactura,
        requiereFactura ? String(cliente_final?.rfc || '').toUpperCase() : null,
        requiereFactura ? cliente_final?.razon_social : null,
        requiereFactura ? cliente_final?.regimen_fiscal : null,
        requiereFactura ? String(cliente_final?.cp || '') : null,
        requiereFactura ? cliente_final?.uso_cfdi : null,
        requiereFactura ? cliente_final?.email : null,
        Number(operacion.montos),
        String(operacion.divisa_destino).toUpperCase(),
        JSON.stringify(requiereFactura ? operacion.conceptos || [] : []),
        quote.tipo_cambio,
        quote.porcentaje_compra,
        quote.monto_mxn_base,
        quote.monto_mxn_total,
        comisionAsesor,
        comisionXox,
        requiereFactura ? 'pendiente' : 'no_aplica',
        proveedor?.supplier_id || null,
        proveedor?.nombre_beneficiario || null,
        proveedor?.nombre_chino || null,
        proveedor?.direccion_beneficiario || null,
        proveedor?.numero_cuenta || null,
        proveedor?.iban || null,
        proveedor?.banco_nombre || null,
        proveedor?.banco_direccion || null,
        proveedor?.swift_bic || null,
        proveedor?.aba_routing || null,
        proveedor?.banco_intermediario_nombre || null,
        proveedor?.banco_intermediario_swift || null,
        proveedor?.motivo || null,
        proveedor?.foto_url || null,
      ]
    );
    requestId = insertResult.rows[0].id;
  } catch (err) {
    console.error('[ENTANGLED] Error creando registro local:', err);
    return res.status(500).json({ error: 'No se pudo crear la solicitud local' });
  }

  // 2. Construir payload exacto y enviarlo a ENTANGLED
  const payload: EntangledSolicitudPayload = {
    cliente_final: requiereFactura
      ? {
          rfc: String(cliente_final?.rfc || '').toUpperCase(),
          razon_social: cliente_final?.razon_social,
          regimen_fiscal: cliente_final?.regimen_fiscal,
          cp: String(cliente_final?.cp || ''),
          uso_cfdi: cliente_final?.uso_cfdi,
          email: cliente_final?.email,
        }
      : ({} as any),
    operacion: {
      montos: Number(operacion.montos),
      divisa_destino: String(operacion.divisa_destino).toUpperCase(),
      conceptos: requiereFactura && Array.isArray(operacion.conceptos) ? operacion.conceptos : [],
      comprobante_cliente_url: '',
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

  // 3. Guardar transaccion_id, instrucciones de pago y marcar en proceso
  const updated = await pool.query(
    `UPDATE entangled_payment_requests
     SET entangled_transaccion_id = $1,
         estatus_global = 'en_proceso',
         raw_response = $2::jsonb,
         instrucciones_pago = $2::jsonb,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [remote.transaccion_id, JSON.stringify(remote.raw || {}), requestId]
  );

  return res.status(201).json({
    message: 'Solicitud enviada a ENTANGLED',
    request: updated.rows[0],
    instrucciones_pago: remote.raw || null,
    quote,
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

// ===========================================================================
// CRUD: Proveedores de Envío del cliente (beneficiarios)
// ===========================================================================

export const listMySuppliers = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    const r = await pool.query(
      `SELECT * FROM entangled_suppliers
       WHERE user_id = $1 AND is_active = TRUE
       ORDER BY is_favorite DESC, created_at DESC`,
      [userId]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error('[ENTANGLED] listMySuppliers:', err);
    return res.status(500).json({ error: 'Error al listar proveedores' });
  }
};

export const createMySupplier = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const b = req.body || {};
  if (!b.nombre_beneficiario || !b.numero_cuenta || !b.banco_nombre) {
    return res.status(400).json({ error: 'nombre_beneficiario, numero_cuenta y banco_nombre son requeridos' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO entangled_suppliers (
        user_id, nombre_beneficiario, nombre_chino, direccion_beneficiario, pais_beneficiario,
        numero_cuenta, iban,
        banco_nombre, banco_direccion, banco_pais,
        swift_bic, aba_routing,
        banco_intermediario_nombre, banco_intermediario_swift, banco_intermediario_direccion,
        divisa_default, motivo_default, foto_url,
        alias, is_favorite, notes
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7,
        $8, $9, $10,
        $11, $12,
        $13, $14, $15,
        $16, $17, $18,
        $19, COALESCE($20, FALSE), $21
      ) RETURNING *`,
      [
        userId,
        b.nombre_beneficiario, b.nombre_chino || null, b.direccion_beneficiario || null, b.pais_beneficiario || null,
        b.numero_cuenta, b.iban || null,
        b.banco_nombre, b.banco_direccion || null, b.banco_pais || null,
        b.swift_bic || null, b.aba_routing || null,
        b.banco_intermediario_nombre || null, b.banco_intermediario_swift || null, b.banco_intermediario_direccion || null,
        b.divisa_default || null, b.motivo_default || null, b.foto_url || null,
        b.alias || null, b.is_favorite, b.notes || null,
      ]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[ENTANGLED] createMySupplier:', err);
    return res.status(500).json({ error: 'Error al crear proveedor' });
  }
};

export const updateMySupplier = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

  const b = req.body || {};
  try {
    const owner = await pool.query(`SELECT user_id FROM entangled_suppliers WHERE id = $1`, [id]);
    if (owner.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    if (owner.rows[0].user_id !== userId) return res.status(403).json({ error: 'Sin acceso' });

    const r = await pool.query(
      `UPDATE entangled_suppliers SET
        nombre_beneficiario = COALESCE($2, nombre_beneficiario),
        nombre_chino = $3,
        direccion_beneficiario = $4,
        pais_beneficiario = $5,
        numero_cuenta = COALESCE($6, numero_cuenta),
        iban = $7,
        banco_nombre = COALESCE($8, banco_nombre),
        banco_direccion = $9,
        banco_pais = $10,
        swift_bic = $11,
        aba_routing = $12,
        banco_intermediario_nombre = $13,
        banco_intermediario_swift = $14,
        banco_intermediario_direccion = $15,
        divisa_default = $16,
        motivo_default = $17,
        foto_url = COALESCE($18, foto_url),
        alias = $19,
        is_favorite = COALESCE($20, is_favorite),
        notes = $21,
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        b.nombre_beneficiario, b.nombre_chino || null, b.direccion_beneficiario || null, b.pais_beneficiario || null,
        b.numero_cuenta, b.iban || null,
        b.banco_nombre, b.banco_direccion || null, b.banco_pais || null,
        b.swift_bic || null, b.aba_routing || null,
        b.banco_intermediario_nombre || null, b.banco_intermediario_swift || null, b.banco_intermediario_direccion || null,
        b.divisa_default || null, b.motivo_default || null, b.foto_url || null,
        b.alias || null, b.is_favorite, b.notes || null,
      ]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('[ENTANGLED] updateMySupplier:', err);
    return res.status(500).json({ error: 'Error al actualizar' });
  }
};

export const deleteMySupplier = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const owner = await pool.query(`SELECT user_id FROM entangled_suppliers WHERE id = $1`, [id]);
    if (owner.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    if (owner.rows[0].user_id !== userId) return res.status(403).json({ error: 'Sin acceso' });

    // Soft delete
    await pool.query(
      `UPDATE entangled_suppliers SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[ENTANGLED] deleteMySupplier:', err);
    return res.status(500).json({ error: 'Error al eliminar' });
  }
};

// ===========================================================================
// FLUJO V2: Perfil fiscal, pricing config, cotización, comprobante diferido
// ===========================================================================

export const getMyFiscalProfile = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    const r = await pool.query(
      `SELECT rfc, razon_social, regimen_fiscal, cp, uso_cfdi, email, updated_at
       FROM entangled_fiscal_profiles WHERE user_id = $1`,
      [userId]
    );
    return res.json(r.rows[0] || null);
  } catch (err) {
    console.error('[ENTANGLED] getMyFiscalProfile:', err);
    return res.status(500).json({ error: 'Error al consultar perfil fiscal' });
  }
};

export const upsertMyFiscalProfile = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const b = req.body || {};
  try {
    const r = await pool.query(
      `INSERT INTO entangled_fiscal_profiles (user_id, rfc, razon_social, regimen_fiscal, cp, uso_cfdi, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         rfc = EXCLUDED.rfc,
         razon_social = EXCLUDED.razon_social,
         regimen_fiscal = EXCLUDED.regimen_fiscal,
         cp = EXCLUDED.cp,
         uso_cfdi = EXCLUDED.uso_cfdi,
         email = EXCLUDED.email,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        String(b.rfc || '').toUpperCase() || null,
        b.razon_social || null,
        b.regimen_fiscal || null,
        b.cp ? String(b.cp) : null,
        b.uso_cfdi || null,
        b.email || null,
      ]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('[ENTANGLED] upsertMyFiscalProfile:', err);
    return res.status(500).json({ error: 'Error al guardar perfil fiscal' });
  }
};

export const getPricingConfig = async (_req: Request, res: Response): Promise<any> => {
  try {
    const r = await pool.query(
      `SELECT tipo_cambio_usd, tipo_cambio_rmb, porcentaje_compra, updated_at
       FROM entangled_pricing_config WHERE id = 1`
    );
    return res.json(r.rows[0] || { tipo_cambio_usd: 18.5, tipo_cambio_rmb: 2.85, porcentaje_compra: 6 });
  } catch (err) {
    console.error('[ENTANGLED] getPricingConfig:', err);
    return res.status(500).json({ error: 'Error al consultar pricing' });
  }
};

export const updatePricingConfig = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const role = String((req as any).user?.role || '').toLowerCase();
  if (!['super_admin', 'admin', 'director'].includes(role)) {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  const { tipo_cambio_usd, tipo_cambio_rmb, porcentaje_compra } = req.body || {};
  try {
    const r = await pool.query(
      `UPDATE entangled_pricing_config SET
        tipo_cambio_usd = COALESCE($1, tipo_cambio_usd),
        tipo_cambio_rmb = COALESCE($2, tipo_cambio_rmb),
        porcentaje_compra = COALESCE($3, porcentaje_compra),
        updated_by = $4,
        updated_at = NOW()
       WHERE id = 1 RETURNING *`,
      [
        tipo_cambio_usd !== undefined ? Number(tipo_cambio_usd) : null,
        tipo_cambio_rmb !== undefined ? Number(tipo_cambio_rmb) : null,
        porcentaje_compra !== undefined ? Number(porcentaje_compra) : null,
        userId,
      ]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('[ENTANGLED] updatePricingConfig:', err);
    return res.status(500).json({ error: 'Error al actualizar pricing' });
  }
};

export const quotePayment = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const monto = Number(req.body?.monto ?? req.query?.monto);
  const divisa = String(req.body?.divisa ?? req.query?.divisa ?? '').toUpperCase();
  if (!monto || monto <= 0) return res.status(400).json({ error: 'monto inválido' });
  if (!['USD', 'RMB'].includes(divisa)) return res.status(400).json({ error: 'divisa debe ser USD o RMB' });
  try {
    const q = await computeQuote(monto, divisa);
    return res.json({ monto, divisa, ...q });
  } catch (err) {
    console.error('[ENTANGLED] quotePayment:', err);
    return res.status(500).json({ error: 'Error al cotizar' });
  }
};

export const uploadProofToRequest = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  const url = req.body?.comprobante_cliente_url;
  if (!url) return res.status(400).json({ error: 'Falta comprobante_cliente_url' });
  try {
    const owner = await pool.query(
      `SELECT user_id FROM entangled_payment_requests WHERE id = $1`,
      [id]
    );
    if (owner.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
    if (owner.rows[0].user_id !== userId) return res.status(403).json({ error: 'Sin acceso' });
    const r = await pool.query(
      `UPDATE entangled_payment_requests SET
        op_comprobante_cliente_url = $2,
        comprobante_subido_at = NOW(),
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, url]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('[ENTANGLED] uploadProofToRequest:', err);
    return res.status(500).json({ error: 'Error al guardar comprobante' });
  }
};
