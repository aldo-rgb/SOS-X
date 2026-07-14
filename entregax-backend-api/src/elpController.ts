/**
 * API ELP — Integración con proveedor externo de trámite aduanal / CBP (USA).
 *
 * Flujo:
 *  1. Cada ruta marítima tiene un flag `elp_enabled`. Los contenedores de esas
 *     rutas son visibles/entregables al proveedor ELP.
 *  2. Al "Aprobar y Registrar" un borrador (Correos Marítimos) cuya ruta es ELP,
 *     se manda un correo a ELP_NOTIFY_EMAIL avisándole que haga GET de documentos.
 *  3. El proveedor autentica con header `X-ELP-Api-Key` y hace GET de los
 *     documentos (URLs directas de S3) por número de contenedor.
 *  4. El proveedor manda pulsos de status (docs_received, procedure_requested,
 *     cbp_signature_received, arrived_port) que actualizan el contenedor.
 */
import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';
import { AuthRequest } from './authController';
import { sendEmail } from './emailService';
import { signS3UrlIfNeeded } from './s3Service';

// El bucket S3 es privado, así que las URLs de documentos se entregan FIRMADAS
// (válidas 7 días). El proveedor puede volver a hacer GET para refrescarlas.
const ELP_DOC_URL_TTL = 7 * 24 * 3600;

const ELP_API_KEY = process.env.ELP_API_KEY || '';
const ELP_NOTIFY_EMAIL = process.env.ELP_NOTIFY_EMAIL || 'aldocampos@entregax.com';

// Estados que el proveedor ELP puede reportar (subconjunto del ciclo del contenedor).
const ELP_ALLOWED_STATUSES = ['docs_received', 'procedure_requested', 'cbp_signature_received', 'arrived_port'];
const ELP_STATUS_LABELS: Record<string, string> = {
  docs_received: 'Documentos Recibidos',
  procedure_requested: 'Trámite Solicitado',
  cbp_signature_received: 'Firma Electrónica CBP Recibida',
  arrived_port: 'Arribo a Puerto',
};

export const isElpConfigured = (): boolean => Boolean(ELP_API_KEY);

// ---------------------------------------------------------------------------
// Auth del proveedor: header X-ELP-Api-Key (comparación timing-safe)
// ---------------------------------------------------------------------------
export const requireElpApiKey = (req: Request, res: Response, next: () => void) => {
  if (!ELP_API_KEY) {
    return res.status(503).json({ error: 'ELP no configurado (falta ELP_API_KEY)' });
  }
  const provided = String(req.headers['x-elp-api-key'] || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(ELP_API_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'API key inválida' });
  }
  next();
};

// ---------------------------------------------------------------------------
// Helper: junta las URLs de documentos de un contenedor.
// BL/Telex viven en container_costs; ISF-Word/Invoice/Packing en el borrador.
// ---------------------------------------------------------------------------
const CONTAINER_DOC_SQL = `
  SELECT c.id, c.container_number, c.bl_number, c.reference_code, c.status,
         c.route_id, c.week_number, c.eta, c.elp_notified_at,
         r.code AS route_code, COALESCE(r.elp_enabled, false) AS elp_enabled,
         cc.bl_document_pdf, cc.telex_release_pdf,
         d.pdf_url AS draft_bl, d.telex_pdf_url AS draft_telex,
         d.summary_excel_url AS draft_summary, d.extracted_data AS draft_data
    FROM containers c
    LEFT JOIN maritime_routes r ON r.id = c.route_id
    LEFT JOIN container_costs cc ON cc.container_id = c.id
    LEFT JOIN LATERAL (
      SELECT md.pdf_url, md.telex_pdf_url, md.summary_excel_url, md.extracted_data
        FROM maritime_reception_drafts md
       WHERE md.container_number = c.container_number
          OR (c.bl_number IS NOT NULL AND md.bl_number = c.bl_number)
       ORDER BY md.id DESC
       LIMIT 1
    ) d ON true
`;

