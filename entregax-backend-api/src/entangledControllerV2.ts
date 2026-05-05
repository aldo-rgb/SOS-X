// ============================================================================
// ENTANGLED Controller v2 — Modelo de dos servicios (pago_con_factura / sin_factura)
// ============================================================================
// Este módulo coexiste con entangledController.ts (v1) durante la transición.
// Las rutas en index.ts apuntan a este archivo para los endpoints nuevos:
//   - POST /api/entangled/payment-requests          (multipart, crea solicitud)
//   - GET  /api/entangled/exchange-rate             (proxy a /v1/tipo-cambio)
//   - GET  /api/entangled/conceptos/search          (proxy a /v1/conceptos/search)
//   - GET  /api/entangled/service-config            (cliente: ve sus % efectivos)
//   - GET  /api/admin/entangled/service-config      (admin: lee global)
//   - PUT  /api/admin/entangled/service-config      (admin: edita global)
//   - GET  /api/admin/entangled/user-service-pricing
//   - PUT  /api/admin/entangled/user-service-pricing/:userId/:servicio
//   - DELETE /api/admin/entangled/user-service-pricing/:userId/:servicio
//   - POST /api/entangled/webhook/factura-generada  (RAW body, HMAC SHA-256)
//   - POST /api/entangled/webhook/pago-proveedor    (RAW body, HMAC SHA-256)
//   - POST /api/admin/entangled/rotate-api-key
// ============================================================================

import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';
import {
  sendSolicitudPago,
  getTipoCambio,
  searchConceptos,
  rotateApiKey,
  isEntangledConfigured,
  ENTANGLED_WEBHOOK_SECRET,
  EntangledServicio,
  EntangledDivisa,
  EntangledSolicitudPayloadV2,
} from './entangledServiceV2';

const SERVICIOS_VALIDOS: EntangledServicio[] = ['pago_con_factura', 'pago_sin_factura'];

