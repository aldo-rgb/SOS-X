import { Request, Response } from 'express';
import { pool } from './db';
import axios from 'axios';
import crypto from 'crypto';

/* =============================================================================
 * FACTURAMA — Recepción Automática de CFDI (Buzón Fiscal)
 * Multi-emisor: cada RFC tiene credenciales independientes en fiscal_emitters
 *
 * Endpoints públicos esperados (a confirmar contra dashboard de Facturama):
 *   GET  /api-lite/cfdis-recibidos?dateFrom=...&dateTo=...
 *   GET  /api-lite/cfdis-recibidos/{id}/xml
 *   GET  /api-lite/cfdis-recibidos/{id}/pdf
 *   POST /Webhook  (registro de webhook)
 *
 * Si los nombres reales difieren, se ajusta solo aquí (FACTURAMA_PATHS).
 * ===========================================================================*/

const FACTURAMA_BASE_URL_SANDBOX    = 'https://apisandbox.facturama.mx';
const FACTURAMA_BASE_URL_PRODUCTION = 'https://api.facturama.mx';

const FACTURAMA_PATHS = {
    listReceived:   '/api-lite/cfdis-recibidos',
    getReceived:    '/api-lite/cfdis-recibidos/{id}',
    downloadXml:    '/api-lite/cfdis-recibidos/{id}/xml',
    downloadPdf:    '/api-lite/cfdis-recibidos/{id}/pdf',
    listWebhooks:   '/Webhook',
    createWebhook:  '/Webhook',
    deleteWebhook:  '/Webhook/{id}'
};

const getFacturamaUrl = (env: string) =>
    env === 'production' ? FACTURAMA_BASE_URL_PRODUCTION : FACTURAMA_BASE_URL_SANDBOX;

const getFacturamaAuth = (username: string, password: string) => ({
    auth: { username, password },
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
});

interface AuthRequest extends Request {
    user?: { userId: number; id?: number; role?: string; email?: string };
}

async function loadEmitterCredentials(emitterId: number) {
    const r = await pool.query(
        `SELECT id, alias, rfc,
                facturama_username, facturama_password, facturama_environment,
                facturama_reception_enabled, facturama_webhook_secret, facturama_configured
         FROM fiscal_emitters WHERE id=$1`,
        [emitterId]
    );
    return r.rows[0] || null;
}

/* ================================================================
 * 1. CONFIGURACIÓN POR EMISOR
 * ============================================================== */

