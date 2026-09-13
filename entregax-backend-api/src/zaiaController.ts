// ============================================================
// ZAIA — canal de CONSULTA para la app de inteligencia de dirección.
//
// Etapa 1: solo lectura. ZAIA pregunta y Cajito contesta; ZAIA no le da
// órdenes. Ninguna ruta de aquí modifica nada, y el núcleo de Cajito que se
// usa (preguntarCore) se ejecuta siempre sin herramientas de escritura, así
// que aunque el modelo quisiera mover algo, no tiene con qué.
//
// Autenticación: X-Zaia-Key (o Authorization: Bearer <key>) contra ZAIA_API_KEY.
// Es llave propia, separada de la de Grupo Rino, para poder revocarla sola.
//
// Identidad: ZAIA consulta con la cuenta de dirección (ZAIA_ACTOR_ID, por
// defecto Aldo), así que ve lo mismo que vería él en Cajito. Cada consulta
// queda registrada en zaia_consultas con lo que preguntó y lo que se respondió.
// ============================================================
import { Request, Response } from 'express';
import { pool } from './db';
import { preguntarCore } from './cajitoController';

const API_KEY = () => process.env.ZAIA_API_KEY || '';
const ACTOR_ID = () => parseInt(process.env.ZAIA_ACTOR_ID || '3', 10);

const ipDe = (req: Request): string =>
  (String(req.header('x-forwarded-for') || (req.socket as any)?.remoteAddress || '').split(',')[0] || '').trim();

/** Llave en header propio o como Bearer, igual que el canal de Grupo Rino. */
const llaveDe = (req: Request): string =>
  req.header('X-Zaia-Key')
  || String(req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  || '';

const autorizado = (req: Request, res: Response): boolean => {
  const server = API_KEY();
  if (!server) { res.status(503).json({ error: 'El servidor no tiene ZAIA_API_KEY configurada.' }); return false; }
  const k = llaveDe(req);
  if (!k) { res.status(401).json({ error: 'Falta el header X-Zaia-Key.' }); return false; }
  if (k !== server) { res.status(401).json({ error: 'La API key no coincide con la configurada.' }); return false; }
  return true;
};

const ensureSchema = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zaia_consultas (
      id            SERIAL PRIMARY KEY,
      endpoint      TEXT NOT NULL,
      pregunta      TEXT,
      respuesta     TEXT,
      herramientas  TEXT[],
      remote_ip     TEXT,
      ok            BOOLEAN NOT NULL DEFAULT TRUE,
      error         TEXT,
      ms            INTEGER,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
};

const registrar = async (d: {
  endpoint: string;
  pregunta?: string | null | undefined;
  respuesta?: string | null | undefined;
  herramientas?: string[] | undefined;
  ip?: string | undefined;
  ok?: boolean | undefined;
  error?: string | null | undefined;
  ms?: number | undefined;
}): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO zaia_consultas (endpoint, pregunta, respuesta, herramientas, remote_ip, ok, error, ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [d.endpoint, d.pregunta || null, (d.respuesta || '').slice(0, 8000) || null,
       d.herramientas || null, d.ip || null, d.ok !== false, d.error || null, d.ms || null]
    );
  } catch (e: any) { console.warn('[zaia] bitácora:', e?.message); }
};

/** Quién es la cuenta con la que ZAIA consulta. */
const actor = async (): Promise<{ id: number; role: string; nombre: string } | null> => {
  const r = await pool.query(
    `SELECT id, role, full_name FROM users WHERE id = $1 AND deleted_at IS NULL`, [ACTOR_ID()]);
  const u = r.rows[0];
  return u ? { id: Number(u.id), role: String(u.role), nombre: String(u.full_name || '') } : null;
};

// GET /api/zaia/health — para que ZAIA verifique llave y estado sin consultar nada.
export const zaiaHealth = async (req: Request, res: Response): Promise<any> => {
  if (!autorizado(req, res)) return;
  const a = await actor();
  res.json({
    ok: true,
    etapa: 'consulta',
    escritura_habilitada: false,
    actor: a ? { id: a.id, nombre: a.nombre, role: a.role } : null,
    generado_en: new Date().toISOString(),
  });
};

