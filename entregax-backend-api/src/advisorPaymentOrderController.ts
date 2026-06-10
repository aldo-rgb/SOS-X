import { Request, Response } from 'express';
import { pool } from './db';

const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS advisor_payment_orders (
      id            SERIAL PRIMARY KEY,
      folio         TEXT NOT NULL UNIQUE,
      advisor_id    INTEGER NOT NULL,
      client_id     INTEGER,
      client_name   TEXT,
      client_box_id TEXT,
      package_uids  JSONB  DEFAULT '[]',
      trackings     JSONB  DEFAULT '[]',
      notes         TEXT,
      total_mxn     NUMERIC(12,2),
      status        TEXT   DEFAULT 'pendiente',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
};

const advisorId = (req: Request): number | null => (req as any).user?.userId ?? null;

export const listAdvisorPaymentOrders = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureTable();
    const aid = advisorId(req);
    if (!aid) return res.status(401).json({ error: 'No autenticado' });
    const r = await pool.query(
      `SELECT id, folio, client_id, client_name, client_box_id,
              package_uids, trackings, notes, total_mxn, status, created_at
       FROM advisor_payment_orders
       WHERE advisor_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [aid]
    );
    return res.json(r.rows);
  } catch (e: any) {
    console.error('[payment-orders] list:', e);
    return res.status(500).json({ error: 'Error al listar órdenes' });
  }
};

export const createAdvisorPaymentOrder = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureTable();
    const aid = advisorId(req);
    if (!aid) return res.status(401).json({ error: 'No autenticado' });

    const { client_id, client_name, client_box_id, package_uids, trackings, notes, total_mxn } = req.body;
    if (!package_uids?.length) return res.status(400).json({ error: 'Selecciona al menos una guía' });

    const folio = `OP-${aid}-${Date.now()}`;
    const r = await pool.query(
      `INSERT INTO advisor_payment_orders
         (folio, advisor_id, client_id, client_name, client_box_id, package_uids, trackings, notes, total_mxn)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [folio, aid, client_id || null, client_name || null, client_box_id || null,
       JSON.stringify(package_uids), JSON.stringify(trackings || []),
       notes || null, total_mxn || null]
    );
    return res.status(201).json(r.rows[0]);
  } catch (e: any) {
    console.error('[payment-orders] create:', e);
    return res.status(500).json({ error: 'Error al crear orden' });
  }
};

export const updateAdvisorPaymentOrderStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const aid = advisorId(req);
    if (!aid) return res.status(401).json({ error: 'No autenticado' });
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['pendiente', 'en_proceso', 'pagado', 'cancelado'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Estado inválido' });
    const r = await pool.query(
      `UPDATE advisor_payment_orders SET status=$1, updated_at=NOW()
       WHERE id=$2 AND advisor_id=$3 RETURNING *`,
      [status, id, aid]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    return res.json(r.rows[0]);
  } catch (e: any) {
    console.error('[payment-orders] update:', e);
    return res.status(500).json({ error: 'Error al actualizar orden' });
  }
};

export const deleteAdvisorPaymentOrder = async (req: Request, res: Response): Promise<any> => {
  try {
    const aid = advisorId(req);
    if (!aid) return res.status(401).json({ error: 'No autenticado' });
    const { id } = req.params;
    const r = await pool.query(
      `DELETE FROM advisor_payment_orders WHERE id=$1 AND advisor_id=$2 AND status='pendiente' RETURNING id`,
      [id, aid]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Orden no encontrada o no cancelable' });
    return res.json({ ok: true });
  } catch (e: any) {
    console.error('[payment-orders] delete:', e);
    return res.status(500).json({ error: 'Error al eliminar orden' });
  }
};