// GET /api/admin/facturama/config/:emitterId
export const getFacturamaConfig = async (req: Request, res: Response): Promise<any> => {
    try {
        const emitterId = String(req.params.emitterId);
        const r = await pool.query(`
            SELECT id, alias, rfc,
                   facturama_username,
                   facturama_environment,
                   facturama_reception_enabled,
                   facturama_configured,
                   facturama_last_sync,
                   facturama_last_sync_count,
                   CASE WHEN facturama_password IS NOT NULL THEN '********' ELSE NULL END AS has_password,
                   CASE WHEN facturama_webhook_secret IS NOT NULL THEN '********' ELSE NULL END AS has_webhook_secret
            FROM fiscal_emitters WHERE id=$1
        `, [emitterId]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Emisor no encontrado' });
        res.json(r.rows[0]);
    } catch (e) {
        console.error('getFacturamaConfig:', e);
        res.status(500).json({ error: 'Error obteniendo configuración' });
    }
};

// POST /api/admin/facturama/config
export const saveFacturamaConfig = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const {
            emitter_id,
            facturama_username,
            facturama_password,
            facturama_environment,
            facturama_reception_enabled,
            facturama_webhook_secret
        } = req.body;

        if (!emitter_id || !facturama_username || !facturama_password) {
            return res.status(400).json({ error: 'emitter_id, username y password son requeridos' });
        }

        const emp = await pool.query('SELECT id, alias, rfc FROM fiscal_emitters WHERE id=$1', [emitter_id]);
        if (!emp.rows[0]) return res.status(404).json({ error: 'Emisor no encontrado' });

        const env = facturama_environment === 'production' ? 'production' : 'sandbox';

        // Probar credenciales (un endpoint barato)
        const baseUrl = getFacturamaUrl(env);
        let connectionOk = false;
        let connectionDetail: string | null = null;
        try {
            const testRes = await axios.get(
                `${baseUrl}/api-lite/cfdis?type=Issued&take=1`,
                getFacturamaAuth(facturama_username, facturama_password)
            );
            connectionOk = testRes.status >= 200 && testRes.status < 300;
        } catch (err: any) {
            connectionDetail = err.response?.data?.Message
                || err.response?.statusText
                || err.message;
            // No bloqueamos guardado: si las credenciales son del sandbox antes de
            // crear cuenta, igual permitimos persistir y luego se valida.
            console.warn(`[Facturama] credenciales no validadas para emisor ${emitter_id}:`, connectionDetail);
        }

        await pool.query(`
            UPDATE fiscal_emitters SET
                facturama_username = $1,
                facturama_password = $2,
                facturama_environment = $3,
                facturama_reception_enabled = COALESCE($4, facturama_reception_enabled),
                facturama_webhook_secret = COALESCE($5, facturama_webhook_secret),
                facturama_configured = TRUE
            WHERE id = $6
        `, [
            facturama_username,
            facturama_password,
            env,
            facturama_reception_enabled ?? false,
            facturama_webhook_secret ?? null,
            emitter_id
        ]);

        const apiBase = process.env.API_URL || 'https://api.entregax.com';
        res.json({
            success: true,
            connection_ok: connectionOk,
            connection_detail: connectionDetail,
            webhook_url: `${apiBase}/api/webhooks/facturama/${emitter_id}`,
            message: `Facturama (${env}) configurado para ${emp.rows[0].alias}`
        });
    } catch (e: any) {
        console.error('saveFacturamaConfig:', e);
        res.status(500).json({ error: 'Error guardando configuración Facturama' });
    }
};

// POST /api/admin/facturama/test/:emitterId
export const testFacturamaConnection = async (req: Request, res: Response): Promise<any> => {
    try {
        const emitterId = String(req.params.emitterId);
        const cfg = await loadEmitterCredentials(parseInt(emitterId, 10));
        if (!cfg) return res.status(404).json({ error: 'Emisor no encontrado' });
        if (!cfg.facturama_username || !cfg.facturama_password) {
            return res.status(400).json({ ok: false, error: 'Credenciales Facturama no configuradas' });
        }
        const baseUrl = getFacturamaUrl(cfg.facturama_environment || 'sandbox');
        try {
            const r = await axios.get(
                `${baseUrl}/api-lite/cfdis?type=Issued&take=1`,
                getFacturamaAuth(cfg.facturama_username, cfg.facturama_password)
            );
            res.json({ ok: true, status: r.status, environment: cfg.facturama_environment });
        } catch (err: any) {
            res.status(400).json({
                ok: false,
                status: err.response?.status,
                error: err.response?.data?.Message || err.message
            });
        }
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e.message });
    }
};

/* ================================================================
 * 2. SINCRONIZACIÓN MANUAL (pull)
 * Trae CFDIs recibidos en un rango y los inserta en
 * accounting_received_invoices con approval_status='pending'
 * ============================================================== */

