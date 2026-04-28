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

// Candidatos para listar CFDIs recibidos (los planes Facturama usan distintos paths).
// Se prueban en orden hasta encontrar uno que devuelve datos útiles.
const FACTURAMA_RECEIVED_LIST_CANDIDATES = [
    // Expense / Gastos (módulo "Cuentas por pagar" del portal de Facturama - ExpenseControl)
    { path: '/api-lite/expenses',           params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to, status: 'unpaid' }) },
    { path: '/api-lite/3/expenses',         params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to }) },
    { path: '/api-lite/2/expenses',         params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to }) },
    { path: '/Expense',                     params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to }) },
    { path: '/api-lite/expense',            params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to }) },
    // Accounts payable / Cuentas por pagar
    { path: '/api-lite/accounts-payable',   params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to }) },
    { path: '/api-lite/cuentas-por-pagar',  params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to }) },
    // Buzón Fiscal moderno (requiere RFC del receptor)
    { path: '/api-lite/cfdi-received',      params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to }) },
    { path: '/api-lite/3/cfdi-received',    params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to }) },
    { path: '/api-lite/2/cfdi-received',    params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to }) },
    // Buzón Fiscal antiguo (CFDI emitidos vs recibidos vía type)
    { path: '/api-lite/cfdis',              params: (from?: string, to?: string, rfc?: string) => ({ type: 'received', rfc, dateInitial: from, dateFinal: to }) },
    { path: '/api-lite/2/cfdis',            params: (from?: string, to?: string, rfc?: string) => ({ type: 'received', rfc, dateInitial: from, dateFinal: to }) },
    // Mailbox (lo que estaba respondiendo string vacío - probablemente requiere otro plan)
    { path: '/api-lite/3/cfdis-mailbox',    params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to }) },
    { path: '/api-lite/cfdis-mailbox',      params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateInitial: from, dateFinal: to }) },
    // Endpoint genérico Cfdi con type filter
    { path: '/Cfdi',                        params: (from?: string, to?: string, rfc?: string) => ({ type: 'Received', rfc, dateFrom: from, dateTo: to }) },
    // Originales
    { path: '/api-lite/cfdis-received',     params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateFrom: from, dateTo: to }) },
    { path: '/api-lite/3/cfdis-received',   params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateFrom: from, dateTo: to }) },
    { path: '/api-lite/cfdis-recibidos',    params: (from?: string, to?: string, rfc?: string) => ({ rfc, dateFrom: from, dateTo: to }) },
];

// Endpoints candidatos para probar credenciales (varían según plan API Web vs Multiemisor)
const FACTURAMA_TEST_ENDPOINTS = [
    '/api-lite/2/cfdis?keyword=&take=1',  // API Lite (multiemisor moderno)
    '/2/cfdis?take=1',                    // API Web v2
    '/api-lite/cfdis?type=Issued&take=1', // legacy
    '/Account',                           // perfil de cuenta
    '/Catalogs/Currencies'                // catálogo (requiere auth)
];

