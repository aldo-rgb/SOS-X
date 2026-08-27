/**
 * ENTREGA EN MOSTRADOR (PO Box · Hidalgo TX)
 *
 * Cuando el cliente elige "recoger en mostrador" la guía queda en
 * `ready_pickup`, pero no había forma de cerrarla: el personal de Hidalgo solo
 * podía escanear SALIDA —que la marca como despachada a México, no entregada—
 * o cambiar el estado a mano, que la pantalla reserva a super_admin. Además
 * ningún camino revisaba si el cliente había pagado, y en un pick-up eso es lo
 * que más importa porque el cliente está enfrente llevándose la caja.
 *
 * Aquí viven las dos piezas que faltaban:
 *   · la lista de lo que está listo para recoger, con su saldo y su referencia
 *   · la entrega en sí, que exige el pago salvo que un gerente lo autorice
 *
 * El cobro en efectivo NO se hace aquí: lo hace el endpoint de siempre
 * (/api/admin/finance/confirm-payment), que ya sabe recibir pesos o dólares,
 * marca las guías pagadas y deja el movimiento en caja chica. Repetir esa
 * lógica sería tener dos verdades sobre el mismo dinero.
 */
import { Request, Response } from 'express';
import { pool } from './db';

/** Roles que pueden saltarse el cobro dejando constancia. */
const PUEDE_ENTREGAR_SIN_PAGO = ['branch_manager', 'director', 'admin', 'super_admin'];

const saldoDe = (p: any): number => {
  const saldo = Number(p.saldo_pendiente);
  if (Number.isFinite(saldo) && saldo > 0) return Math.round(saldo * 100) / 100;
  const total = Number(p.assigned_cost_mxn) || 0;
  const pagado = Number(p.monto_pagado) || 0;
  return Math.round(Math.max(0, total - pagado) * 100) / 100;
};

/**
 * GET /api/pobox/entrega-mostrador
 * Guías PO Box listas para recoger, con lo que se les debe cobrar.
 */
export const listarPendientesMostrador = async (req: Request, res: Response): Promise<any> => {
  try {
    const q = String((req.query.q || '')).trim();
    const filtro = q
      ? `AND (p.tracking_internal ILIKE $1 OR u.box_id ILIKE $1 OR u.full_name ILIKE $1)`
      : '';
    const params = q ? [`%${q}%`] : [];
    const r = await pool.query(`
      SELECT p.id, p.tracking_internal, p.weight, p.total_boxes, p.status, p.carrier,
             p.assigned_cost_mxn, p.monto_pagado, p.saldo_pendiente, p.client_paid,
             p.updated_at, p.received_at,
             u.id AS user_id, u.full_name AS cliente, u.box_id,
             (SELECT pp.payment_reference FROM pobox_payments pp
               WHERE pp.package_ids @> to_jsonb(p.id)
                 AND pp.status NOT IN ('cancelled', 'expired')
               ORDER BY pp.created_at DESC LIMIT 1) AS referencia,
             (SELECT pp.status FROM pobox_payments pp
               WHERE pp.package_ids @> to_jsonb(p.id)
                 AND pp.status NOT IN ('cancelled', 'expired')
               ORDER BY pp.created_at DESC LIMIT 1) AS estado_orden
        FROM packages p
        JOIN users u ON u.id = p.user_id
       WHERE p.status = 'ready_pickup'
         AND COALESCE(p.service_type, '') IN ('POBOX_USA', 'usa_pobox', '')
         -- Solo la guía que se entrega: las cajas hijas van dentro del master y
         -- aparecerían como renglones sueltos sin costo propio.
         AND p.master_id IS NULL
         ${filtro}
       ORDER BY p.updated_at DESC
       LIMIT 200`, params);

    const guias = r.rows.map((p: any) => ({
      id: p.id,
      tracking: p.tracking_internal,
      cliente: p.cliente,
      box_id: p.box_id,
      user_id: p.user_id,
      peso: Number(p.weight) || 0,
      cajas: Number(p.total_boxes) || 1,
      total: Number(p.assigned_cost_mxn) || 0,
      pagado: Number(p.monto_pagado) || 0,
      saldo: saldoDe(p),
      referencia: p.referencia || null,
      estado_orden: p.estado_orden || null,
      listo_desde: p.updated_at,
    }));
    res.json({ guias, total: guias.length });
  } catch (e: any) {
    console.error('[entrega-mostrador] listar:', e);
    res.status(500).json({ error: 'No se pudo cargar la lista' });
  }
};

