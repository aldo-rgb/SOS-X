// ============================================
// ZONA METROPOLITANA DE MONTERREY
// Regla: un CP pertenece a la zona metro si está en el rango 64000–67999
// (Monterrey + municipios conurbados) Y NO está en la lista de exclusiones
// que administra el super_admin desde Nacional México → Administración.
//
// Se usa para el filtro de paqueterías de guías TDX: en zona metro solo aplica
// entrega local EntregaX (se ocultan Paquete Express y todas las "por cobrar").
// ============================================
import { Request, Response } from 'express';
import { pool } from './db';

const MTY_METRO_MIN = 64000;
const MTY_METRO_MAX = 67999;

let _tableEnsured = false;
async function ensureTable(): Promise<void> {
  if (_tableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mty_metro_excluded_zips (
      zip TEXT PRIMARY KEY,
      note TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  _tableEnsured = true;
}

// Determina si un CP está en la zona metropolitana de MTY (rango base menos exclusiones).
export async function isMtyMetroZip(zip: string | null | undefined): Promise<boolean> {
  const n = parseInt(String(zip || '').trim(), 10);
  if (isNaN(n) || n < MTY_METRO_MIN || n > MTY_METRO_MAX) return false;
  try {
    await ensureTable();
    const z = String(zip).trim();
    const r = await pool.query('SELECT 1 FROM mty_metro_excluded_zips WHERE zip = $1 LIMIT 1', [z]);
    return r.rows.length === 0; // en rango y NO excluido → sí es metro
  } catch {
    // Si la tabla falla, aplicar solo el rango base (fail-open al rango).
    return true;
  }
}

// GET /api/admin/mty-metro/excluded-zips  → lista de CP excluidos
export async function listExcludedZips(_req: Request, res: Response): Promise<any> {
  try {
    await ensureTable();
    const r = await pool.query(
      `SELECT z.zip, z.note, z.created_at, u.full_name AS created_by_name
       FROM mty_metro_excluded_zips z
       LEFT JOIN users u ON u.id = z.created_by
       ORDER BY z.zip ASC`
    );
    res.json({ success: true, range: { min: MTY_METRO_MIN, max: MTY_METRO_MAX }, excluded: r.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// POST /api/admin/mty-metro/excluded-zips  { zip, note }
export async function addExcludedZip(req: Request, res: Response): Promise<any> {
  try {
    await ensureTable();
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
      `INSERT INTO mty_metro_excluded_zips (zip, note, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (zip) DO UPDATE SET note = EXCLUDED.note`,
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
    await ensureTable();
    const zip = String(req.params.zip || '').trim();
    await pool.query('DELETE FROM mty_metro_excluded_zips WHERE zip = $1', [zip]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}