// POST /api/admin/facturama/sync/:emitterId  body: { from, to }
export const syncFacturamaReceived = async (req: AuthRequest, res: Response): Promise<any> => {
    const emitterId = String(req.params.emitterId);
    const { from, to } = req.body || {};

    const cfg = await loadEmitterCredentials(parseInt(emitterId, 10));
    if (!cfg) return res.status(404).json({ error: 'Emisor no encontrado' });
    if (!cfg.facturama_configured || !cfg.facturama_username) {
        return res.status(400).json({ error: 'Facturama no configurado para este emisor' });
    }

    const baseUrl = getFacturamaUrl(cfg.facturama_environment || 'sandbox');
    const auth    = getFacturamaAuth(cfg.facturama_username, cfg.facturama_password);

    const params: any = {};
    if (from) params.dateFrom = from;
    if (to)   params.dateTo   = to;

    try {
        const listRes = await axios.get(
            `${baseUrl}${FACTURAMA_PATHS.listReceived}`,
            { ...auth, params }
        );

        const items: any[] = Array.isArray(listRes.data)
            ? listRes.data
            : (listRes.data?.Cfdis || listRes.data?.Items || []);

        let inserted = 0;
        let skipped  = 0;

        for (const cfdi of items) {
            const uuid = cfdi.Uuid || cfdi.UUID || cfdi.uuid || cfdi.complement?.TaxStamp?.Uuid;
            if (!uuid) { skipped++; continue; }

            // ¿Ya existe?
            const dup = await pool.query(
                `SELECT id FROM accounting_received_invoices WHERE fiscal_emitter_id=$1 AND uuid_sat=$2`,
                [emitterId, uuid]
            );
            if (dup.rows.length) { skipped++; continue; }

            const emisorRfc    = cfdi.Issuer?.Rfc           || cfdi.Issuer?.TaxId  || cfdi.IssuerRfc   || null;
            const emisorNombre = cfdi.Issuer?.Name          || cfdi.Issuer?.LegalName || cfdi.IssuerName || null;
            const total        = parseFloat(cfdi.Total ?? cfdi.total ?? 0) || 0;
            const subtotal     = parseFloat(cfdi.SubTotal ?? cfdi.subtotal ?? 0) || 0;
            const fechaEmision = cfdi.Date || cfdi.IssueDate || cfdi.date || null;
            const formaPago    = cfdi.PaymentForm || cfdi.FormaPago || null;
            const metodoPago   = cfdi.PaymentMethod || cfdi.MetodoPago || null;
            const usoCfdi      = cfdi.CfdiUse || cfdi.Receiver?.CfdiUse || null;
            const moneda       = cfdi.Currency || 'MXN';
            const folio        = cfdi.Folio || null;
            const serie        = cfdi.Series || null;
            const facturamaId  = cfdi.Id || cfdi.id || null;
            const pdfUrl       = facturamaId ? `${baseUrl}${FACTURAMA_PATHS.downloadPdf.replace('{id}', facturamaId)}` : null;
            const xmlUrl       = facturamaId ? `${baseUrl}${FACTURAMA_PATHS.downloadXml.replace('{id}', facturamaId)}` : null;

            await pool.query(`
                INSERT INTO accounting_received_invoices (
                    fiscal_emitter_id, uuid_sat, folio, serie,
                    emisor_rfc, emisor_nombre,
                    receptor_rfc, receptor_nombre,
                    tipo_comprobante, uso_cfdi, metodo_pago, forma_pago,
                    moneda, subtotal, total, fecha_emision,
                    pdf_url, xml_url, facturama_id, detection_source,
                    approval_status, payment_status
                ) VALUES (
                    $1,$2,$3,$4,
                    $5,$6,
                    $7,$8,
                    $9,$10,$11,$12,
                    $13,$14,$15,$16,
                    $17,$18,$19,'facturama_sync',
                    'pending','pending'
                )
            `, [
                emitterId, uuid, folio, serie,
                emisorRfc, emisorNombre,
                cfg.rfc, null,
                cfdi.CfdiType || 'I', usoCfdi, metodoPago, formaPago,
                moneda, subtotal, total, fechaEmision,
                pdfUrl, xmlUrl, facturamaId
            ]);
            inserted++;
        }

        await pool.query(`
            UPDATE fiscal_emitters
            SET facturama_last_sync = NOW(), facturama_last_sync_count = $1
            WHERE id=$2
        `, [inserted, emitterId]);

        res.json({ success: true, total_found: items.length, inserted, skipped });
    } catch (err: any) {
        console.error('syncFacturamaReceived:', err.response?.data || err.message);
        res.status(500).json({
            error: 'Error sincronizando con Facturama',
            detail: err.response?.data?.Message || err.message,
            status: err.response?.status
        });
    }
};

/* ================================================================
 * 3. WEBHOOK PÚBLICO (push)
 * POST /api/webhooks/facturama/:emitterId
 * ============================================================== */

