// ============================================================
// SINCRONIZACIÓN CROSS-APP (Grupo Rino)
// Modelo del manual §10: usuarios externos como filas en `users` con
// source_app + external_id; cola de salida (sync_outbox) con firma HMAC y
// reintentos; idempotencia de entrada (sync_inbox).
//
// Variables de entorno (se configuran en Railway cuando Grupo Rino entregue
// sus datos; mientras no existan, el envío queda encolado sin despacharse):
//   GRUPO_RINO_PEER_URL      URL del receptor de webhooks de Grupo Rino
//   GRUPO_RINO_SHARED_SECRET Secreto HMAC compartido (firma en ambos sentidos)
//   GRUPO_RINO_API_KEY       API key que Grupo Rino usa para llamarnos (la verificamos)
//   GRUPO_RINO_OUTBOUND_KEY  API key que nosotros mandamos a Grupo Rino (opcional)
// ============================================================
import crypto from 'crypto';
import { pool } from './db';
import { getSignedUrlForKey } from './s3Service';

export const SYNC_SOURCE = 'entregax-core';
export const EXTERNAL_APP = 'grupo_rino';

const PEER_URL = () => process.env.GRUPO_RINO_PEER_URL || '';
const SHARED_SECRET = () => process.env.GRUPO_RINO_SHARED_SECRET || '';
const INBOUND_API_KEY = () => process.env.GRUPO_RINO_API_KEY || '';
const OUTBOUND_API_KEY = () => process.env.GRUPO_RINO_OUTBOUND_KEY || process.env.GRUPO_RINO_API_KEY || '';
// Base pública de nuestra API, para armar las URLs de descarga de adjuntos.
const SELF_URL = () => (process.env.PUBLIC_API_URL || 'https://api.entregax.app').replace(/\/+$/, '');

/**
 * Adjuntos de una tarea, listos para mandarse afuera.
 *
 * Las imágenes viven en S3 con una llave privada: Grupo Rino no puede leerlas
 * directo. Van dos formas de bajarlas:
 *   - `url`: firmada, caduca (7 días es el máximo que permite S3). Sirve para
 *     descargarla en el momento en que llega el evento.
 *   - `download_url`: nuestro endpoint estable. Nunca caduca, pide la API key
 *     y firma una URL nueva al vuelo. Es la que deben guardar.
 */
export async function attachmentsForTask(taskId: number): Promise<any[]> {
  try {
    const rows = (await pool.query(
      `SELECT id, file_key, file_name, created_at FROM task_attachments
        WHERE task_id = $1 ORDER BY id`, [taskId])).rows;
    return await Promise.all(rows.map(async (a: any) => ({
      id: a.id,
      file_name: a.file_name,
      created_at: a.created_at,
      download_url: `${SELF_URL()}/api/sync/attachments/${a.id}`,
      url: await getSignedUrlForKey(a.file_key, 7 * 24 * 3600).catch(() => null),
    })));
  } catch (e: any) {
    console.warn('[sync] attachmentsForTask:', e?.message);
    return [];
  }
}

