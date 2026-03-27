// ============================================
// CONTROLADOR DE GESTIÓN CAJO
// CRUD para guías aéreas de clientes no-S
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

interface AuthRequest extends Request {
  user?: { userId: number; role: string };
}

// ============================================
// 1. LISTAR GUÍAS CAJO (GET /api/cajo/guides)
// ============================================
export const getCajoGuides = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, search, mawb, limit = 100, offset = 0 } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (status && status !== 'all') {
      whereClause += ` AND cg.status = $${paramIdx++}`;
      params.push(status as string);
    }

    if (search) {
      whereClause += ` AND (cg.guia_air ILIKE $${paramIdx} OR cg.cliente ILIKE $${paramIdx} OR cg.mawb ILIKE $${paramIdx} OR cg.observaciones ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (mawb) {
      whereClause += ` AND cg.mawb = $${paramIdx++}`;
      params.push(mawb as string);
    }

    const countQuery = `SELECT COUNT(*) FROM cajo_guides cg ${whereClause}`;
    const countRes = await pool.query(countQuery, params);
    const total = parseInt(countRes.rows[0].count);

    const dataQuery = `
      SELECT cg.*
      FROM cajo_guides cg
      ${whereClause}
      ORDER BY cg.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(Number(limit), Number(offset));

    const result = await pool.query(dataQuery, params);

    res.json({
      success: true,
      guides: result.rows,
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error: any) {
    console.error('📦 [CAJO] Error listando guías:', error.message);
    res.status(500).json({ error: 'Error al listar guías CAJO' });
  }
};

// ============================================
// 2. ESTADÍSTICAS CAJO (GET /api/cajo/stats)
// ============================================
export const getCajoStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'registered') as registered,
        COUNT(*) FILTER (WHERE status = 'in_transit') as in_transit,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(DISTINCT mawb) as total_mawbs,
        COUNT(DISTINCT cliente) as total_clientes,
        COALESCE(SUM(peso_kg), 0) as total_kg,
        COUNT(*) FILTER (WHERE tipo = 'Logo') as tipo_logo,
        COUNT(*) FILTER (WHERE tipo = 'Generico') as tipo_generico,
        COUNT(*) FILTER (WHERE tipo = 'Medical') as tipo_medical
      FROM cajo_guides
    `);

    res.json({
      success: true,
      stats: result.rows[0],
    });
  } catch (error: any) {
    console.error('📦 [CAJO] Error estadísticas:', error.message);
    res.status(500).json({ error: 'Error al obtener estadísticas CAJO' });
  }
};

// ============================================
// 3. DETALLE DE GUÍA (GET /api/cajo/guides/:id)
// ============================================
export const getCajoGuideById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM cajo_guides WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Guía no encontrada' });
      return;
    }

    res.json({ success: true, guide: result.rows[0] });
  } catch (error: any) {
    console.error('📦 [CAJO] Error detalle:', error.message);
    res.status(500).json({ error: 'Error al obtener detalle' });
  }
};

// ============================================
// 4. ACTUALIZAR GUÍA (PUT /api/cajo/guides/:id)
// ============================================
export const updateCajoGuide = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, observaciones, tipo, paqueteria, guia_entrega } = req.body;

    const result = await pool.query(`
      UPDATE cajo_guides SET
        status = COALESCE($1, status),
        observaciones = COALESCE($2, observaciones),
        tipo = COALESCE($3, tipo),
        paqueteria = COALESCE($4, paqueteria),
        guia_entrega = COALESCE($5, guia_entrega),
        updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [status, observaciones, tipo, paqueteria, guia_entrega, id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Guía no encontrada' });
      return;
    }

    res.json({ success: true, guide: result.rows[0] });
  } catch (error: any) {
    console.error('📦 [CAJO] Error actualizando:', error.message);
    res.status(500).json({ error: 'Error al actualizar guía' });
  }
};

// ============================================
// 5. ACTUALIZAR ESTADO EN LOTE (PUT /api/cajo/guides/batch-status)
// ============================================
export const batchUpdateCajoStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Se requiere un array de IDs' });
      return;
    }

    const validStatuses = ['registered', 'in_transit', 'at_customs', 'delivered', 'pending', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Estado inválido. Válidos: ${validStatuses.join(', ')}` });
      return;
    }

    const result = await pool.query(`
      UPDATE cajo_guides SET status = $1, updated_at = NOW()
      WHERE id = ANY($2::int[])
      RETURNING id
    `, [status, ids]);

    res.json({
      success: true,
      updated: result.rowCount,
      message: `${result.rowCount} guías actualizadas a "${status}"`,
    });
  } catch (error: any) {
    console.error('📦 [CAJO] Error batch update:', error.message);
    res.status(500).json({ error: 'Error al actualizar en lote' });
  }
};

// ============================================
// 6. ELIMINAR GUÍA (DELETE /api/cajo/guides/:id)
// ============================================
export const deleteCajoGuide = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM cajo_guides WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Guía no encontrada' });
      return;
    }

    res.json({ success: true, message: 'Guía eliminada' });
  } catch (error: any) {
    console.error('📦 [CAJO] Error eliminando:', error.message);
    res.status(500).json({ error: 'Error al eliminar guía' });
  }
};

// ============================================
// 7. GUÍAS POR MAWB (GET /api/cajo/by-mawb/:mawb)
// ============================================
export const getCajoByMawb = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { mawb } = req.params;
    const result = await pool.query(`
      SELECT * FROM cajo_guides 
      WHERE mawb = $1 
      ORDER BY cliente, guia_air
    `, [mawb]);

    res.json({
      success: true,
      guides: result.rows,
      total: result.rows.length,
    });
  } catch (error: any) {
    console.error('📦 [CAJO] Error por MAWB:', error.message);
    res.status(500).json({ error: 'Error al buscar por MAWB' });
  }
};

// ============================================
// 8. GET OVERFEE CONFIG (GET /api/cajo/overfee)
// ============================================
export const getCajoOverfee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT value FROM system_config WHERE key = 'cajo_overfee_per_kg'
    `);

    const overfee = result.rows.length > 0 ? parseFloat(result.rows[0].value) : 0;
    res.json({ success: true, overfee_per_kg: overfee });
  } catch (error: any) {
    console.error('📦 [CAJO] Error obteniendo overfee:', error.message);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

// ============================================
// 9. SAVE OVERFEE CONFIG (POST /api/cajo/overfee)
// ============================================
export const saveCajoOverfee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { overfee_per_kg } = req.body;
    const value = parseFloat(overfee_per_kg) || 0;

    // Upsert en system_config
    await pool.query(`
      INSERT INTO system_config (key, value, description, updated_at)
      VALUES ('cajo_overfee_per_kg', $1, 'Overfee por kg para guías CAJO (MXN)', NOW())
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    `, [value.toString()]);

    console.log(`📦 [CAJO] Overfee actualizado a $${value}/kg por usuario ${req.user?.userId}`);
    res.json({ success: true, overfee_per_kg: value, message: 'Overfee guardado correctamente' });
  } catch (error: any) {
    console.error('📦 [CAJO] Error guardando overfee:', error.message);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
};
