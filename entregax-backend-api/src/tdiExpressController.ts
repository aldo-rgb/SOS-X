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
    // Conteos por CAJA (children): capturado en China y listas para envío
    // (received_china que YA tienen instrucciones — child o master).
    const boxes = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE c.status::text = 'received_china') AS capturado_china,
        COUNT(*) FILTER (
          WHERE c.status::text = 'received_china'
            AND (c.assigned_address_id IS NOT NULL OR m.assigned_address_id IS NOT NULL)
        ) AS listas_envio
      FROM packages c
      LEFT JOIN packages m ON m.id = c.master_id
      WHERE c.air_source = 'tdi_express' AND COALESCE(c.is_master, false) = false
    `);

    // Conteos por GUÍA (master): pendientes de foto (aún en China sin foto de
    // recepción) y pendiente de tracking DHL (en tránsito sin AWB asignado).
    const masters = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(m.reception_photos, '[]'::jsonb) = '[]'::jsonb
            AND EXISTS (SELECT 1 FROM packages c WHERE c.master_id = m.id AND c.status::text = 'received_china')
        ) AS pdte_foto,
        COUNT(*) FILTER (
          WHERE (m.status::text = 'in_transit'
                 OR EXISTS (SELECT 1 FROM packages c WHERE c.master_id = m.id AND c.status::text = 'in_transit'))
            AND NULLIF(TRIM(COALESCE(m.international_tracking, '')), '') IS NULL
        ) AS pdte_tracking
      FROM packages m
      WHERE m.air_source = 'tdi_express' AND m.is_master = true
    `);

    const b = boxes.rows[0] || {};
    const mm = masters.rows[0] || {};
    return res.json({
      capturado_china: Number(b.capturado_china) || 0,
      listas_envio: Number(b.listas_envio) || 0,
      pdte_foto: Number(mm.pdte_foto) || 0,
      pdte_tracking: Number(mm.pdte_tracking) || 0,
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
    // Auto-cleanup: elimina masters TDI Express que quedaron vacíos (sin cajas
    // hijas) por más de 10 minutos. Estos son creados al iniciar el wizard
    // 'Recibir Paquete' pero el usuario nunca llegó a capturar cajas (cerró
    // el navegador, recargó, etc.).
    try {
      await pool.query(`
        DELETE FROM packages
         WHERE air_source = 'tdi_express'
           AND is_master = TRUE
           AND created_at < NOW() - INTERVAL '10 minutes'
           AND NOT EXISTS (SELECT 1 FROM packages c WHERE c.master_id = packages.id)
      `);
    } catch (cleanupErr: any) {
      console.warn('[listTdiShipments] cleanup empty masters warning:', cleanupErr.message);
    }

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
         COALESCE(m.reception_photos, '[]'::jsonb) AS reception_photos,
         u.full_name AS client_name,
         (SELECT COUNT(*) FROM packages c WHERE c.master_id = m.id) AS captured_boxes,
         (SELECT string_agg(DISTINCT c.air_tariff_type, ',')
            FROM packages c WHERE c.master_id = m.id AND c.air_tariff_type IS NOT NULL) AS child_tariff_types,
         (SELECT COUNT(DISTINCT COALESCE(c.pkg_length,0)||'x'||COALESCE(c.pkg_width,0)||'x'||COALESCE(c.pkg_height,0))
            FROM packages c WHERE c.master_id = m.id) AS dim_variants,
         (SELECT c.pkg_length || '×' || c.pkg_width || '×' || c.pkg_height
            FROM packages c WHERE c.master_id = m.id AND c.pkg_length IS NOT NULL
            ORDER BY c.box_number LIMIT 1) AS first_dims,
         -- Guía origen: string_agg de tracking_provider distintos entre las cajas hijas.
         (SELECT string_agg(DISTINCT c.tracking_provider, ', ')
            FROM packages c WHERE c.master_id = m.id AND c.tracking_provider IS NOT NULL AND c.tracking_provider <> '') AS origin_guides,
         -- Cargo extra USD: suma de cargos activos ligados al master o a sus cajas hijas.
         (SELECT COALESCE(SUM(gaf.monto), 0)::numeric
            FROM guias_ajustes_financieros gaf
           WHERE gaf.servicio = 'tdi_express'
             AND gaf.tipo = 'cargo_extra'
             AND COALESCE(gaf.moneda, 'USD') = 'USD'
             AND COALESCE(gaf.activo, TRUE) = TRUE
             AND (gaf.guia_id = m.id
               OR gaf.guia_id IN (SELECT id FROM packages WHERE master_id = m.id))) AS extra_charges_usd
       FROM packages m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY m.created_at DESC
       LIMIT 300`,
      params
    );

    // Firmar URLs de fotos de recepción (bucket privado S3)
    try {
      const { signS3UrlIfNeeded } = await import('./s3Service');
      for (const row of r.rows) {
        const raw = Array.isArray(row.reception_photos) ? row.reception_photos : [];
        row.reception_photos = await Promise.all(
          raw.filter(Boolean).map((u: string) => signS3UrlIfNeeded(u))
        );
      }
    } catch (signErr: any) {
      console.warn('[listTdiShipments] sign photos warning:', signErr?.message);
    }

    return res.json({ shipments: r.rows });
  } catch (err: any) {
    console.error('listTdiShipments error', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

// =====================================================================
// SUBIR una o más fotos de recepción a un envío TDI Express (master)
// =====================================================================
export const uploadTdiPhotos = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const files = ((req as any).files || []) as any[];
    if (!files.length) return res.status(400).json({ error: 'No se enviaron fotos' });

    await pool.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS reception_photos JSONB DEFAULT '[]'::jsonb`).catch(() => {});

    const { uploadToS3, signS3UrlIfNeeded } = await import('./s3Service');
    const newUrls: string[] = [];
    for (const f of files) {
      const ext = f.mimetype === 'image/png' ? 'png' : 'jpg';
      const key = `reception-photos/tdi_${id}_${Date.now()}_${newUrls.length}.${ext}`;
      const url = await uploadToS3(f.buffer, key, f.mimetype || 'image/jpeg');
      newUrls.push(url);
    }

    // Append al arreglo existente; también set image_url si estaba vacío (compat).
    const upd = await pool.query(
      `UPDATE packages
          SET reception_photos = COALESCE(reception_photos, '[]'::jsonb) || $2::jsonb,
              image_url = COALESCE(NULLIF(image_url, ''), $3),
              updated_at = NOW()
        WHERE id = $1
        RETURNING reception_photos`,
      [id, JSON.stringify(newUrls), newUrls[0]]
    );
    const stored: string[] = Array.isArray(upd.rows[0]?.reception_photos) ? upd.rows[0].reception_photos : [];
    const signed = await Promise.all(stored.filter(Boolean).map((u: string) => signS3UrlIfNeeded(u)));
    return res.json({ success: true, photos: signed });
  } catch (err: any) {
    console.error('uploadTdiPhotos error', err);
    return res.status(500).json({ error: err.message || 'Error al subir fotos' });
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
// EDITAR un envío: número de cliente y/o tipo de producto
// (aplica al master y a todas sus cajas; recalcula precios si cambia el tipo)
// =====================================================================
export const updateTdiShipment = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const { boxId, productType, extraChargeUsd, extraChargeReason } = (req.body || {}) as { boxId?: string; productType?: string; extraChargeUsd?: number | string; extraChargeReason?: string };
    const bid = boxId ? String(boxId).trim().toUpperCase() : '';
    const newTariff = productType
      ? (PRODUCT_TO_TARIFF[String(productType).toLowerCase()] || null)
      : null;
    const extraUsd = Number(extraChargeUsd);
    const hasExtra = Number.isFinite(extraUsd) && extraUsd > 0;
    const extraReason = String(extraChargeReason || '').trim();
    if (hasExtra && !extraReason) {
      return res.status(400).json({ error: 'El motivo del cargo extra es obligatorio' });
    }
    const autorizadoPor = (req as any).user?.userId ?? (req as any).user?.id ?? null;
    if (!bid && !newTariff && !hasExtra) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }

    await client.query('BEGIN');
    const m = await client.query(
      `SELECT id, air_route_id, tracking_internal, user_id FROM packages WHERE id = $1 AND air_source = 'tdi_express'`,
      [id]
    );
    if (!m.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Envío no encontrado' });
    }
    const routeId = m.rows[0].air_route_id;

    // Cliente (master + hijas)
    if (bid) {
      let userId: number | null = null;
      const u = await client.query('SELECT id FROM users WHERE UPPER(box_id) = $1 LIMIT 1', [bid]);
      if (u.rows[0]) userId = u.rows[0].id;
      await client.query(
        `UPDATE packages SET box_id = $1, user_id = $2, updated_at = NOW()
         WHERE id = $3 OR master_id = $3`,
        [bid, userId, id]
      );
    }

    // Tipo de producto → recalcula tarifa y precio de cada caja
    if (newTariff) {
      const ppk = await getTariffPerKg(client, routeId, newTariff);
      await client.query(
        `UPDATE packages SET
           air_tariff_type = $1,
           air_price_per_kg = $2,
           air_sale_price = CASE WHEN $2 IS NULL THEN NULL
             ELSE ROUND($2 * COALESCE(air_chargeable_weight, weight, 0), 2) END,
           updated_at = NOW()
         WHERE master_id = $3`,
        [newTariff, ppk > 0 ? ppk : null, id]
      );
      await client.query(
        `UPDATE packages SET
           air_sale_price = COALESCE((SELECT SUM(air_sale_price) FROM packages WHERE master_id = $1), 0),
           updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
    }

    // Cargo extra en USD — se registra como cargo_extra en el master de la
    // guía. Aparece en el saldo pendiente / cartera del cliente.
    if (hasExtra) {
      try {
        await client.query(
          `INSERT INTO guias_ajustes_financieros
             (guia_id, guia_tracking, servicio, tipo, monto, moneda, concepto, autorizado_por, cliente_id)
           VALUES ($1, $2, 'tdi_express', 'cargo_extra', $3, 'USD', $4, $5, $6)`,
          [m.rows[0].id, m.rows[0].tracking_internal, extraUsd,
            extraReason, autorizadoPor, m.rows[0].user_id]
        );
      } catch (extraErr: any) {
        console.warn('[updateTdiShipment] no se pudo registrar cargo_extra:', extraErr.message);
      }
    }

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('updateTdiShipment error', err);
    return res.status(500).json({ error: 'Error al actualizar envío', details: err.message });
  } finally {
    client.release();
  }
};

// =====================================================================
// RECEPCIÓN EN SERIE — agregar caja al master
// Body: { originGuide, boxId, grossWeight, chargeableWeight, length, width,
//         height, productType, description, comments, quantity, extraChargeUsd }
//   - originGuide  aplica a TODAS las N cajas del bloque
//   - extraChargeUsd (opcional): se registra como cargo_extra por cada caja
//     creada en guias_ajustes_financieros (servicio='tdi_express', moneda='USD')
// =====================================================================
export const addTdiBox = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const masterId = Number(req.params.masterId);
    if (!Number.isFinite(masterId)) return res.status(400).json({ error: 'masterId inválido' });

    const {
      originGuide, boxId, grossWeight, chargeableWeight,
      length, width, height, productType, description, comments, quantity,
      extraChargeUsd, extraChargeReason,
    } = req.body || {};
    const qty = Math.max(1, Math.min(99, parseInt(String(quantity ?? 1), 10) || 1));
    const extraUsd = Number(extraChargeUsd);
    const hasExtra = Number.isFinite(extraUsd) && extraUsd > 0;
    const extraReason = String(extraChargeReason || '').trim();
    if (hasExtra && !extraReason) {
      return res.status(400).json({ error: 'El motivo del cargo extra es obligatorio' });
    }
    const autorizadoPor = (req as any).user?.userId ?? (req as any).user?.id ?? null;

    const gw = Number(grossWeight) || 0;
    const cw = Number(chargeableWeight) || 0;
    const billWeight = cw > 0 ? cw : gw;
    // Rechazar valores negativos en peso o medidas.
    const dims = [Number(length) || 0, Number(width) || 0, Number(height) || 0];
    if (gw < 0 || cw < 0 || dims.some((d) => d < 0)) {
      return res.status(400).json({ error: 'Los valores negativos no están permitidos en peso ni medidas' });
    }
    if (gw <= 0) return res.status(400).json({ error: 'Peso VW debe ser mayor a 0' });

    const tariffType = PRODUCT_TO_TARIFF[String(productType || 'generico').toLowerCase()] || 'G';

    const m = await client.query(
      `SELECT id, tracking_internal, total_boxes, box_id, user_id, air_route_id FROM packages
       WHERE id = $1 AND air_source = 'tdi_express' AND is_master = true`,
      [masterId]
    );
    if (!m.rows[0]) return res.status(404).json({ error: 'Master no encontrado' });
    const master = m.rows[0];
    const routeId = master.air_route_id;

    const pricePerKg = await getTariffPerKg(client, routeId, tariffType);
    const salePrice = +(pricePerKg * billWeight).toFixed(2);

    // TC USD→MXN de TDI, se GUARDA con la caja para que el flete quede fijo
    // (no se recalcula en cada vista). Fallback 17.77 si no hay config.
    let tdiTc = 17.77;
    try {
      const tcRes = await client.query(`
        SELECT COALESCE(tipo_cambio_manual, ultimo_tc_api, 17.77) + COALESCE(sobreprecio, 0) AS tc
        FROM exchange_rate_config WHERE servicio = 'tdi' AND estado = TRUE LIMIT 1`);
      if (tcRes.rows[0]?.tc) tdiTc = Number(tcRes.rows[0].tc) || 17.77;
    } catch { /* fallback */ }
    // Flete en MXN de esta caja = precio de venta USD × TC.
    const freightMxn = +(salePrice * tdiTc).toFixed(2);

    await client.query('BEGIN');

    const countRes = await client.query('SELECT COUNT(*) AS c FROM packages WHERE master_id = $1', [masterId]);
    let boxNumber = Number(countRes.rows[0].c);
    // ¿Es la primera caja del master? (para notificar "sin identificar" una sola vez)
    const wasEmptyMaster = boxNumber === 0;

    // Validar que no se exceda el total de cajas esperado. Antes se permitía
    // agregar más cajas de las declaradas (ej. total_boxes=1 pero se
    // capturaban 2) y la tabla mostraba "2/1". Si el asesor necesita más
    // cajas, debe crear otra recepción o (a futuro) editar el master.
    const totalEsperado = Number(master.total_boxes ?? 0);
    if (totalEsperado > 0 && boxNumber + qty > totalEsperado) {
      await client.query('ROLLBACK');
      const disponibles = Math.max(0, totalEsperado - boxNumber);
      return res.status(400).json({
        error: `Excede el total de cajas esperado (${totalEsperado}). Ya capturadas: ${boxNumber}, disponibles: ${disponibles}, intentando agregar: ${qty}.`,
      });
    }

    const created: { id: number; tracking: string; boxNumber: number }[] = [];

    // Cantidad: agrega N cajas idénticas en un solo bloque (mismas medidas).
    for (let i = 0; i < qty; i++) {
      boxNumber++;
      // Las cajas hijas se numeran como MASTER-001, MASTER-002… (mismo tracking que
      // el master + sufijo), para que master e hijas se identifiquen como un solo envío.
      const childTracking = `${master.tracking_internal}-${String(boxNumber).padStart(3, '0')}`;
      const ins = await client.query(
        `INSERT INTO packages (
           tracking_internal, tracking_provider, is_master, master_id, box_number, child_no,
           box_id, user_id, status, air_route_id, air_source, service_type,
           weight, air_chargeable_weight, pkg_length, pkg_width, pkg_height,
           air_tariff_type, air_price_per_kg, air_sale_price, air_is_custom_tariff,
           registered_exchange_rate, assigned_cost_mxn, saldo_pendiente,
           description, notes, received_at, created_at, updated_at
         ) VALUES (
           $1, $2, false, $3, $4, $5, $6, $7, 'received_china', $8, 'tdi_express', 'tdi_express',
           $9, $10, $11, $12, $13, $14, $15, $16, false,
           $19, $20, $20,
           $17, $18, NOW(), NOW(), NOW()
         ) RETURNING id, tracking_internal`,
        [
          childTracking, originGuide || null, masterId, boxNumber, String(boxNumber),
          boxId || master.box_id, master.user_id, routeId,
          gw, cw || null, Number(length) || null, Number(width) || null, Number(height) || null,
          tariffType, pricePerKg > 0 ? pricePerKg : null, salePrice > 0 ? salePrice : null,
          description || null, comments || null,
          tdiTc, freightMxn,
        ]
      );
      created.push({ id: ins.rows[0].id, tracking: ins.rows[0].tracking_internal, boxNumber });

      // Cargo extra opcional en USD — se agrega como ajuste financiero por caja
      // (guias_ajustes_financieros). Se usa el mismo endpoint que usa el resto
      // del sistema para cargos/descuentos de guas, para que aparezca en el
      // saldo pendiente / cartera.
      if (hasExtra) {
        try {
          await client.query(
            `INSERT INTO guias_ajustes_financieros
               (guia_id, guia_tracking, servicio, tipo, monto, moneda, concepto, autorizado_por, cliente_id)
             VALUES ($1, $2, 'tdi_express', 'cargo_extra', $3, 'USD', $4, $5, $6)`,
            [ins.rows[0].id, ins.rows[0].tracking_internal, extraUsd,
              extraReason, autorizadoPor, master.user_id]
          );
        } catch (extraErr: any) {
          console.warn('[addTdiBox] no se pudo registrar cargo_extra:', extraErr.message);
        }
      }
    }

    // Recalcular totales del master. El flete (air_sale_price × TC) queda GUARDADO
    // en assigned_cost_mxn/saldo_pendiente junto con el GEX, para que las vistas
    // lean el total sin recalcular. Los cargos extra viven en guias_ajustes.
    await client.query(
      `UPDATE packages SET
         weight = COALESCE((SELECT SUM(weight) FROM packages WHERE master_id = $1), 0),
         air_chargeable_weight = COALESCE((SELECT SUM(COALESCE(air_chargeable_weight, weight)) FROM packages WHERE master_id = $1), 0),
         air_sale_price = COALESCE((SELECT SUM(air_sale_price) FROM packages WHERE master_id = $1), 0),
         registered_exchange_rate = $2,
         -- assigned_cost_mxn = FLETE en MXN (sin GEX ni cargos, para que las vistas
         -- lo tomen como "envío" y sumen GEX/cargos aparte sin doble conteo).
         assigned_cost_mxn = COALESCE((SELECT SUM(air_sale_price) FROM packages WHERE master_id = $1), 0) * $2,
         saldo_pendiente = GREATEST(0,
             COALESCE((SELECT SUM(air_sale_price) FROM packages WHERE master_id = $1), 0) * $2
             + COALESCE(gex_total_cost, 0) - COALESCE(monto_pagado, 0)),
         updated_at = NOW()
       WHERE id = $1`,
      [masterId, tdiTc]
    );

    await client.query('COMMIT');

    // Notificar a TODOS los asesores si la guía se recibió SIN cliente.
    // Solo en la primera caja del master (para no duplicar la notificación).
    if (wasEmptyMaster) {
      const noClient = !String(boxId || '').trim() && !String(master.box_id || '').trim() && !master.user_id;
      if (noClient) {
        try {
          const origenStr = originGuide ? ` · Guía origen: ${originGuide}` : '';
          const notifTitle = '📦 Guía sin identificar · TDI Express';
          const notifBody = `${master.tracking_internal}${origenStr} — Sin cliente asignado`;
          const notifData = { screen: 'AdvisorPackages', filter: 'unidentified', tracking: master.tracking_internal, guia_origen: originGuide || null };
          const nr = await pool.query(`SELECT id FROM users WHERE role IN ('asesor','sub_advisor','advisor')`);
          const { createCustomNotification } = await import('./notificationController');
          await Promise.all(nr.rows.map((row: any) =>
            createCustomNotification(row.id, notifTitle, notifBody, 'info', 'search', notifData)
          )).catch(() => {});
          import('./pushService').then(({ sendPushToRole }) => {
            sendPushToRole(['asesor', 'sub_advisor', 'advisor'], { title: notifTitle, body: notifBody, data: notifData }).catch(() => {});
          }).catch(() => {});
        } catch (notifErr: any) {
          console.warn('[addTdiBox] no se pudo notificar guía sin identificar:', notifErr.message);
        }
      } else {
        // Cliente asignado → avisarle por WhatsApp que su guía TDI Express llegó
        // (una sola vez, en la primera caja del master).
        try {
          const mRow = await pool.query(
            `SELECT user_id, tracking_internal,
                    (SELECT COUNT(*) FROM packages WHERE master_id = $1) AS cajas
               FROM packages WHERE id = $1`,
            [masterId]
          );
          const mm = mRow.rows[0];
          if (mm?.user_id) {
            const { notifyArrivalWhatsApp } = await import('./whatsappService');
            await notifyArrivalWhatsApp(mm.user_id, {
              tracking: mm.tracking_internal,
              servicio: 'TDI Express',
              cajas: parseInt(mm.cajas) || 1,
              guiaOrigen: originGuide || null,
              serviceKey: 'notif_air',
            });
          }
        } catch (waErr: any) {
          console.warn('[addTdiBox] no se pudo notificar WhatsApp al cliente:', waErr.message);
        }
      }
    }

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
// ENVIAR TDI EXPRESS — listado de cajas listas para salir de China
// Una caja está "lista" si: air_source='tdi_express', no es master,
// status='received_china'. Se marca has_instructions si la caja (o su
// master) ya tiene una dirección de entrega asignada.
// REGLA: solo las cajas con instrucciones de envío pueden despacharse.
// =====================================================================
export const listTdiOutboundReady = async (req: Request, res: Response): Promise<any> => {
  try {
    const { search } = req.query as { search?: string };
    const where: string[] = [
      `c.air_source = 'tdi_express'`,
      `COALESCE(c.is_master, false) = false`,
      `c.status = 'received_china'`,
    ];
    const params: any[] = [];
    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      where.push(`(LOWER(c.tracking_internal) LIKE $${params.length}
        OR LOWER(COALESCE(c.tracking_provider,'')) LIKE $${params.length}
        OR LOWER(COALESCE(c.box_id,'')) LIKE $${params.length}
        OR LOWER(COALESCE(u.full_name,'')) LIKE $${params.length})`);
    }
    const r = await pool.query(
      `SELECT
         c.id, c.tracking_internal, c.tracking_provider, c.box_id, c.master_id,
         c.box_number, c.weight, c.air_chargeable_weight,
         c.pkg_length, c.pkg_width, c.pkg_height, c.air_tariff_type,
         c.description, c.assigned_address_id,
         m.tracking_internal AS master_tracking, m.assigned_address_id AS master_address_id,
         u.full_name AS client_name,
         (c.assigned_address_id IS NOT NULL OR m.assigned_address_id IS NOT NULL) AS has_instructions,
         a.alias AS delivery_alias, a.street AS delivery_address, a.city AS delivery_city
       FROM packages c
       LEFT JOIN packages m ON m.id = c.master_id
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN addresses a ON a.id = COALESCE(c.assigned_address_id, m.assigned_address_id)
       WHERE ${where.join(' AND ')}
       ORDER BY c.created_at DESC
       LIMIT 500`,
      params
    );
    return res.json({ boxes: r.rows });
  } catch (err: any) {
    console.error('listTdiOutboundReady error', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

// =====================================================================
// ENVIAR TDI EXPRESS — despachar cajas (received_china → in_transit)
// Body: { packageIds: number[] }
// REGLA: rechaza la operación si alguna caja no tiene instrucciones de envío.
// =====================================================================
export const dispatchTdiBoxes = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const { packageIds } = (req.body || {}) as { packageIds?: number[] };
    const ids = (packageIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      return res.status(400).json({ error: 'packageIds requerido' });
    }

    // Verificar estado e instrucciones de cada caja
    const check = await client.query(
      `SELECT c.id, c.tracking_internal, c.status,
              (c.assigned_address_id IS NOT NULL OR m.assigned_address_id IS NOT NULL) AS has_instructions
       FROM packages c
       LEFT JOIN packages m ON m.id = c.master_id
       WHERE c.id = ANY($1::int[]) AND c.air_source = 'tdi_express'
         AND COALESCE(c.is_master, false) = false`,
      [ids]
    );

    const found = check.rows;
    if (found.length !== ids.length) {
      return res.status(400).json({ error: 'Algunas cajas no existen o no son de TDI Express' });
    }
    const notReady = found.filter((b) => b.status !== 'received_china');
    if (notReady.length > 0) {
      return res.status(400).json({
        error: `Algunas cajas no están listas para salida: ${notReady.map((b) => b.tracking_internal).join(', ')}`,
      });
    }
    // REGLA DE SALIDA: todas deben tener instrucciones de envío
    const noInstructions = found.filter((b) => !b.has_instructions);
    if (noInstructions.length > 0) {
      return res.status(400).json({
        error: `No se puede dar salida: las siguientes cajas no tienen instrucciones de envío: ${noInstructions.map((b) => b.tracking_internal).join(', ')}`,
        boxesWithoutInstructions: noInstructions.map((b) => b.tracking_internal),
      });
    }

    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE packages SET status = 'in_transit', updated_at = NOW()
       WHERE id = ANY($1::int[])
       RETURNING id, tracking_internal`,
      [ids]
    );
    // Actualizar el estado de los masters cuyas cajas ya salieron todas
    await client.query(
      `UPDATE packages m SET status = 'in_transit', updated_at = NOW()
       WHERE m.air_source = 'tdi_express' AND m.is_master = true
         AND m.status = 'received_china'
         AND NOT EXISTS (
           SELECT 1 FROM packages c
           WHERE c.master_id = m.id AND c.status = 'received_china'
         )
         AND EXISTS (SELECT 1 FROM packages c WHERE c.master_id = m.id)`
    );
    await client.query('COMMIT');

    return res.json({ success: true, dispatched: upd.rows.length, boxes: upd.rows });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('dispatchTdiBoxes error', err);
    return res.status(500).json({ error: 'Error al dar salida', details: err.message });
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
    // Renumerar consecutivo y re-nombrar las hijas como MASTER-001, -002…
    // Se hace en 2 fases para no chocar con el UNIQUE de tracking_internal
    // (primero un valor temporal, luego el definitivo).
    const mt = await client.query(`SELECT tracking_internal FROM packages WHERE id = $1`, [masterId]);
    const masterTracking = mt.rows[0]?.tracking_internal || '';
    await client.query(
      `UPDATE packages SET tracking_internal = tracking_internal || '.tmp' WHERE master_id = $1`,
      [masterId]
    );
    await client.query(
      `WITH ordered AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY box_number) AS rn
         FROM packages WHERE master_id = $1
       )
       UPDATE packages p SET box_number = o.rn, child_no = o.rn::text,
         tracking_internal = $2 || '-' || LPAD(o.rn::text, 3, '0')
       FROM ordered o WHERE p.id = o.id`,
      [masterId, masterTracking]
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

// =====================================================================
// RECEPCIÓN EN SERIE — actualizar guías / cliente de una caja hija
// PATCH /api/tdi-express/serial/:masterId/child/:childId
// Body: { originGuide?, originGuide2?, boxId? }
//   - originGuide  → packages.tracking_provider (guía larga principal)
//   - originGuide2 → packages.notes (guía corta secundaria, se almacena
//     en notes para evitar añadir columna nueva — convención ya usada
//     en `addSerialBox` cuando llega como `comments`).
//   - boxId        → packages.box_id (número de cliente)
// =====================================================================
export const updateTdiBox = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const masterId = Number(req.params.masterId);
    const childId = Number(req.params.childId);
    if (!Number.isFinite(masterId) || !Number.isFinite(childId)) {
      return res.status(400).json({ error: 'IDs inválidos' });
    }
    const { originGuide, originGuide2, boxId } = req.body || {};

    // Construir SET dinámico solo con campos provistos (undefined = no tocar)
    const sets: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (originGuide !== undefined) {
      sets.push(`tracking_provider = $${i++}`);
      values.push(originGuide === null || originGuide === '' ? null : String(originGuide).trim().toUpperCase());
    }
    if (originGuide2 !== undefined) {
      sets.push(`notes = $${i++}`);
      values.push(originGuide2 === null || originGuide2 === '' ? null : String(originGuide2).trim().toUpperCase());
    }
    if (boxId !== undefined) {
      sets.push(`box_id = $${i++}`);
      values.push(boxId === null || boxId === '' ? null : String(boxId).trim().toUpperCase());
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'Sin campos a actualizar' });
    }
    sets.push(`updated_at = NOW()`);
    values.push(childId, masterId);

    const upd = await client.query(
      `UPDATE packages SET ${sets.join(', ')}
       WHERE id = $${i++} AND master_id = $${i}
       RETURNING id, tracking_internal, tracking_provider, notes, box_id`,
      values
    );
    if (!upd.rows[0]) return res.status(404).json({ error: 'Caja no encontrada' });
    return res.json({ success: true, box: upd.rows[0] });
  } catch (err: any) {
    console.error('updateTdiBox error', err);
    return res.status(500).json({ error: 'Error al actualizar caja', details: err.message });
  } finally {
    client.release();
  }
};