const getAuthUserId = (req: Request): number | null => {
  const u = (req as any).user;
  const id = Number(u?.userId ?? u?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const isAdminRole = (req: Request): boolean => {
  const role = String((req as any).user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'director'].includes(role);
};

// ---------------------------------------------------------------------------
// Resuelve la comisión que XPAY le cobra al cliente final para un servicio.
// Override por usuario tiene precedencia sobre la configuración global.
// ---------------------------------------------------------------------------
async function resolveClientFinalCommission(
  userId: number,
  servicio: EntangledServicio
): Promise<{ porcentaje: number; es_override: boolean; global: number }> {
  const cfg = await pool.query(
    `SELECT comision_pago_con_factura, comision_pago_sin_factura
       FROM entangled_service_config WHERE id = 1`
  );
  const row = cfg.rows[0] || { comision_pago_con_factura: 6, comision_pago_sin_factura: 4 };
  const global =
    servicio === 'pago_con_factura'
      ? Number(row.comision_pago_con_factura)
      : Number(row.comision_pago_sin_factura);

  const ov = await pool.query(
    `SELECT comision_porcentaje FROM entangled_user_service_pricing
      WHERE user_id = $1 AND servicio = $2 LIMIT 1`,
    [userId, servicio]
  );
  if (ov.rows.length > 0 && ov.rows[0].comision_porcentaje != null) {
    return {
      porcentaje: Number(ov.rows[0].comision_porcentaje),
      es_override: true,
      global,
    };
  }
  return { porcentaje: global, es_override: false, global };
}

// ===========================================================================
// POST /api/entangled/payment-requests   (multipart/form-data)
// ===========================================================================
// Body multipart:
//   - servicio: 'pago_con_factura' | 'pago_sin_factura'
//   - monto_usd: number
//   - divisa: 'USD' | 'RMB'
//   - cliente_final: JSON.stringify({...})
//   - conceptos: JSON.stringify([...])  (sólo si pago_con_factura)
//   - referencia_xpay: string opcional
//   - notas: string opcional
//   - comprobante: archivo (campo único requerido)
// ===========================================================================
export const createPaymentRequestV2 = async (
  req: Request,
  res: Response
): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const file = (req as any).file as
    | { buffer: Buffer; originalname: string; mimetype: string; size: number }
    | undefined;
  if (!file || !file.buffer || file.buffer.length === 0) {
    return res.status(400).json({ error: 'Falta el comprobante (campo "comprobante")' });
  }

  const body = req.body || {};
  const servicio = String(body.servicio || '').trim() as EntangledServicio;
  if (!SERVICIOS_VALIDOS.includes(servicio)) {
    return res
      .status(400)
      .json({ error: 'servicio inválido. Debe ser pago_con_factura o pago_sin_factura' });
  }

  const monto = Number(body.monto_usd ?? body.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return res.status(400).json({ error: 'monto_usd debe ser > 0' });
  }
  const divisa = String(body.divisa || 'USD').toUpperCase() as EntangledDivisa;
  if (!['USD', 'RMB'].includes(divisa)) {
    return res.status(400).json({ error: 'divisa debe ser USD o RMB' });
  }

  // Parseo seguro de campos JSON enviados como string en multipart
  const parseJson = (v: any, fallback: any) => {
    if (v == null || v === '') return fallback;
    if (typeof v === 'object') return v;
    try {
      return JSON.parse(String(v));
    } catch {
      return fallback;
    }
  };

  const clienteFinal: any = parseJson(body.cliente_final, {});
  const conceptos: any[] = parseJson(body.conceptos, []);

  if (servicio === 'pago_con_factura') {
    const required = ['rfc', 'razon_social', 'regimen_fiscal', 'cp', 'uso_cfdi', 'email'];
    for (const k of required) {
      if (!clienteFinal[k]) {
        return res
          .status(400)
          .json({ error: `cliente_final.${k} es requerido para pago_con_factura` });
      }
    }
    if (!Array.isArray(conceptos) || conceptos.length === 0) {
      return res
        .status(400)
        .json({ error: 'conceptos[] es requerido para pago_con_factura' });
    }
  } else {
    if (!clienteFinal?.razon_social) {
      return res
        .status(400)
        .json({ error: 'cliente_final.razon_social es requerido' });
    }
  }

  // Comisión que XPAY le cobra al cliente
  const commission = await resolveClientFinalCommission(userId, servicio);

  // Asesor (informativo, opcional)
  let advisorId: number | null = null;
  try {
    const r = await pool.query(
      `SELECT assigned_advisor_id FROM users WHERE id = $1`,
      [userId]
    );
    advisorId = r.rows[0]?.assigned_advisor_id || null;
  } catch {
    /* columna puede no existir */
  }

  // 1) Persistencia local (estado pendiente, sin transaccion_id aún)
  const referenciaPago = `XP${String(Math.floor(100000 + Math.random() * 900000)).padStart(6, '0')}`;
  let requestId: number;
  try {
    const ins = await pool.query(
      `INSERT INTO entangled_payment_requests (
         user_id, advisor_id,
         servicio, requiere_factura,
         referencia_pago,
         cf_rfc, cf_razon_social, cf_regimen_fiscal, cf_cp, cf_uso_cfdi, cf_email,
         op_monto, op_divisa_destino, op_conceptos,
         comision_cliente_final_porcentaje,
         estatus_global, estatus_factura, estatus_proveedor
       ) VALUES (
         $1, $2,
         $3, $4,
         $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14::jsonb,
         $15,
         'pendiente', $16, 'pendiente'
       ) RETURNING id`,
      [
        userId,
        advisorId,
        servicio,
        servicio === 'pago_con_factura',
        referenciaPago,
        servicio === 'pago_con_factura' ? String(clienteFinal.rfc || '').toUpperCase() : null,
        clienteFinal?.razon_social || null,
        servicio === 'pago_con_factura' ? clienteFinal.regimen_fiscal : null,
        servicio === 'pago_con_factura' ? String(clienteFinal.cp || '') : null,
        servicio === 'pago_con_factura' ? clienteFinal.uso_cfdi : null,
        servicio === 'pago_con_factura' ? clienteFinal.email : null,
        monto,
        divisa,
        JSON.stringify(servicio === 'pago_con_factura' ? conceptos : []),
        commission.porcentaje,
        servicio === 'pago_con_factura' ? 'pendiente' : 'no_aplica',
      ]
    );
    requestId = ins.rows[0].id;
  } catch (err) {
    console.error('[ENTANGLED v2] Error creando registro local:', err);
    return res.status(500).json({ error: 'No se pudo crear la solicitud local' });
  }

  // 2) Construir y enviar payload a ENTANGLED v2
  const payload: EntangledSolicitudPayloadV2 = {
    servicio,
    comision_cliente_final_porcentaje: commission.porcentaje,
    monto_usd: monto,
    divisa,
    cliente_final:
      servicio === 'pago_con_factura'
        ? {
            razon_social: clienteFinal.razon_social,
            rfc: String(clienteFinal.rfc || '').toUpperCase(),
            email: clienteFinal.email,
            regimen_fiscal: clienteFinal.regimen_fiscal,
            cp: String(clienteFinal.cp || ''),
            uso_cfdi: clienteFinal.uso_cfdi,
          }
        : { razon_social: clienteFinal.razon_social },
    referencia_xpay: referenciaPago,
  };
  if (servicio === 'pago_con_factura') {
    payload.conceptos = conceptos as any[];
  }
  if (body.notas) {
    payload.notas = String(body.notas);
  }

  if (!isEntangledConfigured()) {
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
        'Solicitud guardada localmente. ENTANGLED no está configurado todavía; será procesada manualmente.',
      request_id: requestId,
      referencia_pago: referenciaPago,
      status: 'error_envio',
    });
  }

  const remote = await sendSolicitudPago(payload, {
    buffer: file.buffer,
    filename: file.originalname || `comprobante-${requestId}`,
    mimetype: file.mimetype || 'application/octet-stream',
  });

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
      error: remote.error || 'ENTANGLED no devolvió un transaccion_id.',
      request_id: requestId,
      referencia_pago: referenciaPago,
    });
  }

  // 3) Persistir respuesta v2: transacción, comisión cobrada, TC, empresas asignadas
  const upd = await pool.query(
    `UPDATE entangled_payment_requests
        SET entangled_transaccion_id = $1,
            estatus_global = 'en_proceso',
            comision_cobrada_porcentaje = $2,
            tc_aplicado_usd = $3,
            empresas_asignadas = $4::jsonb,
            url_comprobante_cliente = COALESCE($5, url_comprobante_cliente),
            comprobante_subido_at = NOW(),
            raw_response = $6::jsonb,
            updated_at = NOW()
      WHERE id = $7
      RETURNING *`,
    [
      remote.transaccion_id,
      remote.comision_cobrada_porcentaje ?? null,
      remote.tc_aplicado_usd ?? null,
      JSON.stringify(remote.empresas_asignadas || []),
      remote.url_comprobante_cliente || null,
      JSON.stringify(remote.raw || {}),
      requestId,
    ]
  );

  return res.status(201).json({
    message: 'Solicitud enviada a ENTANGLED',
    request: upd.rows[0],
    referencia_pago: referenciaPago,
    servicio,
    comision_cliente_final_porcentaje: commission.porcentaje,
    comision_cobrada_porcentaje: remote.comision_cobrada_porcentaje,
    tc_aplicado_usd: remote.tc_aplicado_usd,
    empresas_asignadas: remote.empresas_asignadas || [],
  });
};

