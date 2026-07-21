// ============================================
// COBERTURA DE ZONA METROPOLITANA — EntregaX Local
// Modelo unificado y extensible por zona (MTY, CDMX, y futuras).
//
// Una zona define REGLAS de pertenencia (rangos numéricos de CP y/o prefijos)
// y una lista de CP EXCLUIDOS. Un CP pertenece a la zona si:
//   - la zona está activa, Y
//   - el CP cae en algún rango o prefijo de la zona, Y
//   - el CP NO está en la lista de exclusiones de esa zona.
//
// Se usa para EntregaX Local: en zona metro solo se ofrece la entrega local
// (se ocultan Paquete Express y las paqueterías "por cobrar") en guías TDX.
// ============================================
import { Request, Response } from 'express';
import { pool } from './db';

let _ensured = false;
export async function ensureCoverageSchema(): Promise<void> {
  if (_ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metro_zones (
      zone_key   TEXT PRIMARY KEY,
      label      TEXT NOT NULL,
      active     BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metro_zone_rules (
      id         SERIAL PRIMARY KEY,
      zone_key   TEXT NOT NULL REFERENCES metro_zones(zone_key) ON DELETE CASCADE,
      rule_type  TEXT NOT NULL CHECK (rule_type IN ('range','prefix')),
      range_min  INTEGER,
      range_max  INTEGER,
      prefix     TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metro_zone_excluded_zips (
      zone_key   TEXT NOT NULL REFERENCES metro_zones(zone_key) ON DELETE CASCADE,
      zip        TEXT NOT NULL,
      note       TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (zone_key, zip)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_metro_zone_rules_zone ON metro_zone_rules(zone_key)`).catch(() => {});

  // Semilla de zonas por defecto (solo si no existen).
  const seeded = await pool.query('SELECT COUNT(*)::int AS n FROM metro_zones');
  if ((seeded.rows[0]?.n || 0) === 0) {
    await pool.query(
      `INSERT INTO metro_zones (zone_key, label, active, sort_order) VALUES
         ('mty', 'Monterrey (AMM)', true, 1),
         ('cdmx', 'CDMX + Valle de México', true, 2)
       ON CONFLICT (zone_key) DO NOTHING`
    );
    // MTY: rango base 64000–67999.
    await pool.query(
      `INSERT INTO metro_zone_rules (zone_key, rule_type, range_min, range_max)
       VALUES ('mty', 'range', 64000, 67999)`
    );
    // CDMX: prefijos 01–16 (CDMX) + 50–57 (Edomex conurbado).
    const cdmxPrefixes = ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','50','51','52','53','54','55','56','57'];
    for (const p of cdmxPrefixes) {
      await pool.query(`INSERT INTO metro_zone_rules (zone_key, rule_type, prefix) VALUES ('cdmx', 'prefix', $1)`, [p]);
    }
  }

  // Migración: traer exclusiones históricas de MTY (tabla antigua) a la nueva.
  await pool.query(`
    INSERT INTO metro_zone_excluded_zips (zone_key, zip, note, created_by, created_at)
    SELECT 'mty', zip, note, created_by, created_at
      FROM mty_metro_excluded_zips
    ON CONFLICT (zone_key, zip) DO NOTHING
  `).catch(() => { /* la tabla antigua puede no existir */ });

  _ensured = true;
}

// Núcleo: devuelve el zone_key al que pertenece el CP, o null.
export async function getMetroZoneForZip(zip: string | null | undefined): Promise<string | null> {
  const raw = String(zip || '').trim();
  if (!/^\d{4,5}$/.test(raw)) return null;
  const padded = raw.padStart(5, '0');
  const n = parseInt(padded, 10);
  try {
    await ensureCoverageSchema();
    const r = await pool.query(
      `SELECT z.zone_key
         FROM metro_zones z
         JOIN metro_zone_rules r ON r.zone_key = z.zone_key
        WHERE z.active = true
          AND (
            (r.rule_type = 'range'  AND $1 BETWEEN r.range_min AND r.range_max)
            OR (r.rule_type = 'prefix' AND $2 LIKE r.prefix || '%')
          )
          AND NOT EXISTS (
            SELECT 1 FROM metro_zone_excluded_zips e
             WHERE e.zone_key = z.zone_key AND e.zip = $2
          )
        ORDER BY z.sort_order ASC
        LIMIT 1`,
      [n, padded]
    );
    return r.rows[0]?.zone_key || null;
  } catch {
    return null;
  }
}

// ¿El CP pertenece a ALGUNA zona metropolitana activa?
export async function isMetroZip(zip: string | null | undefined): Promise<boolean> {
  return (await getMetroZoneForZip(zip)) !== null;
}
export async function isCdmxMetroZip(zip: string | null | undefined): Promise<boolean> {
  return (await getMetroZoneForZip(zip)) === 'cdmx';
}

// ---------- ADMIN CRUD ----------

// GET /api/admin/coverage/zones → zonas con reglas y exclusiones.
export async function listZones(_req: Request, res: Response): Promise<any> {
  try {
    await ensureCoverageSchema();
    const zones = await pool.query('SELECT zone_key, label, active, sort_order FROM metro_zones ORDER BY sort_order ASC, zone_key ASC');
    const rules = await pool.query('SELECT id, zone_key, rule_type, range_min, range_max, prefix FROM metro_zone_rules ORDER BY zone_key, rule_type, range_min, prefix');
    const excluded = await pool.query(
      `SELECT e.zone_key, e.zip, e.note, e.created_at, u.full_name AS created_by_name
         FROM metro_zone_excluded_zips e
         LEFT JOIN users u ON u.id = e.created_by
        ORDER BY e.zone_key, e.zip`
    );
    const data = zones.rows.map((z: any) => ({
      ...z,
      rules: rules.rows.filter((r: any) => r.zone_key === z.zone_key),
      excluded: excluded.rows.filter((e: any) => e.zone_key === z.zone_key),
    }));
    res.json({ success: true, zones: data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// POST /api/admin/coverage/zones  { zone_key, label, active? } → crea o actualiza
export async function upsertZone(req: Request, res: Response): Promise<any> {
  try {
    await ensureCoverageSchema();
    const zone_key = String(req.body?.zone_key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const label = String(req.body?.label || '').trim();
    const active = req.body?.active === undefined ? true : !!req.body.active;
    if (!zone_key || !label) return res.status(400).json({ success: false, error: 'zone_key y label son obligatorios' });
    const ord = await pool.query('SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM metro_zones');
    await pool.query(
      `INSERT INTO metro_zones (zone_key, label, active, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (zone_key) DO UPDATE SET label = EXCLUDED.label, active = EXCLUDED.active`,
      [zone_key, label, active, ord.rows[0].next]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// DELETE /api/admin/coverage/zones/:key
export async function deleteZone(req: Request, res: Response): Promise<any> {
  try {
    await ensureCoverageSchema();
    await pool.query('DELETE FROM metro_zones WHERE zone_key = $1', [String(req.params.key || '').trim()]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// POST /api/admin/coverage/zones/:key/rules  { rule_type, range_min?, range_max?, prefix? }
export async function addRule(req: Request, res: Response): Promise<any> {
  try {
    await ensureCoverageSchema();
    const zone_key = String(req.params.key || '').trim();
    const rule_type = String(req.body?.rule_type || '').trim();
    const exists = await pool.query('SELECT 1 FROM metro_zones WHERE zone_key = $1', [zone_key]);
    if (!exists.rows.length) return res.status(404).json({ success: false, error: 'Zona no existe' });
    if (rule_type === 'range') {
      const min = parseInt(String(req.body?.range_min), 10);
      const max = parseInt(String(req.body?.range_max), 10);
      if (isNaN(min) || isNaN(max) || min < 0 || max < min || max > 99999) {
        return res.status(400).json({ success: false, error: 'Rango inválido (min ≤ max, 0–99999)' });
      }
      await pool.query('INSERT INTO metro_zone_rules (zone_key, rule_type, range_min, range_max) VALUES ($1, $2, $3, $4)', [zone_key, 'range', min, max]);
    } else if (rule_type === 'prefix') {
      const prefix = String(req.body?.prefix || '').trim();
      if (!/^\d{1,4}$/.test(prefix)) return res.status(400).json({ success: false, error: 'Prefijo inválido (1–4 dígitos)' });
      await pool.query('INSERT INTO metro_zone_rules (zone_key, rule_type, prefix) VALUES ($1, $2, $3)', [zone_key, 'prefix', prefix]);
    } else {
      return res.status(400).json({ success: false, error: 'rule_type debe ser range o prefix' });
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// DELETE /api/admin/coverage/rules/:id
export async function deleteRule(req: Request, res: Response): Promise<any> {
  try {
    await ensureCoverageSchema();
    await pool.query('DELETE FROM metro_zone_rules WHERE id = $1', [parseInt(String(req.params.id), 10)]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// POST /api/admin/coverage/zones/:key/excluded  { zip, note? }
export async function addExcluded(req: Request, res: Response): Promise<any> {
  try {
    await ensureCoverageSchema();
    const zone_key = String(req.params.key || '').trim();
    const zip = String(req.body?.zip || '').trim();
    const note = req.body?.note ? String(req.body.note).trim() : null;
    const userId = (req as any).user?.userId || (req as any).user?.id || null;
    if (!/^\d{5}$/.test(zip)) return res.status(400).json({ success: false, error: 'CP inválido (5 dígitos)' });
    const exists = await pool.query('SELECT 1 FROM metro_zones WHERE zone_key = $1', [zone_key]);
    if (!exists.rows.length) return res.status(404).json({ success: false, error: 'Zona no existe' });
    await pool.query(
      `INSERT INTO metro_zone_excluded_zips (zone_key, zip, note, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (zone_key, zip) DO UPDATE SET note = EXCLUDED.note`,
      [zone_key, zip, note, userId]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// DELETE /api/admin/coverage/zones/:key/excluded/:zip
export async function removeExcluded(req: Request, res: Response): Promise<any> {
  try {
    await ensureCoverageSchema();
    await pool.query('DELETE FROM metro_zone_excluded_zips WHERE zone_key = $1 AND zip = $2', [String(req.params.key || '').trim(), String(req.params.zip || '').trim()]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// GET /api/admin/coverage/check?zip=  → prueba a qué zona pertenece un CP.
export async function checkZip(req: Request, res: Response): Promise<any> {
  try {
    const zip = String(req.query.zip || '').trim();
    const zone = await getMetroZoneForZip(zip);
    let label: string | null = null;
    if (zone) {
      const z = await pool.query('SELECT label FROM metro_zones WHERE zone_key = $1', [zone]);
      label = z.rows[0]?.label || null;
    }
    res.json({ success: true, zip, zone, label, isMetro: zone !== null });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}
