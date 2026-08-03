// ============================================================
// QUEJAS (a asesores) y CASTIGO (penalización de embarques)
// - Quejas: se marca una queja a un asesor citando el # de ticket.
//   Queda registrado quién la marcó.
// - Castigo: se marca un embarque (fila de advisor_commissions) como
//   penalizado → NO genera comisión (se excluye en los reportes de comisión).
// ============================================================
import { Request, Response } from 'express';
import { pool } from './db';

const ADVISOR_ROLES = ['advisor', 'sub_advisor', 'asesor_lider', 'asesor'];

const authUserId = (req: Request): number | null => {
  const u = (req as any).user;
  return Number(u?.userId ?? u?.id) || null;
};

let schemaReady = false;
export async function ensureSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS advisor_complaints (
      id SERIAL PRIMARY KEY,
      advisor_id  INTEGER NOT NULL,
      ticket_folio TEXT NOT NULL,
      note        TEXT,
      marked_by   INTEGER,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_advisor_complaints_advisor ON advisor_complaints(advisor_id)`);
  // Penalización de embarques: viven como flag en la propia comisión.
  await pool.query(`ALTER TABLE advisor_commissions ADD COLUMN IF NOT EXISTS penalized BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE advisor_commissions ADD COLUMN IF NOT EXISTS penalized_by INTEGER`);
  await pool.query(`ALTER TABLE advisor_commissions ADD COLUMN IF NOT EXISTS penalized_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE advisor_commissions ADD COLUMN IF NOT EXISTS penalized_reason TEXT`);
  schemaReady = true;
}

// ─────────────────────────── QUEJAS ───────────────────────────

// Todos los asesores y sub-asesores activos, con su conteo de quejas.
export const listComplaintAdvisors = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const r = await pool.query(`
      SELECT u.id, u.full_name, u.role,
             COALESCE(cnt.n, 0)::int AS complaint_count
      FROM users u
      LEFT JOIN (SELECT advisor_id, COUNT(*) n FROM advisor_complaints GROUP BY advisor_id) cnt
             ON cnt.advisor_id = u.id
      WHERE u.role = ANY($1) AND COALESCE(u.is_active, true) = true AND u.deleted_at IS NULL
      ORDER BY u.full_name
    `, [ADVISOR_ROLES]);
    res.json({ advisors: r.rows });
  } catch (e: any) {
    console.error('[complaints] listAdvisors:', e); res.status(500).json({ error: 'Error al cargar asesores' });
  }
};

// Marcar una queja: requiere asesor + # de ticket. Registra quién la marcó.
export const createComplaint = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const uid = authUserId(req);
    const { advisor_id, ticket_folio, note } = req.body || {};
    if (!advisor_id || !ticket_folio || !String(ticket_folio).trim()) {
      return res.status(400).json({ error: 'Se requiere el asesor y el número de ticket' });
    }
    const adv = await pool.query(`SELECT id FROM users WHERE id = $1 AND role = ANY($2)`, [Number(advisor_id), ADVISOR_ROLES]);
    if (adv.rows.length === 0) return res.status(400).json({ error: 'El asesor no es válido' });
    const r = await pool.query(`
      INSERT INTO advisor_complaints (advisor_id, ticket_folio, note, marked_by)
      VALUES ($1, $2, $3, $4) RETURNING id, created_at
    `, [Number(advisor_id), String(ticket_folio).trim(), (note ? String(note).trim() : null), uid]);
    res.json({ ok: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
  } catch (e: any) {
    console.error('[complaints] create:', e); res.status(500).json({ error: 'Error al marcar la queja' });
  }
};

// Historial de quejas registradas (quién la marcó y cuándo).
export const listComplaints = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const r = await pool.query(`
      SELECT c.id, c.advisor_id, a.full_name AS advisor_name,
             c.ticket_folio, c.note, c.created_at,
             c.marked_by, m.full_name AS marked_by_name
      FROM advisor_complaints c
      LEFT JOIN users a ON a.id = c.advisor_id
      LEFT JOIN users m ON m.id = c.marked_by
      ORDER BY c.created_at DESC
      LIMIT 300
    `);
    res.json({ complaints: r.rows });
  } catch (e: any) {
    console.error('[complaints] list:', e); res.status(500).json({ error: 'Error al cargar quejas' });
  }
};

export const deleteComplaint = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    await pool.query(`DELETE FROM advisor_complaints WHERE id = $1`, [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[complaints] delete:', e); res.status(500).json({ error: 'Error al eliminar la queja' });
  }
};

// ─────────────────────────── CASTIGO ───────────────────────────

// Lista de embarques (comisiones) con filtro por servicio, para penalizar.
export const listPenalizableShipments = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const service = String(req.query.service || '').trim();
    const search = String(req.query.search || '').trim();
    const onlyPenalized = String(req.query.only_penalized || '') === 'true';
    const conds: string[] = [];
    const params: any[] = [];
    if (service && service !== 'all') { params.push(service); conds.push(`ac.service_type = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conds.push(`(ac.tracking ILIKE $${params.length} OR ac.advisor_name ILIKE $${params.length} OR ac.client_name ILIKE $${params.length})`); }
    if (onlyPenalized) conds.push(`COALESCE(ac.penalized, false) = true`);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await pool.query(`
      SELECT ac.id, ac.tracking, ac.service_type, ac.shipment_type,
             ac.advisor_id, ac.advisor_name, ac.client_name,
             ac.commission_amount_mxn, ac.status, ac.created_at,
             COALESCE(ac.penalized, false) AS penalized,
             ac.penalized_at, ac.penalized_reason, pu.full_name AS penalized_by_name
      FROM advisor_commissions ac
      LEFT JOIN users pu ON pu.id = ac.penalized_by
      ${where}
      ORDER BY ac.created_at DESC NULLS LAST
      LIMIT 400
    `, params);
    const svc = await pool.query(`SELECT DISTINCT service_type FROM advisor_commissions WHERE service_type IS NOT NULL AND service_type <> '' ORDER BY 1`);
    res.json({ shipments: r.rows, services: svc.rows.map((x: any) => x.service_type) });
  } catch (e: any) {
    console.error('[penalty] listShipments:', e); res.status(500).json({ error: 'Error al cargar embarques' });
  }
};

// Marcar / desmarcar un embarque como penalizado (no genera comisión).
export const setShipmentPenalized = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const uid = authUserId(req);
    const id = Number(req.params.id);
    const penalized = req.body?.penalized === true || req.body?.penalized === 'true';
    const reason = req.body?.reason ? String(req.body.reason).trim() : null;
    if (penalized) {
      await pool.query(`UPDATE advisor_commissions SET penalized = true, penalized_by = $2, penalized_at = NOW(), penalized_reason = $3 WHERE id = $1`, [id, uid, reason]);
    } else {
      await pool.query(`UPDATE advisor_commissions SET penalized = false, penalized_by = NULL, penalized_at = NULL, penalized_reason = NULL WHERE id = $1`, [id]);
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[penalty] setPenalized:', e); res.status(500).json({ error: 'Error al actualizar el castigo' });
  }
};