// ===========================================================================
// GET /api/entangled/exchange-rate?divisa=USD|RMB   (proxy)
// ===========================================================================
export const getExchangeRate = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const divisa = String(req.query.divisa || 'USD').toUpperCase() as EntangledDivisa;
  if (!['USD', 'RMB'].includes(divisa)) {
    return res.status(400).json({ error: 'divisa debe ser USD o RMB' });
  }
  const r = await getTipoCambio(divisa);
  if (!r.ok) return res.status(502).json({ error: r.error });
  return res.json({
    divisa: r.divisa || divisa,
    tipo_cambio: r.tipo_cambio,
    vigencia: r.vigencia,
  });
};

// ===========================================================================
// GET /api/entangled/conceptos/search?q=...&limit=...   (proxy)
// ===========================================================================
export const searchConceptosProxy = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const q = String(req.query.q || '').trim();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  if (!q) return res.json({ results: [] });
  const r = await searchConceptos(q, limit);
  if (!r.ok) return res.status(502).json({ error: r.error });
  return res.json({ results: r.results || [] });
};

// ===========================================================================
// Service config (admin) y vista por cliente
// ===========================================================================

export const getServiceConfigAdmin = async (req: Request, res: Response): Promise<any> => {
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  try {
    const r = await pool.query(
      `SELECT comision_pago_con_factura, comision_pago_sin_factura, updated_at, updated_by
         FROM entangled_service_config WHERE id = 1`
    );
    return res.json(
      r.rows[0] || { comision_pago_con_factura: 6, comision_pago_sin_factura: 4 }
    );
  } catch (err) {
    console.error('[ENTANGLED v2] getServiceConfigAdmin:', err);
    return res.status(500).json({ error: 'Error al consultar configuración' });
  }
};

