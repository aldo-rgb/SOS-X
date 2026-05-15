/**
 * TDI Express — Recepción de envíos de la ruta aérea TDI-EXPRES (HKG → MTY).
 *
 * Flujo: capturado en China (received_china) → en tránsito (in_transit) →
 * recibido en MTY (received_mty) → re-envío nacional (dispatched_national) →
 * entregado (delivered).
 *
 * La captura es "en serie" (master + cajas hijas), replicando la mecánica de
 * PO Box bulk-master pero con los campos propios de carga aérea TDI Express:
 * guía origen, cliente, GW, CW, medidas, tipo de producto y comentarios.
 */
import { Request, Response } from 'express';
import { pool } from './db';

const TDI_ROUTE_CODE = 'TDI-EXPRES';

// tipo de producto (UI) ↔ tariff_type (air_tariffs)
const PRODUCT_TO_TARIFF: Record<string, string> = {
  logo: 'L',
  generico: 'G',
  sensible: 'S',
  fragil: 'F',
};
const TARIFF_TO_PRODUCT: Record<string, string> = {
  L: 'logo',
  G: 'generico',
  S: 'sensible',
  F: 'fragil',
};

/**
 * Genera una guía TDX- + 10 dígitos numéricos aleatorios (no consecutivos),
 * verificada como única en packages.tracking_internal.
 */
const genTdiTracking = async (client: any): Promise<string> => {
  for (let attempt = 0; attempt < 30; attempt++) {
    let digits = '';
    for (let d = 0; d < 10; d++) digits += Math.floor(Math.random() * 10).toString();
    const candidate = `TDX-${digits}`;
    const exists = await client.query(
      'SELECT 1 FROM packages WHERE tracking_internal = $1 LIMIT 1',
      [candidate]
    );
    if (exists.rowCount === 0) return candidate;
  }
  throw new Error('No se pudo generar una guía TDX única');
};

const getTdiRouteId = async (client: any): Promise<number | null> => {
  const r = await client.query(
    `SELECT id FROM air_routes WHERE UPPER(code) = $1 AND is_active = true LIMIT 1`,
    [TDI_ROUTE_CODE]
  );
  return r.rows[0]?.id ?? null;
};

/** Precio por kg vigente para un tipo de tarifa en la ruta TDI Express. */
const getTariffPerKg = async (
  client: any,
  routeId: number,
  tariffType: string
): Promise<number> => {
  const t = await client.query(
    `SELECT price_per_kg FROM air_tariffs
     WHERE route_id = $1 AND tariff_type = $2 AND is_active = true AND price_per_kg > 0
     LIMIT 1`,
    [routeId, tariffType]
  );
  return t.rows[0] ? Number(t.rows[0].price_per_kg) : 0;
};

