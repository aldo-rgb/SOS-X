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
  uploadComprobanteToTransaccion,
  getTipoCambio,
  getSolicitudStatus,
  searchConceptos,
  rotateApiKey,
  isEntangledConfigured,
  ENTANGLED_WEBHOOK_SECRET,
  EntangledServicio,
  EntangledDivisa,
  EntangledSolicitudPayloadV2,
  listProveedoresRemote,
  callAsignacion,
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

  // Comprobante OPCIONAL: si no se envía, la solicitud queda en estado
  // 'pendiente' a la espera de que el cliente suba su comprobante después.
  // Cuando suba el comprobante (endpoint upload-proof-file), recién entonces
  // se enviará a ENTANGLED.
  const file = (req as any).file as
    | { buffer: Buffer; originalname: string; mimetype: string; size: number }
    | undefined;
  const hasFile = !!(file && file.buffer && file.buffer.length > 0);

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
  // TC que XPAY le cobra al cliente — requerido por ENTANGLED
  const tcClienteFinal = Number(body.tc_cliente_final);
  if (!Number.isFinite(tcClienteFinal) || tcClienteFinal <= 0) {
    return res.status(400).json({ error: 'tc_cliente_final es requerido y debe ser > 0' });
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
  // Snapshot de la UI (provider + beneficiario + operation + quote) para
  // poder regenerar el PDF de instrucciones idéntico al original.
  const instructionsSnapshot: any = parseJson(body.instructions_snapshot, null);

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
    // Migración idempotente: columnas adicionales (tc + snapshot UI)
    await pool.query(
      `ALTER TABLE entangled_payment_requests
         ADD COLUMN IF NOT EXISTS tc_cliente_final NUMERIC(14,6),
         ADD COLUMN IF NOT EXISTS instructions_snapshot JSONB`
    ).catch(() => {});
    const ins = await pool.query(
      `INSERT INTO entangled_payment_requests (
         user_id, advisor_id,
         servicio, requiere_factura,
         referencia_pago,
         cf_rfc, cf_razon_social, cf_regimen_fiscal, cf_cp, cf_uso_cfdi, cf_email,
         op_monto, op_divisa_destino, op_conceptos,
         comision_cliente_final_porcentaje, tc_cliente_final,
         instructions_snapshot,
         estatus_global, estatus_factura, estatus_proveedor
       ) VALUES (
         $1, $2,
         $3, $4,
         $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14::jsonb,
         $15, $16,
         $17::jsonb,
         'pendiente', $18, 'pendiente'
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
        tcClienteFinal,
        instructionsSnapshot ? JSON.stringify(instructionsSnapshot) : null,
        servicio === 'pago_con_factura' ? 'pendiente' : 'no_aplica',
      ]
    );
    requestId = ins.rows[0].id;
    // Guardar histórico de claves SAT del usuario (autocomplete)
    if (servicio === 'pago_con_factura' && Array.isArray(conceptos)) {
      for (const c of conceptos) {
        const clave = String(c?.clave_prodserv || '').trim();
        if (!clave) continue;
        const desc = c?.descripcion ? String(c.descripcion).trim() : null;
        try {
          await pool.query(
            `INSERT INTO entangled_clave_sat_history (user_id, clave, descripcion, uses_count, last_used_at)
             VALUES ($1, $2, $3, 1, NOW())
             ON CONFLICT (user_id, clave) DO UPDATE
               SET uses_count = entangled_clave_sat_history.uses_count + 1,
                   last_used_at = NOW(),
                   descripcion = COALESCE(EXCLUDED.descripcion, entangled_clave_sat_history.descripcion)`,
            [userId, clave, desc]
          );
        } catch (histErr) {
          console.warn('[ENTANGLED v2] historial clave SAT:', histErr);
        }
      }
    }
  } catch (err) {
    console.error('[ENTANGLED v2] Error creando registro local:', err);
    return res.status(500).json({ error: 'No se pudo crear la solicitud local' });
  }

  // 2) Construir payload para ENTANGLED v2 (siempre se envía sin comprobante
  //    primero, para obtener empresas_asignadas + transaccion_id sincrónicamente).
  const payload: EntangledSolicitudPayloadV2 = {
    servicio,
    comision_cliente_final_porcentaje: commission.porcentaje,
    tc_cliente_final: tcClienteFinal,
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

  // SIN comprobante → no se envía a ENTANGLED todavía. ENTANGLED exige que
  // POST /solicitud-pago incluya el archivo (multipart) o el link
  // (comprobante_cliente_url) en el JSON. Si todavía no tenemos comprobante no
  // podemos cumplir ninguno de los dos, así que dejamos la solicitud local en
  // 'esperando_comprobante' y la enviaremos cuando el cliente suba el archivo.
  if (!hasFile) {
    await pool.query(
      `UPDATE entangled_payment_requests
          SET estatus_global = 'esperando_comprobante',
              updated_at = NOW()
        WHERE id = $1`,
      [requestId]
    );
    return res.status(201).json({
      message: 'Solicitud creada. Sube el comprobante de pago para enviarla a ENTANGLED.',
      request_id: requestId,
      referencia_pago: referenciaPago,
      status: 'esperando_comprobante',
      requires_proof_upload: true,
    });
  }

  // Subimos el archivo a NUESTRO S3 primero para obtener una URL pública que
  // podamos mandarle a ENTANGLED en `comprobante_cliente_url` (opción B de su
  // contrato). Esto evita el legacy multipart que sus logs reportan como
  // "No se pudo subir el comprobante a almacenamiento".
  let comprobanteUrl: string | null = null;
  try {
    const ext = (file!.originalname?.split('.').pop() || 'pdf').toLowerCase();
    const key = `entangled/comprobantes/${requestId}_${Date.now()}.${ext}`;
    const { uploadToS3, isS3Configured, getSignedUrlForKey } = await import('./s3Service');
    if (isS3Configured()) {
      // El bucket es privado; guardamos la URL pública en DB pero a ENTANGLED
      // le damos una URL firmada con 7 días de validez para que pueda
      // descargar el archivo sin AccessDenied.
      const publicUrl = await uploadToS3(file!.buffer, key, file!.mimetype);
      const signedUrl = await getSignedUrlForKey(key, 7 * 24 * 60 * 60);
      await pool.query(
        `UPDATE entangled_payment_requests
            SET op_comprobante_cliente_url = $1, comprobante_subido_at = NOW(), updated_at = NOW()
          WHERE id = $2`,
        [publicUrl, requestId]
      );
      comprobanteUrl = signedUrl;
      payload.comprobante_cliente_url = signedUrl;
    } else {
      comprobanteUrl = `data:${file!.mimetype};base64,${file!.buffer.toString('base64')}`;
      await pool.query(
        `UPDATE entangled_payment_requests
            SET op_comprobante_cliente_url = $1, comprobante_subido_at = NOW(), updated_at = NOW()
          WHERE id = $2`,
        [comprobanteUrl, requestId]
      );
      payload.comprobante_cliente_url = comprobanteUrl;
    }
  } catch (e) {
    console.error('[ENTANGLED v2] Error subiendo comprobante a S3:', e);
    // Seguimos intentando ENTANGLED; si su contrato exige URL fallará abajo.
  }

  // POST /solicitud-pago — JSON con el payload + comprobante_cliente_url.
  // ENTANGLED responde sincrónicamente con transaccion_id +
  // empresas_asignadas[].cuenta_bancaria (cuentas dinámicas por SAT).
  const remote = await sendSolicitudPago(payload, null);

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

  // Estado tras fase 1: ya tenemos cuenta(s) — esperando comprobante del cliente.
  const estatusTrasFase1 = hasFile ? 'en_proceso' : 'esperando_comprobante';

  let updated = (await pool.query(
    `UPDATE entangled_payment_requests
        SET entangled_transaccion_id = $1,
            estatus_global = $2,
            comision_cobrada_porcentaje = $3,
            tc_aplicado_usd = $4,
            empresas_asignadas = $5::jsonb,
            raw_response = $6::jsonb,
            updated_at = NOW()
      WHERE id = $7
      RETURNING *`,
    [
      remote.transaccion_id,
      estatusTrasFase1,
      remote.comision_cobrada_porcentaje ?? null,
      remote.tc_aplicado_usd ?? null,
      JSON.stringify(remote.empresas_asignadas || []),
      JSON.stringify(remote.raw || {}),
      requestId,
    ]
  )).rows[0];

  // No hay Fase 2: el comprobante ya viajó como `comprobante_cliente_url` en
  // el JSON del POST /solicitud-pago anterior.
  if (comprobanteUrl) {
    updated = (await pool.query(
      `UPDATE entangled_payment_requests
          SET url_comprobante_cliente = COALESCE($1, url_comprobante_cliente),
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [comprobanteUrl, requestId]
    )).rows[0];
  }

  return res.status(201).json({
    message: 'Solicitud enviada y comprobante adjuntado a ENTANGLED.',
    request: updated,
    request_id: requestId,
    referencia_pago: referenciaPago,
    servicio,
    comision_cliente_final_porcentaje: commission.porcentaje,
    comision_cobrada_porcentaje: remote.comision_cobrada_porcentaje,
    tc_aplicado_usd: remote.tc_aplicado_usd,
    empresas_asignadas: remote.empresas_asignadas || [],
    entangled_transaccion_id: remote.transaccion_id,
    requires_proof_upload: false,
    status: estatusTrasFase1,
  });
};

