import { Request, Response } from 'express';
import { Pool } from 'pg';
import { FacturamaClient, FacturamaError } from './facturamaClient';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

interface AuthRequest extends Request {
    user?: { userId: number; id?: number; role?: string; email?: string };
}

/**
 * Verifica si el usuario es admin/super_admin (acceso total)
 * o accountant con permiso sobre el emitter.
 */
async function checkEmitterAccess(userId: number, role: string | undefined, emitterId: number): Promise<{ ok: boolean; perms?: any }>{
    if (role === 'admin' || role === 'super_admin' || role === 'director') {
        return { ok: true, perms: { can_view: true, can_emit_invoice: true, can_cancel_invoice: true } };
    }
    if (role === 'accountant') {
        const r = await pool.query(
            `SELECT can_view, can_emit_invoice, can_cancel_invoice
             FROM accountant_emitter_permissions
             WHERE user_id=$1 AND fiscal_emitter_id=$2`,
            [userId, emitterId]
        );
        if (r.rows[0]?.can_view) return { ok: true, perms: r.rows[0] };
    }
    return { ok: false };
}

/**
 * GET /api/accounting/my-emitters
 * Lista de empresas (fiscal_emitters) a las que el usuario tiene acceso.
 * Admin ve todos; accountant sólo los permitidos.
 */
export const getMyEmitters = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });

        let emitters;
        if (role === 'admin' || role === 'super_admin' || role === 'director') {
            const r = await pool.query(
                `SELECT fe.id, fe.alias, fe.rfc, fe.business_name, fe.fiscal_regime, fe.zip_code, fe.is_active, fe.logo_url, fe.created_at,
                        COALESCE(
                          (SELECT array_agg(DISTINCT scc.service_type ORDER BY scc.service_type)
                             FROM service_company_config scc
                             WHERE scc.emitter_id = fe.id AND scc.is_active = TRUE),
                          ARRAY[]::text[]
                        ) AS service_types
                 FROM fiscal_emitters fe
                 WHERE fe.is_active=TRUE
                 ORDER BY fe.alias ASC`
            );
            emitters = r.rows.map(e => ({ ...e, perms: { can_view: true, can_emit_invoice: true, can_cancel_invoice: true } }));
        } else if (role === 'accountant') {
            const r = await pool.query(
                `SELECT fe.id, fe.alias, fe.rfc, fe.business_name, fe.fiscal_regime, fe.zip_code, fe.is_active, fe.logo_url, fe.created_at,
                        p.can_view, p.can_emit_invoice, p.can_cancel_invoice,
                        COALESCE(
                          (SELECT array_agg(DISTINCT scc.service_type ORDER BY scc.service_type)
                             FROM service_company_config scc
                             WHERE scc.emitter_id = fe.id AND scc.is_active = TRUE),
                          ARRAY[]::text[]
                        ) AS service_types
                 FROM fiscal_emitters fe
                 INNER JOIN accountant_emitter_permissions p ON p.fiscal_emitter_id = fe.id
                 WHERE p.user_id = $1 AND fe.is_active = TRUE
                 ORDER BY fe.alias ASC`,
                [userId]
            );
            emitters = r.rows.map(e => ({
                id: e.id, alias: e.alias, rfc: e.rfc, business_name: e.business_name,
                fiscal_regime: e.fiscal_regime, zip_code: e.zip_code, is_active: e.is_active,
                logo_url: e.logo_url, created_at: e.created_at, service_types: e.service_types || [],
                perms: { can_view: e.can_view, can_emit_invoice: e.can_emit_invoice, can_cancel_invoice: e.can_cancel_invoice }
            }));
        } else {
            return res.status(403).json({ error: 'Rol sin acceso al portal contable' });
        }

        return res.json({ success: true, emitters });
    } catch (e: any) {
        console.error('getMyEmitters:', e);
        res.status(500).json({ error: 'Error listando empresas', message: e.message });
    }
};

/**
 * GET /api/accounting/:emitterId/summary
 * Resumen de la empresa: facturas emitidas, canceladas, pendientes por timbrar.
 */
export const getEmitterSummary = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });

        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso a esta empresa' });

        // Empresa
        const eRes = await pool.query(`SELECT id, alias, rfc, business_name, fiscal_regime, zip_code FROM fiscal_emitters WHERE id=$1`, [emitterId]);
        if (eRes.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' });
        const emitter = eRes.rows[0];

        // Facturas emitidas vía Facturama
        const invCnt = await pool.query(`SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status='valid' OR status IS NULL)::int AS activas,
             COUNT(*) FILTER (WHERE status='canceled' OR canceled_at IS NOT NULL)::int AS canceladas,
             COALESCE(SUM(total) FILTER (WHERE status='valid' OR status IS NULL), 0)::numeric AS monto_activo
             FROM facturas_emitidas
             WHERE payment_id IN (
                SELECT id FROM pobox_payments WHERE 1=1
             )
             OR facturama_id IS NOT NULL
             OR facturapi_id IS NOT NULL`
        ).catch(() => ({ rows: [{ total: 0, activas: 0, canceladas: 0, monto_activo: 0 }] }));

        // Pendientes por timbrar: pagos marcados requiere_factura=true pero sin factura
        const pendCnt = await pool.query(`
            SELECT COUNT(*)::int AS pendientes
            FROM pobox_payments pp
            WHERE pp.requiere_factura = TRUE
              AND pp.facturada = FALSE
              AND pp.status = 'completed'
        `).catch(() => ({ rows: [{ pendientes: 0 }] }));

        return res.json({
            success: true,
            emitter,
            stats: {
                invoices_active: invCnt.rows[0]?.activas || 0,
                invoices_canceled: invCnt.rows[0]?.canceladas || 0,
                invoices_total: invCnt.rows[0]?.total || 0,
                invoice_amount_active: parseFloat(invCnt.rows[0]?.monto_activo || 0),
                pending_to_stamp: pendCnt.rows[0]?.pendientes || 0,
            },
            permissions: access.perms,
        });
    } catch (e: any) {
        console.error('getEmitterSummary:', e);
        res.status(500).json({ error: 'Error obteniendo resumen', message: e.message });
    }
};

/**
 * GET /api/accounting/:emitterId/invoices
 * Lista las facturas emitidas por esa empresa (facturas_emitidas).
 * Filtros opcionales por query: ?status=valid|canceled&from=YYYY-MM-DD&to=YYYY-MM-DD&search=folio o RFC
 */
export const listEmitterInvoices = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });

        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso a esta empresa' });

        const { status, from, to, search } = req.query;
        const eRes = await pool.query(`SELECT rfc, business_name FROM fiscal_emitters WHERE id=$1`, [emitterId]);
        if (eRes.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' });

        // Filtro principal por fiscal_emitter_id (asignado por createInvoice). Las filas legacy sin emitter_id no se listan.
        const conds: string[] = [`f.fiscal_emitter_id = $1`];
        const params: any[] = [emitterId];
        if (status === 'valid') { conds.push(`(f.status='valid' OR f.status IS NULL) AND f.canceled_at IS NULL`); }
        if (status === 'canceled') { conds.push(`(f.status='canceled' OR f.canceled_at IS NOT NULL)`); }
        if (from) { params.push(from); conds.push(`f.created_at >= $${params.length}`); }
        if (to) { params.push(to); conds.push(`f.created_at <= $${params.length}`); }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(`(f.folio ILIKE $${i} OR f.receptor_rfc ILIKE $${i} OR f.receptor_razon_social ILIKE $${i} OR f.uuid_sat ILIKE $${i})`);
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

        const r = await pool.query(`
            SELECT f.id, f.facturama_id, f.facturapi_id, f.uuid_sat, f.folio, f.serie, f.receptor_rfc, f.receptor_razon_social,
                   f.subtotal, f.total, f.currency, f.payment_form, f.status, f.canceled_at, f.cancellation_reason,
                   f.pdf_url, f.xml_url, f.created_at,
                   u.full_name AS cliente_nombre, u.email AS cliente_email
            FROM facturas_emitidas f
            LEFT JOIN users u ON u.id = f.user_id
            ${where}
            ORDER BY f.created_at DESC
            LIMIT 500
        `, params);

        return res.json({ success: true, invoices: r.rows });
    } catch (e: any) {
        console.error('listEmitterInvoices:', e);
        res.status(500).json({ error: 'Error listando facturas', message: e.message });
    }
};

