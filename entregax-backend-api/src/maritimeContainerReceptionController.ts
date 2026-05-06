// ============================================
// CONTROLADOR DE RECEPCIÓN POR CONTENEDOR (Marítimo China)
// Por contenedor / BL / referencia (JSM26-XXXX)
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

interface AuthRequest extends Request {
  user?: { userId: number; role: string };
}

// ============================================
// 1. LISTAR CONTENEDORES PENDIENTES DE RECIBIR
// GET /api/admin/china-sea/containers/in-transit
// ============================================
export const listInTransitContainers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.container_number,
        c.bl_number,
        c.reference_code,
        c.vessel_name,
        c.voyage_number,
        c.pol,
        c.pod,
        c.port_of_loading,
        c.port_of_discharge,
        c.eta,
        c.week_number,
        c.status,
        c.type,
        c.total_packages,
        c.total_weight_kg,
        c.total_cbm,
        c.created_at,
        c.received_at,
        mr.code AS route_code,
        (
          SELECT COUNT(*) FROM maritime_orders mo
          WHERE mo.container_id = c.id
        ) AS total_orders,
        (
          SELECT COUNT(*) FROM maritime_orders mo
          WHERE mo.container_id = c.id
            AND mo.status = 'received_mty'
        ) AS received_orders,
        (
          SELECT COUNT(*) FROM maritime_orders mo
          WHERE mo.container_id = c.id
            AND COALESCE(mo.missing_on_arrival, FALSE) = TRUE
        ) AS missing_orders
      FROM containers c
      LEFT JOIN maritime_routes mr ON mr.id = c.route_id
      WHERE c.received_at IS NULL
      ORDER BY c.eta ASC NULLS LAST, c.id DESC
    `);

    res.json({ containers: result.rows });
  } catch (err) {
    console.error('listInTransitContainers error:', err);
    res.status(500).json({ error: 'Error al listar contenedores' });
  }
};

// ============================================
// 2. OBTENER ÓRDENES DE UN CONTENEDOR
// GET /api/admin/china-sea/containers/:id/orders
// ============================================
export const getContainerOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  const containerId = parseInt(String(req.params.id || ''), 10);
  if (!containerId) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }

  try {
    const containerRes = await pool.query(
      `SELECT c.*, mr.code AS route_code
       FROM containers c
       LEFT JOIN maritime_routes mr ON mr.id = c.route_id
       WHERE c.id = $1`,
      [containerId]
    );

    if (containerRes.rows.length === 0) {
      res.status(404).json({ error: 'Contenedor no encontrado' });
      return;
    }

    const ordersRes = await pool.query(
      `SELECT
         mo.id,
         mo.ordersn,
         mo.shipping_mark,
         mo.goods_name,
         mo.goods_num,
         mo.weight,
         mo.volume,
         mo.status,
         mo.last_tracking_status,
         mo.bl_client_code,
         mo.bl_client_name,
         mo.summary_boxes,
         mo.summary_weight,
         mo.summary_volume,
         mo.received_boxes,
         COALESCE(mo.missing_on_arrival, FALSE) AS missing_on_arrival,
         u.box_id AS user_box_id,
         u.full_name AS user_name
       FROM maritime_orders mo
       LEFT JOIN users u ON u.id = mo.user_id
       WHERE mo.container_id = $1
       ORDER BY mo.ordersn ASC`,
      [containerId]
    );

    res.json({
      container: containerRes.rows[0],
      orders: ordersRes.rows,
    });
  } catch (err) {
    console.error('getContainerOrders error:', err);
    res.status(500).json({ error: 'Error al obtener órdenes' });
  }
};

// ============================================
// 3. ESCANEAR ORDEN DENTRO DE UN CONTENEDOR
// POST /api/admin/china-sea/containers/:id/scan
// body: { reference: 'LOG26CNMX00279' | 'shipping_mark' }
// ============================================
export const scanContainerOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  const containerId = parseInt(String(req.params.id || ''), 10);
  const reference = String(req.body?.reference || '').trim();
  const userId = req.user?.userId;

  if (!containerId || !reference) {
    res.status(400).json({ error: 'Contenedor y referencia requeridos' });
    return;
  }

  try {
    // Si la referencia es una guía hija (LOG con sufijo de caja), normalizar al master.
    // Formatos aceptados:
    //   LOG26CNMX00082-0034   (con dash, 4 dígitos nuevo formato)
    //   LOG26CNMX00082-34     (con dash, formato legacy)
    //   LOG26CNMX000820034    (compacto del barcode)
    //   LOG26CNMX00082        (master directo)
    const refUpper = reference.toUpperCase();
    const candidates: string[] = [refUpper];
    // 1) Dash format: separar el sufijo numérico final
    const dashMatch = refUpper.match(/^(LOG[A-Z0-9]+?)-(\d{1,4})$/);
    if (dashMatch && dashMatch[1]) candidates.push(dashMatch[1]);
    // 2) Compacto: probar quitando últimos 1-4 dígitos como caja
    if (/^LOG/i.test(refUpper) && !dashMatch) {
        const compact = refUpper.replace(/[^A-Z0-9]/g, '');
        for (const len of [4, 3, 2, 1]) {
            if (compact.length > len + 6) {
                candidates.push(compact.slice(0, -len));
            }
        }
    }

    // Match by ordersn primarily, fallback to shipping_mark, probando todas las variantes
    let orderRes = { rows: [] as any[] } as any;
    for (const cand of candidates) {
      orderRes = await pool.query(
        `SELECT id, ordersn, status, shipping_mark
           FROM maritime_orders
          WHERE container_id = $1
            AND (
              UPPER(ordersn) = UPPER($2)
              OR UPPER(shipping_mark) = UPPER($2)
              OR REGEXP_REPLACE(UPPER(COALESCE(ordersn, '')), '[^A-Z0-9]', '', 'g') = $2
            )
          LIMIT 1`,
        [containerId, cand]
      );
      if (orderRes.rows.length > 0) break;
    }

    if (orderRes.rows.length === 0) {
      // Check if reference exists in another container (probando variantes también)
      let otherRes = { rows: [] as any[] } as any;
      for (const cand of candidates) {
        otherRes = await pool.query(
          `SELECT mo.id, mo.ordersn, mo.container_id, c.reference_code, c.container_number
             FROM maritime_orders mo
             LEFT JOIN containers c ON c.id = mo.container_id
            WHERE UPPER(mo.ordersn) = UPPER($1)
               OR UPPER(mo.shipping_mark) = UPPER($1)
               OR REGEXP_REPLACE(UPPER(COALESCE(mo.ordersn, '')), '[^A-Z0-9]', '', 'g') = $1
            LIMIT 1`,
          [cand]
        );
        if (otherRes.rows.length > 0) break;
      }
      if (otherRes.rows.length > 0) {
        const o = otherRes.rows[0];
        res.status(404).json({
          error: `La referencia ${o.ordersn} pertenece al contenedor ${o.container_number || o.reference_code || '#' + o.container_id}, no a éste.`,
        });
        return;
      }
      res.status(404).json({ error: `Referencia "${reference}" no encontrada en este contenedor` });
      return;
    }

    const order = orderRes.rows[0];

    if (order.status === 'received_mty') {
      res.json({
        ok: true,
        already_received: true,
        order: { id: order.id, ordersn: order.ordersn, status: order.status },
      });
      return;
    }

    await pool.query(
      `UPDATE maritime_orders
          SET status = 'received_mty',
              missing_on_arrival = FALSE,
              updated_at = NOW()
        WHERE id = $1`,
      [order.id]
    );

    // Audit log (best-effort)
    try {
      await pool.query(
        `INSERT INTO maritime_tracking_logs (order_id, event_type, event_detail, created_by, created_at)
         VALUES ($1, 'received_mty', $2, $3, NOW())`,
        [order.id, `Escaneado en recepción contenedor #${containerId}`, userId || null]
      );
    } catch (_) { /* tabla puede no existir o columnas distintas */ }

    res.json({
      ok: true,
      already_received: false,
      order: { id: order.id, ordersn: order.ordersn, status: 'received_mty' },
    });
  } catch (err) {
    console.error('scanContainerOrder error:', err);
    res.status(500).json({ error: 'Error al escanear orden' });
  }
};

