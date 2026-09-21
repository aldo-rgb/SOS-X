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

type Tipo = 'duda_cajito' | 'pendiente_cajito' | 'tarea_urgente' | 'paquete_recibido';

// Casilleros cuyos paquetes se avisan a ZAIA. Solo S1, por decisión de Aldo: el
// aviso de "paquete recibido" ya existía pero vive dentro de la app, y si no la
// trae abierta no se entera. Abrirlo a todos los casilleros convertiría este
// canal en ruido —lleva 18 avisos en su historia y solo S1 acumula 72—, así que
// va acotado y se amplía con la lista, no tocando código.
const CASILLEROS_AVISADOS = () =>
  (process.env.ZAIA_AVISO_CASILLEROS || 'S1')
    .split(',').map(x => x.trim().toUpperCase()).filter(Boolean);

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
 * Resumen DIARIO de lo que le llegó a los casilleros vigilados. Lo manda un
 * cron una vez al día; no se avisa paquete por paquete.
 *
 * Por qué resumen y no uno por uno: este canal llevaba 18 avisos en toda su
 * historia y solo el casillero S1 acumula 72 recepciones. Uno por paquete lo
 * convertiría en ruido, y un canal ruidoso se deja de leer. Lo decidió Aldo.
 *
 * El candado contra repetidos es el mismo índice único (tipo, task_id) que usan
 * los avisos de tarea; aquí `task_id` lleva la fecha como número (AAAAMMDD).
 * La columna se llama así por su primer uso, pero lo que guarda es "el id de la
 * cosa que originó el aviso": con la fecha, un segundo intento del mismo día no
 * duplica nada, venga del cron o de una corrida a mano.
 *
 * Si no llegó nada, no se manda: un resumen vacío diario es la forma más rápida
 * de que alguien deje de abrirlos.
 */
export async function avisarZaiaResumenPaquetes(dia?: string): Promise<{ enviado: boolean; paquetes: number }> {
  try {
    const casilleros = CASILLEROS_AVISADOS();
    if (casilleros.length === 0) return { enviado: false, paquetes: 0 };

    // El día que se resume, en hora de México. Sin fecha explícita, hoy.
    const hoy = (await pool.query(
      `SELECT to_char(COALESCE($1::date, (NOW() AT TIME ZONE 'America/Mexico_City')::date), 'YYYY-MM-DD') AS d`,
      [dia || null])).rows[0].d as string;

    const r = await pool.query(
      `SELECT p.id, p.tracking_internal, p.child_no, p.service_type, p.status,
              p.weight, GREATEST(COALESCE(p.total_boxes, 1), 1) AS cajas,
              COALESCE(p.received_at, p.created_at) AS entro,
              u.box_id, u.full_name AS cliente
         FROM packages p
         JOIN users u ON u.id = p.user_id
        WHERE UPPER(COALESCE(u.box_id, '')) = ANY($1::text[])
          AND (COALESCE(p.received_at, p.created_at) AT TIME ZONE 'America/Mexico_City')::date = $2::date
        ORDER BY entro`,
      [casilleros, hoy]);
    if (r.rows.length === 0) return { enviado: false, paquetes: 0 };

    await ensureSchema();
    const payload = {
      evento: 'paquete_recibido' as Tipo,
      resumen: {
        dia: hoy,
        casilleros,
        total: r.rows.length,
        paquetes: r.rows.map((p: any) => ({
          id: Number(p.id),
          guia: p.tracking_internal || p.child_no || null,
          casillero: String(p.box_id || '').toUpperCase(),
          cliente: p.cliente || null,
          servicio: p.service_type || null,
          estado: p.status || null,
          cajas: p.cajas ?? null,
          peso_kg: p.weight ?? null,
          entro: new Date(p.entro).toISOString(),
        })),
      },
      enviado: new Date().toISOString(),
    };
    // La fecha como número: un resumen por día, sin repetir.
    const clave = parseInt(hoy.replace(/-/g, ''), 10);
    const ins = await pool.query(
      `INSERT INTO zaia_avisos (tipo, task_id, payload) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (tipo, task_id) DO NOTHING RETURNING id`,
      ['paquete_recibido', clave, JSON.stringify(payload)]);
    const id = ins.rows[0]?.id;
    if (!id) return { enviado: false, paquetes: r.rows.length };   // ya se mandó el de hoy
    console.log(`[zaia] resumen ${id} paquete_recibido ${hoy}: ${r.rows.length} paquete(s) de ${casilleros.join(', ')}`);
    await entregar(Number(id), { aviso_id: Number(id), ...payload });
    return { enviado: true, paquetes: r.rows.length };
  } catch (e: any) {
    console.warn('[zaia] resumen de paquetes:', e?.message);
    return { enviado: false, paquetes: 0 };
  }
}

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

/**
 * POST /api/zaia/avisos/prueba — manda un aviso de prueba al webhook y dice
 * qué contestó. Para conectar sin esperar a que llegue una tarea real. No se
 * guarda en zaia_avisos.
 */
export const zaiaAvisoPrueba = async (req: Request, res: Response): Promise<any> => {
  const server = API_KEY();
  if (!server) return res.status(503).json({ error: 'El servidor no tiene ZAIA_API_KEY configurada.' });
  const k = (req.header('X-Zaia-Key') || String(req.header('Authorization') || '').replace(/^Bearer\s+/i, '') || '').trim();
  if (!k) return res.status(401).json({ error: 'Falta el header X-Zaia-Key.' });
  if (k !== server) return res.status(401).json({ error: 'La API key no coincide con la configurada.' });
  const url = WEBHOOK();
  if (!url) return res.status(409).json({ ok: false, error: 'EntregaX todavía no tiene ZAIA_WEBHOOK_URL configurada: pídele a Aldo que la cargue en Railway.' });
  const payload = {
    aviso_id: 0,
    evento: 'prueba',
    motivo: 'prueba',
    tarea: {
      id: 0, titulo: 'Aviso de prueba', descripcion: 'Si ves esto, el webhook de EntregaX → ZAIA funciona.',
      urgente: false, tablero: null, creada_por: 'EntregaX', vence: null, creada: new Date().toISOString(),
    },
    folio_cajito: null,
    enviado: new Date().toISOString(),
  };
  const cuerpo = JSON.stringify(payload);
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-EntregaX-Firma': firmar(cuerpo), 'X-EntregaX-Aviso': '0' },
      body: cuerpo, signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    const txt = (await r.text().catch(() => '')).slice(0, 500);
    res.json({ ok: r.ok, status: r.status, respuesta: txt, ms: Date.now() - t0 });
  } catch (e: any) {
    res.json({ ok: false, error: e?.name === 'AbortError' ? 'Su webhook no contestó en 10 segundos.' : String(e?.message || e), ms: Date.now() - t0 });
  }
};