async function probeFacturamaCredentials(baseUrl: string, username: string, password: string) {
    for (const path of FACTURAMA_TEST_ENDPOINTS) {
        try {
            const r = await axios.get(`${baseUrl}${path}`, {
                ...getFacturamaAuth(username, password),
                validateStatus: () => true
            });
            if (r.status >= 200 && r.status < 300) {
                return { ok: true, endpoint: path, status: r.status };
            }
            // 401/403 = credenciales malas → cortar y reportar
            if (r.status === 401 || r.status === 403) {
                return { ok: false, endpoint: path, status: r.status, message: r.data?.Message || 'Credenciales rechazadas' };
            }
            // 404 = endpoint no existe en su plan → seguimos con el siguiente
        } catch (err: any) {
            // network error: continuar
            console.warn(`[Facturama] probe ${path} falló:`, err.message);
        }
    }
    return { ok: false, message: 'Ningún endpoint de prueba respondió OK (probable plan/path distinto, igualmente se guardó)' };
}

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
                facturama_reception_enabled, facturama_webhook_secret, facturama_configured,
                facturama_portal_email, facturama_portal_password
         FROM fiscal_emitters WHERE id=$1`,
        [emitterId]
    );
    return r.rows[0] || null;
}

/* ================================================================
 * PORTAL SCRAPER (app.facturama.mx) — login + GetVoucher
 * Endpoint NO oficial pero el único que devuelve facturas recibidas reales.
 * Usa cookies de sesión (.ASPXAUTH + ASP.NET_SessionId).
 * ============================================================== */

const FACTURAMA_PORTAL_BASE = 'https://app.facturama.mx';

interface PortalSession {
    cookies: string;          // string a usar como header Cookie en peticiones siguientes
    requestVerificationToken?: string;
}

function extractCookies(setCookieHeader: string[] | string | undefined): string {
    if (!setCookieHeader) return '';
    const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    return arr.map(c => c.split(';')[0]).join('; ');
}

function mergeCookies(prev: string, addSetCookie: string[] | string | undefined): string {
    const fresh = extractCookies(addSetCookie);
    if (!fresh) return prev;
    if (!prev) return fresh;
    // sobreescribir cookies con mismo nombre
    const map = new Map<string, string>();
    for (const piece of prev.split('; ')) {
        const eq = piece.indexOf('=');
        if (eq > 0) map.set(piece.slice(0, eq), piece.slice(eq + 1));
    }
    for (const piece of fresh.split('; ')) {
        const eq = piece.indexOf('=');
        if (eq > 0) map.set(piece.slice(0, eq), piece.slice(eq + 1));
    }
    return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function loginFacturamaPortal(email: string, password: string): Promise<{
    session: PortalSession | null;
    diagnostic: any;
}> {
    const diagnostic: any = {
        email_used: email,
        steps: [],
    };
    try {
        // 1) GET /Account/Login para obtener cookies iniciales y __RequestVerificationToken
        const loginPageRes = await axios.get(`${FACTURAMA_PORTAL_BASE}/Account/Login`, {
            validateStatus: () => true,
            maxRedirects: 0,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SOS-X/1.0)' },
        });
        let cookies = extractCookies(loginPageRes.headers['set-cookie']);
        diagnostic.steps.push({
            step: 'GET /Account/Login',
            status: loginPageRes.status,
            cookies_received: !!cookies,
        });

        // Extraer token CSRF del HTML
        const html: string = typeof loginPageRes.data === 'string' ? loginPageRes.data : '';
        const tokenMatch = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
        const csrfToken: string = tokenMatch && tokenMatch[1] ? tokenMatch[1] : '';
        diagnostic.csrf_found = !!csrfToken;

        // 2) POST /Account/Login con email/password + CSRF token
        const form = new URLSearchParams();
        form.append('Email', email);
        form.append('Password', password);
        form.append('RememberMe', 'false');
        if (csrfToken) form.append('__RequestVerificationToken', csrfToken);

        const loginRes = await axios.post(`${FACTURAMA_PORTAL_BASE}/Account/Login`, form.toString(), {
            validateStatus: () => true,
            maxRedirects: 0,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookies,
                'User-Agent': 'Mozilla/5.0 (compatible; SOS-X/1.0)',
                'Referer': `${FACTURAMA_PORTAL_BASE}/Account/Login`,
            },
        });
        cookies = mergeCookies(cookies, loginRes.headers['set-cookie']);
        diagnostic.steps.push({
            step: 'POST /Account/Login',
            status: loginRes.status,
            location: loginRes.headers?.location || null,
        });

        // Si el login fue exitoso, recibimos cookie .ASPXAUTH
        const hasAuth = /\.ASPXAUTH=/i.test(cookies);
        diagnostic.has_aspxauth = hasAuth;

        if (!hasAuth) {
            // Intentar extraer mensaje de error del HTML que devuelve el portal
            const respHtml: string = typeof loginRes.data === 'string' ? loginRes.data : '';
            const errMatch = respHtml.match(/<li>([^<]{5,200})<\/li>/i)
                          || respHtml.match(/validation-summary-errors[^>]*>\s*<ul>\s*<li>([^<]+)/i)
                          || respHtml.match(/field-validation-error[^>]*>([^<]+)/i);
            diagnostic.portal_error_message = errMatch && errMatch[1] ? errMatch[1].trim() : null;
            diagnostic.html_sample = respHtml.slice(0, 400);
            console.warn('[FacturamaPortal] login fallido. Mensaje portal:', diagnostic.portal_error_message);
            return { session: null, diagnostic };
        }
        return {
            session: { cookies, requestVerificationToken: csrfToken },
            diagnostic,
        };
    } catch (err: any) {
        console.error('[FacturamaPortal] login error:', err.message);
        diagnostic.error = err.message;
        return { session: null, diagnostic };
    }
}

/**
 * Llama a /Accounting/ExpenseControl/GetVoucher con las cookies de sesión.
 * Retorna array de facturas recibidas { Id, Folio, ClientName, Total, Date, Type, Paid... }
 */
async function getPortalVouchers(session: PortalSession, paid: boolean = false): Promise<{
    invoices: any[];
    diagnostic: any;
}> {
    const form = new URLSearchParams();
    form.append('valCmbType', 'receivedInvoice');
    form.append('valCmbPaid', paid ? '0' : '1'); // 1 = sin pagar, 0 = pagadas (a confirmar)

    const r = await axios.post(`${FACTURAMA_PORTAL_BASE}/Accounting/ExpenseControl/GetVoucher`,
        form.toString(),
        {
            validateStatus: () => true,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Cookie': session.cookies,
                'User-Agent': 'Mozilla/5.0 (compatible; SOS-X/1.0)',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': `${FACTURAMA_PORTAL_BASE}/Accounting/ExpenseControl`,
                'Accept': 'application/json, text/javascript, */*; q=0.01',
            },
        }
    );

    const data = r.data;
    const diagnostic: any = {
        status: r.status,
        paid_filter: paid,
        response_type: typeof data,
        is_array: Array.isArray(data),
    };
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        diagnostic.response_keys = Object.keys(data).slice(0, 10);
        diagnostic.invoices_length = Array.isArray(data.invoices) ? data.invoices.length : null;
        diagnostic.PageMax = data.PageMax;
        diagnostic.PageCurrent = data.PageCurrent;
    }

    if (r.status !== 200) {
        console.warn(`[FacturamaPortal] GetVoucher status ${r.status}`);
        if (typeof data === 'string') {
            diagnostic.html_sample = data.slice(0, 300);
        }
        return { invoices: [], diagnostic };
    }

    if (data && Array.isArray(data.invoices)) return { invoices: data.invoices, diagnostic };
    if (Array.isArray(data)) return { invoices: data, diagnostic };
    if (typeof data === 'string') diagnostic.html_sample = data.slice(0, 300);
    return { invoices: [], diagnostic };
}

/**
 * Convierte fecha .NET "/Date(1777380232000)/" a Date.
 */
function parseDotNetDate(s: any): Date | null {
    if (!s || typeof s !== 'string') return null;
    const m = s.match(/\/Date\((-?\d+)\)\//);
    if (!m || !m[1]) return null;
    return new Date(parseInt(m[1], 10));
}

// POST /api/admin/facturama/sync-portal/:emitterId
export const syncFacturamaPortal = async (req: AuthRequest, res: Response): Promise<any> => {
    const emitterId = String(req.params.emitterId);
    const cfg = await loadEmitterCredentials(parseInt(emitterId, 10));
    if (!cfg) return res.status(404).json({ error: 'Emisor no encontrado' });

    // Las credenciales del PORTAL pueden ser las mismas que las del API (caen al fallback)
    const email = cfg.facturama_portal_email || cfg.facturama_username;
    const password = cfg.facturama_portal_password || cfg.facturama_password;
    const usingFallback = !cfg.facturama_portal_email && !!cfg.facturama_username;

    if (!email || !password) {
        return res.status(400).json({
            error: 'Credenciales del portal Facturama no configuradas',
            detail: 'Agrega facturama_portal_email y facturama_portal_password (o usa los del API si son los mismos) en la configuración del emisor.',
        });
    }

    const loginResult = await loginFacturamaPortal(email, password);
    if (!loginResult.session) {
        const portalMsg = loginResult.diagnostic?.portal_error_message;
        return res.status(401).json({
            error: 'No fue posible iniciar sesión en app.facturama.mx',
            detail: portalMsg
                ? `El portal respondió: "${portalMsg}". ${usingFallback ? 'Estás usando las credenciales del API; quizá las del portal son distintas.' : 'Verifica que el email/password de portal sean correctos.'}`
                : `Login no aceptado. ${usingFallback ? 'Estás usando las credenciales del API como fallback; agrega las credenciales específicas del portal si son distintas.' : 'Verifica las credenciales del portal.'}`,
            using_api_credentials_as_fallback: usingFallback,
            diagnostic: loginResult.diagnostic,
        });
    }

    try {
        // Traer recibidas sin pagar y pagadas
        const [unpaidRes, paidRes] = await Promise.all([
            getPortalVouchers(loginResult.session, false),
            getPortalVouchers(loginResult.session, true),
        ]);
        const unpaid = unpaidRes.invoices;
        const paid = paidRes.invoices;
        const all = [...unpaid, ...paid];

        let inserted = 0;
        let skipped = 0;

        for (const inv of all) {
            const facturamaId = String(inv.Id || '');
            if (!facturamaId || facturamaId === '0') { skipped++; continue; }

            // Idempotencia por facturama_id (no tenemos UUID en este endpoint)
            const dup = await pool.query(
                `SELECT id FROM accounting_received_invoices
                 WHERE fiscal_emitter_id=$1 AND facturama_id=$2`,
                [emitterId, facturamaId]
            );
            if (dup.rows.length) { skipped++; continue; }

            const fecha = parseDotNetDate(inv.Date);
            const folio = inv.Folio ? String(inv.Folio) : null;
            const total = parseFloat(inv.Total ?? 0) || 0;
            const subtotal = parseFloat(inv.SubTot ?? 0) || 0;
            const moneda = inv.Currency || 'MXN';
            const emisorNombre = inv.ClientName || null;
            const isPaid = inv.Paid === 1 || inv.Paid === true;

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
                    $17,$18,$19,'facturama_portal',
                    'pending',$20
                )
            `, [
                emitterId,
                facturamaId, // usamos facturama_id como uuid_sat temporal hasta que descarguemos el XML
                folio, null,
                null, emisorNombre,
                cfg.rfc, null,
                'I', null, null, null,
                moneda, subtotal, total, fecha,
                null, null, facturamaId,
                isPaid ? 'paid' : 'pending'
            ]);
            inserted++;
        }

        await pool.query(`
            UPDATE fiscal_emitters
            SET facturama_last_sync = NOW(), facturama_last_sync_count = $1
            WHERE id=$2
        `, [inserted, emitterId]);

        return res.json({
            success: true,
            total_found: all.length,
            inserted,
            skipped,
            unpaid_count: unpaid.length,
            paid_count: paid.length,
            mode: 'portal_scraper',
            using_api_credentials_as_fallback: usingFallback,
            diagnostic: {
                login: loginResult.diagnostic,
                unpaid_request: unpaidRes.diagnostic,
                paid_request: paidRes.diagnostic,
            },
        });
    } catch (err: any) {
        console.error('syncFacturamaPortal:', err.message);
        return res.status(500).json({
            error: 'Error sincronizando con el portal Facturama',
            detail: err.message,
        });
    }
};

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
                   facturama_portal_email,
                   CASE WHEN facturama_password IS NOT NULL THEN '********' ELSE NULL END AS has_password,
                   CASE WHEN facturama_webhook_secret IS NOT NULL THEN '********' ELSE NULL END AS has_webhook_secret,
                   CASE WHEN facturama_portal_password IS NOT NULL THEN '********' ELSE NULL END AS has_portal_password
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
            facturama_webhook_secret,
            facturama_portal_email,
            facturama_portal_password,
        } = req.body;

        if (!emitter_id || !facturama_username || !facturama_password) {
            return res.status(400).json({ error: 'emitter_id, username y password son requeridos' });
        }

        const emp = await pool.query('SELECT id, alias, rfc FROM fiscal_emitters WHERE id=$1', [emitter_id]);
        if (!emp.rows[0]) return res.status(404).json({ error: 'Emisor no encontrado' });

        const env = facturama_environment === 'production' ? 'production' : 'sandbox';

        // Probar credenciales contra varios endpoints conocidos
        const baseUrl = getFacturamaUrl(env);
        const probe = await probeFacturamaCredentials(baseUrl, facturama_username, facturama_password);
        const connectionOk = probe.ok;
        const connectionDetail = probe.ok
            ? `OK via ${probe.endpoint}`
            : (probe.message || 'Conexión no validada');
        if (!probe.ok) {
            console.warn(`[Facturama] credenciales no validadas para emisor ${emitter_id}:`, connectionDetail);
        }

        await pool.query(`
            UPDATE fiscal_emitters SET
                facturama_username = $1,
                facturama_password = $2,
                facturama_environment = $3,
                facturama_reception_enabled = COALESCE($4, facturama_reception_enabled),
                facturama_webhook_secret = COALESCE($5, facturama_webhook_secret),
                facturama_configured = TRUE,
                facturama_portal_email = COALESCE($6, facturama_portal_email),
                facturama_portal_password = COALESCE($7, facturama_portal_password)
            WHERE id = $8
        `, [
            facturama_username,
            facturama_password,
            env,
            facturama_reception_enabled ?? false,
            facturama_webhook_secret ?? null,
            facturama_portal_email || null,
            facturama_portal_password || null,
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
        const probe = await probeFacturamaCredentials(baseUrl, cfg.facturama_username, cfg.facturama_password);
        if (probe.ok) {
            res.json({ ok: true, status: probe.status, endpoint: probe.endpoint, environment: cfg.facturama_environment });
        } else {
            res.status(400).json({ ok: false, status: probe.status, error: probe.message, environment: cfg.facturama_environment });
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

    try {
        // Probar varios paths hasta encontrar el que devuelve datos útiles
        let listRes: any = null;
        let usedPath: string | null = null;
        const triedPaths: string[] = [];
        let firstSuccessRes: any = null;
        let firstSuccessPath: string | null = null;

        for (const candidate of FACTURAMA_RECEIVED_LIST_CANDIDATES) {
            const params: any = {};
            const built = candidate.params(from, to, cfg.rfc);
            for (const [k, v] of Object.entries(built)) {
                if (v !== undefined && v !== null && v !== '') params[k] = v;
            }
            try {
                const r = await axios.get(`${baseUrl}${candidate.path}`, {
                    ...auth,
                    params,
                    validateStatus: () => true,
                });
                const dataPreview = typeof r.data === 'string'
                    ? `string(${r.data.length})`
                    : (Array.isArray(r.data) ? `array(${r.data.length})` : `obj(${r.data ? Object.keys(r.data).length : 0})`);
                triedPaths.push(`${candidate.path}→${r.status}:${dataPreview}`);

                if (r.status >= 200 && r.status < 300) {
                    // Guardamos el primer success por si todos están vacíos
                    if (!firstSuccessRes) {
                        firstSuccessRes = r;
                        firstSuccessPath = candidate.path;
                    }
                    // Verificar si tiene datos reales (array no vacío u objeto con campos útiles)
                    const hasItems = Array.isArray(r.data)
                        ? r.data.length > 0
                        : (r.data && typeof r.data === 'object' && (
                            (r.data.Cfdis?.length > 0) || (r.data.Items?.length > 0) ||
                            (r.data.Data?.length > 0) || (r.data.Results?.length > 0) ||
                            (r.data.value?.length > 0)
                          ));
                    if (hasItems) {
                        listRes = r;
                        usedPath = candidate.path;
                        break;
                    }
                }
                // 401/403: credenciales mal → no tiene sentido seguir probando
                if (r.status === 401 || r.status === 403) {
                    return res.status(401).json({
                        error: 'Credenciales Facturama rechazadas',
                        detail: r.data?.Message || 'Verifica usuario/contraseña y ambiente (sandbox/producción).',
                        status: r.status,
                    });
                }
            } catch (e: any) {
                triedPaths.push(`${candidate.path}→err:${e.message}`);
            }
        }

        // Si ningún endpoint devolvió datos pero alguno devolvió 200, usamos ese (probablemente el plan no tiene Buzón Fiscal)
        if (!listRes && firstSuccessRes) {
            listRes = firstSuccessRes;
            usedPath = firstSuccessPath;
        }

        if (!listRes || !usedPath) {
            return res.status(404).json({
                error: 'No se encontró un endpoint compatible para CFDIs recibidos',
                detail: 'Tu plan de Facturama puede no incluir Buzón Fiscal / Recepción de CFDI. Contacta a Facturama o desactiva la sincronización.',
                tried: triedPaths,
            });
        }
        console.log(`[Facturama] sync usando endpoint ${usedPath}`);

        // Extraer items del response (Facturama varía la forma según endpoint)
        const rawData = listRes.data;
        let items: any[] = [];
        if (Array.isArray(rawData)) {
            items = rawData;
        } else if (rawData && typeof rawData === 'object') {
            items = rawData.Cfdis || rawData.Items || rawData.Data
                 || rawData.cfdis || rawData.items || rawData.data
                 || rawData.Results || rawData.results
                 || rawData.value || [];
        }

        // Diagnóstico: log de la forma del response
        const responseShape = Array.isArray(rawData)
            ? `Array(${rawData.length})`
            : (rawData && typeof rawData === 'object'
                ? `Object{${Object.keys(rawData).slice(0, 8).join(',')}}`
                : typeof rawData);
        console.log(`[Facturama] response shape: ${responseShape}, items extraídos: ${items.length}`);
        if (items.length > 0) {
            console.log(`[Facturama] primer item keys:`, Object.keys(items[0]).slice(0, 15).join(','));
        }

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

        // Diagnóstico devuelto al frontend para debugging
        const diagnostic: any = {
            endpoint_used: usedPath,
            environment: cfg.facturama_environment || 'sandbox',
            base_url: baseUrl,
            response_shape: responseShape,
            tried: triedPaths,
        };
        if (items.length === 0 && rawData && typeof rawData === 'object') {
            diagnostic.response_keys = Object.keys(rawData).slice(0, 20);
            diagnostic.response_sample = JSON.stringify(rawData).slice(0, 500);
        }
        if (items.length === 0 && typeof rawData === 'string') {
            diagnostic.response_sample = rawData.slice(0, 1000);
        }
        if (items.length === 0 && Array.isArray(rawData)) {
            diagnostic.response_sample = `Array vacío (length=${rawData.length})`;
        }

        res.json({ success: true, total_found: items.length, inserted, skipped, diagnostic });
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
 * 2.b REGISTRAR WEBHOOK EN FACTURAMA (auto-config push)
 * POST /api/admin/facturama/register-webhook/:emitterId
 * Body: { webhook_url, secret? }
 * Intenta registrar la URL en la cuenta Facturama vía /Webhook (varios paths).
 * Si Facturama no expone API de webhooks (depende del plan), devuelve la URL
 * y secret para configurar manualmente desde el portal.
 * ============================================================== */
const FACTURAMA_WEBHOOK_REGISTER_PATHS = [
    '/api-lite/webhooks',
    '/api-lite/3/webhooks',
    '/Webhook',
    '/api-lite/webhook',
];

export const registerFacturamaWebhook = async (req: AuthRequest, res: Response): Promise<any> => {
    const emitterId = String(req.params.emitterId);
    const { webhook_url, secret } = req.body || {};
    if (!webhook_url) return res.status(400).json({ error: 'webhook_url requerido' });

    const cfg = await loadEmitterCredentials(parseInt(emitterId, 10));
    if (!cfg) return res.status(404).json({ error: 'Emisor no encontrado' });
    if (!cfg.facturama_configured || !cfg.facturama_username) {
        return res.status(400).json({ error: 'Facturama no configurado para este emisor' });
    }

    const baseUrl = getFacturamaUrl(cfg.facturama_environment || 'sandbox');
    const auth    = getFacturamaAuth(cfg.facturama_username, cfg.facturama_password);

    // Generar secret aleatorio si no se proveyó
    const finalSecret = secret || crypto.randomBytes(24).toString('hex');

    const tried: string[] = [];
    let registered: any = null;

    // Eventos que nos interesan (los nombres exactos varían por proveedor)
    const payloadVariants = [
        { Url: webhook_url, Event: 'CfdiReceived',  Secret: finalSecret, Active: true },
        { url: webhook_url, event: 'cfdi.received', secret: finalSecret, active: true },
        { Url: webhook_url, Events: ['CfdiReceived', 'CfdiRecibido'], Secret: finalSecret },
        { Url: webhook_url, Type: 'received_invoice', Secret: finalSecret },
    ];

    outer: for (const path of FACTURAMA_WEBHOOK_REGISTER_PATHS) {
        for (const payload of payloadVariants) {
            try {
                const r = await axios.post(`${baseUrl}${path}`, payload, {
                    ...auth,
                    validateStatus: () => true,
                });
                tried.push(`POST ${path} ${JSON.stringify(payload).slice(0, 60)}→${r.status}`);
                if (r.status >= 200 && r.status < 300) {
                    registered = { path, payload, response: r.data };
                    break outer;
                }
                if (r.status === 401 || r.status === 403) {
                    return res.status(401).json({
                        error: 'Credenciales Facturama rechazadas',
                        tried,
                    });
                }
            } catch (e: any) {
                tried.push(`POST ${path} → err:${e.message}`);
            }
        }
    }

    // Persistir el secret aunque el registro automático haya fallado
    await pool.query(`
        UPDATE fiscal_emitters
        SET facturama_webhook_secret = $1,
            facturama_reception_enabled = TRUE
        WHERE id = $2
    `, [finalSecret, emitterId]);

    if (registered) {
        return res.json({
            success: true,
            mode: 'auto',
            registered_at: registered.path,
            webhook_url,
            secret: finalSecret,
            message: 'Webhook registrado automáticamente en Facturama.',
        });
    }

    return res.json({
        success: true,
        mode: 'manual',
        webhook_url,
        secret: finalSecret,
        tried,
        message: 'Facturama no expone API de registro de webhooks en tu plan. Configura el webhook manualmente desde tu portal de Facturama (Configuración → Webhooks/Notificaciones) usando la URL y el Secret de abajo. SOS-X ya tiene guardado el Secret y validará la firma cuando lleguen eventos.',
        portal_hint: cfg.facturama_environment === 'production'
            ? 'https://consola.facturama.com.mx → Configuración → Webhooks'
            : 'https://dev.facturama.mx → Configuración → Webhooks',
    });
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
