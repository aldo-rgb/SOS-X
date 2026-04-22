import { Request, Response } from 'express';
import { pool } from './db';

interface AuthRequest extends Request {
  user?: {
    userId: number;
    id?: number;
    name?: string;
    role?: string;
    branch_id?: number;
  };
}

// =====================================================================
// POBOX CONSOLIDATION RECEPTION CONTROLLER
// Flujo de recepción de consolidaciones en MTY (PO Box USA)
// =====================================================================

/**
 * GET /api/admin/pobox/consolidations/in-transit
 * Lista consolidaciones en tránsito hacia MTY (pendientes de recibir)
 */
export const listInTransitConsolidations = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const result = await pool.query(
      `SELECT 
         c.id,
         c.status,
         c.master_tracking,
         c.total_weight,
         c.shipping_cost,
         c.dispatched_at,
         c.created_at,
         u.full_name AS user_name,
         u.email AS user_email,
         u.box_id,
         COUNT(p.id)::int AS total_packages,
         COUNT(p.id) FILTER (WHERE p.missing_on_arrival = TRUE)::int AS missing_packages
       FROM consolidations c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN packages p ON p.consolidation_id = c.id
       WHERE c.status IN ('in_transit', 'received_partial')
       GROUP BY c.id, u.full_name, u.email, u.box_id
       ORDER BY c.dispatched_at DESC NULLS LAST, c.id DESC`
    );
    res.json({ success: true, consolidations: result.rows });
  } catch (error: any) {
    console.error('listInTransitConsolidations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/admin/pobox/consolidations/:id/packages
 * Lista los paquetes de una consolidación para escanear
 */
export const getConsolidationPackages = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const consolidation = await pool.query(
      `SELECT c.*, u.full_name AS user_name, u.email AS user_email, u.box_id
       FROM consolidations c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = $1`,
      [id]
    );
    if (consolidation.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Consolidación no encontrada' });
    }

    const packages = await pool.query(
      `SELECT 
         id, tracking_internal, status, received_at, dispatched_at,
         missing_on_arrival, missing_reported_at,
         description, weight, declared_value, service_type
       FROM packages
       WHERE consolidation_id = $1
       ORDER BY tracking_internal ASC`,
      [id]
    );

    res.json({
      success: true,
      consolidation: consolidation.rows[0],
      packages: packages.rows,
    });
  } catch (error: any) {
    console.error('getConsolidationPackages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/admin/pobox/consolidations/:id/receive
 * Finaliza la recepción de una consolidación.
 * Body: { scanned_package_ids: number[], force_partial?: boolean }
 *
 * - Paquetes escaneados -> status='received', dispatched_at=NOW() (llegaron a MTY), missing_on_arrival=false
 * - Paquetes no escaneados -> mantienen status='in_transit', missing_on_arrival=true
 * - Consolidación -> status='received_mty' (completa) o 'received_partial' (con faltantes)
 * - Notifica a todos los usuarios con permiso 'ops_usa_pobox' si hay faltantes
 */
export const receiveConsolidation = async (req: AuthRequest, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { scanned_package_ids = [], force_partial = false } = req.body as {
      scanned_package_ids: number[];
      force_partial?: boolean;
    };
    const userId = req.user?.userId || req.user?.id;

    await client.query('BEGIN');

    // Traer paquetes de la consolidación
    const pkgRes = await client.query(
      `SELECT id, tracking_internal, status FROM packages WHERE consolidation_id = $1::int FOR UPDATE`,
      [Number(id)]
    );
    if (pkgRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Consolidación sin paquetes' });
    }

    const allIds: number[] = pkgRes.rows.map((r: any) => r.id);
    const scannedSet = new Set(scanned_package_ids.map((n) => Number(n)));
    const scanned: number[] = allIds.filter((pid) => scannedSet.has(pid));
    const missing: number[] = allIds.filter((pid) => !scannedSet.has(pid));

    // Validar: si hay faltantes y no se forzó el parcial
    if (missing.length > 0 && !force_partial) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'MISSING_PACKAGES',
        message: `Faltan ${missing.length} paquete(s) por escanear`,
        missing_count: missing.length,
        total_count: allIds.length,
      });
    }

    // Marcar escaneados como recibidos en MTY
    if (scanned.length > 0) {
      await client.query(
        `UPDATE packages
           SET status = 'received',
               received_at = COALESCE(received_at, NOW()),
               dispatched_at = NOW(),
               missing_on_arrival = FALSE,
               missing_reported_at = NULL,
               updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [scanned]
      );
    }

    // Marcar faltantes
    if (missing.length > 0) {
      await client.query(
        `UPDATE packages
           SET missing_on_arrival = TRUE,
               missing_reported_at = NOW(),
               updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [missing]
      );
    }

    // Actualizar estado de consolidación
    const newStatus = missing.length === 0 ? 'received_mty' : 'received_partial';
    const isComplete = missing.length === 0;
    await client.query(
      `UPDATE consolidations
         SET status = $1,
             received_mty_at = CASE WHEN $2::boolean THEN NOW() ELSE received_mty_at END,
             received_mty_by = $3,
             updated_at = NOW()
       WHERE id = $4`,
      [newStatus, isComplete, userId || null, Number(id)]
    );

    // Notificar a todos los usuarios con permiso sobre 'ops_usa_pobox' si hay faltantes
    if (missing.length > 0) {
      const missingTrackingRes = await client.query(
        `SELECT tracking_internal FROM packages WHERE id = ANY($1::int[])`,
        [missing]
      );
      const missingTrackings = missingTrackingRes.rows.map((r: any) => r.tracking_internal);

      const receiversRes = await client.query(
        `SELECT DISTINCT u.id
           FROM users u
           LEFT JOIN user_module_permissions ump
             ON ump.user_id = u.id AND ump.panel_key = 'ops_usa_pobox' AND ump.can_view = TRUE
          WHERE u.role IN ('super_admin','admin')
             OR ump.user_id IS NOT NULL`
      );

      const title = '⚠️ Consolidación recibida con faltantes';
      const message = `Consolidación #${id}: ${missing.length} paquete(s) no llegaron a MTY (${missingTrackings.slice(0, 5).join(', ')}${missingTrackings.length > 5 ? '...' : ''})`;
      const actionUrl = `/admin/pobox/consolidations/${id}`;
      const data = {
        consolidation_id: Number(id),
        missing_count: missing.length,
        missing_trackings: missingTrackings,
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
      success: true,
      consolidation_id: Number(id),
      new_status: newStatus,
      scanned_count: scanned.length,
      missing_count: missing.length,
      total_count: allIds.length,
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('receiveConsolidation:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

/**
 * GET /api/admin/customer-service/delayed-packages
 * Lista paquetes marcados como faltantes (no llegaron en su consolidación).
 */
export const getDelayedPackages = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const result = await pool.query(
      `SELECT 
         p.id,
         p.tracking_internal,
         p.status,
         p.description,
         p.weight,
         p.consolidation_id,
         p.missing_reported_at,
         p.created_at,
         c.master_tracking,
         c.dispatched_at AS consolidation_dispatched_at,
         c.received_mty_at AS consolidation_received_at,
         u.id AS user_id,
         u.full_name AS user_name,
         u.email AS user_email,
         u.phone AS user_phone,
         u.box_id,
         EXTRACT(EPOCH FROM (NOW() - p.missing_reported_at)) / 86400 AS days_delayed
       FROM packages p
       LEFT JOIN consolidations c ON c.id = p.consolidation_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.missing_on_arrival = TRUE
         AND p.status NOT IN ('delivered', 'ready_pickup')
       ORDER BY p.missing_reported_at ASC NULLS LAST`
    );
    res.json({ success: true, packages: result.rows });
  } catch (error: any) {
    console.error('getDelayedPackages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/admin/pobox/packages/:id/mark-found
 * Marca manualmente un paquete retrasado como encontrado/recibido en MTY
 */
export const markPackageAsFound = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE packages
         SET status = 'received',
             received_at = COALESCE(received_at, NOW()),
             dispatched_at = NOW(),
             missing_on_arrival = FALSE,
             missing_reported_at = NULL,
             updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Si todos los paquetes de la consolidación ya llegaron, actualizar status
    const pkg = await pool.query(`SELECT consolidation_id FROM packages WHERE id = $1`, [id]);
    const consolidationId = pkg.rows[0]?.consolidation_id;
    if (consolidationId) {
      const pending = await pool.query(
        `SELECT COUNT(*)::int AS n FROM packages WHERE consolidation_id = $1 AND missing_on_arrival = TRUE`,
        [consolidationId]
      );
      if (pending.rows[0].n === 0) {
        await pool.query(
          `UPDATE consolidations SET status = 'received_mty', received_mty_at = COALESCE(received_mty_at, NOW()), updated_at = NOW() WHERE id = $1`,
          [consolidationId]
        );
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('markPackageAsFound:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
