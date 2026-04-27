// ============================================
// CONTROLADOR DE RECEPCIÓN POR AWB (Aéreo China)
// Estilo similar a la recepción de consolidaciones PO Box
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

interface AuthRequest extends Request {
  user?: { userId: number; role: string };
}

// ============================================
// 1. LISTAR AWBs PENDIENTES DE RECIBIR
// GET /api/admin/china-air/awbs/in-transit
// ============================================
export const listInTransitAwbs = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        ac.id,
        ac.awb_number,
        ac.carrier,
        ac.flight_number,
        ac.flight_date,
        ac.origin_airport,
        ac.destination_airport,
        ac.pieces,
        ac.gross_weight_kg,
        ac.status,
        ac.created_at,
        ac.received_at,
        ar.code AS route_code,
        (
          SELECT COUNT(*) FROM packages p
          WHERE p.international_tracking = ac.awb_number
        ) AS total_packages,
        (
          SELECT COUNT(*) FROM packages p
          WHERE p.international_tracking = ac.awb_number
            AND p.status = 'received_mty'
        ) AS received_packages,
        (
          SELECT COUNT(*) FROM packages p
          WHERE p.international_tracking = ac.awb_number
            AND COALESCE(p.missing_on_arrival, FALSE) = TRUE
        ) AS missing_packages
      FROM air_waybill_costs ac
      LEFT JOIN air_routes ar ON ar.id = ac.route_id
      WHERE ac.received_at IS NULL
      ORDER BY ac.created_at DESC
    `);

    res.json({ success: true, awbs: result.rows });
  } catch (error: any) {
    console.error('✈️ [AWB-RX] Error listando AWBs en tránsito:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// 2. PAQUETES DE UN AWB
// GET /api/admin/china-air/awbs/:id/packages
// ============================================
export const getAwbPackages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const awbRes = await pool.query(
      `SELECT id, awb_number, status, received_at FROM air_waybill_costs WHERE id = $1`,
      [id]
    );
    if (awbRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'AWB no encontrado' });
      return;
    }
    const awb = awbRes.rows[0];

    const pkgRes = await pool.query(
      `
        SELECT
          p.id,
          p.tracking_internal,
          p.status,
          p.description,
          p.weight,
          COALESCE(p.missing_on_arrival, FALSE) AS missing_on_arrival,
          u.box_id AS user_box_id,
          u.full_name AS user_name
        FROM packages p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.international_tracking = $1
        ORDER BY p.tracking_internal
      `,
      [awb.awb_number]
    );

    res.json({ success: true, awb, packages: pkgRes.rows });
  } catch (error: any) {
    console.error('✈️ [AWB-RX] Error paquetes AWB:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// 3. ESCANEAR PAQUETE PARA RECEPCIÓN
// POST /api/admin/china-air/awbs/:id/scan
// body: { tracking }
// ============================================
export const scanAwbPackage = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { tracking } = req.body || {};
    const userId = req.user?.userId;

    if (!tracking || String(tracking).trim() === '') {
      res.status(400).json({ success: false, error: 'tracking es requerido' });
      return;
    }

    const cleanTracking = String(tracking).trim().toUpperCase();

    await client.query('BEGIN');

    // Validar AWB
    const awbRes = await client.query(
      `SELECT id, awb_number, received_at FROM air_waybill_costs WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (awbRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'AWB no encontrado' });
      return;
    }
    const awb = awbRes.rows[0];
    if (awb.received_at) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: 'Esta AWB ya fue recibida' });
      return;
    }

    // Buscar paquete vinculado a este AWB
    const pkgRes = await client.query(
      `SELECT id, tracking_internal, status, COALESCE(missing_on_arrival, FALSE) AS missing_on_arrival
       FROM packages
       WHERE UPPER(tracking_internal) = $1
         AND international_tracking = $2
       LIMIT 1`,
      [cleanTracking, awb.awb_number]
    );

    if (pkgRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        error: `Guía ${cleanTracking} no pertenece a esta AWB`,
      });
      return;
    }

    const pkg = pkgRes.rows[0];

    if (pkg.status === 'received_mty') {
      await client.query('ROLLBACK');
      res.json({
        success: true,
        already_received: true,
        package: pkg,
        message: 'Esta guía ya estaba marcada como recibida',
      });
      return;
    }

    // Actualizar paquete
    await client.query(
      `UPDATE packages
       SET status = 'received_mty',
           missing_on_arrival = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [pkg.id]
    );

    // Insertar historial si la tabla existe
    try {
      await client.query(
        `INSERT INTO package_history (package_id, status, notes, created_by, created_at)
         VALUES ($1, 'received_mty', $2, $3, NOW())`,
        [pkg.id, `Recibido en MTY vía AWB ${awb.awb_number}`, userId || null]
      );
    } catch (_) {
      /* tabla puede no existir, ignorar */
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      package: { ...pkg, status: 'received_mty' },
      message: 'Paquete recibido correctamente',
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('✈️ [AWB-RX] Error escaneando paquete:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

// ============================================
// 4. FINALIZAR RECEPCIÓN
// POST /api/admin/china-air/awbs/:id/finalize
// body: { allow_partial?: boolean, notes?: string }
// ============================================
export const finalizeAwbReception = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { allow_partial = false, notes = null } = req.body || {};
    const userId = req.user?.userId;

    await client.query('BEGIN');

    const awbRes = await client.query(
      `SELECT id, awb_number, received_at FROM air_waybill_costs WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (awbRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'AWB no encontrado' });
      return;
    }
    const awb = awbRes.rows[0];
    if (awb.received_at) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: 'Esta AWB ya fue recibida' });
      return;
    }

    const pkgs = await client.query(
      `SELECT id, status FROM packages WHERE international_tracking = $1`,
      [awb.awb_number]
    );

    const total = pkgs.rows.length;
    const received = pkgs.rows.filter((p) => p.status === 'received_mty').length;
    const missing = total - received;

    if (missing > 0 && !allow_partial) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        error: `Faltan ${missing} paquete(s) por escanear. Confirma recepción parcial.`,
        missing,
      });
      return;
    }

    // Marcar faltantes
    if (missing > 0) {
      await client.query(
        `UPDATE packages
         SET missing_on_arrival = TRUE, updated_at = NOW()
         WHERE international_tracking = $1 AND status <> 'received_mty'`,
        [awb.awb_number]
      );
    }

    // Cerrar AWB
    await client.query(
      `UPDATE air_waybill_costs
       SET received_at = NOW(),
           received_by = $2,
           reception_notes = $3,
           status = CASE WHEN status = 'pending' THEN 'received' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [id, userId || null, notes]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      total,
      received,
      missing,
      new_status: missing === 0 ? 'completa' : 'parcial',
      message: missing === 0
        ? 'Recepción completada exitosamente'
        : `Recepción parcial finalizada (${missing} faltante(s))`,
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('✈️ [AWB-RX] Error finalizando recepción:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

// ============================================
// 5. INVENTARIO AÉREO EN BODEGA
// GET /api/admin/china-air/inventory
// query: search, status, awb, limit, offset
// ============================================
export const getAirInventory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, status, awb, limit = '100', offset = '0' } = req.query;
    const limitNum = Math.min(parseInt(String(limit)) || 100, 500);
    const offsetNum = parseInt(String(offset)) || 0;

    const params: (string | number)[] = [];
    // Solo guías con número AIR/AWB asignado (excluye paquetes que aún están en China sin AWB)
    let where = `WHERE p.service_type = 'AIR_CHN_MX' AND p.international_tracking IS NOT NULL AND p.international_tracking <> ''`;

    if (status && status !== 'all') {
      const s = String(status);
      if (s === 'missing') {
        where += ` AND COALESCE(p.missing_on_arrival, FALSE) = TRUE`;
      } else if (s === 'in_warehouse') {
        where += ` AND p.status = 'received_mty'`;
      } else if (s === 'waiting_customs_gz') {
        // El status IN_CUSTOMS_GZ vive en china_receipts (no en packages.status que es enum)
        where += ` AND cr.status = 'in_customs_gz'`;
      } else {
        params.push(s);
        where += ` AND p.status::text = $${params.length}`;
      }
    }

    if (awb) {
      params.push(String(awb));
      where += ` AND p.international_tracking = $${params.length}`;
    }

    if (search && String(search).trim() !== '') {
      params.push(`%${String(search).trim()}%`);
      const i = params.length;
      where += ` AND (
        p.tracking_internal ILIKE $${i}
        OR p.international_tracking ILIKE $${i}
        OR COALESCE(p.description, '') ILIKE $${i}
        OR COALESCE(u.full_name, '') ILIKE $${i}
        OR COALESCE(u.box_id, '') ILIKE $${i}
        OR COALESCE(u.email, '') ILIKE $${i}
      )`;
    }

    const baseFrom = `
      FROM packages p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN china_receipts cr ON cr.id = p.china_receipt_id
    `;

    const countRes = await pool.query(
      `SELECT COUNT(*) AS total ${baseFrom} ${where}`,
      params
    );

    params.push(limitNum, offsetNum);
    const dataRes = await pool.query(
      `
        SELECT
          p.id,
          p.tracking_internal,
          p.international_tracking AS awb_number,
          p.status,
          cr.status AS china_status,
          p.description,
          p.weight,
          p.dimensions,
          CASE
            WHEN p.status = 'received_mty' THEN p.updated_at
            ELSE NULL
          END AS received_at,
          COALESCE(p.missing_on_arrival, FALSE) AS missing_on_arrival,
          u.id AS user_id,
          u.full_name AS user_name,
          u.box_id AS user_box_id,
          u.email AS user_email
        ${baseFrom}
        ${where}
        ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    // Resumen agregado: 2 chips principales + otros
    const statsRes = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE p.status = 'received_mty')::int AS in_warehouse,
          COUNT(*) FILTER (WHERE cr.status = 'in_customs_gz')::int AS waiting_customs_gz,
          COUNT(*) FILTER (WHERE p.status = 'received_china')::int AS received_china,
          COUNT(*) FILTER (WHERE p.status = 'in_transit')::int AS in_transit,
          COUNT(*) FILTER (WHERE COALESCE(p.missing_on_arrival, FALSE) = TRUE)::int AS missing
        FROM packages p
        LEFT JOIN china_receipts cr ON cr.id = p.china_receipt_id
        WHERE p.service_type = 'AIR_CHN_MX'
      `
    );

    res.json({
      success: true,
      total: parseInt(countRes.rows[0].total),
      packages: dataRes.rows,
      stats: statsRes.rows[0],
    });
  } catch (error: any) {
    console.error('✈️ [AWB-RX] Error inventario:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