/**
 * GET /api/accounting/:emitterId/pending-stamp
 * Lista pagos completados con requiere_factura=true pero sin facturar.
 */
export const listPendingStamp = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });

        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso a esta empresa' });

        const r = await pool.query(`
            SELECT pp.id, pp.payment_reference, pp.amount, pp.currency, pp.payment_method,
                   pp.paid_at, pp.created_at, pp.facturada, pp.factura_error,
                   u.id AS user_id, u.full_name, u.email, u.rfc, u.razon_social
            FROM pobox_payments pp
            LEFT JOIN users u ON u.id = pp.user_id
            WHERE pp.requiere_factura = TRUE
              AND COALESCE(pp.facturada, FALSE) = FALSE
              AND pp.status = 'completed'
            ORDER BY pp.paid_at DESC
            LIMIT 200
        `).catch(err => {
            console.warn('pending-stamp query (fallback):', err.message);
            return pool.query(`
                SELECT pp.id, pp.payment_reference, pp.amount, pp.currency, pp.payment_method,
                       pp.paid_at, pp.created_at, pp.facturada, pp.factura_error,
                       u.id AS user_id, u.full_name, u.email
                FROM pobox_payments pp
                LEFT JOIN users u ON u.id = pp.user_id
                WHERE pp.requiere_factura = TRUE
                  AND COALESCE(pp.facturada, FALSE) = FALSE
                  AND pp.status = 'completed'
                ORDER BY pp.paid_at DESC
                LIMIT 200
            `);
        });

        return res.json({ success: true, pending: r.rows });
    } catch (e: any) {
        console.error('listPendingStamp:', e);
        res.status(500).json({ error: 'Error listando pendientes', message: e.message });
    }
};

// Mapa de métodos de pago EntregaX → código SAT forma_pago
const FORMA_PAGO_MAP: Record<string, string> = {
    card: '04',        // Tarjeta de crédito
    debit_card: '28',  // Tarjeta de débito
    cash: '01',        // Efectivo
    transfer: '03',    // Transferencia electrónica
    spei: '03',
    openpay: '04',
    paypal: '31',      // Intermediario de pagos
};

/**
 * POST /api/fiscal/invoice/manual
 * Emite un CFDI por Facturama para un pago completado con requiere_factura=true.
 */
export const emitManualCFDI = async (req: AuthRequest, res: Response): Promise<any> => {
    const userId = req.user?.userId || (req.user as any)?.id;
    const role = req.user?.role;
    const { payment_id, fiscal_emitter_id } = req.body;

    if (!payment_id || !fiscal_emitter_id) {
        return res.status(400).json({ error: 'Faltan payment_id o fiscal_emitter_id' });
    }

    const access = await checkEmitterAccess(userId!, role, Number(fiscal_emitter_id));
    if (!access.ok) return res.status(403).json({ error: 'Sin acceso a esta empresa' });

    try {
        // 1. Obtener datos del pago y del usuario
        const payRes = await pool.query(`
            SELECT pp.id, pp.payment_reference, pp.amount, pp.currency, pp.payment_method,
                   pp.paid_at, pp.facturada, pp.user_id,
                   u.full_name, u.email, u.rfc, u.razon_social,
                   u.regimen_fiscal, u.cfdi_zip, u.zip_code
            FROM pobox_payments pp
            LEFT JOIN users u ON u.id = pp.user_id
            WHERE pp.id = $1 AND pp.status = 'completed'
        `, [payment_id]);

        if (payRes.rows.length === 0) {
            return res.status(404).json({ error: 'Pago no encontrado o no completado' });
        }
        const pay = payRes.rows[0];

        if (pay.facturada) {
            return res.status(409).json({ error: 'Este pago ya fue facturado' });
        }

        // 2. Datos del receptor (usar XAXX si no tiene RFC fiscal)
        const receptorRfc = pay.rfc?.toUpperCase()?.trim() || 'XAXX010101000';
        const receptorNombre = pay.razon_social?.trim() || pay.full_name?.trim() || 'Público en General';
        const regimenFiscal = pay.regimen_fiscal?.trim() || '616'; // 616 = Sin obligaciones fiscales (PF)
        const cpReceptor = pay.cfdi_zip?.trim() || pay.zip_code?.trim() || '06600';
        const formaPago = FORMA_PAGO_MAP[pay.payment_method] || '99'; // 99 = Por definir

        // 3. Crear cliente Facturama con credenciales del emisor
        const client = await FacturamaClient.fromEmitterId(fiscal_emitter_id);

        // 4. Emitir CFDI
        const invoice = await client.invoices.create({
            customer: {
                legal_name: receptorNombre,
                tax_id: receptorRfc,
                tax_system: regimenFiscal,
                address: { zip: cpReceptor },
                email: pay.email || undefined,
            },
            items: [{
                quantity: 1,
                product: {
                    description: `Servicio de logística - Ref: ${pay.payment_reference || pay.id}`,
                    product_key: '78101803', // Servicios de logística y transporte
                    unit_key: 'E48',
                    price: parseFloat(pay.amount),
                    taxes: [{ type: 'IVA', rate: 0.16 }],
                },
            }],
            payment_form: formaPago,
            payment_method: 'PUE',
            use: receptorRfc === 'XAXX010101000' ? 'S01' : 'G03',
            currency: pay.currency || 'MXN',
        });

        // 5. Guardar en facturas_emitidas
        await pool.query(`
            INSERT INTO facturas_emitidas
                (user_id, fiscal_emitter_id, facturama_id, uuid_sat, folio, serie,
                 receptor_rfc, receptor_razon_social, subtotal, total, currency,
                 payment_form, status, pdf_url, xml_url, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'valid',$13,$14,NOW())
        `, [
            pay.user_id, fiscal_emitter_id,
            invoice.id, invoice.uuid, invoice.folio_number, invoice.series || null,
            receptorRfc, receptorNombre,
            invoice.subtotal, invoice.total, invoice.currency,
            formaPago, invoice.pdf_url, invoice.xml_url,
        ]);

        // 6. Marcar el pago como facturado
        await pool.query(
            `UPDATE pobox_payments SET facturada=TRUE, factura_error=NULL WHERE id=$1`,
            [payment_id]
        );

        return res.json({ success: true, invoice_id: invoice.id, uuid: invoice.uuid, pdf_url: invoice.pdf_url });

    } catch (e: any) {
        const errMsg = e instanceof FacturamaError
            ? (e.details?.Message || e.details?.message || e.message)
            : e.message;

        // Guardar el error en el pago para mostrarlo en la UI
        await pool.query(
            `UPDATE pobox_payments SET factura_error=$1 WHERE id=$2`,
            [errMsg, payment_id]
        ).catch(() => {});

        console.error('[emitManualCFDI]', errMsg);
        return res.status(500).json({ error: 'Error al emitir CFDI', message: errMsg });
    }
};

/**
 * GET /api/accounting/:emitterId/fiscal-clients?search=...
 * Busca clientes con datos fiscales (rfc + razón social) en la tabla `users`
 * para autocompletar el receptor en el modal de "Nueva Factura".
 */