// GET /api/zaia/tareas — reporte de tareas de toda la empresa.
// Filtros opcionales: assignee_id, status, board, incluir_lista=1, limit.
export const zaiaTareas = async (req: Request, res: Response): Promise<any> => {
  if (!autorizado(req, res)) return;
  const t0 = Date.now();
  try {
    await ensureSchema();
    const cond: string[] = ['TRUE'];
    const args: any[] = [];
    const assignee = parseInt(String(req.query.assignee_id || ''), 10);
    if (Number.isFinite(assignee) && assignee > 0) { args.push(assignee); cond.push(`t.assignee_id = $${args.length}`); }
    const status = String(req.query.status || '').trim();
    if (status) { args.push(status); cond.push(`t.status = $${args.length}`); }
    const board = String(req.query.board || '').trim();
    if (board) { args.push(board); cond.push(`(b.board_key = $${args.length} OR b.name ILIKE '%' || $${args.length} || '%')`); }
    const where = cond.join(' AND ');

    const porEstado = await pool.query(
      `SELECT t.status, COUNT(*)::int AS n
         FROM tasks t LEFT JOIN task_boards b ON b.id = t.board_id
        WHERE ${where} GROUP BY t.status ORDER BY n DESC`, args);

    const totales = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE t.status <> 'completed')::int AS abiertas,
              COUNT(*) FILTER (WHERE t.status <> 'completed' AND t.due_at IS NOT NULL AND t.due_at < NOW())::int AS vencidas,
              COUNT(*) FILTER (WHERE t.status <> 'completed' AND t.eisenhower = 'fuego')::int AS urgentes,
              COUNT(*) FILTER (WHERE t.completed_at >= NOW() - INTERVAL '7 days')::int AS cerradas_7d
         FROM tasks t LEFT JOIN task_boards b ON b.id = t.board_id
        WHERE ${where}`, args);

    const porPersona = await pool.query(
      `SELECT u.id, u.full_name AS nombre, u.role,
              COUNT(*) FILTER (WHERE t.status <> 'completed')::int AS abiertas,
              COUNT(*) FILTER (WHERE t.status <> 'completed' AND t.due_at IS NOT NULL AND t.due_at < NOW())::int AS vencidas
         FROM tasks t LEFT JOIN task_boards b ON b.id = t.board_id
         JOIN users u ON u.id = t.assignee_id
        WHERE ${where}
        GROUP BY u.id, u.full_name, u.role
       HAVING COUNT(*) FILTER (WHERE t.status <> 'completed') > 0
        ORDER BY abiertas DESC`, args);

    const porTablero = await pool.query(
      `SELECT COALESCE(b.name, 'Sin tablero') AS tablero,
              COUNT(*) FILTER (WHERE t.status <> 'completed')::int AS abiertas
         FROM tasks t LEFT JOIN task_boards b ON b.id = t.board_id
        WHERE ${where} GROUP BY 1 ORDER BY abiertas DESC`, args);

    let lista: any[] = [];
    if (String(req.query.incluir_lista || '') === '1') {
      const lim = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
      args.push(lim);
      const r = await pool.query(
        `SELECT t.id, t.title AS titulo, t.status, t.eisenhower, t.due_at, t.created_at, t.completed_at,
                COALESCE(b.name, 'Sin tablero') AS tablero,
                u.full_name AS responsable,
                (t.status <> 'completed' AND t.due_at IS NOT NULL AND t.due_at < NOW()) AS vencida
           FROM tasks t LEFT JOIN task_boards b ON b.id = t.board_id
           LEFT JOIN users u ON u.id = t.assignee_id
          WHERE ${where}
          ORDER BY (t.status <> 'completed') DESC, t.due_at NULLS LAST, t.id DESC
          LIMIT $${args.length}`, args);
      lista = r.rows;
    }

    const out = {
      generado_en: new Date().toISOString(),
      filtros: { assignee_id: assignee || null, status: status || null, board: board || null },
      totales: totales.rows[0],
      por_estado: porEstado.rows,
      por_persona: porPersona.rows,
      por_tablero: porTablero.rows,
      ...(lista.length ? { tareas: lista } : {}),
    };
    await registrar({
      endpoint: 'GET /api/zaia/tareas', ip: ipDe(req), ms: Date.now() - t0,
      pregunta: JSON.stringify(out.filtros),
      respuesta: `total=${out.totales?.total} abiertas=${out.totales?.abiertas} vencidas=${out.totales?.vencidas}`,
    });
    res.json(out);
  } catch (e: any) {
    console.error('[zaia] tareas:', e?.message);
    await registrar({ endpoint: 'GET /api/zaia/tareas', ip: ipDe(req), ok: false, error: e?.message, ms: Date.now() - t0 });
    res.status(500).json({ error: 'No se pudo generar el reporte de tareas' });
  }
};

// POST /api/zaia/preguntar — { pregunta } → ZAIA le pregunta a Cajito.
export const zaiaPreguntar = async (req: Request, res: Response): Promise<any> => {
  if (!autorizado(req, res)) return;
  const t0 = Date.now();
  const pregunta = String(req.body?.pregunta || req.body?.message || '').trim();
  try {
    await ensureSchema();
    if (!pregunta) return res.status(400).json({ error: 'Falta "pregunta" en el cuerpo.' });
    const a = await actor();
    if (!a) return res.status(500).json({ error: 'La cuenta configurada en ZAIA_ACTOR_ID no existe.' });

    const r = await preguntarCore({ userId: a.id, role: a.role, pregunta, origen: 'ZAIA (app de dirección), por API' });
    if (!r.ok) {
      await registrar({ endpoint: 'POST /api/zaia/preguntar', pregunta, ip: ipDe(req), ok: false, error: r.error, ms: Date.now() - t0 });
      return res.status(r.status || 500).json({ error: r.error });
    }
    await registrar({
      endpoint: 'POST /api/zaia/preguntar', pregunta, respuesta: r.texto,
      herramientas: r.herramientas, ip: ipDe(req), ms: Date.now() - t0,
    });
    res.json({ respuesta: r.texto, herramientas: r.herramientas, generado_en: new Date().toISOString() });
  } catch (e: any) {
    console.error('[zaia] preguntar:', e?.message);
    await registrar({ endpoint: 'POST /api/zaia/preguntar', pregunta, ip: ipDe(req), ok: false, error: e?.message, ms: Date.now() - t0 });
    res.status(500).json({ error: 'No se pudo consultar a Cajito' });
  }
};

// POST /api/zaia/revisar-tarea — { task_id } → Cajito revisa la tarea y da su veredicto.
export const zaiaRevisarTarea = async (req: Request, res: Response): Promise<any> => {
  if (!autorizado(req, res)) return;
  const t0 = Date.now();
  const taskId = parseInt(String(req.body?.task_id ?? req.body?.tarea ?? ''), 10);
  try {
    await ensureSchema();
    if (!Number.isFinite(taskId) || taskId <= 0) return res.status(400).json({ error: 'Falta "task_id" (número).' });
    const existe = await pool.query(`SELECT id, title FROM tasks WHERE id = $1`, [taskId]);
    if (!existe.rows.length) return res.status(404).json({ error: `La tarea ${taskId} no existe.` });
    const a = await actor();
    if (!a) return res.status(500).json({ error: 'La cuenta configurada en ZAIA_ACTOR_ID no existe.' });

    const extra = String(req.body?.nota || '').trim();
    const pregunta =
      `Revisa la tarea ${taskId} y dame tu veredicto: de qué se trata, en qué estado está, ` +
      `si ya se puede cerrar o qué le falta, y quién tiene la pelota. ` +
      `Si encuentras algo que no cuadra, dilo.` +
      (extra ? `\n\nContexto de quien pregunta: ${extra}` : '');

    const r = await preguntarCore({ userId: a.id, role: a.role, pregunta, origen: 'ZAIA (app de dirección), por API' });
    if (!r.ok) {
      await registrar({ endpoint: 'POST /api/zaia/revisar-tarea', pregunta, ip: ipDe(req), ok: false, error: r.error, ms: Date.now() - t0 });
      return res.status(r.status || 500).json({ error: r.error });
    }
    await registrar({
      endpoint: 'POST /api/zaia/revisar-tarea', pregunta, respuesta: r.texto,
      herramientas: r.herramientas, ip: ipDe(req), ms: Date.now() - t0,
    });
    res.json({
      task_id: taskId,
      titulo: existe.rows[0].title,
      veredicto: r.texto,
      herramientas: r.herramientas,
      generado_en: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[zaia] revisar-tarea:', e?.message);
    await registrar({ endpoint: 'POST /api/zaia/revisar-tarea', ip: ipDe(req), ok: false, error: e?.message, ms: Date.now() - t0 });
    res.status(500).json({ error: 'No se pudo revisar la tarea' });
  }
};