// =====================================================================
// CATÁLOGO: tipos de producto con tarifa vigente
// (los que tienen tarifa 0 o inactiva NO se devuelven → no se muestran)
// =====================================================================
export const getTdiProductTypes = async (_req: Request, res: Response): Promise<any> => {
  try {
    const routeId = await getTdiRouteId(pool);
    if (!routeId) return res.json({ productTypes: [] });
    const r = await pool.query(
      `SELECT tariff_type, price_per_kg FROM air_tariffs
       WHERE route_id = $1 AND is_active = true AND price_per_kg > 0
       ORDER BY tariff_type`,
      [routeId]
    );
    const productTypes = r.rows
      .filter((row) => TARIFF_TO_PRODUCT[row.tariff_type])
      .map((row) => ({
        key: TARIFF_TO_PRODUCT[row.tariff_type],
        tariffType: row.tariff_type,
        pricePerKg: Number(row.price_per_kg),
      }));
    return res.json({ routeId, productTypes });
  } catch (err: any) {
    console.error('getTdiProductTypes error', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

// =====================================================================
// STATS por estado
// =====================================================================
export const getTdiStats = async (_req: Request, res: Response): Promise<any> => {
  try {
    const r = await pool.query(`
      SELECT status, COUNT(*) AS c
      FROM packages
      WHERE air_source = 'tdi_express' AND COALESCE(is_master, false) = false
      GROUP BY status
    `);
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of r.rows) {
      byStatus[row.status] = Number(row.c);
      total += Number(row.c);
    }
    return res.json({
      total,
      capturado_china: byStatus['received_china'] || 0,
      en_transito: byStatus['in_transit'] || 0,
      recibido_mty: byStatus['received_mty'] || 0,
      en_reenvio: byStatus['dispatched_national'] || 0,
      entregado: byStatus['delivered'] || 0,
    });
  } catch (err: any) {
    console.error('getTdiStats error', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

// =====================================================================
// LISTADO de envíos (masters + paquetes individuales)
// =====================================================================
export const listTdiShipments = async (req: Request, res: Response): Promise<any> => {
  try {
    const { search, status } = req.query as { search?: string; status?: string };
    const where: string[] = [
      `m.air_source = 'tdi_express'`,
      `(m.is_master = true OR m.master_id IS NULL)`,
    ];
    const params: any[] = [];
    if (status && status !== 'all') {
      params.push(status);
      where.push(`m.status = $${params.length}`);
    }
    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      where.push(`(LOWER(m.tracking_internal) LIKE $${params.length}
        OR LOWER(COALESCE(m.box_id,'')) LIKE $${params.length}
        OR LOWER(COALESCE(u.full_name,'')) LIKE $${params.length})`);
    }
    const r = await pool.query(
      `SELECT
         m.id, m.tracking_internal, m.box_id, m.status, m.is_master,
         m.total_boxes, m.weight, m.air_chargeable_weight, m.air_sale_price,
         m.description, m.notes, m.received_at, m.created_at,
         u.full_name AS client_name,
         (SELECT COUNT(*) FROM packages c WHERE c.master_id = m.id) AS captured_boxes
       FROM packages m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY m.created_at DESC
       LIMIT 300`,
      params
    );
    return res.json({ shipments: r.rows });
  } catch (err: any) {
    console.error('listTdiShipments error', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

// =====================================================================
// DETALLE de un envío (master + sus cajas)
// =====================================================================
export const getTdiShipmentDetail = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const m = await pool.query(
      `SELECT m.*, u.full_name AS client_name
       FROM packages m LEFT JOIN users u ON u.id = m.user_id
       WHERE m.id = $1 AND m.air_source = 'tdi_express'`,
      [id]
    );
    if (!m.rows[0]) return res.status(404).json({ error: 'Envío no encontrado' });
    const boxes = await pool.query(
      `SELECT * FROM packages WHERE master_id = $1 ORDER BY box_number`,
      [id]
    );
    return res.json({ shipment: m.rows[0], boxes: boxes.rows });
  } catch (err: any) {
    console.error('getTdiShipmentDetail error', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

// =====================================================================
// RECEPCIÓN EN SERIE — iniciar master
// Body: { boxId?, expectedTotalBoxes, notes? }
// =====================================================================
export const startTdiSerial = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const { boxId, expectedTotalBoxes, notes } = req.body || {};
    const total = parseInt(String(expectedTotalBoxes || 0), 10);
    if (!total || total < 1) {
      return res.status(400).json({ error: 'expectedTotalBoxes requerido (>=1)' });
    }

    const routeId = await getTdiRouteId(client);
    if (!routeId) {
      return res.status(503).json({ error: 'No hay ruta TDI-EXPRES activa configurada' });
    }

    // Cliente opcional (users → legacy_clients)
    let userId: number | null = null;
    let clientBoxId: string | null = null;
    if (boxId && String(boxId).trim()) {
      const bid = String(boxId).trim().toUpperCase();
      const u = await client.query('SELECT id, box_id FROM users WHERE UPPER(box_id) = $1 LIMIT 1', [bid]);
      if (u.rows[0]) {
        userId = u.rows[0].id;
        clientBoxId = u.rows[0].box_id;
      } else {
        const lg = await client.query('SELECT box_id FROM legacy_clients WHERE UPPER(box_id) = $1 LIMIT 1', [bid]);
        clientBoxId = lg.rows[0]?.box_id || bid;
      }
    }

    await client.query('BEGIN');
    const tracking = await genTdiTracking(client);
    const m = await client.query(
      `INSERT INTO packages (
         tracking_internal, is_master, total_boxes, box_id, user_id,
         status, air_route_id, air_source, service_type,
         description, notes, weight, received_at, created_at, updated_at
       ) VALUES (
         $1, true, $2, $3, $4, 'received_china', $5, 'tdi_express', 'tdi_express',
         $6, $7, 0, NOW(), NOW(), NOW()
       ) RETURNING id, tracking_internal`,
      [tracking, total, clientBoxId, userId, routeId, 'TDI Express - Recepción en serie', notes || null]
    );
    await client.query('COMMIT');

    return res.json({
      success: true,
      masterId: m.rows[0].id,
      masterTracking: m.rows[0].tracking_internal,
      totalBoxes: total,
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('startTdiSerial error', err);
    return res.status(500).json({ error: 'Error al iniciar recepción', details: err.message });
  } finally {
    client.release();
  }
};

// =====================================================================
// ELIMINAR un envío TDI Express completo (master + cajas)
// =====================================================================
export const deleteTdiShipment = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const m = await client.query(
      `SELECT id FROM packages WHERE id = $1 AND air_source = 'tdi_express'`,
      [id]
    );
    if (!m.rows[0]) return res.status(404).json({ error: 'Envío no encontrado' });
    await client.query('BEGIN');
    await client.query(`DELETE FROM packages WHERE master_id = $1`, [id]);
    await client.query(`DELETE FROM packages WHERE id = $1`, [id]);
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('deleteTdiShipment error', err);
    return res.status(500).json({ error: 'Error al eliminar envío', details: err.message });
  } finally {
    client.release();
  }
};

// =====================================================================
// EDITAR el número de cliente de un envío (master + todas sus cajas)
// =====================================================================
export const updateTdiShipmentClient = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const bid = String((req.body || {}).boxId || '').trim().toUpperCase();
    if (!bid) return res.status(400).json({ error: 'Número de cliente requerido' });

    // Resolver usuario por casillero (users → legacy)
    let userId: number | null = null;
    const u = await client.query('SELECT id FROM users WHERE UPPER(box_id) = $1 LIMIT 1', [bid]);
    if (u.rows[0]) userId = u.rows[0].id;

    await client.query('BEGIN');
    const m = await client.query(
      `SELECT id FROM packages WHERE id = $1 AND air_source = 'tdi_express'`,
      [id]
    );
    if (!m.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Envío no encontrado' });
    }
    await client.query(
      `UPDATE packages SET box_id = $1, user_id = $2, updated_at = NOW()
       WHERE id = $3 OR master_id = $3`,
      [bid, userId, id]
    );
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('updateTdiShipmentClient error', err);
    return res.status(500).json({ error: 'Error al actualizar cliente', details: err.message });
  } finally {
    client.release();
  }
};

// =====================================================================
// RECEPCIÓN EN SERIE — agregar caja al master
// Body: { originGuide, boxId, grossWeight, chargeableWeight, length, width,
//         height, productType, description, comments }
// =====================================================================
export const addTdiBox = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const masterId = Number(req.params.masterId);
    if (!Number.isFinite(masterId)) return res.status(400).json({ error: 'masterId inválido' });

    const {
      originGuide, boxId, grossWeight, chargeableWeight,
      length, width, height, productType, description, comments, quantity,
    } = req.body || {};
    const qty = Math.max(1, Math.min(99, parseInt(String(quantity ?? 1), 10) || 1));

    const gw = Number(grossWeight) || 0;
    const cw = Number(chargeableWeight) || 0;
    const billWeight = cw > 0 ? cw : gw;
    if (gw <= 0) return res.status(400).json({ error: 'Peso GW requerido' });

    const tariffType = PRODUCT_TO_TARIFF[String(productType || 'generico').toLowerCase()] || 'G';

    const m = await client.query(
      `SELECT id, total_boxes, box_id, user_id, air_route_id FROM packages
       WHERE id = $1 AND air_source = 'tdi_express' AND is_master = true`,
      [masterId]
    );
    if (!m.rows[0]) return res.status(404).json({ error: 'Master no encontrado' });
    const master = m.rows[0];
    const routeId = master.air_route_id;

    const pricePerKg = await getTariffPerKg(client, routeId, tariffType);
    const salePrice = +(pricePerKg * billWeight).toFixed(2);

    await client.query('BEGIN');

    const countRes = await client.query('SELECT COUNT(*) AS c FROM packages WHERE master_id = $1', [masterId]);
    let boxNumber = Number(countRes.rows[0].c);
    const created: { id: number; tracking: string; boxNumber: number }[] = [];

    // Cantidad: agrega N cajas idénticas en un solo bloque (mismas medidas).
    for (let i = 0; i < qty; i++) {
      boxNumber++;
      const childTracking = await genTdiTracking(client);
      const ins = await client.query(
        `INSERT INTO packages (
           tracking_internal, tracking_provider, is_master, master_id, box_number, child_no,
           box_id, user_id, status, air_route_id, air_source, service_type,
           weight, air_chargeable_weight, pkg_length, pkg_width, pkg_height,
           air_tariff_type, air_price_per_kg, air_sale_price, air_is_custom_tariff,
           description, notes, received_at, created_at, updated_at
         ) VALUES (
           $1, $2, false, $3, $4, $5, $6, $7, 'received_china', $8, 'tdi_express', 'tdi_express',
           $9, $10, $11, $12, $13, $14, $15, $16, false,
           $17, $18, NOW(), NOW(), NOW()
         ) RETURNING id, tracking_internal`,
        [
          childTracking, originGuide || null, masterId, boxNumber, String(boxNumber),
          boxId || master.box_id, master.user_id, routeId,
          gw, cw || null, Number(length) || null, Number(width) || null, Number(height) || null,
          tariffType, pricePerKg > 0 ? pricePerKg : null, salePrice > 0 ? salePrice : null,
          description || null, comments || null,
        ]
      );
      created.push({ id: ins.rows[0].id, tracking: ins.rows[0].tracking_internal, boxNumber });
    }

    // Recalcular totales del master
    await client.query(
      `UPDATE packages SET
         weight = COALESCE((SELECT SUM(weight) FROM packages WHERE master_id = $1), 0),
         air_chargeable_weight = COALESCE((SELECT SUM(COALESCE(air_chargeable_weight, weight)) FROM packages WHERE master_id = $1), 0),
         air_sale_price = COALESCE((SELECT SUM(air_sale_price) FROM packages WHERE master_id = $1), 0),
         updated_at = NOW()
       WHERE id = $1`,
      [masterId]
    );

    await client.query('COMMIT');
    return res.json({
      success: true,
      created,
      count: created.length,
      pricePerKg,
      salePrice,
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('addTdiBox error', err);
    return res.status(500).json({ error: 'Error al agregar caja', details: err.message });
  } finally {
    client.release();
  }
};

// =====================================================================
// RECEPCIÓN EN SERIE — quitar caja
// =====================================================================
export const removeTdiBox = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const masterId = Number(req.params.masterId);
    const childId = Number(req.params.childId);
    if (!Number.isFinite(masterId) || !Number.isFinite(childId)) {
      return res.status(400).json({ error: 'IDs inválidos' });
    }
    await client.query('BEGIN');
    const del = await client.query(
      `DELETE FROM packages WHERE id = $1 AND master_id = $2 RETURNING id`,
      [childId, masterId]
    );
    if (!del.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Caja no encontrada' });
    }
    // Renumerar y recalcular
    await client.query(
      `WITH ordered AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY box_number) AS rn
         FROM packages WHERE master_id = $1
       )
       UPDATE packages p SET box_number = o.rn, child_no = o.rn::text
       FROM ordered o WHERE p.id = o.id`,
      [masterId]
    );
    await client.query(
      `UPDATE packages SET
         weight = COALESCE((SELECT SUM(weight) FROM packages WHERE master_id = $1), 0),
         air_chargeable_weight = COALESCE((SELECT SUM(COALESCE(air_chargeable_weight, weight)) FROM packages WHERE master_id = $1), 0),
         air_sale_price = COALESCE((SELECT SUM(air_sale_price) FROM packages WHERE master_id = $1), 0),
         updated_at = NOW()
       WHERE id = $1`,
      [masterId]
    );
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('removeTdiBox error', err);
    return res.status(500).json({ error: 'Error al quitar caja', details: err.message });
  } finally {
    client.release();
  }
};
