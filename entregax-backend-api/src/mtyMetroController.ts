// ============================================
// ZONA METROPOLITANA DE MONTERREY (compatibilidad)
// Este módulo ahora DELEGA en el modelo unificado de cobertura
// (coverageController: zonas metro configurables MTY/CDMX/…).
// Se conserva por compatibilidad con imports y rutas existentes.
//   - isMtyMetroZip → zona 'mty' del modelo unificado.
//   - Los endpoints /api/admin/mty-metro/excluded-zips operan sobre la
//     zona 'mty' del modelo unificado (misma data que el panel Cobertura).
// ============================================
import { Request, Response } from 'express';
import { pool } from './db';
import { getMetroZoneForZip, ensureCoverageSchema } from './coverageController';

const MTY_METRO_MIN = 64000;
const MTY_METRO_MAX = 67999;

// ¿El CP pertenece a la zona metropolitana de MTY? (modelo unificado)
export async function isMtyMetroZip(zip: string | null | undefined): Promise<boolean> {
  return (await getMetroZoneForZip(zip)) === 'mty';
}

// GET /api/admin/mty-metro/excluded-zips  → lista de CP excluidos de la zona 'mty'
export async function listExcludedZips(_req: Request, res: Response): Promise<any> {
  try {
    await ensureCoverageSchema();
    const r = await pool.query(
      `SELECT e.zip, e.note, e.created_at, u.full_name AS created_by_name
         FROM metro_zone_excluded_zips e
         LEFT JOIN users u ON u.id = e.created_by
        WHERE e.zone_key = 'mty'
        ORDER BY e.zip ASC`
    );
    res.json({ success: true, range: { min: MTY_METRO_MIN, max: MTY_METRO_MAX }, excluded: r.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// POST /api/admin/mty-metro/excluded-zips  { zip, note }
export async function addExcludedZip(req: Request, res: Response): Promise<any> {
  try {
    await ensureCoverageSchema();
    const zip = String(req.body?.zip || '').trim();
    const note = req.body?.note ? String(req.body.note).trim() : null;
    const userId = (req as any).user?.userId || (req as any).user?.id || null;
    if (!/^\d{5}$/.test(zip)) {
      return res.status(400).json({ success: false, error: 'CP inválido (5 dígitos)' });
    }
    const n = parseInt(zip, 10);
    if (n < MTY_METRO_MIN || n > MTY_METRO_MAX) {
      return res.status(400).json({ success: false, error: `El CP debe estar en el rango metro ${MTY_METRO_MIN}–${MTY_METRO_MAX}` });
    }
    await pool.query(
      `INSERT INTO metro_zone_excluded_zips (zone_key, zip, note, created_by)
       VALUES ('mty', $1, $2, $3)
       ON CONFLICT (zone_key, zip) DO UPDATE SET note = EXCLUDED.note`,
      [zip, note, userId]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// DELETE /api/admin/mty-metro/excluded-zips/:zip
export async function removeExcludedZip(req: Request, res: Response): Promise<any> {
  try {
    await ensureCoverageSchema();
    const zip = String(req.params.zip || '').trim();
    await pool.query(`DELETE FROM metro_zone_excluded_zips WHERE zone_key = 'mty' AND zip = $1`, [zip]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}
