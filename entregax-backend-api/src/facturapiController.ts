// facturapiController.ts — Integración con Facturapi.io para DESCARGA
// de facturas recibidas (CFDIs). Facturama queda dedicado a la EMISIÓN.
//
// API de Facturapi v2 (público y documentado):
//   Base: https://www.facturapi.io/v2
//   Auth: Basic <base64(secret_key:)>  (nota el ':' final, password vacío)
//
//   GET  /invoices?issuer_type=receiving   - Listar facturas recibidas (oficial)
//   GET  /invoices/{id}/xml                - Descargar XML
//   GET  /invoices/{id}/pdf                - Descargar PDF
//
// Notas:
//   - El endpoint legacy `/received` no existe en la API pública v2.
//   - Para que `issuer_type=receiving` devuelva facturas, la organización debe
//     tener activada la "Bandeja de Recibidas" (Buzón Fiscal) en facturapi.io
//     y haber autorizado la descarga desde el SAT con e.firma.
//   - Multi-emisor: cada fiscal_emitter tiene su propia API key.

import { Request, Response } from 'express';
import { pool } from './db';
import axios from 'axios';

const FACTURAPI_BASE = 'https://www.facturapi.io/v2';

interface AuthRequest extends Request {
  user?: { userId: number; id?: number; role?: string; email?: string };
}

const getFacturapiAuth = (apiKey: string) => ({
  auth: { username: apiKey, password: '' },
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

async function loadEmitter(emitterId: number) {
  const r = await pool.query(
    `SELECT id, alias, rfc,
            facturapi_api_key, facturapi_environment,
            facturapi_enabled, facturapi_last_sync, facturapi_last_sync_count
       FROM fiscal_emitters WHERE id = $1`,
    [emitterId]
  );
  return r.rows[0] || null;
}

/* =================================================================
 * 1) GET CONFIG — devuelve si está configurado (sin exponer la key)
 * GET /api/admin/facturapi/config/:emitterId
 * =============================================================== */
export const getFacturapiConfig = async (req: Request, res: Response): Promise<any> => {
  try {
    const emitterId = parseInt(String(req.params.emitterId || ''), 10);
    const e = await loadEmitter(emitterId);
    if (!e) return res.status(404).json({ error: 'Emisor no encontrado' });
    res.json({
      configured: !!e.facturapi_api_key,
      enabled: !!e.facturapi_enabled,
      environment: e.facturapi_environment || 'live',
      key_preview: e.facturapi_api_key ? `${String(e.facturapi_api_key).slice(0, 8)}…` : null,
      last_sync: e.facturapi_last_sync,
      last_sync_count: e.facturapi_last_sync_count,
    });
  } catch (err: any) {
    console.error('getFacturapiConfig:', err.message);
    res.status(500).json({ error: 'Error obteniendo configuración' });
  }
};

/* =================================================================
 * 2) SAVE CONFIG — guarda API key + ambiente
 * PUT /api/admin/facturapi/config/:emitterId  body { api_key, environment, enabled }
 * =============================================================== */
export const saveFacturapiConfig = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const emitterId = parseInt(String(req.params.emitterId || ''), 10);
    const { api_key, environment, enabled } = req.body || {};
    if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });
    const env = environment === 'test' ? 'test' : 'live';

    // Solo actualizamos api_key si viene; permitimos toggle solo de enabled.
    if (api_key) {
      await pool.query(
        `UPDATE fiscal_emitters
            SET facturapi_api_key = $1,
                facturapi_environment = $2,
                facturapi_enabled = COALESCE($3, TRUE)
          WHERE id = $4`,
        [api_key, env, enabled ?? null, emitterId]
      );
    } else {
      await pool.query(
        `UPDATE fiscal_emitters
            SET facturapi_environment = $1,
                facturapi_enabled = COALESCE($2, facturapi_enabled)
          WHERE id = $3`,
        [env, enabled ?? null, emitterId]
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('saveFacturapiConfig:', err.message);
    res.status(500).json({ error: 'Error guardando configuración' });
  }
};

/* =================================================================
 * 3) TEST CONNECTION
 * POST /api/admin/facturapi/test/:emitterId
 * =============================================================== */