const buildDocuments = (row: any) => {
  const ed = row.draft_data || {};
  return {
    bl: row.bl_document_pdf || row.draft_bl || null,
    telex_isf: row.telex_release_pdf || row.draft_telex || null,
    isf_word: ed.isf_word_url || null,
    invoice: ed.invoice_url || null,
    packing_list: row.draft_summary || ed.summary_excel_url || null,
  };
};

// Igual que buildDocuments pero firmando cada URL de S3 (bucket privado).
const buildSignedDocuments = async (row: any) => {
  const d = buildDocuments(row);
  const [bl, telex_isf, isf_word, invoice, packing_list] = await Promise.all([
    signS3UrlIfNeeded(d.bl, ELP_DOC_URL_TTL),
    signS3UrlIfNeeded(d.telex_isf, ELP_DOC_URL_TTL),
    signS3UrlIfNeeded(d.isf_word, ELP_DOC_URL_TTL),
    signS3UrlIfNeeded(d.invoice, ELP_DOC_URL_TTL),
    signS3UrlIfNeeded(d.packing_list, ELP_DOC_URL_TTL),
  ]);
  return { bl, telex_isf, isf_word, invoice, packing_list };
};

const getContainerRowByNumber = async (containerNumber: string) => {
  const r = await pool.query(`${CONTAINER_DOC_SQL} WHERE UPPER(c.container_number) = UPPER($1) LIMIT 1`, [containerNumber]);
  return r.rows[0] || null;
};