export const searchFiscalClients = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });

        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso a esta empresa' });

        const search = String(req.query.search || '').trim();
        const params: any[] = [];
        let where = `WHERE u.rfc IS NOT NULL AND LENGTH(TRIM(u.rfc)) >= 12`;
        if (search) {
            params.push(`%${search}%`);
            where += ` AND (u.rfc ILIKE $${params.length} OR u.razon_social ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
        }

        const r = await pool.query(`
            SELECT u.id, u.full_name, u.email,
                   UPPER(TRIM(u.rfc)) AS rfc,
                   COALESCE(u.razon_social, u.full_name) AS razon_social,
                   u.regimen_fiscal,
                   COALESCE(u.cfdi_zip, u.zip_code) AS cp
              FROM users u
             ${where}
             ORDER BY u.razon_social ASC NULLS LAST, u.full_name ASC
             LIMIT 25
        `, params);

        return res.json({ success: true, clients: r.rows });
    } catch (e: any) {
        console.error('searchFiscalClients:', e);
        res.status(500).json({ error: 'Error buscando clientes fiscales', message: e.message });
    }
};

/**
 * Calcula el total de impuestos (traslados y retenciones) de un concepto.
 * Cada item devuelve { subtotal, taxes[], totalTaxes, totalRetentions, total }.
 */
function buildItemTaxBreakdown(it: {
    quantity: number; unit_price: number; discount?: number;
    iva_rate?: number; ieps_rate?: number;
    iva_retention_rate?: number; isr_retention_rate?: number;
}) {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unit_price) || 0;
    const discount = Number(it.discount) || 0;
    const subtotalRaw = qty * price;
    const subtotal = +(subtotalRaw - discount).toFixed(2);

    const taxes: Array<{ type: 'IVA' | 'IEPS' | 'ISR'; rate: number; withholding?: boolean }> = [];
    if (it.iva_rate != null && Number(it.iva_rate) > 0) {
        taxes.push({ type: 'IVA', rate: Number(it.iva_rate) });
    }
    if (it.ieps_rate != null && Number(it.ieps_rate) > 0) {
        taxes.push({ type: 'IEPS', rate: Number(it.ieps_rate) });
    }
    if (it.iva_retention_rate != null && Number(it.iva_retention_rate) > 0) {
        taxes.push({ type: 'IVA', rate: Number(it.iva_retention_rate), withholding: true });
    }
    if (it.isr_retention_rate != null && Number(it.isr_retention_rate) > 0) {
        taxes.push({ type: 'ISR', rate: Number(it.isr_retention_rate), withholding: true });
    }
    return { subtotal, taxes };
}

/**
 * POST /api/accounting/:emitterId/invoices/manual
 * Crea y timbra un CFDI desde cero (sin requerir un pago previo en pobox_payments).
 * Body:
 *   {
 *     receptor: { rfc, razon_social, regimen_fiscal, cp, uso_cfdi, email?, user_id? },
 *     items: [{ description, quantity, unit_price, sat_clave_prod_serv, sat_clave_unidad,
 *               no_identificacion?, discount?, iva_rate?, ieps_rate?,
 *               iva_retention_rate?, isr_retention_rate? }],
 *     payment_form, payment_method, currency?, tipo_cambio?, serie?, folio?
 *   }
 */
export const createManualInvoice = async (req: AuthRequest, res: Response): Promise<any> => {
    const userId = req.user?.userId || (req.user as any)?.id;
    const role = req.user?.role;
    const emitterId = parseInt(String(req.params.emitterId), 10);
    if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });

    const access = await checkEmitterAccess(userId!, role, emitterId);
    if (!access.ok || !access.perms?.can_emit_invoice) {
        return res.status(403).json({ error: 'Sin permiso para emitir facturas en esta empresa' });
    }

    const body = req.body || {};
    const receptor = body.receptor || {};
    const items: any[] = Array.isArray(body.items) ? body.items : [];

    // Validaciones mínimas
    const receptorRfc = String(receptor.rfc || '').toUpperCase().trim();
    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(receptorRfc)) {
        return res.status(400).json({ error: 'RFC del receptor inválido' });
    }
    const receptorNombre = String(receptor.razon_social || '').trim();
    if (!receptorNombre) return res.status(400).json({ error: 'Razón social del receptor es requerida' });
    const regimenFiscal = String(receptor.regimen_fiscal || '').trim();
    if (!regimenFiscal) return res.status(400).json({ error: 'Régimen fiscal del receptor es requerido' });
    const cpReceptor = String(receptor.cp || '').trim();
    if (!/^\d{5}$/.test(cpReceptor)) return res.status(400).json({ error: 'Código postal del receptor inválido' });
    const usoCfdi = String(receptor.uso_cfdi || (receptorRfc === 'XAXX010101000' ? 'S01' : 'G03')).trim();

    if (items.length === 0) return res.status(400).json({ error: 'Agrega al menos un concepto' });
    for (const [i, it] of items.entries()) {
        if (!it.description) return res.status(400).json({ error: `Concepto #${i + 1}: descripción requerida` });
        if (!it.sat_clave_prod_serv) return res.status(400).json({ error: `Concepto #${i + 1}: clave SAT prod/serv requerida` });
        if (!(Number(it.quantity) > 0)) return res.status(400).json({ error: `Concepto #${i + 1}: cantidad debe ser mayor a 0` });
        if (!(Number(it.unit_price) >= 0)) return res.status(400).json({ error: `Concepto #${i + 1}: precio inválido` });
    }

    const paymentForm = String(body.payment_form || '99').trim();
    const paymentMethod = (body.payment_method === 'PPD' ? 'PPD' : 'PUE') as 'PUE' | 'PPD';
    const currency = String(body.currency || 'MXN').toUpperCase();
    const serie = body.serie ? String(body.serie) : undefined;
    const folio = body.folio ? Number(body.folio) : undefined;

    try {
        const client = await FacturamaClient.fromEmitterId(emitterId);

        // Validar que el emisor tenga datos fiscales completos antes de mandar
        // a Facturama (mejor mensaje que "Bad Request" genérico).
        if (!client.emitter.fiscal_regime) {
            return res.status(400).json({ error: 'La empresa emisora no tiene régimen fiscal configurado. Edítala en la sección Empresas.' });
        }
        if (!client.emitter.zip_code) {
            return res.status(400).json({ error: 'La empresa emisora no tiene CP de expedición configurado. Edítala en la sección Empresas.' });
        }

        const facturapiItems = items.map((it: any) => {
            const { taxes } = buildItemTaxBreakdown(it);
            return {
                quantity: Number(it.quantity),
                product: {
                    description: String(it.description),
                    product_key: String(it.sat_clave_prod_serv),
                    unit_key: it.sat_clave_unidad ? String(it.sat_clave_unidad) : 'E48',
                    price: Number(it.unit_price),
                    taxes,
                },
            };
        });

        const cfdiPayload: any = {
            customer: {
                legal_name: receptorNombre,
                tax_id: receptorRfc,
                tax_system: regimenFiscal,
                address: { zip: cpReceptor },
            },
            items: facturapiItems,
            payment_form: paymentForm,
            payment_method: paymentMethod,
            use: usoCfdi,
            currency,
        };
        if (receptor.email) cfdiPayload.customer.email = receptor.email;
        if (typeof folio === 'number' && Number.isFinite(folio)) cfdiPayload.folio_number = folio;
        if (serie) cfdiPayload.series = serie;
        const invoice = await client.invoices.create(cfdiPayload);

        // Persistir en facturas_emitidas
        const linkedUserId = receptor.user_id ? Number(receptor.user_id) : null;
        await pool.query(`
            INSERT INTO facturas_emitidas
                (user_id, fiscal_emitter_id, facturama_id, uuid_sat, folio, serie,
                 receptor_rfc, receptor_razon_social, subtotal, total, currency,
                 payment_form, status, pdf_url, xml_url, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'valid',$13,$14,NOW())
        `, [
            linkedUserId, emitterId,
            invoice.id, invoice.uuid, invoice.folio_number, invoice.series || null,
            receptorRfc, receptorNombre,
            invoice.subtotal, invoice.total, invoice.currency,
            paymentForm, invoice.pdf_url, invoice.xml_url,
        ]);

        return res.json({
            success: true,
            invoice_id: invoice.id,
            uuid: invoice.uuid,
            folio: invoice.folio_number,
            total: invoice.total,
            pdf_url: invoice.pdf_url,
            xml_url: invoice.xml_url,
        });
    } catch (e: any) {
        // Facturama suele devolver { Message, ModelState: { 'campo': ['detalle'] } }
        const facturamaDetails = e instanceof FacturamaError ? e.details : null;
        const flatModelState = facturamaDetails?.ModelState
            ? Object.entries(facturamaDetails.ModelState as Record<string, string[]>)
                .map(([k, v]) => `${k}: ${(v as string[]).join('; ')}`)
                .join(' | ')
            : '';
        const errMsg = e instanceof FacturamaError
            ? [
                facturamaDetails?.Message || facturamaDetails?.message || e.message,
                flatModelState,
              ].filter(Boolean).join(' — ')
            : e.message;
        console.error('[createManualInvoice]', errMsg, facturamaDetails || '');
        return res.status(500).json({
            error: 'Error al emitir CFDI',
            message: errMsg,
            details: process.env.NODE_ENV !== 'production' ? facturamaDetails : undefined,
        });
    }
};