export const testFacturapiConnection = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const emitterId = parseInt(String(req.params.emitterId || ''), 10);
    const e = await loadEmitter(emitterId);
    if (!e) return res.status(404).json({ error: 'Emisor no encontrado' });
    if (!e.facturapi_api_key) {
      return res.status(400).json({ error: 'Facturapi no configurado para este emisor' });
    }
    const r = await axios.get(`${FACTURAPI_BASE}/organizations/me`, {
      ...getFacturapiAuth(e.facturapi_api_key),
      validateStatus: () => true,
    });
    if (r.status >= 200 && r.status < 300) {
      return res.json({
        success: true,
        status: r.status,
        organization: {
          id: r.data?.id,
          legal_name: r.data?.legal?.legal_name,
          tax_id: r.data?.legal?.tax_id,
          is_production_ready: r.data?.is_production_ready,
        },
      });
    }
    return res.status(r.status).json({
      success: false,
      status: r.status,
      detail: r.data?.message || r.data?.error || 'Credenciales rechazadas',
    });
  } catch (err: any) {
    console.error('testFacturapiConnection:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* =================================================================
 * 4) SYNC RECIBIDAS — pull manual de CFDIs recibidos
 * POST /api/admin/facturapi/sync/:emitterId  body { from, to }
 * Inserta en accounting_received_invoices con detection_source='facturapi_sync'.
 * =============================================================== */

/**
 * Núcleo reutilizable de sincronización (usado por endpoint manual,
 * cron automático y webhook). Devuelve un objeto resumen sin tocar `res`.
 * Lanza error si las credenciales son inválidas.
 */
export async function runFacturapiSync(
  emitterId: number,
  opts: { from?: string; to?: string; source?: string } = {}
): Promise<{
  emitter_id: number;
  total_found: number;
  inserted: number;
  skipped: number;
  pages_fetched: number;
}> {
  const e = await loadEmitter(emitterId);
  if (!e) throw new Error(`Emisor ${emitterId} no encontrado`);
  if (!e.facturapi_api_key) throw new Error(`Facturapi no configurado para emisor ${emitterId}`);
  if (!e.facturapi_enabled) throw new Error(`Facturapi deshabilitado para emisor ${emitterId}`);

  const auth = getFacturapiAuth(e.facturapi_api_key);
  const { from, to } = opts;

  const limit = 100;
  let page = 1;
  let totalPages = 1;
  const allItems: any[] = [];

  do {
    const params: any = { page, limit, issuer_type: 'receiving' };
    if (from) params['date[gt]'] = `${from}T00:00:00`;
    if (to)   params['date[lt]'] = `${to}T23:59:59`;

    const r = await axios.get(`${FACTURAPI_BASE}/invoices`, {
      ...auth,
      params,
      validateStatus: () => true,
    });

    if (r.status < 200 || r.status >= 300) {
      const msg = r.data?.message || r.statusText || 'Error desconocido';
      throw new Error(`Facturapi ${r.status}: ${msg}`);
    }

    const data = r.data || {};
    const items = Array.isArray(data) ? data : (data.data || data.results || []);
    allItems.push(...items);
    totalPages = data.total_pages ?? data.totalPages ?? (items.length < limit ? page : page + 1);
    page += 1;
    if (page > 50) break;
  } while (page <= totalPages);

  const detectionSource = opts.source || 'facturapi_sync';
  let inserted = 0;
  let skipped = 0;

  for (const cfdi of allItems) {
    const uuid = cfdi.uuid || cfdi.UUID || cfdi.fiscal_uuid || cfdi.id;
    if (!uuid) { skipped++; continue; }

    const dup = await pool.query(
      `SELECT id FROM accounting_received_invoices
        WHERE fiscal_emitter_id = $1 AND uuid_sat = $2`,
      [emitterId, uuid]
    );
    if (dup.rows.length) { skipped++; continue; }

    const issuer   = cfdi.issuer_info || cfdi.issuer || cfdi.emisor || {};
    const customer = cfdi.customer || cfdi.receiver || cfdi.receptor || {};
    const emisorRfc    = issuer.tax_id || issuer.rfc || cfdi.issuer_tax_id || cfdi.issuer_rfc || null;
    const emisorNombre = issuer.legal_name || issuer.name || cfdi.issuer_legal_name || cfdi.issuer_name || null;
    const total        = parseFloat(cfdi.total ?? 0) || 0;
    const subtotal     = parseFloat(cfdi.subtotal ?? 0) || 0;
    const fechaEmision = cfdi.date || cfdi.created_at || null;
    const formaPago    = cfdi.payment_form || null;
    const metodoPago   = cfdi.payment_method || null;
    const usoCfdi      = cfdi.use || customer.use || null;
    const moneda       = cfdi.currency || 'MXN';
    const folio        = cfdi.folio_number ? String(cfdi.folio_number) : (cfdi.folio || null);
    const serie        = cfdi.series || null;
    const tipo         = cfdi.type || 'I';
    const facturapiId  = cfdi.id || null;
    const pdfUrl       = facturapiId ? `${FACTURAPI_BASE}/invoices/${facturapiId}/pdf` : null;
    const xmlUrl       = facturapiId ? `${FACTURAPI_BASE}/invoices/${facturapiId}/xml` : null;

    await pool.query(
      `INSERT INTO accounting_received_invoices (
          fiscal_emitter_id, uuid_sat, folio, serie,
          emisor_rfc, emisor_nombre,
          receptor_rfc, receptor_nombre,
          tipo_comprobante, uso_cfdi, metodo_pago, forma_pago,
          moneda, subtotal, total, fecha_emision,
          pdf_url, xml_url, facturapi_id, detection_source,
          approval_status, payment_status
       ) VALUES (
          $1,$2,$3,$4,
          $5,$6,
          $7,$8,
          $9,$10,$11,$12,
          $13,$14,$15,$16,
          $17,$18,$19,$20,
          'pending','pending'
       )`,
      [
        emitterId, uuid, folio, serie,
        emisorRfc, emisorNombre,
        e.rfc, customer.legal_name || null,
        tipo, usoCfdi, metodoPago, formaPago,
        moneda, subtotal, total, fechaEmision,
        pdfUrl, xmlUrl, facturapiId, detectionSource,
      ]
    );
    inserted++;
  }

  await pool.query(
    `UPDATE fiscal_emitters
        SET facturapi_last_sync = NOW(), facturapi_last_sync_count = $1
      WHERE id = $2`,
    [inserted, emitterId]
  );

  return {
    emitter_id: emitterId,
    total_found: allItems.length,
    inserted,
    skipped,
    pages_fetched: page - 1,
  };
}

/**
 * Sincroniza TODOS los emisores con Facturapi habilitado (usado por cron).
 */
export async function runFacturapiSyncAll(opts: { days?: number; source?: string } = {}): Promise<any[]> {
  const days = opts.days ?? 30;
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const r = await pool.query(
    `SELECT id, alias FROM fiscal_emitters
      WHERE facturapi_enabled = TRUE AND facturapi_api_key IS NOT NULL`
  );

  const results: any[] = [];
  for (const row of r.rows) {
    try {
      const res = await runFacturapiSync(row.id, {
        from: fromStr,
        to: toStr,
        source: opts.source || 'facturapi_cron',
      });
      results.push({ ...res, alias: row.alias, ok: true });
    } catch (err: any) {
      results.push({ emitter_id: row.id, alias: row.alias, ok: false, error: err.message });
    }
  }
  return results;
}

export const syncFacturapiReceived = async (req: AuthRequest, res: Response): Promise<any> => {
  const emitterId = parseInt(String(req.params.emitterId || ''), 10);
  const { from, to } = req.body || {};
  const userId = req.user?.userId || (req.user as any)?.id;
  const role = req.user?.role;
  if (role === 'accountant') {
    const perm = await pool.query(
      `SELECT 1 FROM accountant_emitter_permissions WHERE user_id=$1 AND fiscal_emitter_id=$2 AND can_view=TRUE`,
      [userId, emitterId]
    );
    if (perm.rowCount === 0) return res.status(403).json({ error: 'Sin acceso a esta empresa' });
  }

  const e = await loadEmitter(emitterId);
  if (!e) return res.status(404).json({ error: 'Emisor no encontrado' });
  if (!e.facturapi_api_key) {
    return res.status(400).json({ error: 'Facturapi no configurado para este emisor' });
  }

  try {
    const result = await runFacturapiSync(emitterId, { from, to, source: 'facturapi_sync' });
    res.json({
      success: true,
      ...result,
      diagnostic: {
        environment: e.facturapi_environment || 'live',
        base_url: FACTURAPI_BASE,
      },
    });
  } catch (err: any) {
    console.error('syncFacturapiReceived:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Error sincronizando con Facturapi',
      detail: err.response?.data?.message || err.message,
      status: err.response?.status,
    });
  }
};