// ============================================
// 4. FINALIZAR RECEPCIÓN DE CONTENEDOR
// POST /api/admin/china-sea/containers/:id/finalize
// body: { allow_partial: boolean, notes?: string }
// ============================================
export const finalizeContainerReception = async (req: AuthRequest, res: Response): Promise<void> => {
  const containerId = parseInt(String(req.params.id || ''), 10);
  const allowPartial = req.body?.allow_partial === true;
  const notes = req.body?.notes ? String(req.body.notes) : null;
  const userId = req.user?.userId;

  if (!containerId) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const containerRes = await client.query(
      `SELECT id, received_at FROM containers WHERE id = $1 FOR UPDATE`,
      [containerId]
    );
    if (containerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Contenedor no encontrado' });
      return;
    }
    if (containerRes.rows[0].received_at) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Contenedor ya fue recibido' });
      return;
    }

    const totalsRes = await client.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'received_mty')::int AS received
       FROM maritime_orders
       WHERE container_id = $1`,
      [containerId]
    );
    const total = totalsRes.rows[0].total;
    const received = totalsRes.rows[0].received;
    const missing = total - received;

    if (missing > 0 && !allowPartial) {
      await client.query('ROLLBACK');
      res.status(400).json({
        error: `Faltan ${missing} órdenes por escanear. Activa allow_partial para finalizar parcial.`,
        total,
        received,
        missing,
      });
      return;
    }

    if (missing > 0) {
      await client.query(
        `UPDATE maritime_orders
            SET missing_on_arrival = TRUE,
                updated_at = NOW()
          WHERE container_id = $1
            AND status <> 'received_mty'`,
        [containerId]
      );
    }

    // Solo cerrar contenedor (received_at + status='received_mty') cuando la recepción
    // está completa. Para parciales, dejar received_at NULL y status='received_partial'
    // para que siga apareciendo en la lista de pendientes hasta que se complete.
    if (missing === 0) {
      await client.query(
        `UPDATE containers
            SET received_at = NOW(),
                received_by = $2,
                reception_notes = $3,
                status = 'received_mty',
                updated_at = NOW()
          WHERE id = $1`,
        [containerId, userId || null, notes]
      );
    } else {
      await client.query(
        `UPDATE containers
            SET received_by = $2,
                reception_notes = $3,
                status = 'received_partial',
                updated_at = NOW()
          WHERE id = $1`,
        [containerId, userId || null, notes]
      );

      // Notificar a usuarios con permiso 'ops_china_sea' o admins
      try {
        const containerInfoRes = await client.query(
          `SELECT COALESCE(bl_number, container_number, reference_code) AS master FROM containers WHERE id = $1`,
          [containerId]
        );
        const masterTrk = containerInfoRes.rows[0]?.master || `#${containerId}`;

        // Cajas parciales (logs escaneados pero con cajas faltantes)
        const partialBoxesRes = await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE received_boxes IS NOT NULL
                              AND received_boxes < COALESCE(summary_boxes, goods_num, 0))::int AS partial_orders,
             COALESCE(SUM(GREATEST(COALESCE(summary_boxes, goods_num, 0) - COALESCE(received_boxes, 0), 0))
                      FILTER (WHERE received_boxes IS NOT NULL
                              AND received_boxes < COALESCE(summary_boxes, goods_num, 0)), 0)::int AS partial_boxes_missing
           FROM maritime_orders
           WHERE container_id = $1`,
          [containerId]
        );
        const partialOrders = partialBoxesRes.rows[0]?.partial_orders || 0;
        const partialBoxesMissing = partialBoxesRes.rows[0]?.partial_boxes_missing || 0;

        // Marítimo China llega a CEDIS CDMX → notificar a operadores de CEDIS + admins
        const receiversRes = await client.query(
          `SELECT DISTINCT u.id
             FROM users u
             LEFT JOIN user_module_permissions ump
               ON ump.user_id = u.id
              AND ump.panel_key IN ('ops_mx_cedis','ops_china_sea')
              AND ump.can_view = TRUE
            WHERE u.role IN ('super_admin','admin')
               OR ump.user_id IS NOT NULL`
        );

        const title = '⚠️ Contenedor recibido con faltantes';
        const parts: string[] = [];
        if (missing > 0) parts.push(`${missing} log(s) sin escanear`);
        if (partialOrders > 0) parts.push(`${partialOrders} log(s) con ${partialBoxesMissing} caja(s) faltante(s)`);
        const message = `Contenedor ${masterTrk}: ${parts.join(' + ')} (${received}/${total} logs recibidos)`;
        const actionUrl = `/admin/china-sea/reception/${containerId}`;
        const data = {
          container_id: Number(containerId),
          missing_logs: missing,
          partial_orders: partialOrders,
          partial_boxes_missing: partialBoxesMissing,
          received,
          total,
        };

        for (const row of receiversRes.rows) {
          await client.query(
            `INSERT INTO notifications (user_id, title, message, type, icon, action_url, data)
             VALUES ($1::int, $2::varchar, $3::text, 'warning'::varchar, '⚠️'::varchar, $4::varchar, $5::jsonb)`,
            [row.id, title, message, actionUrl, JSON.stringify(data)]
          );
        }
      } catch (e) {
        console.warn('[SEA-RX] notification dispatch failed:', (e as any)?.message);
      }
    }

    await client.query('COMMIT');

    // Calcular cajas faltantes parciales (para mostrar en el frontend)
    const partialFinalRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE received_boxes IS NOT NULL
                          AND received_boxes < COALESCE(summary_boxes, goods_num, 0))::int AS partial_orders,
         COALESCE(SUM(GREATEST(COALESCE(summary_boxes, goods_num, 0) - COALESCE(received_boxes, 0), 0))
                  FILTER (WHERE received_boxes IS NOT NULL
                          AND received_boxes < COALESCE(summary_boxes, goods_num, 0)), 0)::int AS partial_boxes_missing
       FROM maritime_orders
       WHERE container_id = $1`,
      [containerId]
    );

    res.json({
      ok: true,
      new_status: missing === 0 ? 'received_mty' : 'received_partial',
      total,
      received,
      missing,
      partial_orders: partialFinalRes.rows[0]?.partial_orders || 0,
      partial_boxes_missing: partialFinalRes.rows[0]?.partial_boxes_missing || 0,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('finalizeContainerReception error:', err);
    res.status(500).json({ error: 'Error al finalizar recepción' });
  } finally {
    client.release();
  }
};