/**
 * GET /api/accounting/accountants
 * (Admin) Lista accountants y sus permisos para gestión.
 */
export const listAccountants = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const role = req.user?.role;
        if (!['admin', 'super_admin', 'director'].includes(role || '')) {
            return res.status(403).json({ error: 'Sin permiso' });
        }
        // Ensure table exists (idempotent — safe to run every call)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS accountant_emitter_permissions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                fiscal_emitter_id INTEGER NOT NULL REFERENCES fiscal_emitters(id) ON DELETE CASCADE,
                can_view BOOLEAN NOT NULL DEFAULT TRUE,
                can_emit_invoice BOOLEAN NOT NULL DEFAULT TRUE,
                can_cancel_invoice BOOLEAN NOT NULL DEFAULT FALSE,
                granted_by INTEGER REFERENCES users(id),
                granted_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (user_id, fiscal_emitter_id)
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_aep_user ON accountant_emitter_permissions(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_aep_emitter ON accountant_emitter_permissions(fiscal_emitter_id)`);
        const r = await pool.query(`
            SELECT u.id, u.full_name AS name, u.email, u.role,
                   COALESCE(json_agg(json_build_object(
                     'fiscal_emitter_id', p.fiscal_emitter_id,
                     'alias', fe.alias,
                     'rfc', fe.rfc,
                     'can_view', p.can_view,
                     'can_emit_invoice', p.can_emit_invoice,
                     'can_cancel_invoice', p.can_cancel_invoice
                   )) FILTER (WHERE p.id IS NOT NULL), '[]'::json) AS permissions
            FROM users u
            LEFT JOIN accountant_emitter_permissions p ON p.user_id = u.id
            LEFT JOIN fiscal_emitters fe ON fe.id = p.fiscal_emitter_id
            WHERE u.role = 'accountant'
            GROUP BY u.id
            ORDER BY u.full_name ASC
        `);
        return res.json({ success: true, accountants: r.rows });
    } catch (e: any) {
        console.error('listAccountants:', e);
        res.status(500).json({ error: 'Error listando contadores', message: e.message });
    }
};

/**
 * POST /api/accounting/accountants/:userId/permissions
 * Body: { fiscal_emitter_id, can_view?, can_emit_invoice?, can_cancel_invoice? }
 */
export const grantAccountantPermission = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const role = req.user?.role;
        const grantedBy = req.user?.userId || (req.user as any)?.id;
        if (!['admin', 'super_admin', 'director'].includes(role || '')) {
            return res.status(403).json({ error: 'Sin permiso' });
        }
        const userId = parseInt(String(req.params.userId), 10);
        const { fiscal_emitter_id, can_view = true, can_emit_invoice = true, can_cancel_invoice = false } = req.body || {};
        if (!userId || !fiscal_emitter_id) return res.status(400).json({ error: 'userId y fiscal_emitter_id requeridos' });

        // Asegurar rol accountant
        await pool.query(`UPDATE users SET role='accountant' WHERE id=$1 AND role NOT IN ('admin','super_admin','director')`, [userId]);

        const r = await pool.query(
            `INSERT INTO accountant_emitter_permissions (user_id, fiscal_emitter_id, can_view, can_emit_invoice, can_cancel_invoice, granted_by)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (user_id, fiscal_emitter_id) DO UPDATE
             SET can_view=EXCLUDED.can_view,
                 can_emit_invoice=EXCLUDED.can_emit_invoice,
                 can_cancel_invoice=EXCLUDED.can_cancel_invoice,
                 granted_by=EXCLUDED.granted_by,
                 granted_at=CURRENT_TIMESTAMP
             RETURNING *`,
            [userId, fiscal_emitter_id, can_view, can_emit_invoice, can_cancel_invoice, grantedBy]
        );
        return res.json({ success: true, permission: r.rows[0] });
    } catch (e: any) {
        console.error('grantAccountantPermission:', e);
        res.status(500).json({ error: 'Error otorgando permiso', message: e.message });
    }
};

/**
 * DELETE /api/accounting/accountants/:userId/permissions/:emitterId
 */
export const revokeAccountantPermission = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const role = req.user?.role;
        if (!['admin', 'super_admin', 'director'].includes(role || '')) {
            return res.status(403).json({ error: 'Sin permiso' });
        }
        const userId = parseInt(String(req.params.userId), 10);
        const emitterId = parseInt(String(req.params.emitterId), 10);
        await pool.query(
            `DELETE FROM accountant_emitter_permissions WHERE user_id=$1 AND fiscal_emitter_id=$2`,
            [userId, emitterId]
        );
        return res.json({ success: true });
    } catch (e: any) {
        console.error('revokeAccountantPermission:', e);
        res.status(500).json({ error: 'Error revocando permiso', message: e.message });
    }
};

// =======================================================================
// INVENTARIOS: CATEGORÍAS
// =======================================================================

export const listCategories = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });

        const r = await pool.query(`
            SELECT c.*, COALESCE((SELECT COUNT(*) FROM accounting_products p WHERE p.category_id=c.id AND p.is_active=TRUE), 0)::int AS product_count
            FROM accounting_product_categories c
            WHERE c.fiscal_emitter_id=$1 AND c.is_active=TRUE
            ORDER BY c.name ASC
        `, [emitterId]);
        return res.json({ success: true, categories: r.rows });
    } catch (e: any) {
        console.error('listCategories:', e);
        res.status(500).json({ error: 'Error listando categorías', message: e.message });
    }
};

export const createCategory = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const { name, description, sat_clave_prod_serv, sat_clave_unidad, default_tax_rate, color } = req.body || {};
        if (!emitterId || !name) return res.status(400).json({ error: 'emitterId y name requeridos' });
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });

        const r = await pool.query(`
            INSERT INTO accounting_product_categories
                (fiscal_emitter_id, name, description, sat_clave_prod_serv, sat_clave_unidad, default_tax_rate, color, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (fiscal_emitter_id, name) DO UPDATE
            SET description=EXCLUDED.description,
                sat_clave_prod_serv=EXCLUDED.sat_clave_prod_serv,
                sat_clave_unidad=COALESCE(EXCLUDED.sat_clave_unidad, accounting_product_categories.sat_clave_unidad),
                default_tax_rate=COALESCE(EXCLUDED.default_tax_rate, accounting_product_categories.default_tax_rate),
                color=EXCLUDED.color,
                is_active=TRUE
            RETURNING *
        `, [emitterId, name, description || null, sat_clave_prod_serv || null, sat_clave_unidad || 'H87', default_tax_rate ?? 0.16, color || null, userId]);
        return res.json({ success: true, category: r.rows[0] });
    } catch (e: any) {
        console.error('createCategory:', e);
        res.status(500).json({ error: 'Error creando categoría', message: e.message });
    }
};

export const updateCategory = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const catId = parseInt(String(req.params.categoryId), 10);
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });
        const fields = ['name', 'description', 'sat_clave_prod_serv', 'sat_clave_unidad', 'default_tax_rate', 'color', 'is_active'];
        const sets: string[] = []; const vals: any[] = [];
        for (const f of fields) {
            if (req.body[f] !== undefined) { vals.push(req.body[f]); sets.push(`${f}=$${vals.length}`); }
        }
        if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
        vals.push(catId); vals.push(emitterId);
        const r = await pool.query(`UPDATE accounting_product_categories SET ${sets.join(',')} WHERE id=$${vals.length - 1} AND fiscal_emitter_id=$${vals.length} RETURNING *`, vals);
        return res.json({ success: true, category: r.rows[0] });
    } catch (e: any) {
        console.error('updateCategory:', e);
        res.status(500).json({ error: 'Error actualizando', message: e.message });
    }
};

export const deleteCategory = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const catId = parseInt(String(req.params.categoryId), 10);
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });
        await pool.query(`UPDATE accounting_product_categories SET is_active=FALSE WHERE id=$1 AND fiscal_emitter_id=$2`, [catId, emitterId]);
        return res.json({ success: true });
    } catch (e: any) {
        console.error('deleteCategory:', e);
        res.status(500).json({ error: 'Error eliminando', message: e.message });
    }
};

// =======================================================================
// INVENTARIOS: PRODUCTOS
// =======================================================================

export const listProducts = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });

        const { search, category_id, low_stock } = req.query;
        const conds: string[] = [`p.fiscal_emitter_id=$1`, `p.is_active=TRUE`];
        const params: any[] = [emitterId];
        if (search) { params.push(`%${search}%`); conds.push(`(p.description ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.sat_clave_prod_serv ILIKE $${params.length})`); }
        if (category_id) { params.push(parseInt(String(category_id), 10)); conds.push(`p.category_id=$${params.length}`); }
        if (low_stock === 'true') conds.push(`p.stock_qty <= p.min_stock`);

        const r = await pool.query(`
            SELECT p.*, c.name AS category_name, c.color AS category_color
            FROM accounting_products p
            LEFT JOIN accounting_product_categories c ON c.id=p.category_id
            WHERE ${conds.join(' AND ')}
            ORDER BY p.description ASC
            LIMIT 500
        `, params);
        return res.json({ success: true, products: r.rows });
    } catch (e: any) {
        console.error('listProducts:', e);
        res.status(500).json({ error: 'Error listando productos', message: e.message });
    }
};

export const createProduct = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const b = req.body || {};
        if (!emitterId || !b.description || !b.sat_clave_prod_serv) {
            return res.status(400).json({ error: 'description y sat_clave_prod_serv son requeridos' });
        }
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });

        const r = await pool.query(`
            INSERT INTO accounting_products
              (fiscal_emitter_id, category_id, sku, description, sat_clave_prod_serv, sat_clave_unidad,
               unit_measure, unit_price, currency, tax_rate, tax_included, stock_qty, min_stock,
               barcode, is_service, notes, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            RETURNING *
        `, [
            emitterId, b.category_id || null, b.sku || null, b.description, b.sat_clave_prod_serv,
            b.sat_clave_unidad || 'H87', b.unit_measure || 'Pieza', b.unit_price || 0,
            b.currency || 'MXN', b.tax_rate ?? 0.16, b.tax_included || false,
            b.stock_qty || 0, b.min_stock || 0, b.barcode || null,
            b.is_service || false, b.notes || null, userId
        ]);
        if (b.stock_qty && b.stock_qty > 0) {
            await pool.query(`INSERT INTO accounting_product_movements (product_id, movement_type, quantity, unit_cost, reason, reference_type, created_by) VALUES ($1,'in',$2,$3,'Carga inicial','manual',$4)`,
                [r.rows[0].id, b.stock_qty, b.unit_price || 0, userId]);
        }
        return res.json({ success: true, product: r.rows[0] });
    } catch (e: any) {
        console.error('createProduct:', e);
        res.status(500).json({ error: 'Error creando producto', message: e.message });
    }
};

export const updateProduct = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const prodId = parseInt(String(req.params.productId), 10);
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });
        const editable = ['category_id', 'sku', 'description', 'sat_clave_prod_serv', 'sat_clave_unidad', 'unit_measure', 'unit_price', 'currency', 'tax_rate', 'tax_included', 'stock_qty', 'min_stock', 'barcode', 'is_service', 'is_active', 'notes'];
        const sets: string[] = []; const vals: any[] = [];
        for (const f of editable) if (req.body[f] !== undefined) { vals.push(req.body[f]); sets.push(`${f}=$${vals.length}`); }
        if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
        sets.push('updated_at=CURRENT_TIMESTAMP');
        vals.push(prodId); vals.push(emitterId);
        const r = await pool.query(`UPDATE accounting_products SET ${sets.join(',')} WHERE id=$${vals.length - 1} AND fiscal_emitter_id=$${vals.length} RETURNING *`, vals);
        return res.json({ success: true, product: r.rows[0] });
    } catch (e: any) {
        console.error('updateProduct:', e);
        res.status(500).json({ error: 'Error actualizando producto', message: e.message });
    }
};

export const deleteProduct = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const prodId = parseInt(String(req.params.productId), 10);
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });
        await pool.query(`UPDATE accounting_products SET is_active=FALSE, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND fiscal_emitter_id=$2`, [prodId, emitterId]);
        return res.json({ success: true });
    } catch (e: any) {
        console.error('deleteProduct:', e);
        res.status(500).json({ error: 'Error eliminando producto', message: e.message });
    }
};

export const adjustProductStock = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const prodId = parseInt(String(req.params.productId), 10);
        const { quantity, movement_type = 'adjust', reason } = req.body || {};
        const qty = Number(quantity);
        if (!qty || !['in', 'out', 'adjust'].includes(movement_type)) {
            return res.status(400).json({ error: 'quantity y movement_type válidos requeridos' });
        }
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const pr = await client.query(`SELECT stock_qty, unit_price FROM accounting_products WHERE id=$1 AND fiscal_emitter_id=$2 FOR UPDATE`, [prodId, emitterId]);
            if (!pr.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Producto no encontrado' }); }
            const cur = parseFloat(pr.rows[0].stock_qty || 0);
            let newQty = cur;
            if (movement_type === 'in') newQty = cur + qty;
            else if (movement_type === 'out') newQty = cur - qty;
            else newQty = qty;
            await client.query(`UPDATE accounting_products SET stock_qty=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`, [newQty, prodId]);
            await client.query(`INSERT INTO accounting_product_movements (product_id, movement_type, quantity, unit_cost, reason, reference_type, created_by) VALUES ($1,$2,$3,$4,$5,'manual',$6)`,
                [prodId, movement_type, qty, pr.rows[0].unit_price || 0, reason || null, userId]);
            await client.query('COMMIT');
            return res.json({ success: true, new_stock: newQty });
        } catch (err) {
            await client.query('ROLLBACK'); throw err;
        } finally {
            client.release();
        }
    } catch (e: any) {
        console.error('adjustProductStock:', e);
        res.status(500).json({ error: 'Error ajustando stock', message: e.message });
    }
};

// =======================================================================
// FACTURAS RECIBIDAS (CFDI de proveedores)
// =======================================================================

export const listReceivedInvoices = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });

        const { search, from, to, status } = req.query;
        const conds: string[] = [`r.fiscal_emitter_id=$1`];
        const params: any[] = [emitterId];
        if (search) { params.push(`%${search}%`); conds.push(`(r.uuid_sat ILIKE $${params.length} OR r.emisor_rfc ILIKE $${params.length} OR r.emisor_nombre ILIKE $${params.length} OR r.folio ILIKE $${params.length})`); }
        if (from) { params.push(from); conds.push(`r.fecha_emision >= $${params.length}`); }
        if (to) { params.push(to); conds.push(`r.fecha_emision <= $${params.length}`); }
        if (status) { params.push(status); conds.push(`r.status=$${params.length}`); }

        const r = await pool.query(`
            SELECT r.id, r.uuid_sat, r.folio, r.serie, r.emisor_rfc, r.emisor_nombre,
                   r.subtotal, r.iva, r.total, r.moneda, r.fecha_emision,
                   r.tipo_comprobante, r.status, r.inventory_imported, r.payment_status,
                   r.xml_filename, r.created_at,
                   (SELECT COUNT(*) FROM accounting_received_invoice_items i WHERE i.received_invoice_id=r.id)::int AS item_count
            FROM accounting_received_invoices r
            WHERE ${conds.join(' AND ')}
            ORDER BY r.fecha_emision DESC NULLS LAST, r.created_at DESC
            LIMIT 500
        `, params);
        return res.json({ success: true, invoices: r.rows });
    } catch (e: any) {
        console.error('listReceivedInvoices:', e);
        res.status(500).json({ error: 'Error listando facturas recibidas', message: e.message });
    }
};

export const getReceivedInvoiceDetail = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const invoiceId = parseInt(String(req.params.invoiceId), 10);
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });

        const inv = await pool.query(`SELECT * FROM accounting_received_invoices WHERE id=$1 AND fiscal_emitter_id=$2`, [invoiceId, emitterId]);
        if (!inv.rows[0]) return res.status(404).json({ error: 'No encontrada' });
        const items = await pool.query(`
            SELECT i.*, p.description AS matched_description, p.sku AS matched_sku
            FROM accounting_received_invoice_items i
            LEFT JOIN accounting_products p ON p.id=i.matched_product_id
            WHERE i.received_invoice_id=$1 ORDER BY i.id ASC
        `, [invoiceId]);
        return res.json({ success: true, invoice: inv.rows[0], items: items.rows });
    } catch (e: any) {
        console.error('getReceivedInvoiceDetail:', e);
        res.status(500).json({ error: 'Error obteniendo detalle', message: e.message });
    }
};

// Parser simple de CFDI 4.0 XML usando regex (sin dependencias nuevas)
function parseCfdiXml(xml: string): { header: any; items: any[] } {
    // Extrae la etiqueta de apertura completa de un nodo (incluye todos sus atributos,
    // aunque contengan URLs con "/"). Maneja saltos de línea y self-closing.
    const extractOpenTag = (name: string, source: string = xml): string => {
        // name puede venir con o sin prefijo, intentamos ambos
        const patterns = [
            new RegExp(`<${name}\\b[^>]*?/?>`, 'i'),
            new RegExp(`<cfdi:${name}\\b[^>]*?/?>`, 'i'),
            new RegExp(`<tfd:${name}\\b[^>]*?/?>`, 'i'),
        ];
        for (const re of patterns) {
            const m = source.match(re);
            if (m) return m[0];
        }
        return '';
    };
    const attr = (tag: string, name: string): string | null => {
        if (!tag) return null;
        const re = new RegExp(`\\b${name}\\s*=\\s*\"([^\"]*)\"`, 'i');
        const m = tag.match(re);
        return m && m[1] !== undefined ? m[1] : null;
    };

    const comprobante = extractOpenTag('Comprobante');
    const emisor = extractOpenTag('Emisor');
    const receptor = extractOpenTag('Receptor');
    const timbre = extractOpenTag('TimbreFiscalDigital');

    const header = {
        uuid_sat: attr(timbre, 'UUID'),
        fecha_timbrado: attr(timbre, 'FechaTimbrado'),
        folio: attr(comprobante, 'Folio'),
        serie: attr(comprobante, 'Serie'),
        fecha_emision: attr(comprobante, 'Fecha'),
        tipo_comprobante: attr(comprobante, 'TipoDeComprobante') || 'I',
        metodo_pago: attr(comprobante, 'MetodoPago'),
        forma_pago: attr(comprobante, 'FormaPago'),
        moneda: attr(comprobante, 'Moneda') || 'MXN',
        tipo_cambio: parseFloat(attr(comprobante, 'TipoCambio') || '1'),
        subtotal: parseFloat(attr(comprobante, 'SubTotal') || '0'),
        descuento: parseFloat(attr(comprobante, 'Descuento') || '0'),
        total: parseFloat(attr(comprobante, 'Total') || '0'),
        emisor_rfc: attr(emisor, 'Rfc'),
        emisor_nombre: attr(emisor, 'Nombre'),
        receptor_rfc: attr(receptor, 'Rfc'),
        receptor_nombre: attr(receptor, 'Nombre'),
        uso_cfdi: attr(receptor, 'UsoCFDI'),
    };

    const items: any[] = [];
    // Conceptos: pueden ser self-closing <Concepto .../> o tener hijos <Concepto ...>...</Concepto>
    const conceptosRe = /<(?:cfdi:)?Concepto\b[^>]*?\/?>/gi;
    const matches = xml.match(conceptosRe) || [];
    for (const c of matches) {
        const cantidad = parseFloat(attr(c, 'Cantidad') || '1');
        const valor = parseFloat(attr(c, 'ValorUnitario') || '0');
        items.push({
            sat_clave_prod_serv: attr(c, 'ClaveProdServ'),
            sat_clave_unidad: attr(c, 'ClaveUnidad'),
            no_identificacion: attr(c, 'NoIdentificacion'),
            description: attr(c, 'Descripcion') || '',
            quantity: cantidad,
            unit_price: valor,
            amount: parseFloat(attr(c, 'Importe') || String(cantidad * valor)),
            discount: parseFloat(attr(c, 'Descuento') || '0'),
        });
    }
    // IVA total desde <cfdi:Impuestos TotalImpuestosTrasladados="...">
    const iva = parseFloat(xml.match(/TotalImpuestosTrasladados\s*=\s*\"([^\"]*)\"/i)?.[1] || '0');
    (header as any).iva = iva;
    return { header, items };
}

export const uploadReceivedInvoice = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });

        const { xml_content, xml_filename, import_inventory = true } = req.body || {};
        if (!xml_content || typeof xml_content !== 'string') return res.status(400).json({ error: 'xml_content es requerido' });

        const { header, items } = parseCfdiXml(xml_content);
        if (!header.uuid_sat) return res.status(400).json({ error: 'XML no es un CFDI timbrado válido (sin UUID)' });

        const crypto = require('crypto');
        const xml_hash = crypto.createHash('sha256').update(xml_content).digest('hex');

        // Verificar duplicado
        const dup = await pool.query(`SELECT id FROM accounting_received_invoices WHERE fiscal_emitter_id=$1 AND uuid_sat=$2`, [emitterId, header.uuid_sat]);
        if (dup.rows[0]) return res.status(409).json({ error: 'Factura ya cargada', invoice_id: dup.rows[0].id });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const ins = await client.query(`
                INSERT INTO accounting_received_invoices
                  (fiscal_emitter_id, uuid_sat, folio, serie, emisor_rfc, emisor_nombre,
                   receptor_rfc, receptor_nombre, tipo_comprobante, uso_cfdi, metodo_pago, forma_pago,
                   moneda, tipo_cambio, subtotal, descuento, iva, total, fecha_emision, fecha_timbrado,
                   xml_filename, xml_hash, xml_content, uploaded_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
                RETURNING *
            `, [
                emitterId, header.uuid_sat, header.folio, header.serie, header.emisor_rfc, header.emisor_nombre,
                header.receptor_rfc, header.receptor_nombre, header.tipo_comprobante || 'I', header.uso_cfdi,
                header.metodo_pago, header.forma_pago, header.moneda || 'MXN', header.tipo_cambio || 1,
                header.subtotal || 0, header.descuento || 0, header.iva || 0, header.total || 0,
                header.fecha_emision, header.fecha_timbrado,
                xml_filename || null, xml_hash, xml_content, userId
            ]);
            const invoiceId = ins.rows[0].id;

            // Items
            for (const it of items) {
                // Buscar match existente por sat_clave_prod_serv + description fuzzy
                let matchedProductId: number | null = null;
                if (it.sat_clave_prod_serv) {
                    const mr = await client.query(
                        `SELECT id FROM accounting_products WHERE fiscal_emitter_id=$1 AND sat_clave_prod_serv=$2 AND is_active=TRUE ORDER BY (CASE WHEN description ILIKE $3 THEN 0 ELSE 1 END) LIMIT 1`,
                        [emitterId, it.sat_clave_prod_serv, `%${it.description.substring(0, 30)}%`]
                    );
                    if (mr.rows[0]) matchedProductId = mr.rows[0].id;
                }

                const itemIns = await client.query(`
                    INSERT INTO accounting_received_invoice_items
                      (received_invoice_id, sat_clave_prod_serv, sat_clave_unidad, no_identificacion,
                       description, quantity, unit_price, amount, discount, matched_product_id)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                    RETURNING id
                `, [
                    invoiceId, it.sat_clave_prod_serv, it.sat_clave_unidad, it.no_identificacion,
                    it.description, it.quantity, it.unit_price, it.amount, it.discount, matchedProductId
                ]);
                const itemId = itemIns.rows[0].id;

                // Si import_inventory: crear producto si no existe y sumar stock
                if (import_inventory && header.tipo_comprobante === 'I') {
                    let productId = matchedProductId;
                    if (!productId && it.sat_clave_prod_serv && it.description) {
                        const np = await client.query(`
                            INSERT INTO accounting_products
                              (fiscal_emitter_id, sku, description, sat_clave_prod_serv, sat_clave_unidad,
                               unit_price, currency, tax_rate, stock_qty, created_by, notes)
                            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                            RETURNING id
                        `, [
                            emitterId, it.no_identificacion || null, it.description.substring(0, 255),
                            it.sat_clave_prod_serv, it.sat_clave_unidad || 'H87',
                            it.unit_price, header.moneda || 'MXN', 0.16, 0, userId,
                            `Auto-creado desde CFDI ${header.uuid_sat}`
                        ]);
                        productId = np.rows[0].id;
                        await client.query(`UPDATE accounting_received_invoice_items SET matched_product_id=$1 WHERE id=$2`, [productId, itemId]);
                    }
                    if (productId) {
                        await client.query(`UPDATE accounting_products SET stock_qty = stock_qty + $1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`, [it.quantity, productId]);
                        await client.query(`
                            INSERT INTO accounting_product_movements
                              (product_id, movement_type, quantity, unit_cost, reason, reference_type, reference_id, created_by)
                            VALUES ($1,'invoice_in',$2,$3,$4,'received_invoice',$5,$6)
                        `, [productId, it.quantity, it.unit_price, `CFDI ${header.uuid_sat}`, invoiceId, userId]);
                        await client.query(`UPDATE accounting_received_invoice_items SET imported_to_inventory=TRUE WHERE id=$1`, [itemId]);
                    }
                }
            }

            if (import_inventory && header.tipo_comprobante === 'I') {
                await client.query(`UPDATE accounting_received_invoices SET inventory_imported=TRUE, inventory_imported_at=CURRENT_TIMESTAMP WHERE id=$1`, [invoiceId]);
            }

            await client.query('COMMIT');
            return res.json({ success: true, invoice: ins.rows[0], items_count: items.length, inventory_imported: import_inventory && header.tipo_comprobante === 'I' });
        } catch (err) {
            await client.query('ROLLBACK'); throw err;
        } finally {
            client.release();
        }
    } catch (e: any) {
        console.error('uploadReceivedInvoice:', e);
        res.status(500).json({ error: 'Error procesando factura', message: e.message });
    }
};