function verifyFacturamaSignature(secret: string, payload: any, signature: string | undefined): boolean {
    if (!secret || !signature) return false;
    try {
        const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const computed = crypto.createHmac('sha256', secret).update(body).digest('hex');
        // soportar variantes: hex puro o base64
        if (signature === computed) return true;
        const computedB64 = crypto.createHmac('sha256', secret).update(body).digest('base64');
        return signature === computedB64;
    } catch { return false; }
}

export const handleFacturamaWebhook = async (req: Request, res: Response): Promise<any> => {
    const emitterId = String(req.params.emitterId);
    const signature = (req.headers['x-facturama-signature']
        || req.headers['facturama-signature']
        || req.headers['x-signature']) as string | undefined;

    let logId: number | null = null;
    try {
        const cfg = await loadEmitterCredentials(parseInt(emitterId, 10));
        if (!cfg) return res.status(404).json({ error: 'Emisor no encontrado' });

        const secret = cfg.facturama_webhook_secret || '';
        const valid  = secret ? verifyFacturamaSignature(secret, req.body, signature) : true;

        const logIns = await pool.query(`
            INSERT INTO facturama_webhook_logs
                (fiscal_emitter_id, event_type, raw_payload, signature_header, signature_valid, processed)
            VALUES ($1, $2, $3, $4, $5, FALSE)
            RETURNING id
        `, [
            emitterId,
            req.body?.event || req.body?.Type || 'received_invoice',
            req.body,
            signature || null,
            valid
        ]);
        logId = logIns.rows[0].id;

        if (secret && !valid) {
            return res.status(401).json({ error: 'Firma inválida' });
        }

        const cfdi = req.body?.data || req.body?.Cfdi || req.body;
        const uuid = cfdi?.Uuid || cfdi?.UUID || cfdi?.uuid;
        if (!uuid) {
            await pool.query(`UPDATE facturama_webhook_logs SET error_message=$1 WHERE id=$2`,
                ['Payload sin UUID', logId]);
            return res.status(400).json({ error: 'Payload sin UUID' });
        }

        // Idempotencia
        const dup = await pool.query(
            `SELECT id FROM accounting_received_invoices WHERE fiscal_emitter_id=$1 AND uuid_sat=$2`,
            [emitterId, uuid]
        );
        let invoiceId: number;
        if (dup.rows.length) {
            invoiceId = dup.rows[0].id;
        } else {
            const baseUrl = getFacturamaUrl(cfg.facturama_environment || 'sandbox');
            const facturamaId  = cfdi.Id || cfdi.id || null;
            const pdfUrl       = facturamaId ? `${baseUrl}${FACTURAMA_PATHS.downloadPdf.replace('{id}', facturamaId)}` : null;
            const xmlUrl       = facturamaId ? `${baseUrl}${FACTURAMA_PATHS.downloadXml.replace('{id}', facturamaId)}` : null;

            const ins = await pool.query(`
                INSERT INTO accounting_received_invoices (
                    fiscal_emitter_id, uuid_sat, folio, serie,
                    emisor_rfc, emisor_nombre,
                    receptor_rfc,
                    tipo_comprobante, uso_cfdi, metodo_pago, forma_pago,
                    moneda, subtotal, total, fecha_emision,
                    pdf_url, xml_url, facturama_id, detection_source,
                    approval_status, payment_status
                ) VALUES (
                    $1,$2,$3,$4,
                    $5,$6,
                    $7,
                    $8,$9,$10,$11,
                    $12,$13,$14,$15,
                    $16,$17,$18,'facturama_webhook',
                    'pending','pending'
                ) RETURNING id
            `, [
                emitterId, uuid, cfdi.Folio || null, cfdi.Series || null,
                cfdi.Issuer?.Rfc || cfdi.IssuerRfc || null,
                cfdi.Issuer?.Name || cfdi.Issuer?.LegalName || cfdi.IssuerName || null,
                cfg.rfc,
                cfdi.CfdiType || 'I',
                cfdi.CfdiUse || cfdi.Receiver?.CfdiUse || null,
                cfdi.PaymentMethod || null,
                cfdi.PaymentForm   || null,
                cfdi.Currency || 'MXN',
                parseFloat(cfdi.SubTotal ?? 0) || 0,
                parseFloat(cfdi.Total ?? 0) || 0,
                cfdi.Date || cfdi.IssueDate || null,
                pdfUrl, xmlUrl, facturamaId
            ]);
            invoiceId = ins.rows[0].id;
        }

        await pool.query(`
            UPDATE facturama_webhook_logs
            SET processed=TRUE, received_invoice_id=$1
            WHERE id=$2
        `, [invoiceId, logId]);

        res.json({ ok: true, received_invoice_id: invoiceId });
    } catch (e: any) {
        console.error('handleFacturamaWebhook:', e);
        if (logId) {
            await pool.query(`UPDATE facturama_webhook_logs SET error_message=$1 WHERE id=$2`,
                [e.message?.slice(0, 500) || 'unknown', logId]).catch(() => {});
        }
        res.status(500).json({ error: 'Error procesando webhook' });
    }
};