const logElpEvent = async (
  containerId: number | null,
  containerNumber: string | null,
  direction: string,
  event: string,
  payload: any,
  statusCode: number
) => {
  try {
    await pool.query(
      `INSERT INTO elp_event_logs (container_id, container_number, direction, event, payload, status_code)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [containerId, containerNumber, direction, event, payload ? JSON.stringify(payload) : null, statusCode]
    );
  } catch (e: any) {
    console.error('[ELP] Error guardando log:', e.message);
  }
};

// ===========================================================================
// NOTIFICACIÓN AL PROVEEDOR (disparada al aprobar un borrador de ruta ELP)
// ===========================================================================
/**
 * Si el contenedor pertenece a una ruta ELP y aún no se notificó, manda el
 * correo al proveedor y marca elp_notified_at. Idempotente. No lanza errores.
 */
export const maybeNotifyElpForContainer = async (containerNumber?: string | null, blNumber?: string | null) => {
  try {
    if (!containerNumber && !blNumber) return;
    const r = await pool.query(
      `${CONTAINER_DOC_SQL}
        WHERE ($1::text IS NOT NULL AND UPPER(c.container_number) = UPPER($1))
           OR ($2::text IS NOT NULL AND UPPER(COALESCE(c.bl_number,'')) = UPPER($2))
        ORDER BY c.id DESC LIMIT 1`,
      [containerNumber || null, blNumber || null]
    );
    const row = r.rows[0];
    if (!row) return;
    if (!row.elp_enabled) return;            // ruta no comunica con ELP
    if (row.elp_notified_at) return;         // ya notificado

    const docs = buildDocuments(row);
    const subject = `[ELP] Contenedor recibido: ${row.container_number} — realizar GET`;
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
        <h2 style="color:#3949AB;margin-bottom:4px">Nuevo contenedor listo para trámite (ELP)</h2>
        <p>Se registró un contenedor en una ruta habilitada para ELP. Por favor realiza un GET
        en tu sistema para obtener las URLs de los documentos.</p>
        <table style="border-collapse:collapse">
          <tr><td style="padding:2px 8px"><b>Contenedor</b></td><td style="padding:2px 8px">${row.container_number || '—'}</td></tr>
          <tr><td style="padding:2px 8px"><b>BL</b></td><td style="padding:2px 8px">${row.bl_number || '—'}</td></tr>
          <tr><td style="padding:2px 8px"><b>Referencia</b></td><td style="padding:2px 8px">${row.reference_code || '—'}</td></tr>
          <tr><td style="padding:2px 8px"><b>Ruta</b></td><td style="padding:2px 8px">${row.route_code || '—'}</td></tr>
          <tr><td style="padding:2px 8px"><b>Week</b></td><td style="padding:2px 8px">${row.week_number || '—'}</td></tr>
        </table>
        <p style="margin-top:12px"><b>Endpoint:</b><br/>
        <code>GET /api/elp/containers/${encodeURIComponent(row.container_number)}/documents</code><br/>
        (header <code>X-ELP-Api-Key</code>)</p>
        <p style="color:#666;font-size:12px">Documentos disponibles:
          ${docs.bl ? 'BL ' : ''}${docs.telex_isf ? 'Telex/ISF ' : ''}${docs.isf_word ? 'ISF-Word ' : ''}${docs.invoice ? 'Invoice ' : ''}${docs.packing_list ? 'Packing ' : ''}
        </p>
      </div>`;
    const result = await sendEmail(ELP_NOTIFY_EMAIL, subject, html);

    await pool.query('UPDATE containers SET elp_notified_at = NOW() WHERE id = $1', [row.id]);
    await logElpEvent(row.id, row.container_number, 'email_sent', result.ok ? 'notify_ok' : 'notify_fail', { to: ELP_NOTIFY_EMAIL, messageId: result.messageId, error: result.error }, result.ok ? 200 : 500);
    console.log(`📧 [ELP] Notificación enviada a ${ELP_NOTIFY_EMAIL} por contenedor ${row.container_number} (ok=${result.ok})`);
  } catch (e: any) {
    console.error('[ELP] maybeNotifyElpForContainer error:', e.message);
  }
};

// ===========================================================================
// ENDPOINTS PARA EL PROVEEDOR (auth: X-ELP-Api-Key)
// ===========================================================================

// GET /api/elp/containers — lista de contenedores de rutas ELP
export const elpListContainers = async (req: Request, res: Response): Promise<any> => {
  try {
    const r = await pool.query(`
      SELECT c.container_number, c.bl_number, c.reference_code, c.status,
             r.code AS route_code, c.week_number, c.eta, c.elp_notified_at
        FROM containers c
        JOIN maritime_routes r ON r.id = c.route_id AND r.elp_enabled = true
       ORDER BY c.created_at DESC NULLS LAST, c.id DESC
       LIMIT 1000
    `);
    res.json({ ok: true, count: r.rows.length, containers: r.rows });
  } catch (e: any) {
    console.error('[ELP] elpListContainers error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

// GET /api/elp/containers/:ref/documents — URLs directas de documentos
export const elpGetDocuments = async (req: Request, res: Response): Promise<any> => {
  try {
    const ref = String(req.params.ref || '');
    const row = await getContainerRowByNumber(ref);
    if (!row) {
      await logElpEvent(null, ref, 'outbound_docs', 'not_found', null, 404);
      return res.status(404).json({ error: `Contenedor no encontrado: ${ref}` });
    }
    if (!row.elp_enabled) {
      await logElpEvent(row.id, row.container_number, 'outbound_docs', 'route_not_elp', null, 403);
      return res.status(403).json({ error: 'La ruta de este contenedor no está habilitada para ELP' });
    }
    const documents = await buildSignedDocuments(row);
    await logElpEvent(row.id, row.container_number, 'outbound_docs', 'documents_fetched', null, 200);
    res.json({
      ok: true,
      container_number: row.container_number,
      bl_number: row.bl_number,
      reference_code: row.reference_code,
      route_code: row.route_code,
      status: row.status,
      documents,
    });
  } catch (e: any) {
    console.error('[ELP] elpGetDocuments error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

// POST /api/elp/containers/:ref/status — pulso de status del proveedor
export const elpReceiveStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const ref = String(req.params.ref || '');
    const status = String(req.body?.status || '').trim();
    if (!ELP_ALLOWED_STATUSES.includes(status)) {
      await logElpEvent(null, ref, 'inbound_status', 'invalid_status', req.body, 400);
      return res.status(400).json({
        error: 'Estado inválido para ELP',
        allowed: ELP_ALLOWED_STATUSES,
      });
    }
    const row = await getContainerRowByNumber(ref);
    if (!row) {
      await logElpEvent(null, ref, 'inbound_status', 'not_found', req.body, 404);
      return res.status(404).json({ error: `Contenedor no encontrado: ${ref}` });
    }
    if (!row.elp_enabled) {
      await logElpEvent(row.id, row.container_number, 'inbound_status', 'route_not_elp', req.body, 403);
      return res.status(403).json({ error: 'La ruta de este contenedor no está habilitada para ELP' });
    }

    const previousStatus = row.status;
    await pool.query('UPDATE containers SET status = $1, updated_at = NOW() WHERE id = $2', [status, row.id]);
    // Auditoría en el historial estándar del contenedor
    await pool.query(
      `INSERT INTO container_status_history (container_id, previous_status, new_status, changed_by_name, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, previousStatus, status, 'ELP (proveedor)', req.body?.notes || `Pulso ELP: ${ELP_STATUS_LABELS[status]}`]
    );
    await logElpEvent(row.id, row.container_number, 'inbound_status', status, req.body, 200);

    res.json({
      ok: true,
      container_number: row.container_number,
      previous_status: previousStatus,
      new_status: status,
      label: ELP_STATUS_LABELS[status],
    });
  } catch (e: any) {
    console.error('[ELP] elpReceiveStatus error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

// ===========================================================================
// ENDPOINTS ADMIN (auth: login normal) — para la página "API ELP"
// ===========================================================================

// GET /api/elp/admin/containers — contenedores de rutas ELP + documentos + status
export const elpAdminListContainers = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const r = await pool.query(`
      ${CONTAINER_DOC_SQL}
      WHERE COALESCE(r.elp_enabled, false) = true
      ORDER BY c.created_at DESC NULLS LAST, c.id DESC
      LIMIT 1000
    `);
    const containers = await Promise.all(r.rows.map(async (row: any) => {
      const documents = await buildSignedDocuments(row);
      const docCount = Object.values(documents).filter(Boolean).length;
      return {
        id: row.id,
        container_number: row.container_number,
        bl_number: row.bl_number,
        reference_code: row.reference_code,
        route_code: row.route_code,
        status: row.status,
        status_label: ELP_STATUS_LABELS[row.status] || row.status,
        week_number: row.week_number,
        eta: row.eta,
        elp_notified_at: row.elp_notified_at,
        doc_count: docCount,
        documents,
      };
    }));
    res.json({ ok: true, count: containers.length, containers });
  } catch (e: any) {
    console.error('[ELP] elpAdminListContainers error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

// GET /api/elp/admin/stats
export const elpAdminStats = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.elp_notified_at IS NOT NULL)::int AS notificados,
        COUNT(*) FILTER (WHERE c.status = 'docs_received')::int AS docs_received,
        COUNT(*) FILTER (WHERE c.status = 'procedure_requested')::int AS procedure_requested,
        COUNT(*) FILTER (WHERE c.status = 'cbp_signature_received')::int AS cbp_signature_received,
        COUNT(*) FILTER (WHERE c.status = 'arrived_port')::int AS arrived_port
      FROM containers c
      JOIN maritime_routes r ON r.id = c.route_id AND r.elp_enabled = true
    `);
    res.json({ ok: true, stats: r.rows[0], configured: isElpConfigured() });
  } catch (e: any) {
    console.error('[ELP] elpAdminStats error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

// POST /api/elp/admin/containers/:id/notify — reenviar correo al proveedor (manual)
export const elpAdminResendNotify = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const cr = await pool.query('SELECT container_number, bl_number FROM containers WHERE id = $1', [id]);
    if (cr.rows.length === 0) return res.status(404).json({ error: 'Contenedor no encontrado' });
    // Forzar reenvío: limpiar la marca y volver a notificar
    await pool.query('UPDATE containers SET elp_notified_at = NULL WHERE id = $1', [id]);
    await maybeNotifyElpForContainer(cr.rows[0].container_number, cr.rows[0].bl_number);
    res.json({ ok: true, message: 'Notificación reenviada al proveedor ELP' });
  } catch (e: any) {
    console.error('[ELP] elpAdminResendNotify error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
