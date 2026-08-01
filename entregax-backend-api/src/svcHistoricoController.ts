// ============================================================================
// 📚 HISTÓRICO POR SERVICIO — almacenamiento aislado (1 reporte por servicio)
// ============================================================================
// Panel de SOLO CONSULTA. Guarda el reporte de Excel ya parseado (registros
// asesor/año/mes/monto) en su PROPIA tabla, sin tocar ni depender de las tablas
// operativas (packages, maritime_orders, dhl_shipments). Un reporte por servicio;
// subir de nuevo reemplaza el anterior.
// ============================================================================

import { Request, Response } from 'express';
import { pool } from './db';

const SERVICES = ['tdi_aereo', 'tdi_express', 'maritimo', 'pobox_usa', 'dhl'];

let _ready = false;
async function ensureSchema(): Promise<void> {
  if (_ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS svc_historico_reports (
      service TEXT PRIMARY KEY,
      file_name TEXT,
      records JSONB NOT NULL DEFAULT '[]'::jsonb,
      uploaded_by INTEGER,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  _ready = true;
}

// GET /api/svc-historico/:service → reporte guardado (registros parseados)
export const getHistorico = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const service = String(req.params.service || '');
    if (!SERVICES.includes(service)) return res.status(400).json({ error: 'Servicio no válido' });
    const r = await pool.query(
      `SELECT file_name, records, uploaded_at FROM svc_historico_reports WHERE service = $1`,
      [service]
    );
    if (r.rows.length === 0) return res.json({ exists: false, records: [] });
    const row = r.rows[0];
    return res.json({
      exists: true,
      file_name: row.file_name,
      uploaded_at: row.uploaded_at,
      records: Array.isArray(row.records) ? row.records : [],
    });
  } catch (err: any) {
    console.error('[svc-historico:get]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// POST /api/svc-historico/:service  { file_name, records: [{asesor,anio,mes,monto}] }
export const saveHistorico = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const service = String(req.params.service || '');
    if (!SERVICES.includes(service)) return res.status(400).json({ error: 'Servicio no válido' });
    const { file_name, records } = req.body || {};
    if (!Array.isArray(records)) return res.status(400).json({ error: 'records debe ser un arreglo' });
    if (records.length > 100000) return res.status(400).json({ error: 'Demasiados registros' });
    const uid = (req as any).user?.userId || (req as any).user?.id || null;
    await pool.query(
      `INSERT INTO svc_historico_reports (service, file_name, records, uploaded_by, uploaded_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       ON CONFLICT (service) DO UPDATE SET
         file_name = EXCLUDED.file_name,
         records = EXCLUDED.records,
         uploaded_by = EXCLUDED.uploaded_by,
         uploaded_at = NOW()`,
      [service, String(file_name || '').slice(0, 255), JSON.stringify(records), uid]
    );
    return res.json({ success: true, count: records.length });
  } catch (err: any) {
    console.error('[svc-historico:save]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// DELETE /api/svc-historico/:service → borrar el histórico guardado
export const deleteHistorico = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchema();
    const service = String(req.params.service || '');
    if (!SERVICES.includes(service)) return res.status(400).json({ error: 'Servicio no válido' });
    await pool.query(`DELETE FROM svc_historico_reports WHERE service = $1`, [service]);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[svc-historico:delete]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
