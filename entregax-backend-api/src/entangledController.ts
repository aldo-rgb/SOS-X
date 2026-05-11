// ============================================================================
// ENTANGLED Controller - Integración del motor externo de triangulación.
// ============================================================================
// Mantiene aislada toda la lógica para no afectar el módulo legacy
// supplier_payments. Tabla principal: entangled_payment_requests.
// ============================================================================

import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';
import { getSignedUrlForKey, extractKeyFromUrl } from './s3Service';

// Firma URLs de S3 (comprobantes/facturas) para que el navegador no reciba
// AccessDenied al hacer GET directo. URLs de otros hosts se devuelven tal cual.
const signS3UrlIfPossible = async (url: string | null | undefined): Promise<string | null> => {
  if (!url) return null;
  try {
    const key = extractKeyFromUrl(url);
    if (!key) return url;
    return await getSignedUrlForKey(key, 3600);
  } catch {
    return url;
  }
};

const signRowFileUrls = async <T extends Record<string, any>>(row: T): Promise<T> => {
  const next: any = { ...row };
  if (next.op_comprobante_cliente_url) next.op_comprobante_cliente_url = await signS3UrlIfPossible(next.op_comprobante_cliente_url);
  if (next.comprobante_proveedor_url) next.comprobante_proveedor_url = await signS3UrlIfPossible(next.comprobante_proveedor_url);
  if (next.factura_url) next.factura_url = await signS3UrlIfPossible(next.factura_url);
  if (next.factura_xml_url) next.factura_xml_url = await signS3UrlIfPossible(next.factura_xml_url);
  return next as T;
};
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
// Helper: cotización aplicando pricing del proveedor seleccionado
// ---------------------------------------------------------------------------
const computeQuote = async (
  monto: number,
  divisa: string,
  userId?: number,
  providerId?: number | null
): Promise<{
  provider_id: number | null;
  provider_name: string | null;
  tipo_cambio: number;
  porcentaje_compra: number;
  costo_operacion_usd: number;
  porcentaje_es_override: boolean;
  monto_mxn_base: number;
  monto_mxn_comision: number;
  monto_mxn_total: number;
  comision_xox: number;
  comision_entregax: number;
  comision_asesor: number;
  comision_over_asesor: number;
  comision_over_entregax: number;
}> => {
  // 1) Resolver proveedor: el indicado, o el default activo, o el primero activo
  let provider: any = null;
  if (providerId) {
    const r = await pool.query(
      `SELECT id, name,
              tipo_cambio_usd, tipo_cambio_rmb, porcentaje_compra, costo_operacion_usd,
              override_tipo_cambio_usd, override_tipo_cambio_rmb, override_porcentaje_compra, override_costo_operacion_usd,
              COALESCE(asesor_pct, 0) AS asesor_pct, COALESCE(over_pct, 0) AS over_pct, COALESCE(over_split_asesor, 90) AS over_split_asesor
       FROM entangled_providers WHERE id = $1 AND is_active = true`,
      [providerId]
    );
    provider = r.rows[0] || null;
  }
  if (!provider) {
    const r = await pool.query(
      `SELECT id, name,
              tipo_cambio_usd, tipo_cambio_rmb, porcentaje_compra, costo_operacion_usd,
              override_tipo_cambio_usd, override_tipo_cambio_rmb, override_porcentaje_compra, override_costo_operacion_usd,
              COALESCE(asesor_pct, 0) AS asesor_pct, COALESCE(over_pct, 0) AS over_pct, COALESCE(over_split_asesor, 90) AS over_split_asesor
       FROM entangled_providers
       WHERE is_active = true
       ORDER BY is_default DESC, sort_order ASC, id ASC LIMIT 1`
    );
    provider = r.rows[0] || null;
  }

  // 2) Aplicar override del proveedor SUMANDO al valor del API (delta).
  //    NULL o 0 = sin incremento. Ej: API TC USD = 18.50, override = 1 → efectivo 19.50.
  const tcUsd = provider
    ? Number(provider.tipo_cambio_usd) + Number(provider.override_tipo_cambio_usd ?? 0)
    : 18.5;
  const tcRmb = provider
    ? Number(provider.tipo_cambio_rmb) + Number(provider.override_tipo_cambio_rmb ?? 0)
    : 2.85;
  const pctBase = provider
    ? Number(provider.porcentaje_compra) + Number(provider.override_porcentaje_compra ?? 0)
    : 6;
  const costoOpBase = provider
    ? Number(provider.costo_operacion_usd || 0) + Number(provider.override_costo_operacion_usd ?? 0)
    : 0;
  const div = String(divisa).toUpperCase();
  let tc = div === 'RMB' ? tcRmb : tcUsd;

  // 3) Override por usuario — el porcentaje_compra del usuario es ADICIONAL al base
  //    (se suma, no reemplaza). Ese extra se reparte según over_split_asesor.
  //    El TC por usuario sí puede sobreescribir.
  let pct = pctBase;
  let userOverridePct = 0;  // extra % asignado específicamente a este usuario
  let isOverride = false;
  if (userId) {
    try {
      const ov = await pool.query(
        `SELECT porcentaje_compra, tipo_cambio_usd, tipo_cambio_rmb, provider_id
         FROM entangled_user_pricing
         WHERE user_id = $1 AND (provider_id = $2 OR provider_id IS NULL)
         ORDER BY provider_id NULLS LAST LIMIT 1`,
        [userId, provider?.id || null]
      );
      if (ov.rows.length > 0) {
        const row = ov.rows[0];
        if (row.porcentaje_compra != null) {
          userOverridePct = Number(row.porcentaje_compra);
          pct = pctBase + userOverridePct;   // SUMATIVO: base + extra del usuario
          isOverride = true;
        }
        const ovTc = div === 'RMB' ? row.tipo_cambio_rmb : row.tipo_cambio_usd;
        if (ovTc != null) {
          tc = Number(ovTc);
          isOverride = true;
        }
      }
    } catch { /* tabla puede no existir aún en envs viejos */ }
  }

  // Convertir costo de operación USD a MXN usando el TC
  const costoOpMxn = costoOpBase * tc;

  const base = Number(monto) * tc;

  // Desglose de comisiones
  const xoxPct        = provider ? Number(provider.porcentaje_compra) : 6;
  const entregaxPct   = provider ? Number(provider.override_porcentaje_compra ?? 0) : 0;
  const asesorPct     = provider ? Number(provider.asesor_pct ?? 0) : 0;
  const overPct       = provider ? Number(provider.over_pct ?? 0) : 0;
  const overSplitAsesor   = provider ? Number(provider.over_split_asesor ?? 90) : 90;
  const overSplitEntregax = 100 - overSplitAsesor;

  const comisionXox      = Number((base * xoxPct / 100).toFixed(2));
  const comisionEntregax = Number((base * entregaxPct / 100).toFixed(2));
  const comisionAsesorBase = Number((base * asesorPct / 100).toFixed(2));

  // Override global del proveedor + override personal del usuario — ambos se dividen igual
  const totalOverPct    = overPct + userOverridePct;
  const comisionOverTotal   = Number((base * totalOverPct / 100).toFixed(2));
  const comisionOverAsesor  = Number((comisionOverTotal * overSplitAsesor / 100).toFixed(2));
  const comisionOverEntregax = Number((comisionOverTotal * overSplitEntregax / 100).toFixed(2));

  // El % total cobrado al cliente incluye todos los componentes
  const totalPct = pct + asesorPct + overPct;  // pct ya = xoxPct + entregaxPct (con override usuario)
  const comision = base * (asesorPct + overPct) / 100 + base * (pct / 100);
  const total = base + comision + costoOpMxn;

  return {
    provider_id: provider?.id || null,
    provider_name: provider?.name || null,
    tipo_cambio: tc,
    porcentaje_compra: totalPct,
    costo_operacion_usd: costoOpBase,
    porcentaje_es_override: isOverride,
    monto_mxn_base: Number(base.toFixed(2)),
    monto_mxn_comision: Number(comision.toFixed(2)),
    monto_mxn_total: Number(total.toFixed(2)),
    comision_xox: comisionXox,
    comision_entregax: comisionEntregax,
    comision_asesor: Number((comisionAsesorBase + comisionOverAsesor).toFixed(2)),
    comision_over_asesor: comisionOverAsesor,
    comision_over_entregax: comisionOverEntregax,
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
  const providerIdRaw = (req.body as any).provider_id;
  const providerId = providerIdRaw ? Number(providerIdRaw) : null;

  // Calcular cotización con TC + porcentaje del proveedor seleccionado
  const quote = await computeQuote(Number(operacion.montos), operacion.divisa_destino, userId, providerId);
  if (!quote.provider_id) {
    return res.status(400).json({ error: 'No hay proveedor ENTANGLED activo configurado' });
  }

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

  // Comisiones calculadas automáticamente desde la configuración del proveedor
  const comisionAsesor      = quote.comision_asesor;
  const comisionXox         = quote.comision_xox;
  const comisionEntregax    = quote.comision_entregax;
  const comisionOverAsesor  = quote.comision_over_asesor;
  const comisionOverEntregax = quote.comision_over_entregax;

  // 1. Crear el registro local primero (estado pendiente, sin transaccion_id)
  let requestId: number;
  let referenciaPago: string;
  try {
    const insertResult = await pool.query(
      `INSERT INTO entangled_payment_requests (
         user_id, advisor_id,
         provider_id,
         requiere_factura,
         referencia_pago,
         cf_rfc, cf_razon_social, cf_regimen_fiscal, cf_cp, cf_uso_cfdi, cf_email,
         op_monto, op_divisa_destino, op_conceptos, op_comprobante_cliente_url,
         tipo_cambio_aplicado, porcentaje_compra_aplicado, monto_mxn_base, monto_mxn_total,
         comision_asesor, comision_xox, comision_entregax, comision_over_asesor, comision_over_entregax,
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
         $4,
         $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14::jsonb, NULL,
         $15, $16, $17, $18,
         $19, $20, $21, $22, $23,
         'pendiente', $24, 'pendiente',
         $25,
         $26, $27, $28,
         $29, $30,
         $31, $32,
         $33, $34,
         $35, $36,
         $37, $38
       ) RETURNING id, referencia_pago`,
      [
        userId,
        advisorId,
        quote.provider_id,
        requiereFactura,
        `XP${String(Math.floor(100000 + Math.random() * 900000)).padStart(6, '0')}`,
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
        comisionEntregax,
        comisionOverAsesor,
        comisionOverEntregax,
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
    referenciaPago = insertResult.rows[0].referencia_pago;
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
      comision_entregax: comisionEntregax,
      comision_over_asesor: comisionOverAsesor,
      comision_over_entregax: comisionOverEntregax,
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
      referencia_pago: referenciaPago,
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
      referencia_pago: referenciaPago,
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
    referencia_pago: referenciaPago,
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
    // Auto-cancelación: solicitudes sin completar en 24h
    // Se marca cargo de cancelación configurable por proveedor (fallback 1 USD) en raw_response.
    await pool.query(
      `UPDATE entangled_payment_requests epr
       SET estatus_global = 'cancelado',
           estatus_factura = CASE WHEN estatus_factura IN ('completado', 'emitida', 'enviado') THEN estatus_factura ELSE 'cancelado' END,
           estatus_proveedor = CASE WHEN estatus_proveedor IN ('completado', 'emitida', 'enviado') THEN estatus_proveedor ELSE 'cancelado' END,
           raw_response = jsonb_set(
             jsonb_set(COALESCE(raw_response, '{}'::jsonb), '{auto_cancelled}', 'true'::jsonb),
             '{cancellation_fee_usd}',
             to_jsonb(COALESCE(
               (SELECT ep.cancellation_fee_usd FROM entangled_providers ep WHERE ep.id = epr.provider_id),
               1
             )::numeric)
           ),
           updated_at = NOW()
       WHERE user_id = $1
         AND estatus_global IN ('pendiente', 'en_proceso', 'error_envio')
         AND created_at <= (NOW() - INTERVAL '24 hours')`,
      [userId]
    );

    const r = await pool.query(
      `SELECT id,
              COALESCE(referencia_pago, 'XP' || LPAD(id::text, 6, '0')) AS referencia_pago,
              entangled_transaccion_id,
              cf_rfc, cf_razon_social, cf_email,
              op_monto, op_divisa_destino,
              estatus_global, estatus_factura, estatus_proveedor,
              factura_url, factura_emitida_at,
              (raw_response->>'factura_xml_url') AS factura_xml_url,
              comprobante_proveedor_url, proveedor_pagado_at,
              op_comprobante_cliente_url,
              comprobante_subido_at,
              -- snapshot de instrucciones de pago: lo necesita el cliente
              -- móvil para regenerar el PDF de instrucciones de cualquier
              -- solicitud anterior sin tener que volver a llamar al
              -- proveedor.
              instructions_snapshot,
              created_at, updated_at,
              (created_at + INTERVAL '24 hours') AS payment_deadline_at,
              CASE
                WHEN estatus_global = 'cancelado' THEN COALESCE(
                  (raw_response->>'cancellation_fee_usd')::numeric,
                  (SELECT ep.cancellation_fee_usd FROM entangled_providers ep WHERE ep.id = entangled_payment_requests.provider_id),
                  1
                )
                ELSE 0
              END AS cancellation_fee_usd
       FROM entangled_payment_requests
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [userId]
    );
    const signed = await Promise.all(r.rows.map(signRowFileUrls));
    return res.json(signed);
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
    // Expone factura_xml_url al top-level (vive dentro de raw_response).
    if (row.raw_response && typeof row.raw_response === 'object' && row.raw_response.factura_xml_url) {
      row.factura_xml_url = row.raw_response.factura_xml_url;
    }
    const signed = await signRowFileUrls(row);
    return res.json(signed);
  } catch (err) {
    console.error('[ENTANGLED] getPaymentRequestDetail:', err);
    return res.status(500).json({ error: 'Error al obtener detalle' });
  }
};

export const getAllPaymentRequests = async (req: Request, res: Response): Promise<any> => {
  const status = (req.query.status as string) || 'all';
  try {
    // Auto-cancelación global de solicitudes vencidas
    await pool.query(
      `UPDATE entangled_payment_requests epr
       SET estatus_global = 'cancelado',
           estatus_factura = CASE WHEN estatus_factura IN ('completado', 'emitida', 'enviado') THEN estatus_factura ELSE 'cancelado' END,
           estatus_proveedor = CASE WHEN estatus_proveedor IN ('completado', 'emitida', 'enviado') THEN estatus_proveedor ELSE 'cancelado' END,
           raw_response = jsonb_set(
             jsonb_set(COALESCE(raw_response, '{}'::jsonb), '{auto_cancelled}', 'true'::jsonb),
             '{cancellation_fee_usd}',
             to_jsonb(COALESCE(
               (SELECT ep.cancellation_fee_usd FROM entangled_providers ep WHERE ep.id = epr.provider_id),
               1
             )::numeric)
           ),
           updated_at = NOW()
       WHERE estatus_global IN ('pendiente', 'en_proceso', 'error_envio')
         AND created_at <= (NOW() - INTERVAL '24 hours')`
    );

    const params: any[] = [];
    let where = '';
    if (status && status !== 'all') {
      params.push(status);
      where = `WHERE r.estatus_global = $${params.length}`;
    }
    const q = `
      SELECT r.*,
              (r.created_at + INTERVAL '24 hours') AS payment_deadline_at,
              CASE
                WHEN r.estatus_global = 'completado'
                  THEN GREATEST(
                    COALESCE(r.factura_emitida_at, r.proveedor_pagado_at, r.updated_at),
                    COALESCE(r.proveedor_pagado_at, r.factura_emitida_at, r.updated_at)
                  )
                ELSE NULL
              END AS completed_at,
              CASE
                WHEN r.estatus_global = 'completado' AND r.comprobante_subido_at IS NOT NULL
                  THEN EXTRACT(EPOCH FROM (
                    GREATEST(
                      COALESCE(r.factura_emitida_at, r.proveedor_pagado_at, r.updated_at),
                      COALESCE(r.proveedor_pagado_at, r.factura_emitida_at, r.updated_at)
                    ) - r.comprobante_subido_at
                  ))::bigint
                ELSE NULL
              END AS time_to_complete_seconds,
              CASE
           WHEN r.estatus_global = 'cancelado' THEN COALESCE(
             (r.raw_response->>'cancellation_fee_usd')::numeric,
             (SELECT ep.cancellation_fee_usd FROM entangled_providers ep WHERE ep.id = r.provider_id),
             1
           )
           ELSE 0
              END AS cancellation_fee_usd,
             u.full_name AS client_name, u.email AS client_email,
             u.box_id AS client_box_id,
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

  // Normalizadores
  const normCuenta = (v: any) => String(v || '').replace(/\s+/g, '').toUpperCase();
  const normNombre = (v: any) => String(v || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const cuentaIn = normCuenta(b.numero_cuenta);
  const nombreIn = normNombre(b.nombre_beneficiario);
  const nombreChinoIn = normNombre(b.nombre_chino);

  try {
    // 1. Buscar si ya existe la cuenta en CUALQUIER usuario
    const existing = await pool.query(
      `SELECT id, user_id, nombre_beneficiario, nombre_chino, numero_cuenta, banco_nombre, alias, is_active
         FROM entangled_suppliers
        WHERE UPPER(REPLACE(numero_cuenta, ' ', '')) = $1
        ORDER BY id ASC
        LIMIT 1`,
      [cuentaIn]
    );

    if (existing.rows.length > 0) {
      const ex = existing.rows[0];
      const exNombre = normNombre(ex.nombre_beneficiario);
      const exNombreChino = normNombre(ex.nombre_chino);
      const nombreCoincide =
        (!!nombreIn && (nombreIn === exNombre || nombreIn === exNombreChino)) ||
        (!!nombreChinoIn && (nombreChinoIn === exNombre || nombreChinoIn === exNombreChino));

      if (!nombreCoincide) {
        return res.status(409).json({
          error: 'CUENTA_REGISTRADA_NOMBRE_DISTINTO',
          message:
            'Esta cuenta bancaria ya está registrada con otro beneficiario. Por favor contacta a tu asesor para validar el alta.',
          existing_holder_hint: ex.nombre_beneficiario
            ? `${String(ex.nombre_beneficiario).slice(0, 1)}***`
            : null,
        });
      }

      // Mismo número y mismo nombre → si el mismo usuario ya lo tiene, devolverlo (puede usar otro alias actualizándolo)
      if (ex.user_id === userId) {
        // Si está inactivo, lo reactivamos y actualizamos alias/datos del cliente
        const upd = await pool.query(
          `UPDATE entangled_suppliers SET
             alias = COALESCE($2, alias),
             is_active = TRUE,
             is_favorite = COALESCE($3, is_favorite),
             notes = COALESCE($4, notes),
             updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [ex.id, b.alias || null, b.is_favorite, b.notes || null]
        );
        return res.status(200).json({ ...upd.rows[0], _reused: true });
      }

      // Otro usuario ya lo registró con el mismo nombre → creamos una entrada nueva para ESTE usuario
      // (cada usuario tiene su propio alias y favorito) pero apuntando a la misma cuenta.
      // Continuamos al INSERT normal abajo.
    }

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
// ADMIN: Base de datos global de proveedores agregada por número de cuenta
// ===========================================================================

export const adminListSuppliersAggregated = async (req: Request, res: Response): Promise<any> => {
  const search = String(req.query.q || '').trim();
  try {
    const params: any[] = [];
    let where = '';
    if (search) {
      params.push(`%${search.toUpperCase()}%`);
      where = `WHERE (
        UPPER(s.numero_cuenta) LIKE $1 OR
        UPPER(s.nombre_beneficiario) LIKE $1 OR
        UPPER(COALESCE(s.nombre_chino,'')) LIKE $1 OR
        UPPER(s.banco_nombre) LIKE $1 OR
        UPPER(COALESCE(s.alias,'')) LIKE $1
      )`;
    }
    // Agregamos por número de cuenta normalizado.
    // Las stats (operaciones / total enviado) se calculan desde entangled_payment_requests
    // matcheando por sup_numero_cuenta normalizado y considerando solo operaciones
    // efectivamente pagadas al proveedor.
    const q = `
      WITH normalized AS (
        SELECT
          s.*,
          UPPER(REPLACE(s.numero_cuenta, ' ', '')) AS cuenta_norm
        FROM entangled_suppliers s
        ${where}
      ),
      stats AS (
        SELECT
          UPPER(REPLACE(epr.sup_numero_cuenta, ' ', '')) AS cuenta_norm,
          COUNT(*) FILTER (WHERE LOWER(epr.estatus_proveedor) IN ('completado','enviado','emitida'))::int AS ops_completadas,
          COUNT(*)::int AS ops_total,
          COALESCE(SUM(CASE WHEN LOWER(epr.estatus_proveedor) IN ('completado','enviado','emitida')
                            THEN epr.op_monto ELSE 0 END), 0)::numeric AS total_enviado,
          MAX(epr.created_at) AS ultima_operacion_at
        FROM entangled_payment_requests epr
        WHERE epr.sup_numero_cuenta IS NOT NULL
        GROUP BY UPPER(REPLACE(epr.sup_numero_cuenta, ' ', ''))
      ),
      agg AS (
        SELECT
          n.cuenta_norm,
          MIN(n.id) AS id_principal,
          (ARRAY_AGG(n.nombre_beneficiario ORDER BY n.id ASC))[1] AS nombre_beneficiario,
          (ARRAY_AGG(n.nombre_chino ORDER BY n.id ASC))[1] AS nombre_chino,
          (ARRAY_AGG(n.numero_cuenta ORDER BY n.id ASC))[1] AS numero_cuenta,
          (ARRAY_AGG(n.banco_nombre ORDER BY n.id ASC))[1] AS banco_nombre,
          (ARRAY_AGG(n.banco_pais ORDER BY n.id ASC))[1] AS banco_pais,
          (ARRAY_AGG(n.swift_bic ORDER BY n.id ASC))[1] AS swift_bic,
          (ARRAY_AGG(n.divisa_default ORDER BY n.id ASC))[1] AS divisa_default,
          COUNT(DISTINCT n.user_id)::int AS clientes_count,
          BOOL_OR(n.is_active) AS is_active,
          MIN(n.created_at) AS first_registered_at,
          ARRAY_AGG(DISTINCT n.alias) FILTER (WHERE n.alias IS NOT NULL AND n.alias <> '') AS aliases
        FROM normalized n
        GROUP BY n.cuenta_norm
      )
      SELECT
        a.*,
        COALESCE(st.ops_completadas, 0) AS ops_completadas,
        COALESCE(st.ops_total, 0) AS ops_total,
        COALESCE(st.total_enviado, 0) AS total_enviado,
        st.ultima_operacion_at
      FROM agg a
      LEFT JOIN stats st ON st.cuenta_norm = a.cuenta_norm
      ORDER BY COALESCE(st.total_enviado, 0) DESC, a.first_registered_at DESC
      LIMIT 500
    `;
    const r = await pool.query(q, params);
    return res.json(r.rows);
  } catch (err) {
    console.error('[ENTANGLED] adminListSuppliersAggregated:', err);
    return res.status(500).json({ error: 'Error al listar proveedores' });
  }
};

// ADMIN: detalle de un proveedor (cuenta) — clientes que lo tienen + operaciones
export const adminGetSupplierDetail = async (req: Request, res: Response): Promise<any> => {
  const cuenta = String(req.params.cuenta || '').trim();
  if (!cuenta) return res.status(400).json({ error: 'Cuenta requerida' });
  const cuentaNorm = cuenta.replace(/\s+/g, '').toUpperCase();
  try {
    const clientes = await pool.query(
      `SELECT s.id, s.user_id, s.alias, s.nombre_beneficiario, s.nombre_chino,
              s.numero_cuenta, s.banco_nombre, s.is_active, s.created_at,
              u.full_name AS client_name, u.email AS client_email, u.box_id
         FROM entangled_suppliers s
         LEFT JOIN users u ON u.id = s.user_id
        WHERE UPPER(REPLACE(s.numero_cuenta, ' ', '')) = $1
        ORDER BY s.created_at ASC`,
      [cuentaNorm]
    );
    const operaciones = await pool.query(
      `SELECT epr.id, epr.referencia_pago, epr.user_id, u.full_name AS client_name,
              epr.op_monto, epr.op_divisa_destino,
              epr.estatus_global, epr.estatus_factura, epr.estatus_proveedor,
              epr.created_at, epr.proveedor_pagado_at
         FROM entangled_payment_requests epr
         LEFT JOIN users u ON u.id = epr.user_id
        WHERE UPPER(REPLACE(epr.sup_numero_cuenta, ' ', '')) = $1
        ORDER BY epr.created_at DESC
        LIMIT 200`,
      [cuentaNorm]
    );
    return res.json({
      cuenta_norm: cuentaNorm,
      clientes: clientes.rows,
      operaciones: operaciones.rows,
    });
  } catch (err) {
    console.error('[ENTANGLED] adminGetSupplierDetail:', err);
    return res.status(500).json({ error: 'Error al obtener detalle' });
  }
};

// ===========================================================================
// FLUJO V2: Perfil fiscal, pricing config, cotización, comprobante diferido
// ===========================================================================

export const getMyFiscalProfile = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    // 1) Perfil ENTANGLED (si existe)
    const r = await pool.query(
      `SELECT rfc, razon_social, regimen_fiscal, cp, uso_cfdi, email, updated_at
       FROM entangled_fiscal_profiles WHERE user_id = $1`,
      [userId]
    );
    if (r.rows[0]) return res.json(r.rows[0]);

    // 2) Fallback: datos fiscales generales del usuario (tabla users)
    const u = await pool.query(
      `SELECT fiscal_rfc, fiscal_razon_social, fiscal_regimen_fiscal,
              fiscal_codigo_postal, fiscal_uso_cfdi, email
       FROM users WHERE id = $1`,
      [userId]
    );
    const row = u.rows[0];
    if (row && (row.fiscal_rfc || row.fiscal_razon_social)) {
      return res.json({
        rfc: row.fiscal_rfc || '',
        razon_social: row.fiscal_razon_social || '',
        regimen_fiscal: row.fiscal_regimen_fiscal || '601',
        cp: row.fiscal_codigo_postal || '',
        uso_cfdi: row.fiscal_uso_cfdi || 'G03',
        email: row.email || '',
        updated_at: null,
        _source: 'user_profile',
      });
    }
    return res.json(null);
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
  // DEPRECATED: ahora pricing es por proveedor. Devolvemos el provider default.
  try {
    const r = await pool.query(
      `SELECT tipo_cambio_usd, tipo_cambio_rmb, porcentaje_compra, updated_at
       FROM entangled_providers WHERE is_active = true
       ORDER BY is_default DESC, sort_order ASC, id ASC LIMIT 1`
    );
    return res.json(r.rows[0] || { tipo_cambio_usd: 18.5, tipo_cambio_rmb: 2.85, porcentaje_compra: 6 });
  } catch (err) {
    console.error('[ENTANGLED] getPricingConfig:', err);
    return res.status(500).json({ error: 'Error al consultar pricing' });
  }
};

export const updatePricingConfig = async (_req: Request, res: Response): Promise<any> => {
  // DEPRECATED — ahora se usa CRUD de providers
  return res.status(410).json({ error: 'Endpoint deprecado. Usa /api/admin/entangled/providers' });
};

// ===========================================================================
// Providers ENTANGLED — CRUD admin
// ===========================================================================

const isAdminRole = (req: Request) => {
  const role = String((req as any).user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'director'].includes(role);
};

export const listProviders = async (_req: Request, res: Response): Promise<any> => {
  try {
    const r = await pool.query(
      `SELECT *,
        (tipo_cambio_usd   + COALESCE(override_tipo_cambio_usd, 0))   AS effective_tipo_cambio_usd,
        (tipo_cambio_rmb   + COALESCE(override_tipo_cambio_rmb, 0))   AS effective_tipo_cambio_rmb,
        (porcentaje_compra + COALESCE(override_porcentaje_compra, 0)) AS effective_porcentaje_compra,
        (COALESCE(costo_operacion_usd, 0) + COALESCE(override_costo_operacion_usd, 0)) AS effective_costo_operacion_usd,
        (COALESCE(costo_operacion_rmb, 0) + COALESCE(override_costo_operacion_rmb, 0)) AS effective_costo_operacion_rmb
       FROM entangled_providers ORDER BY is_default DESC, sort_order ASC, id ASC`
    );
    return res.json(r.rows);
  } catch (err) {
    console.error('[ENTANGLED] listProviders:', err);
    return res.status(500).json({ error: 'Error al listar proveedores' });
  }
};

export const listActiveProvidersPublic = async (_req: Request, res: Response): Promise<any> => {
  try {
    const r = await pool.query(
      `SELECT id, name, code,
        (tipo_cambio_usd   + COALESCE(override_tipo_cambio_usd, 0))   AS tipo_cambio_usd,
        (tipo_cambio_rmb   + COALESCE(override_tipo_cambio_rmb, 0))   AS tipo_cambio_rmb,
        (porcentaje_compra + COALESCE(override_porcentaje_compra, 0)) AS porcentaje_compra,
        (COALESCE(costo_operacion_usd, 0) + COALESCE(override_costo_operacion_usd, 0)) AS costo_operacion_usd,
        COALESCE(cancellation_fee_usd, 1) AS cancellation_fee_usd,
        COALESCE(costo_operacion_usd, 0) as base_costo,
        COALESCE(override_costo_operacion_usd, 0) as override_costo,
        bank_accounts, is_default, sort_order
       FROM entangled_providers WHERE is_active = true
       ORDER BY is_default DESC, sort_order ASC, id ASC`
    );
    console.log('[ENTANGLED] listActiveProvidersPublic result:', r.rows);
    return res.json(r.rows);
  } catch (err) {
    console.error('[ENTANGLED] listActiveProvidersPublic:', err);
    return res.status(500).json({ error: 'Error al listar proveedores' });
  }
};

export const createProvider = async (req: Request, res: Response): Promise<any> => {
  // Los proveedores se sincronizan desde el API ENTANGLED. No se permite crear manual.
  return res.status(410).json({ error: 'Los proveedores se sincronizan desde el API. No se pueden crear manualmente.' });
};

export const updateProvider = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
  const b = req.body || {};
  try {
    if (b.is_default === true) {
      await pool.query(`UPDATE entangled_providers SET is_default = false WHERE id <> $1`, [id]);
    }
    // Editables: overrides, cuentas bancarias, flags, notas/orden, comisiones,
    // y único campo local que NO llega del API: code.
    // name, tipo_cambio_*, porcentaje_compra, costo_operacion_*, min_operacion_* se sincronizan.
    const r = await pool.query(
      `UPDATE entangled_providers SET
         override_tipo_cambio_usd = $1,
         override_tipo_cambio_rmb = $2,
         override_porcentaje_compra = $3,
         override_costo_operacion_usd = $4,
         bank_accounts = COALESCE($5::jsonb, bank_accounts),
         notes = COALESCE($6, notes),
         is_active = COALESCE($7, is_active),
         is_default = COALESCE($8, is_default),
         sort_order = COALESCE($9, sort_order),
         asesor_pct = COALESCE($10, asesor_pct),
         over_pct = COALESCE($11, over_pct),
         over_split_asesor = COALESCE($12, over_split_asesor),
         cancellation_fee_usd = COALESCE($13, cancellation_fee_usd),
         code = COALESCE($14, code),
         updated_at = NOW()
       WHERE id = $15 RETURNING *,
         (tipo_cambio_usd   + COALESCE(override_tipo_cambio_usd, 0))   AS effective_tipo_cambio_usd,
         (tipo_cambio_rmb   + COALESCE(override_tipo_cambio_rmb, 0))   AS effective_tipo_cambio_rmb,
         (porcentaje_compra + COALESCE(override_porcentaje_compra, 0)) AS effective_porcentaje_compra,
         (COALESCE(costo_operacion_usd, 0) + COALESCE(override_costo_operacion_usd, 0)) AS effective_costo_operacion_usd`,
      [
        b.override_tipo_cambio_usd === '' || b.override_tipo_cambio_usd == null ? null : Number(b.override_tipo_cambio_usd),
        b.override_tipo_cambio_rmb === '' || b.override_tipo_cambio_rmb == null ? null : Number(b.override_tipo_cambio_rmb),
        b.override_porcentaje_compra === '' || b.override_porcentaje_compra == null ? null : Number(b.override_porcentaje_compra),
        b.override_costo_operacion_usd === '' || b.override_costo_operacion_usd == null ? null : Number(b.override_costo_operacion_usd),
        b.bank_accounts !== undefined ? JSON.stringify(b.bank_accounts) : null,
        b.notes ?? null,
        b.is_active !== undefined ? !!b.is_active : null,
        b.is_default !== undefined ? !!b.is_default : null,
        b.sort_order !== undefined ? Number(b.sort_order) : null,
        b.asesor_pct !== undefined && b.asesor_pct !== '' ? Number(b.asesor_pct) : null,
        b.over_pct !== undefined && b.over_pct !== '' ? Number(b.over_pct) : null,
        b.over_split_asesor !== undefined && b.over_split_asesor !== '' ? Number(b.over_split_asesor) : null,
        b.cancellation_fee_usd !== undefined && b.cancellation_fee_usd !== '' ? Number(b.cancellation_fee_usd) : null,
        b.code !== undefined && b.code !== null ? String(b.code).toUpperCase().slice(0, 16).replace(/[^A-Z0-9]/g, '') || null : null,
        id,
      ]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('[ENTANGLED] updateProvider:', err);
    return res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
};

export const deleteProvider = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    // Si tiene solicitudes, solo soft-delete
    const used = await pool.query(
      `SELECT 1 FROM entangled_payment_requests WHERE provider_id = $1 LIMIT 1`,
      [id]
    );
    if (used.rows.length > 0) {
      await pool.query(`UPDATE entangled_providers SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
      return res.json({ ok: true, soft: true });
    }
    await pool.query(`DELETE FROM entangled_providers WHERE id = $1`, [id]);
    return res.json({ ok: true, soft: false });
  } catch (err) {
    console.error('[ENTANGLED] deleteProvider:', err);
    return res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
};

export const quotePayment = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const monto = Number(req.body?.monto ?? req.query?.monto);
  const divisa = String(req.body?.divisa ?? req.query?.divisa ?? '').toUpperCase();
  const providerIdRaw = req.body?.provider_id ?? req.query?.provider_id;
  const providerId = providerIdRaw ? Number(providerIdRaw) : null;
  if (!monto || monto <= 0) return res.status(400).json({ error: 'monto inválido' });
  if (!['USD', 'RMB'].includes(divisa)) return res.status(400).json({ error: 'divisa debe ser USD o RMB' });
  try {
    const q = await computeQuote(monto, divisa, userId, providerId);
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

// ===========================================================================
// Admin: override de porcentaje_compra por usuario (cliente)
// ===========================================================================

export const listUserPricing = async (req: Request, res: Response): Promise<any> => {
  const role = String((req as any).user?.role || '').toLowerCase();
  if (!['super_admin', 'admin', 'director'].includes(role)) {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  try {
    const r = await pool.query(
      `SELECT up.user_id, up.porcentaje_compra, up.notes, up.updated_at,
              u.full_name AS client_name, u.email AS client_email
       FROM entangled_user_pricing up
       JOIN users u ON u.id = up.user_id
       ORDER BY u.full_name ASC NULLS LAST, u.email ASC`
    );
    return res.json(r.rows);
  } catch (err) {
    console.error('[ENTANGLED] listUserPricing:', err);
    return res.status(500).json({ error: 'Error al listar overrides' });
  }
};

export const upsertUserPricing = async (req: Request, res: Response): Promise<any> => {
  const adminId = getAuthUserId(req);
  const role = String((req as any).user?.role || '').toLowerCase();
  if (!adminId || !['super_admin', 'admin', 'director'].includes(role)) {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  const userId = Number(req.params.userId);
  const pct = Number(req.body?.porcentaje_compra);
  const notes = req.body?.notes || null;
  if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'userId inválido' });
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return res.status(400).json({ error: 'porcentaje_compra debe estar entre 0 y 100' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO entangled_user_pricing (user_id, porcentaje_compra, notes, set_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         porcentaje_compra = EXCLUDED.porcentaje_compra,
         notes = EXCLUDED.notes,
         set_by = EXCLUDED.set_by,
         updated_at = NOW()
       RETURNING *`,
      [userId, pct, notes, adminId]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('[ENTANGLED] upsertUserPricing:', err);
    return res.status(500).json({ error: 'Error al guardar override' });
  }
};

export const deleteUserPricing = async (req: Request, res: Response): Promise<any> => {
  const role = String((req as any).user?.role || '').toLowerCase();
  if (!['super_admin', 'admin', 'director'].includes(role)) {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'userId inválido' });
  try {
    await pool.query(`DELETE FROM entangled_user_pricing WHERE user_id = $1`, [userId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[ENTANGLED] deleteUserPricing:', err);
    return res.status(500).json({ error: 'Error al borrar override' });
  }
};
