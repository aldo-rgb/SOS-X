// ============================================================
// ZAIA — avisos SALIENTES. Hasta aquí ZAIA solo preguntaba; ahora también se
// le avisa cuando a Aldo (la cuenta de ZAIA_ACTOR_ID) le llega algo que no
// puede esperar:
//
//   - duda_cajito        tarea "Cajito · CJD-2026-0001": Cajito no supo algo
//   - pendiente_cajito   una persona le pidió a Cajito levantarle una tarea, o
//                        le reportó un error desde el chat
//   - tarea_urgente      cualquier tarea nueva (o reasignada) en 🔥 fuego
//
// Cada aviso se guarda en zaia_avisos ANTES de mandarlo. Si ZAIA_WEBHOOK_URL
// está configurada se le hace POST firmado; si su lado está caído, el aviso no
// se pierde: se reintenta con el siguiente aviso y ZAIA puede ponerse al día
// con GET /api/zaia/avisos?desde=<id>.
//
// Firma: header X-EntregaX-Firma = "sha256=" + HMAC-SHA256(cuerpo crudo,
// ZAIA_API_KEY). Es la misma llave que ya tienen los dos lados.
// ============================================================
import crypto from 'crypto';
import { Request, Response } from 'express';
import { pool } from './db';

const API_KEY = () => (process.env.ZAIA_API_KEY || '').trim();
const WEBHOOK = () => (process.env.ZAIA_WEBHOOK_URL || '').trim();
const ACTOR_ID = () => parseInt(process.env.ZAIA_ACTOR_ID || '3', 10);

type Tipo = 'duda_cajito' | 'pendiente_cajito' | 'tarea_urgente';