/**
 * POST /api/pobox/entrega-mostrador/:id
 * Body: { recibe: string, sin_pago?: boolean, notas?: string }
 *
 * Marca la guía como entregada en mostrador. Si queda saldo, se rechaza con el
 * monto exacto y la referencia para cobrarlo; un gerente puede forzarlo con
 * `sin_pago`, y queda registrado quién lo autorizó.
 */
export const entregarEnMostrador = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const id = parseInt(String(req.params.id), 10);
    const { recibe, sin_pago, notas } = req.body || {};
    const uid = (req as any).user?.userId || null;
    const rol = String((req as any).user?.role || '').toLowerCase();
    if (!id) return res.status(400).json({ error: 'Guía inválida' });
    const quienRecibe = String(recibe || '').trim();
    if (!quienRecibe) return res.status(400).json({ error: 'Falta el nombre de quien recibe el paquete' });

    await client.query('BEGIN');
    const p = (await client.query(
      `SELECT p.*, u.full_name AS cliente, u.box_id
         FROM packages p JOIN users u ON u.id = p.user_id
        WHERE p.id = $1 FOR UPDATE`, [id])).rows[0];
    if (!p) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Guía no encontrada' }); }
    if (p.status === 'delivered') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Esta guía ya está entregada', entregada_el: p.delivered_at });
    }

    const saldo = saldoDe(p);
    if (saldo > 0.01 && !sin_pago) {
      const ref = (await client.query(
        `SELECT payment_reference FROM pobox_payments
          WHERE package_ids @> to_jsonb($1::int) AND status NOT IN ('cancelled','expired')
          ORDER BY created_at DESC LIMIT 1`, [id])).rows[0]?.payment_reference || null;
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'saldo_pendiente',
        message: `Esta guía debe $${saldo.toFixed(2)} MXN. Cóbralos antes de entregar.`,
        saldo, referencia: ref,
      });
    }
    if (saldo > 0.01 && sin_pago && !PUEDE_ENTREGAR_SIN_PAGO.includes(rol)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Solo un gerente puede entregar una guía con saldo pendiente.' });
    }

    const nota = [
      `Entregada en mostrador a ${quienRecibe}`,
      saldo > 0.01 ? `CON SALDO PENDIENTE de $${saldo.toFixed(2)} autorizado por el usuario ${uid}` : null,
      notas ? String(notas).trim() : null,
    ].filter(Boolean).join('. ');

    await client.query(
      `UPDATE packages
          SET status = 'delivered', delivered_at = NOW(),
              delivery_recipient_name = $2, delivery_status = 'delivered',
              needs_instructions = false, updated_at = NOW()
        WHERE id = $1`, [id, quienRecibe]);
    await client.query(
      `INSERT INTO package_history (package_id, status, notes, created_by) VALUES ($1, 'delivered', $2, $3)`,
      [id, nota, uid]).catch(() => {});
    await client.query('COMMIT');

    console.log(`📦 [Entrega mostrador] ${p.tracking_internal} (${p.box_id}) entregada a ${quienRecibe} por usuario ${uid}`);
    res.json({
      ok: true,
      tracking: p.tracking_internal,
      cliente: p.cliente,
      recibe: quienRecibe,
      con_saldo: saldo > 0.01 ? saldo : 0,
    });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[entrega-mostrador] entregar:', e);
    res.status(500).json({ error: 'No se pudo registrar la entrega' });
  } finally {
    client.release();
  }
};