/**
 * POST /api/accounting/:emitterId/received-invoices/:invoiceId/import
 * Importa al inventario los conceptos de una factura recibida ya cargada
 * pero todavía no importada. Sólo aplica a CFDI tipo Ingreso ('I').
 */
export const importReceivedInvoiceToInventory = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const invoiceId = parseInt(String(req.params.invoiceId), 10);
        if (!emitterId || !invoiceId) return res.status(400).json({ error: 'Parámetros inválidos' });

        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso a esta empresa' });

        const invRes = await pool.query(
            `SELECT id, uuid_sat, tipo_comprobante, moneda, inventory_imported
               FROM accounting_received_invoices
              WHERE id=$1 AND fiscal_emitter_id=$2`,
            [invoiceId, emitterId]
        );
        const invoice = invRes.rows[0];
        if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
        if (invoice.tipo_comprobante !== 'I') {
            return res.status(400).json({ error: 'Sólo se puede importar inventario de CFDI tipo Ingreso (I)' });
        }
        if (invoice.inventory_imported) {
            return res.status(409).json({ error: 'Esta factura ya fue importada al inventario' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const itemsRes = await client.query(
                `SELECT id, sat_clave_prod_serv, sat_clave_unidad, no_identificacion,
                        description, quantity, unit_price, matched_product_id, imported_to_inventory
                   FROM accounting_received_invoice_items
                  WHERE received_invoice_id=$1
                  ORDER BY id ASC`,
                [invoiceId]
            );

            let importedCount = 0;
            let skippedCount = 0;

            for (const it of itemsRes.rows) {
                if (it.imported_to_inventory) { skippedCount++; continue; }

                let productId: number | null = it.matched_product_id;

                // Si no hay match previo, intentar localizarlo otra vez (por si ya existe el producto)
                if (!productId && it.sat_clave_prod_serv) {
                    const mr = await client.query(
                        `SELECT id FROM accounting_products
                          WHERE fiscal_emitter_id=$1 AND sat_clave_prod_serv=$2 AND is_active=TRUE
                          ORDER BY (CASE WHEN description ILIKE $3 THEN 0 ELSE 1 END)
                          LIMIT 1`,
                        [emitterId, it.sat_clave_prod_serv, `%${String(it.description || '').substring(0, 30)}%`]
                    );
                    if (mr.rows[0]) productId = mr.rows[0].id;
                }

                // Si sigue sin existir, crearlo a partir del concepto del XML
                if (!productId && it.sat_clave_prod_serv && it.description) {
                    const np = await client.query(
                        `INSERT INTO accounting_products
                            (fiscal_emitter_id, sku, description, sat_clave_prod_serv, sat_clave_unidad,
                             unit_price, currency, tax_rate, stock_qty, created_by, notes)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                         RETURNING id`,
                        [
                            emitterId,
                            it.no_identificacion || null,
                            String(it.description).substring(0, 255),
                            it.sat_clave_prod_serv,
                            it.sat_clave_unidad || 'H87',
                            it.unit_price,
                            invoice.moneda || 'MXN',
                            0.16,
                            0,
                            userId,
                            `Auto-creado al importar CFDI ${invoice.uuid_sat}`,
                        ]
                    );
                    productId = np.rows[0].id;
                }

                if (!productId) { skippedCount++; continue; }

                await client.query(
                    `UPDATE accounting_products
                        SET stock_qty = stock_qty + $1, updated_at=CURRENT_TIMESTAMP
                      WHERE id=$2`,
                    [it.quantity, productId]
                );
                await client.query(
                    `INSERT INTO accounting_product_movements
                        (product_id, movement_type, quantity, unit_cost, reason, reference_type, reference_id, created_by)
                     VALUES ($1,'invoice_in',$2,$3,$4,'received_invoice',$5,$6)`,
                    [productId, it.quantity, it.unit_price, `CFDI ${invoice.uuid_sat}`, invoiceId, userId]
                );
                await client.query(
                    `UPDATE accounting_received_invoice_items
                        SET matched_product_id=$1, imported_to_inventory=TRUE
                      WHERE id=$2`,
                    [productId, it.id]
                );
                importedCount++;
            }

            await client.query(
                `UPDATE accounting_received_invoices
                    SET inventory_imported=TRUE, inventory_imported_at=CURRENT_TIMESTAMP
                  WHERE id=$1`,
                [invoiceId]
            );

            await client.query('COMMIT');
            return res.json({
                success: true,
                imported_items: importedCount,
                skipped_items: skippedCount,
                total_items: itemsRes.rows.length,
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (e: any) {
        console.error('importReceivedInvoiceToInventory:', e);
        res.status(500).json({ error: 'Error importando al inventario', message: e.message });
    }
};

export const deleteReceivedInvoice = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        const invoiceId = parseInt(String(req.params.invoiceId), 10);
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok || !access.perms?.can_cancel_invoice) return res.status(403).json({ error: 'Sin permiso para eliminar' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Revertir inventario si se había importado
            const items = await client.query(`SELECT matched_product_id, quantity FROM accounting_received_invoice_items WHERE received_invoice_id=$1 AND imported_to_inventory=TRUE`, [invoiceId]);
            for (const it of items.rows) {
                if (it.matched_product_id) {
                    await client.query(`UPDATE accounting_products SET stock_qty = GREATEST(stock_qty - $1, 0) WHERE id=$2`, [it.quantity, it.matched_product_id]);
                    await client.query(`INSERT INTO accounting_product_movements (product_id, movement_type, quantity, reason, reference_type, reference_id, created_by) VALUES ($1,'out',$2,'Reverso por eliminación de factura recibida','received_invoice_delete',$3,$4)`, [it.matched_product_id, it.quantity, invoiceId, userId]);
                }
            }
            await client.query(`DELETE FROM accounting_received_invoices WHERE id=$1 AND fiscal_emitter_id=$2`, [invoiceId, emitterId]);
            await client.query('COMMIT');
            return res.json({ success: true });
        } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    } catch (e: any) {
        console.error('deleteReceivedInvoice:', e);
        res.status(500).json({ error: 'Error eliminando', message: e.message });
    }
};

// ============================================================
// MOVIMIENTOS BANCARIOS (Belvo) por empresa
// ============================================================

/**
 * GET /api/accounting/:emitterId/bank-movements
 * Lista movimientos bancarios (belvo_transactions) de la empresa.
 * Filtros: ?from=YYYY-MM-DD&to=YYYY-MM-DD&type=INFLOW|OUTFLOW&match_status=matched|pending|unmatched&search=&limit=
 */
export const listBankMovements = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });

        const { from, to, type, match_status, search } = req.query;
        const limit = Math.min(parseInt(String(req.query.limit || '300'), 10) || 300, 1000);

        const conds: string[] = [`bt.emitter_id = $1`];
        const params: any[] = [emitterId];
        if (from) { params.push(from); conds.push(`bt.value_date >= $${params.length}`); }
        if (to) { params.push(to); conds.push(`bt.value_date <= $${params.length}`); }
        if (type) { params.push(type); conds.push(`bt.type = $${params.length}`); }
        if (match_status) { params.push(match_status); conds.push(`bt.match_status = $${params.length}`); }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(`(bt.description ILIKE $${i} OR bt.reference ILIKE $${i} OR bt.merchant_name ILIKE $${i})`);
        }

        params.push(limit);
        const sql = `
            SELECT bt.id, bt.value_date, bt.accounting_date, bt.amount, bt.balance, bt.currency,
                   bt.description, bt.reference, bt.type, bt.category, bt.subcategory,
                   bt.merchant_name, bt.status, bt.match_status, bt.matched_payment_id, bt.matched_at,
                   bl.institution_name,
                   u.full_name AS matched_client, pp.payment_reference AS matched_reference,
                   pp.amount AS matched_amount
            FROM belvo_transactions bt
            JOIN belvo_links bl ON bl.id = bt.belvo_link_id
            LEFT JOIN pobox_payments pp ON pp.id = bt.matched_payment_id
            LEFT JOIN users u ON u.id = pp.user_id
            WHERE ${conds.join(' AND ')}
            ORDER BY bt.value_date DESC, bt.id DESC
            LIMIT $${params.length}
        `;
        const r = await pool.query(sql, params);

        // Estadísticas del mismo filtro (sin LIMIT)
        const statsParams = params.slice(0, -1);
        const stats = await pool.query(`
            SELECT 
              COUNT(*) FILTER (WHERE bt.type='INFLOW') AS in_count,
              COUNT(*) FILTER (WHERE bt.type='OUTFLOW') AS out_count,
              COALESCE(SUM(bt.amount) FILTER (WHERE bt.type='INFLOW'),0) AS in_total,
              COALESCE(SUM(bt.amount) FILTER (WHERE bt.type='OUTFLOW'),0) AS out_total,
              COUNT(*) FILTER (WHERE bt.match_status='matched') AS matched_count,
              COUNT(*) FILTER (WHERE bt.match_status='pending') AS pending_count,
              COUNT(*) FILTER (WHERE bt.match_status='unmatched') AS unmatched_count
            FROM belvo_transactions bt
            WHERE ${conds.join(' AND ')}
        `, statsParams);

        // Links activos de la empresa (para UI)
        const linksRes = await pool.query(
            `SELECT id, institution_name, last_sync_at, is_active FROM belvo_links WHERE emitter_id=$1 ORDER BY id DESC`,
            [emitterId]
        );

        return res.json({
            success: true,
            movements: r.rows,
            stats: stats.rows[0],
            links: linksRes.rows,
        });
    } catch (e: any) {
        console.error('listBankMovements:', e);
        res.status(500).json({ error: 'Error listando movimientos', message: e.message });
    }
};