// =====================================================================
// ACTUALIZAR GUÍA AWB DHL — cajas TDX en tránsito para asignarles el AWB
// El AWB se guarda en packages.international_tracking (que es lo que muestra
// el Inventario TDX en la columna AWB).
// =====================================================================
export const listTdiInTransit = async (req: Request, res: Response): Promise<any> => {
  try {
    const { search } = req.query as { search?: string };
    // Se listan los MASTERS en tránsito con sus cajas hijas anidadas. El AWB se
    // asigna al master y se propaga a todas sus hijas.
    const where: string[] = [
      `m.air_source = 'tdi_express'`,
      `m.is_master = true`,
      `(m.status::text = 'in_transit' OR EXISTS (SELECT 1 FROM packages c WHERE c.master_id = m.id AND c.status::text = 'in_transit'))`,
    ];
    const params: any[] = [];
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      const i = params.length;
      where.push(`(m.tracking_internal ILIKE $${i} OR m.international_tracking ILIKE $${i} OR COALESCE(m.box_id,'') ILIKE $${i} OR COALESCE(u.full_name,'') ILIKE $${i})`);
    }
    const r = await pool.query(
      `SELECT m.id, m.tracking_internal, m.box_id, m.total_boxes,
              m.weight, m.air_chargeable_weight, m.description,
              m.international_tracking AS awb,
              COALESCE(NULLIF(u.full_name,''), NULLIF(lc.full_name,'')) AS client_name,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', c.id, 'tracking_internal', c.tracking_internal, 'box_number', c.box_number,
                  'weight', c.weight, 'air_chargeable_weight', c.air_chargeable_weight,
                  'dimensions', c.dimensions, 'awb', c.international_tracking
                ) ORDER BY c.box_number)
                FROM packages c WHERE c.master_id = m.id
              ), '[]') AS children
       FROM packages m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN legacy_clients lc ON m.user_id IS NULL AND UPPER(COALESCE(m.box_id,'')) = UPPER(lc.box_id)
       WHERE ${where.join(' AND ')}
       ORDER BY m.received_at DESC NULLS LAST, m.id DESC`,
      params
    );
    res.json({ success: true, masters: r.rows });
  } catch (err: any) {
    console.error('listTdiInTransit error', err);
    res.status(500).json({ error: 'Error al listar envíos en tránsito', details: err.message });
  }
};

// PATCH /api/tdi-express/:id/awb  { awb }
// El AWB se asigna al master y se PROPAGA a todas sus cajas hijas (para que
// aparezca en el Inventario TDX de cada caja).
export const updateTdiAwb = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
    const awb = String(req.body?.awb ?? '').trim().toUpperCase();
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE packages SET international_tracking = NULLIF($1, ''), updated_at = NOW()
       WHERE id = $2 AND air_source = 'tdi_express'
       RETURNING id, is_master, tracking_internal`,
      [awb, id]
    );
    if (!upd.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Envío TDX no encontrado' });
    }
    // Si es master, propagar el AWB a todas sus hijas.
    if (upd.rows[0].is_master) {
      await client.query(
        `UPDATE packages SET international_tracking = NULLIF($1, ''), updated_at = NOW() WHERE master_id = $2`,
        [awb, id]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, awb: awb || null });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('updateTdiAwb error', err);
    res.status(500).json({ error: 'Error al actualizar AWB', details: err.message });
  } finally {
    client.release();
  }
};