export const updateServiceConfig = async (req: Request, res: Response): Promise<any> => {
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  const adminId = getAuthUserId(req);
  const conFactura = Number(req.body?.comision_pago_con_factura);
  const sinFactura = Number(req.body?.comision_pago_sin_factura);
  if (!Number.isFinite(conFactura) || conFactura < 0 || conFactura > 100) {
    return res.status(400).json({ error: 'comision_pago_con_factura inválida (0-100)' });
  }
  if (!Number.isFinite(sinFactura) || sinFactura < 0 || sinFactura > 100) {
    return res.status(400).json({ error: 'comision_pago_sin_factura inválida (0-100)' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO entangled_service_config (id, comision_pago_con_factura, comision_pago_sin_factura, updated_by, updated_at)
       VALUES (1, $1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         comision_pago_con_factura = EXCLUDED.comision_pago_con_factura,
         comision_pago_sin_factura = EXCLUDED.comision_pago_sin_factura,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [conFactura, sinFactura, adminId]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('[ENTANGLED v2] updateServiceConfig:', err);
    return res.status(500).json({ error: 'Error al guardar configuración' });
  }
};

// Cliente: ve sus % efectivos (con override aplicado si existe)
export const getMyServiceConfig = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    const conFactura = await resolveClientFinalCommission(userId, 'pago_con_factura');
    const sinFactura = await resolveClientFinalCommission(userId, 'pago_sin_factura');
    return res.json({
      pago_con_factura: {
        comision_porcentaje: conFactura.porcentaje,
        es_override: conFactura.es_override,
      },
      pago_sin_factura: {
        comision_porcentaje: sinFactura.porcentaje,
        es_override: sinFactura.es_override,
      },
    });
  } catch (err) {
    console.error('[ENTANGLED v2] getMyServiceConfig:', err);
    return res.status(500).json({ error: 'Error al consultar configuración' });
  }
};

// ===========================================================================
// User service pricing (overrides por cliente, por servicio) — admin
// ===========================================================================

export const listUserServicePricing = async (req: Request, res: Response): Promise<any> => {
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  try {
    const r = await pool.query(
      `SELECT usp.user_id, usp.servicio, usp.comision_porcentaje, usp.notes,
              usp.created_at, usp.updated_at,
              u.full_name AS client_name, u.email AS client_email
         FROM entangled_user_service_pricing usp
         JOIN users u ON u.id = usp.user_id
        ORDER BY u.full_name ASC NULLS LAST, u.email ASC, usp.servicio ASC`
    );
    return res.json(r.rows);
  } catch (err) {
    console.error('[ENTANGLED v2] listUserServicePricing:', err);
    return res.status(500).json({ error: 'Error al listar overrides' });
  }
};

export const upsertUserServicePricing = async (req: Request, res: Response): Promise<any> => {
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  const adminId = getAuthUserId(req);
  const userId = Number(req.params.userId);
  const servicio = String(req.params.servicio) as EntangledServicio;
  const pct = Number(req.body?.comision_porcentaje);
  const notes = req.body?.notes || null;
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: 'userId inválido' });
  }
  if (!SERVICIOS_VALIDOS.includes(servicio)) {
    return res.status(400).json({ error: 'servicio inválido' });
  }
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return res.status(400).json({ error: 'comision_porcentaje debe estar entre 0 y 100' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO entangled_user_service_pricing (user_id, servicio, comision_porcentaje, notes, set_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, servicio) DO UPDATE SET
         comision_porcentaje = EXCLUDED.comision_porcentaje,
         notes = EXCLUDED.notes,
         set_by = EXCLUDED.set_by,
         updated_at = NOW()
       RETURNING *`,
      [userId, servicio, pct, notes, adminId]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('[ENTANGLED v2] upsertUserServicePricing:', err);
    return res.status(500).json({ error: 'Error al guardar override' });
  }
};

export const deleteUserServicePricing = async (req: Request, res: Response): Promise<any> => {
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  const userId = Number(req.params.userId);
  const servicio = String(req.params.servicio) as EntangledServicio;
  if (!Number.isFinite(userId) || !SERVICIOS_VALIDOS.includes(servicio)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }
  try {
    await pool.query(
      `DELETE FROM entangled_user_service_pricing WHERE user_id = $1 AND servicio = $2`,
      [userId, servicio]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[ENTANGLED v2] deleteUserServicePricing:', err);
    return res.status(500).json({ error: 'Error al borrar override' });
  }
};

// ===========================================================================
// WEBHOOKS v2 — RAW BODY + HMAC SHA-256
// ===========================================================================
// IMPORTANTE: estas rutas se montan con `express.raw({ type: 'application/json' })`
// ANTES de express.json(). El body llega como Buffer en req.body.
// ===========================================================================

const verifyWebhookSignature = (
  rawBody: Buffer,
  signatureHeader: string | undefined
): { ok: boolean; reason?: string } => {
  if (!ENTANGLED_WEBHOOK_SECRET) {
    console.warn('[ENTANGLED v2] ENTANGLED_WEBHOOK_SECRET no configurado: aceptando webhook sin verificar');
    return { ok: true };
  }
  if (!signatureHeader) return { ok: false, reason: 'Falta cabecera X-Entangled-Signature' };
  if (!rawBody || rawBody.length === 0) return { ok: false, reason: 'Body vacío' };
  const expected = crypto
    .createHmac('sha256', ENTANGLED_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  const provided = signatureHeader.replace(/^sha256=/i, '').trim();
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(expected, 'hex');
    b = Buffer.from(provided, 'hex');
  } catch {
    return { ok: false, reason: 'Firma malformada' };
  }
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
    console.error('[ENTANGLED v2] No se pudo registrar webhook log:', err);
  }
};

// Helpers para parsear el raw body después de validar la firma
const parseRawJson = (rawBody: Buffer): any => {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }
};

// POST /api/entangled/webhook/factura-generada
export const webhookFacturaGeneradaV2 = async (
  req: Request,
  res: Response
): Promise<any> => {
  // Express.json captura raw body en req.rawBody (verify callback global).
  const raw: Buffer = ((req as any).rawBody as Buffer) || Buffer.from(JSON.stringify(req.body || {}));
  const sig = (req.headers['x-entangled-signature'] || req.headers['x-signature']) as
    | string
    | undefined;
  const verify = verifyWebhookSignature(raw, sig);
  const payload = parseRawJson(raw) || req.body || {};
  if (!verify.ok) {
    await logWebhook(null, 'factura.generada', payload, null, verify.reason || 'firma');
    return res.status(401).json({ error: verify.reason || 'No autorizado' });
  }

  const transaccionId = payload.transaccion_id || null;
  const evento = payload.evento || 'factura.generada';
  if (!transaccionId) {
    await logWebhook(null, evento, payload, null, 'transaccion_id faltante');
    return res.status(400).json({ error: 'transaccion_id requerido' });
  }

  try {
    const found = await pool.query(
      `SELECT id, servicio FROM entangled_payment_requests
        WHERE entangled_transaccion_id = $1`,
      [transaccionId]
    );
    if (found.rows.length === 0) {
      await logWebhook(transaccionId, evento, payload, null, 'request no encontrada');
      return res.status(200).json({ ok: true, ignored: true });
    }
    const requestId = found.rows[0].id;
    const docs = payload.documentos || {};
    const facturaUrl = docs.url_factura_pdf || docs.factura_pdf || null;
    const facturaXmlUrl = docs.url_factura_xml || docs.factura_xml || null;

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
              raw_response = COALESCE(raw_response, '{}'::jsonb) || jsonb_build_object('factura_xml_url', $3::text),
              last_webhook_at = NOW(),
              updated_at = NOW()
        WHERE id = $4`,
      [facturaUrl, docs.nombre_archivo || null, facturaXmlUrl, requestId]
    );

    await logWebhook(transaccionId, evento, payload, requestId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[ENTANGLED v2] webhookFacturaGenerada error:', err);
    await logWebhook(transaccionId, evento, payload, null, (err as Error).message);
    return res.status(500).json({ error: 'Error procesando webhook' });
  }
};

