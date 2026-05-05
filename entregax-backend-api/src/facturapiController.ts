// facturapiController.ts — Integración con Facturapi.io para DESCARGA
// de facturas recibidas (CFDIs). Facturama queda dedicado a la EMISIÓN.
//
// API de Facturapi (Buzón / Recibidas):
//   Base: https://www.facturapi.io/v2
//   Auth: Basic <base64(secret_key:)>  (nota el ':' final, password vacío)
//   GET  /received                       - Listar
//   GET  /received/{id}                  - Detalle
//   GET  /received/{id}/xml              - Descargar XML
//   GET  /received/{id}/pdf              - Descargar PDF
//
// Multi-emisor: cada fiscal_emitter tiene su propia API key.

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
    const r = await axios.get(`${FACTURAPI_BASE}/received`, {
      ...getFacturapiAuth(e.facturapi_api_key),
      params: { page: 1, limit: 1 },
      validateStatus: () => true,
    });
    if (r.status >= 200 && r.status < 300) {
      return res.json({ success: true, status: r.status, sample_total: r.data?.total_results ?? r.data?.total ?? null });
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
export const syncFacturapiReceived = async (req: AuthRequest, res: Response): Promise<any> => {
  const emitterId = parseInt(String(req.params.emitterId || ''), 10);
  const { from, to } = req.body || {};

  const e = await loadEmitter(emitterId);
  if (!e) return res.status(404).json({ error: 'Emisor no encontrado' });
  if (!e.facturapi_api_key) {
    return res.status(400).json({ error: 'Facturapi no configurado para este emisor' });
  }

  const auth = getFacturapiAuth(e.facturapi_api_key);

  try {
    // Facturapi soporta paginado: page=1..N, limit hasta 50
    const limit = 50;
    let page = 1;
    let totalPages = 1;
    let allItems: any[] = [];
    const triedParams: any[] = [];

    do {
      const params: any = { page, limit };
      if (from) params['date[gt]'] = `${from}T00:00:00`;
      if (to)   params['date[lt]'] = `${to}T23:59:59`;
      triedParams.push({ ...params });

      const r = await axios.get(`${FACTURAPI_BASE}/received`, {
        ...auth,
        params,
        validateStatus: () => true,
      });

      if (r.status === 401 || r.status === 403) {
        return res.status(401).json({
          error: 'Credenciales Facturapi rechazadas',
          detail: r.data?.message || 'Verifica la API key y el ambiente.',
          status: r.status,
        });
      }
      if (r.status === 404) {
        return res.status(404).json({
          error: 'Tu cuenta de Facturapi no tiene habilitada la "Bandeja de Recibidas"',
          detail: r.data?.message || 'Resource not found',
          how_to_fix: [
            '1. Ingresa a https://app.facturapi.io',
            '2. Ve a la sección "Recibidas" o "Buzón Fiscal" del menú lateral',
            '3. Activa el módulo siguiendo el asistente (te pedirá tu e.firma o CSF para autorizar la descarga desde el SAT)',
            '4. Espera ~30 minutos a que Facturapi haga la primera sincronización con el SAT',
            '5. Vuelve a intentar la sincronización aquí',
          ].join('\n'),
          docs: 'https://docs.facturapi.io/api/#tag/Recibidas',
        });
      }
      if (r.status < 200 || r.status >= 300) {
        return res.status(r.status).json({
          error: 'Facturapi respondió con error',
          detail: r.data?.message || r.data,
        });
      }

      const data = r.data || {};
      const items = Array.isArray(data) ? data : (data.data || data.results || []);
      allItems.push(...items);
      totalPages = data.total_pages ?? data.totalPages ?? (items.length < limit ? page : page + 1);
      page += 1;
      if (page > 50) break; // safeguard máx 2500 facturas por sync
    } while (page <= totalPages);

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

      const issuer = cfdi.issuer || {};
      const receiver = cfdi.receiver || {};
      const emisorRfc    = issuer.tax_id || issuer.rfc || cfdi.issuer_rfc || null;
      const emisorNombre = issuer.legal_name || issuer.name || cfdi.issuer_name || null;
      const total        = parseFloat(cfdi.total ?? 0) || 0;
      const subtotal     = parseFloat(cfdi.subtotal ?? 0) || 0;
      const fechaEmision = cfdi.date || cfdi.created_at || null;
      const formaPago    = cfdi.payment_form || null;
      const metodoPago   = cfdi.payment_method || null;
      const usoCfdi      = cfdi.use || receiver.use || null;
      const moneda       = cfdi.currency || 'MXN';
      const folio        = cfdi.folio_number ? String(cfdi.folio_number) : (cfdi.folio || null);
      const serie        = cfdi.series || null;
      const tipo         = cfdi.type || 'I';
      const facturapiId  = cfdi.id || null;
      const pdfUrl       = facturapiId ? `${FACTURAPI_BASE}/received/${facturapiId}/pdf` : null;
      const xmlUrl       = facturapiId ? `${FACTURAPI_BASE}/received/${facturapiId}/xml` : null;

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
            $17,$18,$19,'facturapi_sync',
            'pending','pending'
         )`,
        [
          emitterId, uuid, folio, serie,
          emisorRfc, emisorNombre,
          e.rfc, receiver.legal_name || null,
          tipo, usoCfdi, metodoPago, formaPago,
          moneda, subtotal, total, fechaEmision,
          pdfUrl, xmlUrl, facturapiId,
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

    res.json({
      success: true,
      total_found: allItems.length,
      inserted,
      skipped,
      pages_fetched: page - 1,
      diagnostic: {
        environment: e.facturapi_environment || 'live',
        base_url: FACTURAPI_BASE,
        tried: triedParams,
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
    const e = await loadEmitter(emitterId);
    if (!e || !e.facturapi_api_key) return res.status(400).json({ error: 'Facturapi no configurado' });

    const r = await axios.get(`${FACTURAPI_BASE}/received/${facturapiId}/${type}`, {
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
