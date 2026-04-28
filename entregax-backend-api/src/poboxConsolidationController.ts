import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
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
      // Resolver branch CEDIS MTY (code='MTY') para fijar current_branch_id en
      // los paquetes; sin esto el scanner de SALIDA marca "no está aquí".
      const mtyBranch = await client.query(
        `SELECT id FROM branches WHERE UPPER(code) = 'MTY' AND is_active = TRUE LIMIT 1`
      );
      const mtyBranchId = mtyBranch.rows[0]?.id || null;

      await client.query(
        `UPDATE packages
           SET status = 'received_mty',
               received_at = COALESCE(received_at, NOW()),
               dispatched_at = COALESCE(dispatched_at, NOW()),
               missing_on_arrival = FALSE,
               missing_reported_at = NULL,
               current_branch_id = COALESCE($2::int, current_branch_id),
               updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [scanned, mtyBranchId]
      );

      // Reflejar en branch_inventory para que aparezca en "Inventario por Sucursal"
      if (mtyBranchId) {
        try {
          await client.query(
            `INSERT INTO branch_inventory (branch_id, package_type, package_id, tracking_number, status, received_at, received_by, released_at, released_by)
             SELECT $1, 'package', p.id, COALESCE(p.tracking_internal, p.tracking_provider, p.id::text), 'in_stock', NOW(), $2, NULL, NULL
               FROM packages p WHERE p.id = ANY($3::int[])
             ON CONFLICT (branch_id, package_type, package_id)
             DO UPDATE SET status='in_stock', received_at=NOW(), released_at=NULL, released_by=NULL, received_by=EXCLUDED.received_by`,
            [mtyBranchId, userId || null, scanned]
          );
        } catch (e) {
          console.warn('[pobox-consolidation] branch_inventory upsert falló (no bloqueante):', (e as any)?.message);
        }
      }

      // Propagar a paquetes master cuyos hijos fueron recibidos
      // (los masters no traen consolidation_id, solo las hijas, por eso quedan rezagados)
      try {
        const masterRes = await client.query(
          `SELECT DISTINCT m.id
             FROM packages c
             JOIN packages m ON m.id = c.master_id
            WHERE c.id = ANY($1::int[])
              AND c.master_id IS NOT NULL
              AND m.is_master = TRUE`,
          [scanned]
        );
        const masterIds: number[] = masterRes.rows.map((r: any) => r.id);
        if (masterIds.length > 0) {
          // Solo subir el master cuando TODAS sus hijas estén received_mty
          await client.query(
            `UPDATE packages m
                SET status = 'received_mty',
                    received_at = COALESCE(m.received_at, NOW()),
                    dispatched_at = COALESCE(m.dispatched_at, NOW()),
                    missing_on_arrival = FALSE,
                    missing_reported_at = NULL,
                    current_branch_id = COALESCE($2::int, m.current_branch_id),
                    updated_at = NOW()
              WHERE m.id = ANY($1::int[])
                AND NOT EXISTS (
                  SELECT 1 FROM packages c2
                   WHERE c2.master_id = m.id
                     AND c2.status::text <> 'received_mty'
                )`,
            [masterIds, mtyBranchId]
          );

          if (mtyBranchId) {
            await client.query(
              `INSERT INTO branch_inventory (branch_id, package_type, package_id, tracking_number, status, received_at, received_by, released_at, released_by)
               SELECT $1, 'package', p.id, COALESCE(p.tracking_internal, p.tracking_provider, p.id::text), 'in_stock', NOW(), $2, NULL, NULL
                 FROM packages p
                WHERE p.id = ANY($3::int[])
                  AND p.status::text = 'received_mty'
               ON CONFLICT (branch_id, package_type, package_id)
               DO UPDATE SET status='in_stock', received_at=NOW(), released_at=NULL, released_by=NULL, received_by=EXCLUDED.received_by`,
              [mtyBranchId, userId || null, masterIds]
            );
          }
        }
      } catch (e) {
        console.warn('[pobox-consolidation] propagación a master falló (no bloqueante):', (e as any)?.message);
      }
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
 * Lista paquetes con retraso:
 *  - Paquetes marcados como faltantes (missing_on_arrival) cuando su consolidación llegó sin ellos
 *  - Paquetes cuyo consolidación lleva 5+ días en tránsito y aún no llega a MTY (semáforo rojo)
 */
export const getDelayedPackages = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const result = await pool.query(
      `SELECT 
         p.id,
         p.tracking_internal,
         p.status,
         p.service_type,
         p.description,
         p.weight,
         p.consolidation_id,
         p.missing_reported_at,
         p.created_at,
         c.master_tracking,
         c.status AS consolidation_status,
         c.dispatched_at AS consolidation_dispatched_at,
         c.received_mty_at AS consolidation_received_at,
         c.created_at AS consolidation_created_at,
         u.id AS user_id,
         u.full_name AS user_name,
         u.email AS user_email,
         u.phone AS user_phone,
         u.box_id,
         CASE
           WHEN p.missing_on_arrival = TRUE AND p.missing_reported_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (NOW() - p.missing_reported_at)) / 86400
           WHEN c.status IN ('in_transit', 'received_partial')
             THEN EXTRACT(EPOCH FROM (NOW() - COALESCE(c.dispatched_at, c.created_at))) / 86400
           ELSE NULL
         END AS days_delayed,
         CASE
           WHEN p.missing_on_arrival = TRUE THEN 'faltante'
           WHEN c.status IN ('in_transit', 'received_partial')
                AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.dispatched_at, c.created_at))) / 86400 >= 5
             THEN 'consolidacion_atrasada'
           ELSE 'otro'
         END AS delay_reason
       FROM packages p
       LEFT JOIN consolidations c ON c.id = p.consolidation_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE COALESCE(p.is_lost, FALSE) = FALSE
         AND p.status NOT IN ('delivered', 'ready_pickup')
         AND (
           -- Caso 1: paquete faltante reportado
           p.missing_on_arrival = TRUE
           OR
           -- Caso 2: consolidación en tránsito con 5+ días (semáforo rojo)
           (c.status IN ('in_transit', 'received_partial')
            AND COALESCE(p.missing_on_arrival, FALSE) = FALSE
            AND p.status NOT IN ('received_mty')
            AND EXTRACT(EPOCH FROM (NOW() - COALESCE(c.dispatched_at, c.created_at))) / 86400 >= 5)
         )
       ORDER BY days_delayed DESC NULLS LAST`
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
    const mtyBranch = await pool.query(
      `SELECT id FROM branches WHERE UPPER(code) = 'MTY' AND is_active = TRUE LIMIT 1`
    );
    const mtyBranchId = mtyBranch.rows[0]?.id || null;

    await pool.query(
      `UPDATE packages
         SET status = 'received_mty',
             received_at = COALESCE(received_at, NOW()),
             dispatched_at = COALESCE(dispatched_at, NOW()),
             missing_on_arrival = FALSE,
             missing_reported_at = NULL,
             current_branch_id = COALESCE($2::int, current_branch_id),
             updated_at = NOW()
       WHERE id = $1`,
      [id, mtyBranchId]
    );

    if (mtyBranchId) {
      try {
        await pool.query(
          `INSERT INTO branch_inventory (branch_id, package_type, package_id, tracking_number, status, received_at, released_at, released_by)
           SELECT $1, 'package', p.id, COALESCE(p.tracking_internal, p.tracking_provider, p.id::text), 'in_stock', NOW(), NULL, NULL
             FROM packages p WHERE p.id = $2
           ON CONFLICT (branch_id, package_type, package_id)
           DO UPDATE SET status='in_stock', received_at=NOW(), released_at=NULL, released_by=NULL`,
          [mtyBranchId, id]
        );
      } catch (e) {
        console.warn('[markPackageAsFound] branch_inventory upsert falló:', (e as any)?.message);
      }
    }

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

/**
 * POST /api/admin/pobox/packages/:id/mark-lost
 * Marca un paquete como PERDIDO.
 * Requiere: rol de servicio a cliente o superior + verificación de contraseña del usuario actual.
 * Body: { password: string, reason: string }
 */
export const markPackageAsLost = async (req: AuthRequest, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { password, reason } = req.body as { password?: string; reason?: string };
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }
    if (!password || !reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Detalles del incidente y contraseña son obligatorios' });
    }

    // Verificar rol con permisos suficientes (CS, gerente, admin, director, super_admin)
    const allowedRoles = ['customer_service', 'branch_manager', 'admin', 'director', 'super_admin'];
    const userRow = await client.query(
      `SELECT id, password, role, full_name FROM users WHERE id = $1`,
      [userId]
    );
    if (userRow.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
    }
    const currentUser = userRow.rows[0];
    if (!allowedRoles.includes(currentUser.role)) {
      return res.status(403).json({ success: false, error: 'No tienes permisos de Servicio a Cliente para realizar esta acción' });
    }

    // Verificar contraseña
    const passwordValid = await bcrypt.compare(password, currentUser.password);
    if (!passwordValid) {
      return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }

    // Verificar que el paquete existe y está marcado como faltante
    const pkgRow = await client.query(
      `SELECT id, tracking_internal, missing_on_arrival, is_lost FROM packages WHERE id = $1`,
      [id]
    );
    if (pkgRow.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Paquete no encontrado' });
    }
    if (pkgRow.rows[0].is_lost) {
      return res.status(400).json({ success: false, error: 'El paquete ya está marcado como perdido' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE packages
         SET is_lost = TRUE,
             lost_at = NOW(),
             lost_by_user_id = $1,
             lost_reason = $2,
             status = 'lost',
             updated_at = NOW()
       WHERE id = $3`,
      [userId, reason.trim(), id]
    );

    await client.query('COMMIT');

    console.log(`📦❌ Paquete ${pkgRow.rows[0].tracking_internal} (id=${id}) marcado como PERDIDO por ${currentUser.full_name} (${currentUser.role}). Motivo: ${reason.trim()}`);

    res.json({
      success: true,
      message: 'Paquete marcado como perdido',
      tracking: pkgRow.rows[0].tracking_internal,
      marked_by: currentUser.full_name,
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('markPackageAsLost:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

/**
 * POST /api/admin/pobox/packages/mark-lost-bulk
 * Marca múltiples paquetes como PERDIDOS con el mismo motivo/contraseña.
 * Body: { package_ids: number[], password: string, reason: string }
 */
export const markPackagesAsLostBulk = async (req: AuthRequest, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const { package_ids, password, reason } = req.body as {
      package_ids?: number[];
      password?: string;
      reason?: string;
    };
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }
    if (!Array.isArray(package_ids) || package_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Debes seleccionar al menos un paquete' });
    }
    if (!password || !reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Detalles del incidente y contraseña son obligatorios' });
    }

    const allowedRoles = ['customer_service', 'branch_manager', 'admin', 'director', 'super_admin'];
    const userRow = await client.query(
      `SELECT id, password, role, full_name FROM users WHERE id = $1`,
      [userId]
    );
    if (userRow.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
    }
    const currentUser = userRow.rows[0];
    if (!allowedRoles.includes(currentUser.role)) {
      return res.status(403).json({ success: false, error: 'No tienes permisos de Servicio a Cliente' });
    }

    const passwordValid = await bcrypt.compare(password, currentUser.password);
    if (!passwordValid) {
      return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }

    // Filtrar IDs válidos (numéricos)
    const validIds = package_ids.map(Number).filter((n) => Number.isFinite(n));
    if (validIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay IDs válidos' });
    }

    await client.query('BEGIN');
    const updateRes = await client.query(
      `UPDATE packages
         SET is_lost = TRUE,
             lost_at = NOW(),
             lost_by_user_id = $1,
             lost_reason = $2,
             status = 'lost',
             updated_at = NOW()
       WHERE id = ANY($3::int[])
         AND COALESCE(is_lost, FALSE) = FALSE
       RETURNING id, tracking_internal`,
      [userId, reason.trim(), validIds]
    );
    await client.query('COMMIT');

    console.log(`📦❌ ${updateRes.rowCount} paquetes marcados como PERDIDOS (bulk) por ${currentUser.full_name} (${currentUser.role}). Motivo: ${reason.trim()}`);

    res.json({
      success: true,
      message: `${updateRes.rowCount} paquete(s) marcado(s) como perdido(s)`,
      marked_count: updateRes.rowCount,
      requested_count: validIds.length,
      trackings: updateRes.rows.map((r) => r.tracking_internal),
      marked_by: currentUser.full_name,
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('markPackagesAsLostBulk:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

/**
 * GET /api/admin/customer-service/lost-packages
 * Lista el historial de paquetes marcados como PERDIDOS.
 */
export const getLostPackages = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const result = await pool.query(
      `SELECT 
         p.id,
         p.tracking_internal,
         p.status,
         p.description,
         p.weight,
         p.consolidation_id,
         p.is_lost,
         p.lost_at,
         p.lost_reason,
         p.lost_by_user_id,
         p.missing_reported_at,
         p.created_at,
         c.master_tracking,
         u.id AS user_id,
         u.full_name AS user_name,
         u.email AS user_email,
         u.phone AS user_phone,
         u.box_id,
         lu.full_name AS lost_by_user_name,
         lu.role AS lost_by_user_role,
         EXTRACT(EPOCH FROM (NOW() - p.lost_at)) / 86400 AS days_since_lost
       FROM packages p
       LEFT JOIN consolidations c ON c.id = p.consolidation_id
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN users lu ON lu.id = p.lost_by_user_id
       WHERE COALESCE(p.is_lost, FALSE) = TRUE
       ORDER BY p.lost_at DESC NULLS LAST`
    );
    res.json({ success: true, packages: result.rows });
  } catch (error: any) {
    console.error('getLostPackages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