/* =================================================================
 * 6) WEBHOOK — Facturapi nos avisa de eventos (invoice.status_updated, etc.)
 *    URL pública: POST /api/webhooks/facturapi/:emitterId
 *    Configurar en https://app.facturapi.io → Webhooks
 *    No requiere auth (Facturapi no firma payloads en v2 estándar).
 *    Ante cualquier evento gatillamos un sync rápido (últimos 7 días) del emisor.
 * =============================================================== */
export const handleFacturapiWebhook = async (req: Request, res: Response): Promise<any> => {
  try {
    const emitterId = parseInt(String(req.params.emitterId || ''), 10);
    const evt = req.body || {};
    console.log(`[facturapi-webhook] emitter=${emitterId} type=${evt.type || '?'} id=${evt.id || '?'}`);

    // Respondemos inmediatamente para no hacer esperar a Facturapi.
    res.json({ ok: true });

    if (!emitterId) return;
    const days = 7;
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    runFacturapiSync(emitterId, {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      source: 'facturapi_webhook',
    })
      .then((r) => console.log(`[facturapi-webhook] sync ok emitter=${emitterId} inserted=${r.inserted} skipped=${r.skipped}`))
      .catch((err) => console.error(`[facturapi-webhook] sync error emitter=${emitterId}:`, err.message));
  } catch (err: any) {
    console.error('handleFacturapiWebhook:', err.message);
    if (!res.headersSent) res.status(200).json({ ok: false });
  }
};

