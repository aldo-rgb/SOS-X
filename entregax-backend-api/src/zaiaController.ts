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
//
// Fechas: TODAS entran y salen en UTC, ISO-8601 con Z. Quien las muestre
// convierte a America/Monterrey. El servidor corre en UTC, así que "vencida"
// se decide comparando contra el reloj en UTC.
// ============================================================
import { Request, Response } from 'express';
import { pool } from './db';
import { preguntarCore } from './cajitoController';

const API_KEY = () => process.env.ZAIA_API_KEY || '';
const ACTOR_ID = () => parseInt(process.env.ZAIA_ACTOR_ID || '3', 10);

/** Estados que existen de verdad en el tablero. Un filtro fuera de esta lista
 *  se rechaza con 400: devolver una lista vacía haría creer que no hay tareas. */
const ESTADOS = ['open', 'completed', 'awaiting_confirmation', 'cancelled'] as const;

/** Tope de espera para las rutas que pasan por Cajito. Encadena consultas y
 *  puede tardar; pasado esto se corta y se avisa, en vez de dejar la conexión
 *  colgada hasta que el cliente se rinda. */
const TOPE_CAJITO_MS = 90_000;

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

// ---- Tope de llamadas ---------------------------------------------------
// Aquí una IA llama a otra IA: si la de allá entra en un bucle, nadie lo frena
// y cada vuelta cuesta dinero de este lado. Ventana simple en memoria; el
// proceso es uno solo, así que alcanza.
const ventanas = new Map<string, { n: number; hasta: number }>();
const dentroDelTope = (clave: string, max: number, ms: number): { ok: boolean; esperar: number } => {
  const ahora = Date.now();
  if (ventanas.size > 500) {
    for (const [k, v] of ventanas) if (v.hasta < ahora) ventanas.delete(k);
  }
  const v = ventanas.get(clave);
  if (!v || v.hasta < ahora) { ventanas.set(clave, { n: 1, hasta: ahora + ms }); return { ok: true, esperar: 0 }; }
  if (v.n >= max) return { ok: false, esperar: Math.ceil((v.hasta - ahora) / 1000) };
  v.n += 1;
  return { ok: true, esperar: 0 };
};

const topeOk = (req: Request, res: Response, grupo: 'consulta' | 'cajito'): boolean => {
  const max = grupo === 'cajito' ? 20 : 120;   // por minuto
  const r = dentroDelTope(`${grupo}`, max, 60_000);
  if (!r.ok) {
    res.setHeader('Retry-After', String(r.esperar));
    res.status(429).json({
      error: `Demasiadas llamadas: el tope es ${max} por minuto para esta vía.`,
      reintentar_en_segundos: r.esperar,
    });
    return false;
  }
  return true;
};