// ============================================
// 4b. REPORTAR CAJAS PARCIALES POR ORDEN
// POST /api/admin/china-sea/containers/:id/report-partial-boxes
// body: { orders: [{ order_id, received_boxes }], notes?: string }
// Marca las órdenes donde received_boxes < expected como missing_on_arrival
// y notifica a operadores CEDIS / ops_china_sea / admins.
// ============================================
export const reportPartialBoxes = async (req: AuthRequest, res: Response): Promise<void> => {
  const containerId = parseInt(String(req.params.id || ''), 10);
  const userId = req.user?.userId;
  const orders: Array<{ order_id: number; received_boxes: number }> = Array.isArray(req.body?.orders) ? req.body.orders : [];
  const notes: string | null = (req.body?.notes ? String(req.body.notes) : null);

  if (!containerId) {
    res.status(400).json({ error: 'ID de contenedor inválido' });
    return;
  }
  if (orders.length === 0) {
    res.status(400).json({ error: 'Debes enviar al menos una orden' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Asegurar columnas (auto-migración idempotente)
    await client.query(`ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS received_boxes INTEGER`);
    await client.query(`ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS missing_on_arrival BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS missing_reported_at TIMESTAMP`);

    // Cargar órdenes actuales del contenedor
    const ordersRes = await client.query(
      `SELECT id, ordersn, COALESCE(summary_boxes, goods_num, 1) AS expected_boxes
         FROM maritime_orders
        WHERE container_id = $1`,
      [containerId]
    );
    const expectedById = new Map<number, { ordersn: string; expected: number }>();
    ordersRes.rows.forEach((r: { id: number; ordersn: string; expected_boxes: number }) => {
      expectedById.set(Number(r.id), { ordersn: r.ordersn, expected: Number(r.expected_boxes) || 0 });
    });

    type PartialRow = { order_id: number; ordersn: string; expected: number; received: number; missing: number };
    const partials: PartialRow[] = [];

    for (const item of orders) {
      const id = Number(item.order_id);
      const received = Math.max(0, Math.floor(Number(item.received_boxes) || 0));
      const meta = expectedById.get(id);
      if (!meta) continue;
      const expected = meta.expected;
      const safeReceived = Math.min(received, expected);
      const missing = expected - safeReceived;

      if (missing > 0) {
        await client.query(
          `UPDATE maritime_orders
              SET received_boxes = $1,
                  missing_on_arrival = TRUE,
                  missing_reported_at = COALESCE(missing_reported_at, NOW()),
                  updated_at = NOW()
            WHERE id = $2`,
          [safeReceived, id]
        );
        partials.push({ order_id: id, ordersn: meta.ordersn, expected, received: safeReceived, missing });
      } else {
        // Cantidad completa → limpiar marca de faltante si la tenía
        await client.query(
          `UPDATE maritime_orders
              SET received_boxes = $1,
                  missing_on_arrival = FALSE,
                  missing_reported_at = NULL,
                  updated_at = NOW()
            WHERE id = $2`,
          [safeReceived, id]
        );
      }
    }

    // Notificar si hubo faltantes
    if (partials.length > 0) {
      const containerInfoRes = await client.query(
        `SELECT COALESCE(reference_code, bl_number, container_number) AS master FROM containers WHERE id = $1`,
        [containerId]
      );
      const masterTrk = containerInfoRes.rows[0]?.master || `#${containerId}`;
      const totalMissingBoxes = partials.reduce((s, p) => s + p.missing, 0);

      const receiversRes = await client.query(
        `SELECT DISTINCT u.id
           FROM users u
           LEFT JOIN user_module_permissions ump
             ON ump.user_id = u.id
            AND ump.panel_key IN ('ops_mx_cedis','ops_china_sea')
            AND ump.can_view = TRUE
          WHERE u.role IN ('super_admin','admin')
             OR ump.user_id IS NOT NULL`
      );

      const summary = partials.slice(0, 5)
        .map((p) => `${p.ordersn} (${p.received}/${p.expected})`)
        .join(', ');
      const title = '⚠️ Cajas faltantes en contenedor marítimo';
      const message = `${masterTrk}: ${partials.length} orden(es) con cajas faltantes · ${totalMissingBoxes} caja(s) faltantes — ${summary}${partials.length > 5 ? '...' : ''}`;
      const actionUrl = `/admin/china-sea/reception/${containerId}`;
      const data = {
        container_id: containerId,
        total_missing_boxes: totalMissingBoxes,
        partial_orders: partials,
        notes,
        reported_by: userId || null,
      };

      for (const row of receiversRes.rows) {
        await client.query(
          `INSERT INTO notifications (user_id, title, message, type, icon, action_url, data)
           VALUES ($1::int, $2::varchar, $3::text, 'warning'::varchar, '⚠️'::varchar, $4::varchar, $5::jsonb)`,
          [row.id, title, message, actionUrl, JSON.stringify(data)]
        );
      }
    }

    await client.query('COMMIT');
    res.json({
      ok: true,
      partial_orders_count: partials.length,
      total_missing_boxes: partials.reduce((s, p) => s + p.missing, 0),
      partials,
    });
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    const msg = err instanceof Error ? err.message : 'Error';
    console.error('reportPartialBoxes error:', msg);
    res.status(500).json({ error: 'Error al reportar cajas parciales', details: msg });
  } finally {
    client.release();
  }
};

// ============================================
// 5. INVENTARIO MARÍTIMO
// GET /api/admin/china-sea/inventory?search=&status=&container=&limit=&offset=
// ============================================
export const getSeaInventory = async (req: AuthRequest, res: Response): Promise<void> => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const container = String(req.query.container || '').trim();
  const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 500);
  const offset = parseInt(String(req.query.offset || '0'), 10) || 0;

  try {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      where.push(`(
        mo.ordersn ILIKE $${i}
        OR mo.shipping_mark ILIKE $${i}
        OR mo.goods_name ILIKE $${i}
        OR u.box_id ILIKE $${i}
        OR u.full_name ILIKE $${i}
      )`);
    }

    if (status === 'missing') {
      where.push(`COALESCE(mo.missing_on_arrival, FALSE) = TRUE`);
    } else if (status && status !== 'all') {
      params.push(status);
      where.push(`mo.status = $${params.length}`);
    }

    if (container) {
      params.push(`%${container}%`);
      const i = params.length;
      where.push(`(
        c.container_number ILIKE $${i}
        OR c.bl_number ILIKE $${i}
        OR c.reference_code ILIKE $${i}
      )`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM maritime_orders mo
         LEFT JOIN containers c ON c.id = mo.container_id
         LEFT JOIN users u ON u.id = mo.user_id
         ${whereSql}`,
      params
    );

    params.push(limit);
    params.push(offset);

    const rowsRes = await pool.query(
      `SELECT
         mo.id,
         mo.ordersn,
         mo.shipping_mark,
         mo.goods_name,
         mo.weight,
         mo.volume,
         mo.status,
         mo.container_id,
         mo.created_at,
         mo.updated_at,
         mo.delivered_at,
         COALESCE(mo.missing_on_arrival, FALSE) AS missing_on_arrival,
         c.container_number,
         c.bl_number,
         c.reference_code,
         c.received_at AS container_received_at,
         u.box_id AS user_box_id,
         u.full_name AS user_name
       FROM maritime_orders mo
       LEFT JOIN containers c ON c.id = mo.container_id
       LEFT JOIN users u ON u.id = mo.user_id
       ${whereSql}
       ORDER BY mo.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const statsRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'received_china')::int AS received_china,
         COUNT(*) FILTER (WHERE status = 'in_transit')::int AS in_transit,
         COUNT(*) FILTER (WHERE status = 'received_mty')::int AS received_mty,
         COUNT(*) FILTER (WHERE status = 'customs_mx' OR status = 'customs_cleared')::int AS customs,
         COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
         COUNT(*) FILTER (WHERE COALESCE(missing_on_arrival, FALSE) = TRUE)::int AS missing
       FROM maritime_orders`
    );

    res.json({
      orders: rowsRes.rows,
      total: totalRes.rows[0].total,
      stats: statsRes.rows[0],
    });
  } catch (err) {
    console.error('getSeaInventory error:', err);
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
};