/* =================================================================
 * 5) DESCARGAR XML / PDF de una factura recibida via Facturapi
 *    Útil para serlo en el frontend con redirect/stream.
 * GET /api/admin/facturapi/:emitterId/download/:type/:facturapiId
 * =============================================================== */
export const downloadFacturapiAttachment = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const emitterId = parseInt(String(req.params.emitterId || ''), 10);
    const facturapiId = String(req.params.facturapiId || '');
    const type = String(req.params.type || '').toLowerCase();
    if (!['xml', 'pdf'].includes(type)) return res.status(400).json({ error: 'type debe ser xml o pdf' });
    const userId = req.user?.userId || (req.user as any)?.id;
    const role = req.user?.role;
    if (role === 'accountant') {
      const perm = await pool.query(
        `SELECT 1 FROM accountant_emitter_permissions WHERE user_id=$1 AND fiscal_emitter_id=$2 AND can_view=TRUE`,
        [userId, emitterId]
      );
      if (perm.rowCount === 0) return res.status(403).json({ error: 'Sin acceso a esta empresa' });
    }
    const e = await loadEmitter(emitterId);
    if (!e || !e.facturapi_api_key) return res.status(400).json({ error: 'Facturapi no configurado' });

    const r = await axios.get(`${FACTURAPI_BASE}/invoices/${facturapiId}/${type}`, {
      ...getFacturapiAuth(e.facturapi_api_key),
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    if (r.status >= 200 && r.status < 300) {
      res.setHeader('Content-Type', type === 'xml' ? 'application/xml' : 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${facturapiId}.${type}"`);
      return res.send(Buffer.from(r.data));
    }
    return res.status(r.status).json({ error: 'No se pudo descargar', detail: r.statusText });
  } catch (err: any) {
    console.error('downloadFacturapiAttachment:', err.message);
    res.status(500).json({ error: err.message });
  }
};