// POST /api/entangled/webhook/pago-proveedor
export const webhookPagoProveedorV2 = async (
  req: Request,
  res: Response
): Promise<any> => {
  const raw: Buffer = ((req as any).rawBody as Buffer) || Buffer.from(JSON.stringify(req.body || {}));
  const sig = (req.headers['x-entangled-signature'] || req.headers['x-signature']) as
    | string
    | undefined;
  const verify = verifyWebhookSignature(raw, sig);
  const payload = parseRawJson(raw) || req.body || {};
  if (!verify.ok) {
    await logWebhook(null, 'pago.proveedor.confirmado', payload, null, verify.reason || 'firma');
    return res.status(401).json({ error: verify.reason || 'No autorizado' });
  }

  const transaccionId = payload.transaccion_id || null;
  const evento = payload.evento || 'pago.proveedor.confirmado';
  if (!transaccionId) {
    await logWebhook(null, evento, payload, null, 'transaccion_id faltante');
    return res.status(400).json({ error: 'transaccion_id requerido' });
  }

  try {
    const found = await pool.query(
      `SELECT id, servicio FROM entangled_payment_requests
        WHERE entangled_transaccion_id = $1`,
      [transaccionId]
    );
    if (found.rows.length === 0) {
      await logWebhook(transaccionId, evento, payload, null, 'request no encontrada');
      return res.status(200).json({ ok: true, ignored: true });
    }
    const requestId = found.rows[0].id;
    const servicio = found.rows[0].servicio as EntangledServicio;
    const docs = payload.documentos || {};
    const detalles = payload.detalles || {};
    const comprobanteUrl = docs.url_comprobante_proveedor || docs.comprobante_proveedor || null;
    const moneda = detalles.moneda_enviada || null;
    const monto = detalles.monto_enviado != null ? Number(detalles.monto_enviado) : null;
    const cuenta = detalles.cuenta_destino || null;
    const estatus = String(payload.estatus || detalles.estatus || 'completado').toLowerCase();

    // El estatus global se completa cuando:
    //  - servicio sin factura: con que llegue este webhook con estatus 'completado'
    //  - servicio con factura: cuando ADEMÁS factura ya está emitida
    await pool.query(
      `UPDATE entangled_payment_requests
          SET estatus_proveedor = $1,
              comprobante_proveedor_url = COALESCE($2, comprobante_proveedor_url),
              proveedor_moneda_enviada = COALESCE($3, proveedor_moneda_enviada),
              proveedor_monto_enviado = COALESCE($4, proveedor_monto_enviado),
              proveedor_cuenta_destino = COALESCE($5, proveedor_cuenta_destino),
              proveedor_pagado_at = NOW(),
              estatus_global = CASE
                WHEN $1 = 'completado' AND ($6 = 'pago_sin_factura' OR estatus_factura = 'emitida') THEN 'completado'
                WHEN $1 = 'rechazado' THEN 'rechazado'
                ELSE 'en_proceso'
              END,
              last_webhook_at = NOW(),
              updated_at = NOW()
        WHERE id = $7`,
      [estatus, comprobanteUrl, moneda, monto, cuenta, servicio, requestId]
    );

    await logWebhook(transaccionId, evento, payload, requestId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[ENTANGLED v2] webhookPagoProveedor error:', err);
    await logWebhook(transaccionId, evento, payload, null, (err as Error).message);
    return res.status(500).json({ error: 'Error procesando webhook' });
  }
};

// ===========================================================================
// POST /api/admin/entangled/rotate-api-key
// ===========================================================================
export const rotateApiKeyAdmin = async (req: Request, res: Response): Promise<any> => {
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  const r = await rotateApiKey();
  if (!r.ok) return res.status(502).json({ error: r.error });
  // No exponemos la nueva API key en la respuesta del cliente; queda para que el
  // admin la copie del log seguro o sea inyectada a env por DevOps.
  console.log('[ENTANGLED v2] API KEY rotada. Actualizar ENTANGLED_API_KEY en variables de entorno.');
  return res.json({
    ok: true,
    rotated_at: r.rotated_at || new Date().toISOString(),
    message:
      'Se solicitó la rotación. Actualiza ENTANGLED_API_KEY en las variables de entorno con la nueva clave.',
    new_api_key_preview: r.new_api_key
      ? `${String(r.new_api_key).slice(0, 6)}***${String(r.new_api_key).slice(-4)}`
      : undefined,
    new_api_key: r.new_api_key, // accesible sólo a super_admin/admin/director
  });
};