/**
 * POST /api/accounting/:emitterId/bank-movements/sync
 * Dispara sincronización Belvo para los links de la empresa.
 * Body opcional: { days_back?: number, link_id?: number }
 */
export const syncBankMovements = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.userId || (req.user as any)?.id;
        const role = req.user?.role;
        const emitterId = parseInt(String(req.params.emitterId), 10);
        if (!emitterId) return res.status(400).json({ error: 'emitterId inválido' });
        const access = await checkEmitterAccess(userId!, role, emitterId);
        if (!access.ok) return res.status(403).json({ error: 'Sin acceso' });

        const { days_back = 7, link_id } = req.body || {};
        const belvoService = require('./belvoService');
        if (!belvoService.isBelvoConfigured || !belvoService.isBelvoConfigured()) {
            return res.status(503).json({ error: 'Belvo no está configurado en el servidor' });
        }

        // Validar que el link pertenezca a la empresa
        const linksQ = link_id
            ? await pool.query(`SELECT id FROM belvo_links WHERE id=$1 AND emitter_id=$2 AND is_active=TRUE`, [link_id, emitterId])
            : await pool.query(`SELECT id FROM belvo_links WHERE emitter_id=$1 AND is_active=TRUE`, [emitterId]);

        if (linksQ.rows.length === 0) {
            return res.status(404).json({ error: 'Esta empresa no tiene bancos conectados en Belvo' });
        }

        const results: any[] = [];
        for (const row of linksQ.rows) {
            try {
                const r = await belvoService.syncLinkTransactions(row.id, Number(days_back) || 7);
                results.push({ link_id: row.id, ...r });
            } catch (err: any) {
                results.push({ link_id: row.id, error: err.message });
            }
        }

        return res.json({ success: true, results });
    } catch (e: any) {
        console.error('syncBankMovements:', e);
        res.status(500).json({ error: 'Error sincronizando', message: e.message });
    }
};