// ===========================================================================
// Helper: forwardea el comprobante a ENTANGLED para una solicitud existente.
// Flujo de 2 fases:
//   * Si ya tenemos transaccion_id → POST /solicitud-pago/:id/comprobante
//     (vía uploadComprobanteToTransaccion). Persistimos url_comprobante.
//   * Fallback legacy: si NO hay transaccion_id (solicitud antigua creada
//     antes del nuevo contrato) → reenviamos con multipart sendSolicitudPago.
// Devuelve { ok, status, payload } para responder al cliente.
// ===========================================================================
export async function sendPendingRequestToEntangled(
  requestId: number,
  fileBuffer: Buffer,
  fileName: string,
  fileMime: string
): Promise<{ ok: boolean; status: number; payload: any }> {
  // 1) Cargar solicitud local
  const r = await pool.query(
    `SELECT * FROM entangled_payment_requests WHERE id = $1 LIMIT 1`,
    [requestId]
  );
  if (r.rows.length === 0) {
    return { ok: false, status: 404, payload: { error: 'Solicitud no encontrada' } };
  }
  const reqRow = r.rows[0];

  if (!isEntangledConfigured()) {
    return {
      ok: false,
      status: 202,
      payload: {
        message:
          'Comprobante guardado localmente. ENTANGLED no está configurado; será procesado manualmente.',
        request_id: requestId,
        status: 'error_envio',
      },
    };
  }

  // CAMINO PRINCIPAL: ya tenemos transaccion_id (nuevo contrato 2 fases)
  if (reqRow.entangled_transaccion_id) {
    const up = await uploadComprobanteToTransaccion(
      String(reqRow.entangled_transaccion_id),
      {
        buffer: fileBuffer,
        filename: fileName || `comprobante-${requestId}`,
        mimetype: fileMime || 'application/octet-stream',
      }
    );
    if (!up.ok) {
      await pool.query(
        `UPDATE entangled_payment_requests
            SET error_message = $1,
                updated_at = NOW()
          WHERE id = $2`,
        [up.error || 'Error subiendo comprobante a ENTANGLED', requestId]
      );
      return {
        ok: false,
        status: 502,
        payload: {
          error: up.error || 'No se pudo enviar el comprobante a ENTANGLED.',
          request_id: requestId,
        },
      };
    }
    const upd = await pool.query(
      `UPDATE entangled_payment_requests
          SET estatus_global = 'en_proceso',
              url_comprobante_cliente = COALESCE($1, url_comprobante_cliente),
              comprobante_subido_at = NOW(),
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [up.url_comprobante_cliente || null, requestId]
    );
    return {
      ok: true,
      status: 200,
      payload: {
        message: 'Comprobante enviado a ENTANGLED.',
        request: upd.rows[0],
        entangled_transaccion_id: reqRow.entangled_transaccion_id,
      },
    };
  }

  // FALLBACK LEGACY: solicitud antigua sin transaccion_id → reenvío multipart
  const servicio = reqRow.servicio as EntangledServicio;
  const conceptos = Array.isArray(reqRow.op_conceptos)
    ? reqRow.op_conceptos
    : (() => {
        try {
          return JSON.parse(reqRow.op_conceptos || '[]');
        } catch {
          return [];
        }
      })();

  // tc_cliente_final es obligatorio para ENTANGLED. Para solicitudes creadas
  // antes de que la columna existiera (o en las que la persistencia falló),
  // intentamos recuperarlo del instructions_snapshot.quote.tipo_cambio que el
  // frontend ya guarda al crear la solicitud. Si lo recuperamos, lo persistimos
  // para que reuploads futuros lo encuentren en columna.
  let tcClienteFinal: number | undefined;
  if (reqRow.tc_cliente_final != null) {
    tcClienteFinal = Number(reqRow.tc_cliente_final);
  } else {
    const snap = reqRow.instructions_snapshot && typeof reqRow.instructions_snapshot === 'object'
      ? reqRow.instructions_snapshot
      : null;
    const fromSnapshot = Number(snap?.quote?.tipo_cambio);
    if (Number.isFinite(fromSnapshot) && fromSnapshot > 0) {
      tcClienteFinal = fromSnapshot;
      try {
        await pool.query(
          `UPDATE entangled_payment_requests
              SET tc_cliente_final = $1, updated_at = NOW()
            WHERE id = $2`,
          [tcClienteFinal, requestId]
        );
      } catch (e) {
        console.warn('[ENTANGLED] no pude persistir tc_cliente_final recuperado:', e);
      }
    }
  }
  if (!Number.isFinite(tcClienteFinal as number) || (tcClienteFinal as number) <= 0) {
    await pool.query(
      `UPDATE entangled_payment_requests
          SET estatus_global = 'error_envio',
              error_message = $1,
              updated_at = NOW()
        WHERE id = $2`,
      ['Falta tc_cliente_final para enviar a ENTANGLED', requestId]
    );
    return {
      ok: false,
      status: 400,
      payload: {
        error: 'Falta el tipo de cambio (tc_cliente_final) usado al crear la solicitud. Vuelva a crear la solicitud para regenerar la cotización.',
        request_id: requestId,
      },
    };
  }

  const payload: EntangledSolicitudPayloadV2 = {
    servicio,
    comision_cliente_final_porcentaje: Number(
      reqRow.comision_cliente_final_porcentaje || 0
    ),
    tc_cliente_final: tcClienteFinal,
    monto_usd: Number(reqRow.op_monto),
    divisa: reqRow.op_divisa_destino as EntangledDivisa,
    cliente_final:
      servicio === 'pago_con_factura'
        ? {
            razon_social: reqRow.cf_razon_social,
            rfc: String(reqRow.cf_rfc || '').toUpperCase(),
            email: reqRow.cf_email,
            regimen_fiscal: reqRow.cf_regimen_fiscal,
            cp: String(reqRow.cf_cp || ''),
            uso_cfdi: reqRow.cf_uso_cfdi,
          }
        : { razon_social: reqRow.cf_razon_social },
    referencia_xpay: reqRow.referencia_pago,
  };
  if (servicio === 'pago_con_factura') {
    payload.conceptos = conceptos as any[];
  }
  // Anexamos la URL del comprobante (ya subido a NUESTRO S3 por el endpoint
  // /upload-proof-file en index.ts antes de invocarnos). ENTANGLED exige que
  // POST /solicitud-pago incluya el archivo (multipart) o el link
  // (comprobante_cliente_url) en el JSON; vamos por la opción JSON+URL.
  // Como el bucket es privado, generamos una URL firmada con 7 días de
  // validez para que ENTANGLED pueda descargar el archivo sin AccessDenied.
  if (reqRow.op_comprobante_cliente_url) {
    let urlForEntangled = String(reqRow.op_comprobante_cliente_url);
    try {
      const { extractKeyFromUrl, getSignedUrlForKey } = await import('./s3Service');
      const key = extractKeyFromUrl(urlForEntangled);
      if (key) {
        urlForEntangled = await getSignedUrlForKey(key, 7 * 24 * 60 * 60);
      }
    } catch (e) {
      console.warn('[ENTANGLED] no pude firmar la URL del comprobante:', e);
    }
    payload.comprobante_cliente_url = urlForEntangled;
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
    return {
      ok: false,
      status: 202,
      payload: {
        message:
          'Comprobante guardado. ENTANGLED no está configurado; la solicitud será procesada manualmente.',
        request_id: requestId,
        status: 'error_envio',
      },
    };
  }

  // POST /solicitud-pago — JSON con payload + comprobante_cliente_url.
  // Una sola llamada: ENTANGLED toma la URL del comprobante y devuelve
  // transaccion_id + empresas_asignadas.
  const remote = await sendSolicitudPago(payload, null);

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
    return {
      ok: false,
      status: 502,
      payload: {
        error: remote.error || 'ENTANGLED no devolvió un transaccion_id.',
        request_id: requestId,
      },
    };
  }

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
      remote.url_comprobante_cliente || reqRow.op_comprobante_cliente_url || null,
      JSON.stringify(remote.raw || {}),
      requestId,
    ]
  );

  return {
    ok: true,
    status: 200,
    payload: {
      message: 'Comprobante recibido y solicitud enviada a ENTANGLED.',
      request: upd.rows[0],
      comision_cobrada_porcentaje: remote.comision_cobrada_porcentaje,
      tc_aplicado_usd: remote.tc_aplicado_usd,
      empresas_asignadas: remote.empresas_asignadas || [],
    },
  };
}

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
// POST /api/entangled/payment-requests/:id/sync
// Pull manual del estado actual desde ENTANGLED. Aplica los mismos updates
// que harían los webhooks factura.generada y pago.proveedor.confirmado, pero
// reactivamente cuando un webhook se perdió y el estado local quedó atrás.
// ===========================================================================
export const syncRequestFromEntangled = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

  const r = await pool.query(
    `SELECT id, user_id, entangled_transaccion_id, servicio
       FROM entangled_payment_requests WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const row = r.rows[0];
  if (!isAdminRole(req) && row.user_id !== userId) {
    return res.status(403).json({ error: 'Sin acceso a esta solicitud' });
  }
  if (!row.entangled_transaccion_id) {
    return res.status(400).json({
      error: 'La solicitud aún no se envió a ENTANGLED (no hay transaccion_id).',
    });
  }

  const remote = await getSolicitudStatus(String(row.entangled_transaccion_id));
  if (!remote.ok) {
    return res.status(502).json({ error: remote.error || 'Error consultando ENTANGLED' });
  }

  // Normalizamos la respuesta — su contrato puede traer documentos y estatus
  // en distintas anidaciones según el evento del que vienen los datos.
  const data = remote.data || {};
  const docs = data.documentos || data.docs || {};
  const detalles = data.detalles || {};
  const facturaUrl = docs.url_factura_pdf || docs.factura_pdf || data.factura_url || null;
  const facturaXmlUrl = docs.url_factura_xml || docs.factura_xml || data.factura_xml_url || null;
  const comprobanteProvUrl = docs.url_comprobante_proveedor || docs.comprobante_proveedor || data.comprobante_proveedor_url || null;
  const facturaEmitida = !!(facturaUrl || facturaXmlUrl);
  const proveedorEstatus = String(detalles.estatus || data.estatus_proveedor || data.estatus || '').toLowerCase();
  const servicio = row.servicio as EntangledServicio;

  const upd = await pool.query(
    `UPDATE entangled_payment_requests
        SET factura_url = COALESCE($1, factura_url),
            estatus_factura = CASE WHEN $1 IS NOT NULL OR $7 = TRUE THEN 'emitida' ELSE estatus_factura END,
            factura_emitida_at = CASE WHEN ($1 IS NOT NULL OR $7 = TRUE) AND factura_emitida_at IS NULL THEN NOW() ELSE factura_emitida_at END,
            comprobante_proveedor_url = COALESCE($2, comprobante_proveedor_url),
            estatus_proveedor = CASE WHEN $3 IN ('completado','rechazado','en_proceso') THEN $3 ELSE estatus_proveedor END,
            proveedor_pagado_at = CASE WHEN $3 = 'completado' AND proveedor_pagado_at IS NULL THEN NOW() ELSE proveedor_pagado_at END,
            raw_response = COALESCE(raw_response, '{}'::jsonb)
              || jsonb_build_object('factura_xml_url', $4::text)
              || jsonb_build_object('last_sync_at', NOW())
              || jsonb_build_object('last_sync_payload', $5::jsonb),
            estatus_global = CASE
              WHEN ($6 = 'pago_sin_factura' AND $3 = 'completado') THEN 'completado'
              WHEN ($6 = 'pago_con_factura' AND $3 = 'completado' AND ($1 IS NOT NULL OR estatus_factura = 'emitida' OR $7 = TRUE)) THEN 'completado'
              WHEN $3 = 'rechazado' THEN 'rechazado'
              ELSE estatus_global
            END,
            last_webhook_at = NOW(),
            updated_at = NOW()
      WHERE id = $8
      RETURNING *`,
    [
      facturaUrl,
      comprobanteProvUrl,
      proveedorEstatus || null,
      facturaXmlUrl,
      JSON.stringify(data),
      servicio,
      facturaEmitida,
      id,
    ]
  );

  return res.json({ ok: true, request: upd.rows[0], remote: data });
};

// ===========================================================================
// POST /api/entangled/asignacion
// Obtiene empresa + cuenta bancaria asignada para un concepto SAT + cliente.
// ===========================================================================
export const asignacionProxy = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const {
    servicio,
    concepto,
    cliente_final,
    monto_destino,
    divisa_destino,
    tc_cliente_final,
    comision_cliente_final_porcentaje,
  } = req.body || {};
  if (!servicio || !cliente_final?.razon_social) {
    return res.status(400).json({ error: 'servicio y cliente_final.razon_social son requeridos' });
  }
  if (servicio === 'pago_con_factura' && !concepto) {
    return res.status(400).json({ error: 'concepto es requerido para pago_con_factura' });
  }
  // ENTANGLED /asignacion exige el desglose completo del cobro al cliente
  // (monto, divisa, TC y % de comisión) además de la clave + datos fiscales.
  const montoNum = Number(monto_destino);
  if (!Number.isFinite(montoNum) || montoNum <= 0) {
    return res.status(400).json({ error: 'monto_destino es requerido y debe ser un número mayor a 0' });
  }
  if (!divisa_destino || typeof divisa_destino !== 'string') {
    return res.status(400).json({ error: 'divisa_destino es requerida (USD/RMB/MXN)' });
  }
  const tcNum = Number(tc_cliente_final);
  if (!Number.isFinite(tcNum) || tcNum <= 0) {
    return res.status(400).json({ error: 'tc_cliente_final es requerido y debe ser un número mayor a 0' });
  }
  const comisionNum = Number(comision_cliente_final_porcentaje);
  if (!Number.isFinite(comisionNum) || comisionNum < 0) {
    return res.status(400).json({ error: 'comision_cliente_final_porcentaje es requerida (porcentaje XPAY → cliente final)' });
  }
  const result = await callAsignacion({
    servicio,
    concepto,
    cliente_final,
    monto_destino: montoNum,
    divisa_destino,
    tc_cliente_final: tcNum,
    comision_cliente_final_porcentaje: comisionNum,
  });
  if (!result.ok) {
    // Si ENTANGLED devolvió un 4xx (validación / clave no encontrada), reenviar como 4xx
    // para que el frontend muestre el mensaje real al usuario. 5xx → 502 con mensaje genérico.
    const upstream = result.upstream_status;
    if (typeof upstream === 'number' && upstream >= 400 && upstream < 500) {
      return res.status(upstream).json({ error: result.error, raw: result.raw, upstream_status: upstream });
    }
    return res.status(502).json({
      error: result.error || 'El servicio de asignación no respondió. Intenta de nuevo en unos segundos.',
      raw: result.raw,
      upstream_status: upstream,
    });
  }
  return res.json(result);
};

// ===========================================================================
// GET /api/entangled/conceptos/search?q=...&limit=...   (proxy)
// ===========================================================================
export const searchConceptosProxy = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const q = String(req.query.q || '').trim();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const proveedorId = req.query.proveedor_id ? String(req.query.proveedor_id) : undefined;
  if (!q) return res.json({ results: [] });
  const r = await searchConceptos(q, limit, proveedorId);
  if (!r.ok) {
    // Fallback local: historial de claves SAT usadas por el cliente.
    // Evita propagar 502 al frontend cuando ENTANGLED está temporalmente caído
    // o no configurado en entorno productivo.
    try {
      const qLike = `%${q.replace(/[%_]/g, '')}%`;
      const hist = await pool.query(
        `SELECT clave, COALESCE(descripcion, '') AS descripcion
           FROM entangled_clave_sat_history
          WHERE user_id = $1
            AND (clave ILIKE $2 OR COALESCE(descripcion, '') ILIKE $2)
          ORDER BY uses_count DESC, last_used_at DESC
          LIMIT $3`,
        [userId, qLike, limit]
      );

      return res.json({
        results: hist.rows.map((x: any) => ({
          clave_prodserv: String(x.clave),
          descripcion: String(x.descripcion || ''),
        })),
        fallback: true,
        warning: r.error || 'Catálogo SAT remoto no disponible',
      });
    } catch {
      return res.json({
        results: [],
        fallback: true,
        warning: r.error || 'Catálogo SAT remoto no disponible',
      });
    }
  }
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

// ===========================================================================
// POST /api/admin/entangled/providers/sync
// Sincroniza la tabla entangled_providers con el listado real del API ENTANGLED
// (/v1/proveedores). Hace upsert por external_id (UUID remoto), actualiza
// nombre/descripcion/tarifas y desactiva los proveedores que ya no existen
// en el remoto.
// ===========================================================================
export const syncProveedoresFromRemote = async (req: Request, res: Response): Promise<any> => {
  if (!isAdminRole(req)) return res.status(403).json({ error: 'Sin permisos' });
  if (!isEntangledConfigured()) return res.status(400).json({ error: 'ENTANGLED_API_KEY no configurada' });

  const remote = await listProveedoresRemote();
  if (!remote.ok) return res.status(502).json({ error: remote.error || 'Error consultando proveedores remotos' });

  // Tipo de cambio global (el API solo expone USD; RMB no está disponible y queda en 0)
  const tcUsdRes = await getTipoCambio('USD');
  const tcUsd = tcUsdRes.ok && tcUsdRes.tipo_cambio != null ? Number(tcUsdRes.tipo_cambio) : 0;
  const tcRmbRes = await getTipoCambio('RMB' as any).catch(() => ({ ok: false, tipo_cambio: 0 } as any));
  const tcRmb = tcRmbRes.ok && tcRmbRes.tipo_cambio != null ? Number(tcRmbRes.tipo_cambio) : 0;

  const proveedores = remote.proveedores || [];
  const summary = {
    total_remotos: proveedores.length,
    inserted: 0,
    updated: 0,
    deactivated: 0,
    activos_externos: [] as string[],
    detalles: [] as any[],
  };

  // 1) Upsert por external_id
  for (const p of proveedores) {
    summary.activos_externos.push(p.id);
    // ¿Ya existe?
    const existing = await pool.query(
      `SELECT id, name, descripcion, tarifas FROM entangled_providers WHERE external_id = $1`,
      [p.id]
    );
    const pctConFactura = (() => {
      const t = (p.tarifas || []).find((x: any) => x.servicio_codigo === 'pago_con_factura');
      return t && t.comision_cliente_porcentaje != null ? Number(t.comision_cliente_porcentaje) : 0;
    })();
    // Nuevos campos del API (post-update ENTANGLED): tipos_cambio, costo_operacion, monto_minimo por tarifa.
    // tipos_cambio.USD/RMB puede ser number (legacy) u objeto { modo, valor_efectivo, valor_base, ... }.
    const extractTC = (v: any): number | null => {
      if (v == null) return null;
      if (typeof v === 'number') return v;
      if (typeof v === 'object') {
        const ef = v.valor_efectivo ?? v.valor_base ?? v.valor;
        return ef != null ? Number(ef) : null;
      }
      return null;
    };
    const remoteUsd = extractTC(p.tipos_cambio?.USD);
    const remoteRmb = extractTC(p.tipos_cambio?.RMB);
    const provTcUsd = remoteUsd != null ? remoteUsd : tcUsd;
    const provTcRmb = remoteRmb != null ? remoteRmb : tcRmb;
    // Costo de operación: el API ahora lo expone por divisa { USD: {...}, RMB: {...} }.
    // Compat con formato legacy plano { porcentaje, monto_fijo, moneda }.
    const co: any = p.costo_operacion || {};
    const coUsd: any = co.USD || (String(co.moneda || 'USD').toUpperCase() === 'USD' ? co : null) || {};
    const coRmb: any = co.RMB || (String(co.moneda || '').toUpperCase() === 'RMB' ? co : null) || {};
    const costoOpFijoUsd = coUsd.monto_fijo != null ? Number(coUsd.monto_fijo) : 0;
    const costoOpPctUsd = coUsd.porcentaje != null ? Number(coUsd.porcentaje) : 0;
    const costoOpFijoRmb = coRmb.monto_fijo != null ? Number(coRmb.monto_fijo) : 0;
    const costoOpPctRmb = coRmb.porcentaje != null ? Number(coRmb.porcentaje) : 0;
    // Para compat con campos heredados (1 sola moneda)
    const costoOpFijo = costoOpFijoUsd;
    const costoOpPct = costoOpPctUsd;
    const costoOpMoneda = (co.moneda || 'USD').toString().slice(0, 8);
    // Mínimos: tomamos los del servicio "con factura"; si no hay, los del primero.
    const tarifaRef = (p.tarifas || []).find((x: any) => x.servicio_codigo === 'pago_con_factura') || (p.tarifas || [])[0];
    const minUsd = tarifaRef?.monto_minimo?.USD != null ? Number(tarifaRef.monto_minimo.USD) : 0;
    const minRmb = tarifaRef?.monto_minimo?.RMB != null ? Number(tarifaRef.monto_minimo.RMB) : 0;
    if (existing.rows.length > 0) {
      const r = await pool.query(
        `UPDATE entangled_providers
            SET name = $1,
                descripcion = $2,
                tarifas = $3::jsonb,
                tipo_cambio_usd = $5,
                tipo_cambio_rmb = $6,
                porcentaje_compra = $7,
                total_empresas_activas = $8,
                remote_activo = $9,
                is_active = $9,
                costo_operacion_usd = $10,
                costo_operacion_porcentaje = $11,
                costo_operacion_moneda = $12,
                min_operacion_usd = $13,
                min_operacion_rmb = $14,
                costo_operacion_rmb = $15,
                costo_operacion_porcentaje_rmb = $16,
                last_synced_at = NOW(),
                updated_at = NOW()
          WHERE external_id = $4
          RETURNING id, name, external_id, is_default, total_empresas_activas`,
        [
          p.nombre,
          p.descripcion ?? null,
          JSON.stringify(p.tarifas || []),
          p.id,
          provTcUsd,
          provTcRmb,
          pctConFactura,
          Number(p.total_empresas_activas ?? 0) || 0,
          p.activo !== false,
          costoOpFijo,
          costoOpPct,
          costoOpMoneda,
          minUsd,
          minRmb,
          costoOpFijoRmb,
          costoOpPctRmb,
        ]
      );
      summary.updated++;
      summary.detalles.push({ action: 'updated', ...r.rows[0] });
    } else {
      // Insert. El primero recibido se marca como default si no hay default activo
      const hasDefault = await pool.query(
        `SELECT 1 FROM entangled_providers WHERE is_default = true AND is_active = true LIMIT 1`
      );
      const isDefault = hasDefault.rows.length === 0;
      const r = await pool.query(
        `INSERT INTO entangled_providers
           (name, code, external_id, descripcion, tarifas,
            tipo_cambio_usd, tipo_cambio_rmb, porcentaje_compra,
            total_empresas_activas, remote_activo,
            costo_operacion_usd, costo_operacion_porcentaje, costo_operacion_moneda,
            min_operacion_usd, min_operacion_rmb,
            costo_operacion_rmb, costo_operacion_porcentaje_rmb,
            is_active, is_default, sort_order, last_synced_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $7, $8, $9, $10, $11,
                 $12, $13, $14, $15, $16,
                 $17, $18,
                 $11, $6, 0, NOW(), NOW(), NOW())
         RETURNING id, name, external_id, is_default, total_empresas_activas`,
        [
          p.nombre,
          (p.nombre || '').toUpperCase().slice(0, 16).replace(/[^A-Z0-9]/g, ''),
          p.id,
          p.descripcion ?? null,
          JSON.stringify(p.tarifas || []),
          isDefault,
          provTcUsd,
          provTcRmb,
          pctConFactura,
          Number(p.total_empresas_activas ?? 0) || 0,
          p.activo !== false,
          costoOpFijo,
          costoOpPct,
          costoOpMoneda,
          minUsd,
          minRmb,
          costoOpFijoRmb,
          costoOpPctRmb,
        ]
      );
      summary.inserted++;
      summary.detalles.push({ action: 'inserted', ...r.rows[0] });
    }
  }

  // 2) Desactivar proveedores que YA NO están en el remoto.
  //    Sólo desactivamos los que SÍ tenían external_id (vinieron de sync) o legacy
  //    sin external_id. No los borramos por integridad referencial con
  //    entangled_payment_requests.
  if (summary.activos_externos.length > 0) {
    const deact = await pool.query(
      `UPDATE entangled_providers
          SET is_active = false, is_default = false, updated_at = NOW()
        WHERE is_active = true
          AND (external_id IS NULL OR external_id <> ALL($1::text[]))
        RETURNING id, name, external_id`,
      [summary.activos_externos]
    );
    summary.deactivated = deact.rows.length;
    summary.detalles.push(...deact.rows.map(r => ({ action: 'deactivated', ...r })));
  } else {
    // Si remoto no devolvió ninguno, no desactivamos nada (precaución)
  }

  // 3) Si después del sync no hay default activo, marcar el primero activo
  const def = await pool.query(
    `SELECT id FROM entangled_providers WHERE is_active = true AND is_default = true LIMIT 1`
  );
  if (def.rows.length === 0) {
    const first = await pool.query(
      `SELECT id FROM entangled_providers WHERE is_active = true ORDER BY id ASC LIMIT 1`
    );
    if (first.rows.length > 0) {
      await pool.query(`UPDATE entangled_providers SET is_default = true WHERE id = $1`, [first.rows[0].id]);
    }
  }

  return res.json({ ok: true, ...summary, raw: remote.raw });
};

// ===========================================================================
// GET /api/entangled/clave-sat-history    — historial de claves SAT del usuario
// ===========================================================================
export const listClaveSatHistory = async (req: Request, res: Response): Promise<any> => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    const r = await pool.query(
      `SELECT clave, descripcion, uses_count, last_used_at
         FROM entangled_clave_sat_history
        WHERE user_id = $1
        ORDER BY uses_count DESC, last_used_at DESC
        LIMIT 50`,
      [userId]
    );
    return res.json(r.rows);
  } catch (err) {
    console.error('[ENTANGLED] listClaveSatHistory:', err);
    return res.status(500).json({ error: 'Error al consultar historial' });
  }
};