let _ready = false;
export async function ensureSyncSchema(): Promise<void> {
  if (_ready) return;
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS source_app TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS external_role TEXT`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_source_ext
       ON users(source_app, external_id)
     WHERE source_app IS NOT NULL AND external_id IS NOT NULL`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS sync_inbox (
       event_id     TEXT PRIMARY KEY,
       event        TEXT,
       processed_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS sync_outbox (
       id              SERIAL PRIMARY KEY,
       event           TEXT NOT NULL,
       event_id        TEXT,
       payload         JSONB NOT NULL,
       status          TEXT NOT NULL DEFAULT 'pending',   -- pending|sent|failed
       attempts        INTEGER NOT NULL DEFAULT 0,
       next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
       last_error      TEXT,
       created_at      TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(status, next_attempt_at)`);
  // Bitácora de intentos entrantes (debug): para ver si Grupo Rino nos llama y qué falla.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS sync_debug_log (
       id          SERIAL PRIMARY KEY,
       endpoint    TEXT,
       remote_ip   TEXT,
       key_prefix  TEXT,
       has_sig     BOOLEAN,
       diag        TEXT,
       body_size   INTEGER,
       body_preview TEXT,
       created_at  TIMESTAMPTZ DEFAULT NOW())`);
  _ready = true;
}

// Registra un intento entrante (sin filtrar secretos) para diagnóstico.
export async function logSyncAttempt(opts: {
  endpoint: string; remoteIp?: string | undefined; key?: string | undefined; sig?: string | undefined; diag: string; rawBody?: Buffer | string | undefined;
}): Promise<void> {
  try {
    await ensureSyncSchema();
    const raw = opts.rawBody == null ? '' : (Buffer.isBuffer(opts.rawBody) ? opts.rawBody.toString('utf8') : String(opts.rawBody));
    const keyPrefix = opts.key ? String(opts.key).slice(0, 8) + '…' : null;
    await pool.query(
      `INSERT INTO sync_debug_log (endpoint, remote_ip, key_prefix, has_sig, diag, body_size, body_preview)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [opts.endpoint, opts.remoteIp || null, keyPrefix, !!opts.sig, opts.diag, raw.length, raw.slice(0, 400)]);
  } catch (e: any) { console.error('[sync] logSyncAttempt:', e?.message); }
}

// ---- Firma / verificación HMAC ------------------------------------------------
export function sign(body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', SHARED_SECRET()).update(body, 'utf8').digest('hex');
}
// Compara la firma recibida contra la esperada. Tolerante al formato: acepta
// "sha256=<hex>" o el hex pelón, y compara en minúsculas (case-insensitive).
function signatureMatches(rawBody: Buffer | string | undefined, signature: string | undefined): boolean {
  const secret = SHARED_SECRET();
  if (!secret || !signature || rawBody == null) return false;
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const expectedHex = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex').toLowerCase();
  const got = String(signature).trim().replace(/^sha256=/i, '').toLowerCase();
  try {
    const a = Buffer.from(expectedHex);
    const b = Buffer.from(got);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
export function verifySignature(rawBody: Buffer | string | undefined, signature: string | undefined): boolean {
  return signatureMatches(rawBody, signature);
}
export function verifyInboundApiKey(key: string | undefined): boolean {
  const k = INBOUND_API_KEY();
  return !!k && key === k;
}

// Diagnóstico detallado (para responder al que llama QUÉ falló, sin filtrar secretos).
export type AuthDiag = 'ok' | 'server_no_key' | 'no_key' | 'key_mismatch'
  | 'server_no_secret' | 'no_signature' | 'signature_mismatch';
export function diagnoseAuth(key: string | undefined, rawBody: Buffer | string | undefined, sig: string | undefined): AuthDiag {
  const serverKey = INBOUND_API_KEY();
  if (!serverKey) return 'server_no_key';
  if (!key) return 'no_key';
  if (key !== serverKey) return 'key_mismatch';
  if (!SHARED_SECRET()) return 'server_no_secret';
  if (!sig) return 'no_signature';
  if (!signatureMatches(rawBody, sig)) return 'signature_mismatch';
  return 'ok';
}
export const isPeerConfigured = () => !!PEER_URL() && !!SHARED_SECRET();

// ---- Cola de salida -----------------------------------------------------------
// Encola un evento sólo si la tarea involucra a un usuario de Grupo Rino
// (responsable o participante). Devuelve true si se encoló.
/**
 * Emite un evento de tarea hacia Grupo Rino.
 *
 * `extra` se mezcla con el sobre `data`. Sin él, un `task.comment_added` viajaba
 * SOLO con la foto de la tarea: el evento llegaba (HTTP 200) pero sin texto,
 * autor ni fecha, así que del otro lado no había nada que mostrar y el
 * comentario parecía perdido. El contrato de vuelta es `data.comment` — el
 * mismo campo que leemos nosotros en el webhook entrante.
 */
export async function emitTaskEventIfExternal(event: string, taskId: number, actorId: number | null, extra?: Record<string, any>): Promise<boolean> {
  try {
    await ensureSyncSchema();
    const t = (await pool.query(
      `SELECT t.id, t.title, t.status, t.eisenhower, t.due_at, t.commitment_date,
              t.started_at, t.completed_at, t.description,
              t.assignee_id, t.created_by, b.board_key,
              au.external_id AS assignee_external_id, au.source_app AS assignee_source
         FROM tasks t
         LEFT JOIN task_boards b ON b.id = t.board_id
         LEFT JOIN users au ON au.id = t.assignee_id
        WHERE t.id = $1`, [taskId])).rows[0];
    if (!t) return false;
    // ¿Hay algún stakeholder de Grupo Rino? (responsable o participante)
    const ext = (await pool.query(
      `SELECT 1
         FROM task_participants tp JOIN users u ON u.id = tp.user_id
        WHERE tp.task_id = $1 AND u.source_app = $2
        UNION
        SELECT 1 FROM users u WHERE u.id = $3 AND u.source_app = $2
        LIMIT 1`, [taskId, EXTERNAL_APP, t.assignee_id])).rows[0];
    if (!ext) return false;

    const participants = (await pool.query(
      `SELECT u.id, u.external_id, u.source_app FROM task_participants tp
         JOIN users u ON u.id = tp.user_id WHERE tp.task_id = $1`, [taskId])).rows;

    const data = {
      task: {
        id: t.id, external_id: t.id, // para Grupo Rino, nuestro id ES el external_id
        title: t.title, description: t.description, status: t.status,
        eisenhower: t.eisenhower, board_key: t.board_key,
        assignee_id: t.assignee_id,
        assignee_external_id: t.assignee_source === EXTERNAL_APP ? t.assignee_external_id : null,
        created_by: t.created_by,
        due_at: t.due_at, commitment_date: t.commitment_date,
        started_at: t.started_at, completed_at: t.completed_at,
        participants: participants.map((p: any) => ({
          user_id: p.id, external_id: p.source_app === EXTERNAL_APP ? p.external_id : null,
        })),
        // Los adjuntos viajan en TODOS los eventos, no solo al subirlos: si se
        // pierden uno, el siguiente evento de la tarea trae la lista completa.
        attachments: await attachmentsForTask(taskId),
      },
      actor_id: actorId,
      actor_external_id: null as string | null,
      actor_name: null as string | null,
      ...(extra || {}),
    };
    // Nombre (y external_id si el actor fuera de ellos) para que puedan atribuir
    // el evento a una persona y no a un número que no conocen.
    if (actorId) {
      const a = (await pool.query(
        `SELECT full_name, external_id, source_app FROM users WHERE id = $1`, [actorId])).rows[0];
      if (a) {
        data.actor_name = a.full_name || null;
        data.actor_external_id = a.source_app === EXTERNAL_APP ? a.external_id : null;
      }
    }
    await enqueueOutbound(event, data);
    return true;
  } catch (e: any) {
    console.error('[sync] emitTaskEventIfExternal:', e?.message || e);
    return false;
  }
}

export async function enqueueOutbound(event: string, data: any): Promise<void> {
  await ensureSyncSchema();
  const eventId = crypto.randomUUID();
  const payload = { event, occurred_at: new Date().toISOString(), source_app: SYNC_SOURCE, data };
  await pool.query(
    `INSERT INTO sync_outbox (event, event_id, payload) VALUES ($1, $2, $3::jsonb)`,
    [event, eventId, JSON.stringify(payload)]);
}

// Despacha la cola de salida. Sin peer configurado, no hace nada (queda encolado).
export async function dispatchOutbox(): Promise<void> {
  if (!isPeerConfigured()) return;
  await ensureSyncSchema();
  const rows = (await pool.query(
    `SELECT * FROM sync_outbox
      WHERE status = 'pending' AND next_attempt_at <= NOW()
      ORDER BY id ASC LIMIT 50`)).rows;
  for (const row of rows) {
    const body = JSON.stringify(row.payload);
    try {
      const resp = await fetch(PEER_URL(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EntregaX-Key': OUTBOUND_API_KEY(),
          'X-Signature': sign(body),
          'X-Event-Id': row.event_id,
        },
        body,
      });
      if (resp.ok) {
        await pool.query(`UPDATE sync_outbox SET status='sent', last_error=NULL WHERE id=$1`, [row.id]);
      } else {
        throw new Error(`HTTP ${resp.status}`);
      }
    } catch (e: any) {
      const attempts = (row.attempts || 0) + 1;
      const backoff = Math.min(3600, 30 * Math.pow(2, attempts)); // 60s,120s… cap 1h
      const status = attempts >= 12 ? 'failed' : 'pending';
      await pool.query(
        `UPDATE sync_outbox
            SET attempts=$2, last_error=$3, status=$4,
                next_attempt_at = NOW() + ($5 || ' seconds')::interval
          WHERE id=$1`,
        [row.id, attempts, String(e?.message || e), status, backoff]);
    }
  }
}
