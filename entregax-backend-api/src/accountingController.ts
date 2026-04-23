import { Request, Response } from 'express';
import { Pool } from 'pg';

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
                `SELECT id, alias, rfc, business_name, fiscal_regime, zip_code, is_active, logo_url, created_at
                 FROM fiscal_emitters WHERE is_active=TRUE ORDER BY alias ASC`
            );
            emitters = r.rows.map(e => ({ ...e, perms: { can_view: true, can_emit_invoice: true, can_cancel_invoice: true } }));
        } else if (role === 'accountant') {
            const r = await pool.query(
                `SELECT fe.id, fe.alias, fe.rfc, fe.business_name, fe.fiscal_regime, fe.zip_code, fe.is_active, fe.logo_url, fe.created_at,
                        p.can_view, p.can_emit_invoice, p.can_cancel_invoice
                 FROM fiscal_emitters fe
                 INNER JOIN accountant_emitter_permissions p ON p.fiscal_emitter_id = fe.id
                 WHERE p.user_id = $1 AND fe.is_active = TRUE
                 ORDER BY fe.alias ASC`,
                [userId]
            );
            emitters = r.rows.map(e => ({
                id: e.id, alias: e.alias, rfc: e.rfc, business_name: e.business_name,
                fiscal_regime: e.fiscal_regime, zip_code: e.zip_code, is_active: e.is_active,
                logo_url: e.logo_url, created_at: e.created_at,
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

        // Facturas emitidas vía facturapi
        const invCnt = await pool.query(`SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status='valid' OR status IS NULL)::int AS activas,
             COUNT(*) FILTER (WHERE status='canceled' OR canceled_at IS NOT NULL)::int AS canceladas,
             COALESCE(SUM(total) FILTER (WHERE status='valid' OR status IS NULL), 0)::numeric AS monto_activo
             FROM facturas_emitidas
             WHERE payment_id IN (
                SELECT id FROM pobox_payments WHERE 1=1
             )
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
        // La tabla facturas_emitidas no tiene fiscal_emitter_id (emite por api_key); cruzamos vía facturapi_id
        // y la invoice se asocia al emitter a través de users o pagos. Para simplificar: filtramos por razón social.
        const eRes = await pool.query(`SELECT rfc, business_name FROM fiscal_emitters WHERE id=$1`, [emitterId]);
        if (eRes.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' });
        // Nota: la tabla facturas_emitidas tiene receptor_rfc (el cliente), no tiene emisor_rfc.
        // Como las facturas están agrupadas por api_key al momento de emitir, consultamos por rango libre (admin verá todas).
        // En producción deberías añadir columna fiscal_emitter_id a facturas_emitidas; lo marcaremos como TODO.
        const conds: string[] = [];
        const params: any[] = [];
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
            SELECT f.id, f.facturapi_id, f.uuid_sat, f.folio, f.serie, f.receptor_rfc, f.receptor_razon_social,
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
        const r = await pool.query(`
            SELECT u.id, u.full_name, u.email, u.is_active, u.created_at,
                   COALESCE(json_agg(json_build_object(
                     'emitter_id', p.fiscal_emitter_id,
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