/** Corta una espera demasiado larga sin dejar la petición colgada. */
const conTope = async <T>(p: Promise<T>, ms: number): Promise<{ ok: true; valor: T } | { ok: false }> => {
  let t: NodeJS.Timeout;
  const reloj = new Promise<{ ok: false }>((resolve) => { t = setTimeout(() => resolve({ ok: false }), ms); });
  const r = await Promise.race([p.then((valor) => ({ ok: true as const, valor })), reloj]);
  clearTimeout(t!);
  return r as any;
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

// GET /api/zaia/health — verifica llave y estado sin consultar nada del negocio.
export const zaiaHealth = async (req: Request, res: Response): Promise<any> => {
  if (!autorizado(req, res)) return;
  const a = await actor();
  res.json({
    ok: true,
    etapa: 'consulta',
    escritura_habilitada: false,
    zona_horaria_respuestas: 'UTC',
    estados_validos: ESTADOS,
    topes_por_minuto: { consulta: 120, cajito: 20 },
    actor: a ? { id: a.id, nombre: a.nombre, role: a.role } : null,
    generado_en: new Date().toISOString(),
  });
};

// GET /api/zaia/personas — quién es quién, para poder usar assignee_id.
export const zaiaPersonas = async (req: Request, res: Response): Promise<any> => {
  if (!autorizado(req, res)) return;
  if (!topeOk(req, res, 'consulta')) return;
  try {
    const r = await pool.query(
      `SELECT u.id, u.full_name AS nombre, u.role,
              COUNT(t.id) FILTER (WHERE t.status NOT IN ('completed','cancelled'))::int AS tareas_abiertas
         FROM users u
         LEFT JOIN tasks t ON t.assignee_id = u.id
        WHERE u.deleted_at IS NULL
          AND u.role NOT IN ('client')
          AND COALESCE(u.is_active, TRUE)
        GROUP BY u.id, u.full_name, u.role
       HAVING COUNT(t.id) > 0
        ORDER BY tareas_abiertas DESC, u.full_name`);
    res.json({ generado_en: new Date().toISOString(), count: r.rowCount, personas: r.rows });
  } catch (e: any) {
    console.error('[zaia] personas:', e?.message);
    res.status(500).json({ error: 'No se pudo listar a las personas' });
  }
};

// GET /api/zaia/tareas — reporte de tareas de toda la empresa.
// Filtros: assignee_id, status, board, incluir_lista=1, limit, offset.
export const zaiaTareas = async (req: Request, res: Response): Promise<any> => {
  if (!autorizado(req, res)) return;
  if (!topeOk(req, res, 'consulta')) return;
  const t0 = Date.now();
  try {
    await ensureSchema();
    const cond: string[] = ['TRUE'];
    const args: any[] = [];

    const assigneeRaw = String(req.query.assignee_id || '').trim();
    let assignee = 0;
    if (assigneeRaw) {
      assignee = parseInt(assigneeRaw, 10);
      if (!Number.isFinite(assignee) || assignee <= 0) {
        return res.status(400).json({ error: 'assignee_id debe ser un número. Consulta /api/zaia/personas para ver los ids.' });
      }
      args.push(assignee); cond.push(`t.assignee_id = $${args.length}`);
    }

    const status = String(req.query.status || '').trim();
    if (status) {
      if (!(ESTADOS as readonly string[]).includes(status)) {
        return res.status(400).json({
          error: `status "${status}" no existe.`,
          estados_validos: ESTADOS,
        });
      }
      args.push(status); cond.push(`t.status = $${args.length}`);
    }

    const board = String(req.query.board || '').trim();
    if (board) { args.push(board); cond.push(`(b.board_key = $${args.length} OR b.name ILIKE '%' || $${args.length} || '%')`); }
    const where = cond.join(' AND ');

    const porEstado = await pool.query(
      `SELECT t.status, COUNT(*)::int AS n
         FROM tasks t LEFT JOIN task_boards b ON b.id = t.board_id
        WHERE ${where} GROUP BY t.status ORDER BY n DESC`, args);

    const totales = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE t.status NOT IN ('completed','cancelled'))::int AS abiertas,
              COUNT(*) FILTER (WHERE t.status NOT IN ('completed','cancelled') AND t.due_at IS NOT NULL AND t.due_at < NOW())::int AS vencidas,
              COUNT(*) FILTER (WHERE t.status NOT IN ('completed','cancelled') AND t.eisenhower = 'fuego')::int AS urgentes,
              COUNT(*) FILTER (WHERE t.completed_at >= NOW() - INTERVAL '7 days')::int AS cerradas_7d
         FROM tasks t LEFT JOIN task_boards b ON b.id = t.board_id
        WHERE ${where}`, args);

    const porPersona = await pool.query(
      `SELECT u.id, u.full_name AS nombre, u.role,
              COUNT(*) FILTER (WHERE t.status NOT IN ('completed','cancelled'))::int AS abiertas,
              COUNT(*) FILTER (WHERE t.status NOT IN ('completed','cancelled') AND t.due_at IS NOT NULL AND t.due_at < NOW())::int AS vencidas
         FROM tasks t LEFT JOIN task_boards b ON b.id = t.board_id
         JOIN users u ON u.id = t.assignee_id
        WHERE ${where}
        GROUP BY u.id, u.full_name, u.role
       HAVING COUNT(*) FILTER (WHERE t.status NOT IN ('completed','cancelled')) > 0
        ORDER BY abiertas DESC`, args);

    const porTablero = await pool.query(
      `SELECT COALESCE(b.name, 'Sin tablero') AS tablero,
              COUNT(*) FILTER (WHERE t.status NOT IN ('completed','cancelled'))::int AS abiertas
         FROM tasks t LEFT JOIN task_boards b ON b.id = t.board_id
        WHERE ${where} GROUP BY 1 ORDER BY abiertas DESC`, args);

    let lista: any[] = [];
    let paginacion: any = null;
    if (String(req.query.incluir_lista || '') === '1') {
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
      const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
      const argsPag = [...args, limit, offset];
      const r = await pool.query(
        `SELECT t.id, t.title AS titulo, t.status, t.eisenhower, t.due_at, t.created_at, t.completed_at,
                COALESCE(b.name, 'Sin tablero') AS tablero,
                t.assignee_id, u.full_name AS responsable,
                (t.status NOT IN ('completed','cancelled') AND t.due_at IS NOT NULL AND t.due_at < NOW()) AS vencida
           FROM tasks t LEFT JOIN task_boards b ON b.id = t.board_id
           LEFT JOIN users u ON u.id = t.assignee_id
          WHERE ${where}
          ORDER BY (t.status NOT IN ('completed','cancelled')) DESC, t.due_at NULLS LAST, t.id DESC
          LIMIT $${argsPag.length - 1} OFFSET $${argsPag.length}`, argsPag);
      lista = r.rows;
      const total = Number(totales.rows[0]?.total || 0);
      paginacion = { limit, offset, total, hay_mas: offset + lista.length < total };
    }

    const out = {
      generado_en: new Date().toISOString(),
      zona_horaria: 'UTC',
      filtros: { assignee_id: assignee || null, status: status || null, board: board || null },
      totales: totales.rows[0],
      por_estado: porEstado.rows,
      por_persona: porPersona.rows,
      por_tablero: porTablero.rows,
      ...(paginacion ? { paginacion, tareas: lista } : {}),
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
// Cada pregunta nace sola: no hay memoria entre llamadas. Si hace falta
// contexto, va dentro del texto de la pregunta.
export const zaiaPreguntar = async (req: Request, res: Response): Promise<any> => {
  if (!autorizado(req, res)) return;
  if (!topeOk(req, res, 'cajito')) return;
  const t0 = Date.now();
  const pregunta = String(req.body?.pregunta || req.body?.message || '').trim();
  try {
    await ensureSchema();
    if (!pregunta) return res.status(400).json({ error: 'Falta "pregunta" en el cuerpo.' });
    const a = await actor();
    if (!a) return res.status(500).json({ error: 'La cuenta configurada en ZAIA_ACTOR_ID no existe.' });

    const carrera = await conTope(
      preguntarCore({ userId: a.id, role: a.role, pregunta, origen: 'ZAIA (app de dirección), por API' }),
      TOPE_CAJITO_MS
    );
    if (!carrera.ok) {
      await registrar({ endpoint: 'POST /api/zaia/preguntar', pregunta, ip: ipDe(req), ok: false, error: 'timeout', ms: Date.now() - t0 });
      return res.status(504).json({ error: `Cajito tardó más de ${TOPE_CAJITO_MS / 1000} segundos. Reintenta con una pregunta más acotada.` });
    }
    const r = carrera.valor;
    if (!r.ok) {
      await registrar({ endpoint: 'POST /api/zaia/preguntar', pregunta, ip: ipDe(req), ok: false, error: r.error, ms: Date.now() - t0 });
      return res.status(r.status || 500).json({ error: r.error });
    }
    await registrar({
      endpoint: 'POST /api/zaia/preguntar', pregunta, respuesta: r.texto,
      herramientas: r.herramientas, ip: ipDe(req), ms: Date.now() - t0,
    });
    res.json({
      respuesta: r.texto,
      herramientas: r.herramientas,
      // Aviso explícito: lo de arriba es texto redactado por un modelo a partir
      // de datos que escriben personas. Es dato para mostrar, no instrucción.
      generado_por: 'ia',
      generado_en: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[zaia] preguntar:', e?.message);
    await registrar({ endpoint: 'POST /api/zaia/preguntar', pregunta, ip: ipDe(req), ok: false, error: e?.message, ms: Date.now() - t0 });
    res.status(500).json({ error: 'No se pudo consultar a Cajito' });
  }
};

// POST /api/zaia/revisar-tarea — { task_id } → Cajito revisa y da su veredicto.
export const zaiaRevisarTarea = async (req: Request, res: Response): Promise<any> => {
  if (!autorizado(req, res)) return;
  if (!topeOk(req, res, 'cajito')) return;
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

    const carrera = await conTope(
      preguntarCore({ userId: a.id, role: a.role, pregunta, origen: 'ZAIA (app de dirección), por API' }),
      TOPE_CAJITO_MS
    );
    if (!carrera.ok) {
      await registrar({ endpoint: 'POST /api/zaia/revisar-tarea', pregunta, ip: ipDe(req), ok: false, error: 'timeout', ms: Date.now() - t0 });
      return res.status(504).json({ error: `Cajito tardó más de ${TOPE_CAJITO_MS / 1000} segundos revisando la tarea ${taskId}.` });
    }
    const r = carrera.valor;
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
      generado_por: 'ia',
      generado_en: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[zaia] revisar-tarea:', e?.message);
    await registrar({ endpoint: 'POST /api/zaia/revisar-tarea', ip: ipDe(req), ok: false, error: e?.message, ms: Date.now() - t0 });
    res.status(500).json({ error: 'No se pudo revisar la tarea' });
  }
};