/* ================================================================
 * 4. CUENTAS POR PAGAR
 * ============================================================== */

async function userCanAccessEmitter(userId: number, role: string | undefined, emitterId: number) {
    if (role === 'admin' || role === 'super_admin' || role === 'director') return true;
    if (role === 'accountant') {
        const r = await pool.query(
            `SELECT 1 FROM accountant_emitter_permissions
             WHERE user_id=$1 AND fiscal_emitter_id=$2 AND can_view=TRUE`,
            [userId, emitterId]
        );
        return r.rows.length > 0;
    }
    return false;
}

// GET /api/accounting/:emitterId/payables?status=pending|approved|rejected|paid
export const listAccountsPayable = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role   = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        if (!userId) return res.status(401).json({ error: 'No autenticado' });
        if (!await userCanAccessEmitter(userId, role, emitterId)) {
            return res.status(403).json({ error: 'Sin acceso a este emisor' });
        }

        const { status, q, from, to } = req.query as any;
        const filters: string[] = ['r.fiscal_emitter_id = $1'];
        const params: any[] = [emitterId];

        if (status) {
            if (status === 'paid') {
                filters.push(`r.payment_status = 'paid'`);
            } else {
                params.push(status);
                filters.push(`r.approval_status = $${params.length}`);
            }
        }
        if (q) {
            params.push(`%${q}%`);
            filters.push(`(r.emisor_nombre ILIKE $${params.length} OR r.emisor_rfc ILIKE $${params.length} OR r.uuid_sat ILIKE $${params.length} OR r.folio ILIKE $${params.length})`);
        }
        if (from) { params.push(from); filters.push(`r.fecha_emision >= $${params.length}`); }
        if (to)   { params.push(to);   filters.push(`r.fecha_emision <= $${params.length}`); }

        const sql = `
            SELECT r.id, r.uuid_sat, r.folio, r.serie,
                   r.emisor_rfc, r.emisor_nombre,
                   r.total, r.subtotal, r.moneda,
                   r.fecha_emision, r.due_date, r.scheduled_payment_date,
                   r.detection_source, r.approval_status, r.payment_status,
                   r.paid_at, r.paid_amount,
                   r.pdf_url, r.xml_url,
                   u.email AS approved_by_email
            FROM accounting_received_invoices r
            LEFT JOIN users u ON u.id = r.approved_by
            WHERE ${filters.join(' AND ')}
            ORDER BY r.fecha_emision DESC NULLS LAST, r.id DESC
            LIMIT 500
        `;
        const result = await pool.query(sql, params);

        // Totales
        const totals = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE approval_status='pending')   AS pending_count,
                COUNT(*) FILTER (WHERE approval_status='approved' AND payment_status<>'paid') AS approved_unpaid_count,
                COUNT(*) FILTER (WHERE payment_status='paid')       AS paid_count,
                COALESCE(SUM(total) FILTER (WHERE approval_status='pending'),0)  AS pending_total,
                COALESCE(SUM(total) FILTER (WHERE approval_status='approved' AND payment_status<>'paid'),0) AS approved_unpaid_total,
                COALESCE(SUM(total) FILTER (WHERE payment_status='paid'),0)     AS paid_total
            FROM accounting_received_invoices WHERE fiscal_emitter_id=$1
        `, [emitterId]);

        res.json({ data: result.rows, totals: totals.rows[0] });
    } catch (e: any) {
        console.error('listAccountsPayable:', e);
        res.status(500).json({ error: 'Error listando cuentas por pagar' });
    }
};

// POST /api/accounting/:emitterId/payables/:invoiceId/approve
export const approveAccountPayable = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role   = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const invoiceId = parseInt(String(req.params.invoiceId), 10);
        if (!userId) return res.status(401).json({ error: 'No autenticado' });
        if (!await userCanAccessEmitter(userId, role, emitterId)) {
            return res.status(403).json({ error: 'Sin acceso a este emisor' });
        }
        const { due_date, scheduled_payment_date, notes } = req.body || {};
        const r = await pool.query(`
            UPDATE accounting_received_invoices
            SET approval_status='approved',
                approved_by=$1,
                approved_at=NOW(),
                due_date=COALESCE($2, due_date),
                scheduled_payment_date=COALESCE($3, scheduled_payment_date),
                notes=COALESCE($4, notes)
            WHERE id=$5 AND fiscal_emitter_id=$6
            RETURNING id, approval_status
        `, [userId, due_date || null, scheduled_payment_date || null, notes || null, invoiceId, emitterId]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Factura no encontrada' });
        res.json({ success: true, invoice: r.rows[0] });
    } catch (e: any) {
        console.error('approveAccountPayable:', e);
        res.status(500).json({ error: 'Error aprobando factura' });
    }
};

// POST /api/accounting/:emitterId/payables/:invoiceId/reject
export const rejectAccountPayable = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role   = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const invoiceId = parseInt(String(req.params.invoiceId), 10);
        if (!userId) return res.status(401).json({ error: 'No autenticado' });
        if (!await userCanAccessEmitter(userId, role, emitterId)) {
            return res.status(403).json({ error: 'Sin acceso a este emisor' });
        }
        const { reason } = req.body || {};
        const r = await pool.query(`
            UPDATE accounting_received_invoices
            SET approval_status='rejected',
                approved_by=$1,
                approved_at=NOW(),
                rejection_reason=$2
            WHERE id=$3 AND fiscal_emitter_id=$4
            RETURNING id, approval_status
        `, [userId, reason || null, invoiceId, emitterId]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Factura no encontrada' });
        res.json({ success: true, invoice: r.rows[0] });
    } catch (e: any) {
        console.error('rejectAccountPayable:', e);
        res.status(500).json({ error: 'Error rechazando factura' });
    }
};

// POST /api/accounting/:emitterId/payables/:invoiceId/pay
export const markPayablePaid = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role   = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const invoiceId = parseInt(String(req.params.invoiceId), 10);
        if (!userId) return res.status(401).json({ error: 'No autenticado' });
        if (!await userCanAccessEmitter(userId, role, emitterId)) {
            return res.status(403).json({ error: 'Sin acceso a este emisor' });
        }
        const { paid_amount, paid_reference, paid_at } = req.body || {};
        const r = await pool.query(`
            UPDATE accounting_received_invoices
            SET payment_status='paid',
                paid_at=COALESCE($1, NOW()),
                paid_amount=COALESCE($2, total),
                paid_reference=$3
            WHERE id=$4 AND fiscal_emitter_id=$5 AND approval_status='approved'
            RETURNING id, payment_status, paid_at, paid_amount
        `, [paid_at || null, paid_amount || null, paid_reference || null, invoiceId, emitterId]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Factura no encontrada o no aprobada' });
        res.json({ success: true, invoice: r.rows[0] });
    } catch (e: any) {
        console.error('markPayablePaid:', e);
        res.status(500).json({ error: 'Error marcando pago' });
    }
};