let esquemaListo = false;
const ensureSchema = async (): Promise<void> => {
  if (esquemaListo) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zaia_avisos (
      id            SERIAL PRIMARY KEY,
      tipo          TEXT NOT NULL,
      task_id       INTEGER NOT NULL,
      payload       JSONB NOT NULL,
      intentos      INTEGER NOT NULL DEFAULT 0,
      entregado_at  TIMESTAMPTZ,
      ultimo_error  TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tipo, task_id)
    )`);
  esquemaListo = true;
};

const firmar = (cuerpo: string): string =>
  'sha256=' + crypto.createHmac('sha256', API_KEY()).update(cuerpo).digest('hex');

/** Manda un aviso ya guardado. Nunca lanza. */
const entregar = async (id: number, payload: any): Promise<void> => {
  const url = WEBHOOK();
  if (!url || !API_KEY()) return;   // sin destino: se queda para GET /avisos
  const cuerpo = JSON.stringify(payload);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-EntregaX-Firma': firmar(cuerpo), 'X-EntregaX-Aviso': String(id) },
      body: cuerpo,
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (r.ok) {
      await pool.query(`UPDATE zaia_avisos SET intentos = intentos + 1, entregado_at = NOW(), ultimo_error = NULL WHERE id = $1`, [id]);
    } else {
      const txt = (await r.text().catch(() => '')).slice(0, 300);
      await pool.query(`UPDATE zaia_avisos SET intentos = intentos + 1, ultimo_error = $2 WHERE id = $1`, [id, `HTTP ${r.status} ${txt}`]);
    }
  } catch (e: any) {
    await pool.query(`UPDATE zaia_avisos SET intentos = intentos + 1, ultimo_error = $2 WHERE id = $1`,
      [id, String(e?.message || e).slice(0, 300)]).catch(() => {});
  }
};

/**
 * Se llama cuando una tarea se crea o se reasigna. Decide si le toca aviso a
 * ZAIA y lo manda. Nunca lanza: una tarea no puede fallar por esto.
 */
export async function avisarZaiaTarea(taskId: number, motivo: 'creada' | 'asignada'): Promise<void> {
  try {
    const t = (await pool.query(
      `SELECT t.id, t.title, t.description, t.eisenhower, t.due_at, t.created_at, t.assignee_id, t.status,
              b.name AS tablero, c.full_name AS creado_por
         FROM tasks t
         LEFT JOIN task_boards b ON b.id = t.board_id
         LEFT JOIN users c ON c.id = t.created_by
        WHERE t.id = $1`, [taskId])).rows[0];
    if (!t || Number(t.assignee_id) !== ACTOR_ID() || t.status === 'cancelled') return;

    const titulo = String(t.title || '');
    const desc = String(t.description || '');
    const folio = titulo.match(/CJD-\d{4}-\d+/)?.[0] || null;
    let tipo: Tipo | null = null;
    if (folio && titulo.startsWith('Cajito')) tipo = 'duda_cajito';
    else if (desc.includes('(Levantada con Cajito') || titulo.startsWith('Error reportado desde Cajito')) tipo = 'pendiente_cajito';
    else if (t.eisenhower === 'fuego') tipo = 'tarea_urgente';
    if (!tipo) return;

    await ensureSchema();
    const payload = {
      evento: tipo,
      motivo,                       // creada | asignada
      tarea: {
        id: Number(t.id),
        titulo,
        descripcion: desc.slice(0, 4000),
        urgente: t.eisenhower === 'fuego',
        tablero: t.tablero || null,
        creada_por: t.creado_por || null,
        vence: t.due_at ? new Date(t.due_at).toISOString() : null,
        creada: new Date(t.created_at).toISOString(),
      },
      folio_cajito: folio,
      enviado: new Date().toISOString(),
    };
    const ins = await pool.query(
      `INSERT INTO zaia_avisos (tipo, task_id, payload) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (tipo, task_id) DO NOTHING RETURNING id`,
      [tipo, taskId, JSON.stringify(payload)]);
    const id = ins.rows[0]?.id;
    if (!id) return;   // ya se había avisado esta misma tarea
    console.log(`[zaia] aviso ${id} ${tipo} tarea ${taskId}`);
    await entregar(Number(id), { aviso_id: Number(id), ...payload });

    // De paso, reintentar los que no entraron (su servidor pudo estar caído).
    const pend = await pool.query(
      `SELECT id, payload FROM zaia_avisos
        WHERE entregado_at IS NULL AND id <> $1 AND intentos < 10 AND created_at > NOW() - INTERVAL '3 days'
        ORDER BY id LIMIT 20`, [id]);
    for (const p of pend.rows) await entregar(Number(p.id), { aviso_id: Number(p.id), ...p.payload });
  } catch (e: any) {
    console.warn('[zaia] aviso de tarea', taskId, e?.message);
  }
}

/** GET /api/zaia/avisos?desde=<id> — para ponerse al día (máx. 100, del más viejo). */
export const zaiaAvisos = async (req: Request, res: Response): Promise<any> => {
  const server = API_KEY();
  if (!server) return res.status(503).json({ error: 'El servidor no tiene ZAIA_API_KEY configurada.' });
  const k = (req.header('X-Zaia-Key') || String(req.header('Authorization') || '').replace(/^Bearer\s+/i, '') || '').trim();
  if (!k) return res.status(401).json({ error: 'Falta el header X-Zaia-Key.' });
  if (k !== server) return res.status(401).json({ error: 'La API key no coincide con la configurada.' });
  try {
    await ensureSchema();
    const desde = Math.max(0, parseInt(String(req.query.desde || '0'), 10) || 0);
    const r = await pool.query(
      `SELECT id, payload, entregado_at FROM zaia_avisos WHERE id > $1 ORDER BY id LIMIT 100`, [desde]);
    res.json({
      avisos: r.rows.map((x: any) => ({
        aviso_id: Number(x.id), ...x.payload,
        entregado_por_webhook: x.entregado_at ? new Date(x.entregado_at).toISOString() : null,
      })),
      siguiente_desde: r.rows.length ? Number(r.rows[r.rows.length - 1].id) : desde,
    });
  } catch (e: any) {
    console.error('[zaia] avisos:', e);
    res.status(500).json({ error: 'No se pudieron leer los avisos.' });
  }
};
