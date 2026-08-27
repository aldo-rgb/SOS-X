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
import { getSignedUrlForKey, uploadToS3WithSignedUrl } from './s3Service';

export const SYNC_SOURCE = 'entregax-core';
export const EXTERNAL_APP = 'grupo_rino';

const PEER_URL = () => process.env.GRUPO_RINO_PEER_URL || '';
const SHARED_SECRET = () => process.env.GRUPO_RINO_SHARED_SECRET || '';
const INBOUND_API_KEY = () => process.env.GRUPO_RINO_API_KEY || '';
const OUTBOUND_API_KEY = () => process.env.GRUPO_RINO_OUTBOUND_KEY || process.env.GRUPO_RINO_API_KEY || '';
// Base pública de nuestra API, para armar las URLs de descarga de adjuntos.
const SELF_URL = () => (process.env.PUBLIC_API_URL || 'https://api.entregax.app').replace(/\/+$/, '');

/**
 * Trae a nuestro S3 un archivo que Grupo Rino subió de su lado.
 *
 * Guardar solo el enlace no sirve: sus archivos viven en su almacenamiento y el
 * enlace caduca o pide su sesión, así que la imagen se vería rota justo cuando
 * alguien la necesita. Se descarga y queda como adjunto normal de la tarea,
 * igual que si la hubiéramos subido nosotros.
 *
 * Solo se baja de hosts conocidos (el de su webhook, más GRUPO_RINO_FILES_HOSTS
 * si hay que agregar otro): un servidor que descarga cualquier URL que le
 * manden es un agujero, aunque venga firmada.
 */
const HOSTS_PERMITIDOS = (): string[] => {
  const extra = String(process.env.GRUPO_RINO_FILES_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean);
  const peer = (() => { try { return new URL(PEER_URL()).hostname; } catch { return ''; } })();
  return [...extra, ...(peer ? [peer] : [])].map(h => h.toLowerCase());
};

const MAX_ADJUNTO_BYTES = 25 * 1024 * 1024;

/** Para diagnóstico: de qué hosts aceptamos bajar archivos. */
export const hostsDeArchivosPermitidos = (): string[] => HOSTS_PERMITIDOS();

export async function ingestExternalAttachment(
  taskId: number, url: string, fileName: string, uploaderId: number | null
): Promise<{ id: number } | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') { console.warn('[sync] adjunto rechazado, no es https:', url); return null; }
    const permitidos = HOSTS_PERMITIDOS();
    const host = u.hostname.toLowerCase();
    const ok = permitidos.some(h => host === h || host.endsWith('.' + h));
    if (!ok) { console.warn(`[sync] adjunto rechazado, host no permitido: ${host} (permitidos: ${permitidos.join(', ') || 'ninguno'})`); return null; }

    // Su endpoint de archivos pide autenticación y no acordamos cómo mandarla,
    // así que se prueban las formas usuales con la misma llave compartida hasta
    // que una conteste 200. Si ninguna entra, se registra el código real para
    // poder decirles qué esperábamos.
    const llave = OUTBOUND_API_KEY();
    const intentos: Array<[string, Record<string, string>]> = [
      ['X-EntregaX-Key', { 'X-EntregaX-Key': llave }],
      ['Authorization Bearer', { Authorization: `Bearer ${llave}` }],
      ['X-Api-Key', { 'X-Api-Key': llave }],
      ['sin auth', {}],
    ];
    let resp: Response | null = null;
    const bitacora: string[] = [];
    for (const [comoSeLlama, headers] of intentos) {
      const r = await fetch(url, { headers }).catch(() => null);
      bitacora.push(`${comoSeLlama}=${r?.status ?? 'sin respuesta'}`);
      if (r?.ok) { console.log(`[sync] adjunto bajado con ${comoSeLlama}`); resp = r; break; }
      // Si no fue 401/403, la llave sí entró y el problema es otro (su 404, por
      // ejemplo): probar las demás formas de auth solo sería ruido en su server.
      if (r && r.status !== 401 && r.status !== 403) break;
    }
    if (!resp) {
      console.warn(`[sync] adjunto no se pudo bajar: ${url} · ${bitacora.join(' ')}`);
      // Queda en la bitácora de sync porque los logs de Railway no siempre están
      // a la mano y sin esto no hay forma de saber QUÉ contestó su servidor.
      await logSyncAttempt({
        endpoint: 'descarga-adjunto', diag: 'ok',
        rawBody: Buffer.from(JSON.stringify({ url, intentos: bitacora })),
      }).catch(() => {});
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length || buf.length > MAX_ADJUNTO_BYTES) {
      console.warn(`[sync] adjunto descartado por tamaño: ${buf.length} bytes`); return null;
    }
    const tipo = resp.headers.get('content-type') || 'application/octet-stream';
    // Sus enlaces no traen nombre de archivo, así que el adjunto se llamaba
    // "imagen" a secas. La extensión sale del content-type para que al
    // descargarlo el sistema sepa abrirlo.
    const EXT: Record<string, string> = {
      'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
      'image/heic': '.heic', 'image/heif': '.heif', 'application/pdf': '.pdf',
    };
    const ext = EXT[tipo.split(';')[0]!.trim().toLowerCase()] || '';
    let limpio = String(fileName || 'archivo').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 60);
    if (ext && !limpio.toLowerCase().endsWith(ext)) limpio += ext;
    const key = `task-attachments/task-${taskId}-${Date.now()}-${limpio}`;
    await uploadToS3WithSignedUrl(buf, key, tipo, 6 * 3600);
    const r = await pool.query(
      `INSERT INTO task_attachments (task_id, file_key, file_name, uploaded_by) VALUES ($1,$2,$3,$4) RETURNING id`,
      [taskId, key, limpio, uploaderId]);
    console.log(`[sync] adjunto externo guardado: tarea ${taskId} · ${limpio} · ${buf.length} bytes`);
    return { id: r.rows[0].id };
  } catch (e: any) {
    console.warn('[sync] ingestExternalAttachment:', e?.message);
    return null;
  }
}

/**
 * Reintenta bajar los archivos que quedaron como enlace externo.
 *
 * Cuando su servidor rechaza la descarga, el comentario conserva la URL y aquí
 * se vuelve a intentar cada tanto: el día que acomoden la autenticación, las
 * fotos viejas se convierten solas en adjuntos normales sin que nadie reenvíe
 * nada. Al lograrlo, el comentario apunta a la copia nuestra (una key de S3),
 * que sí se puede mostrar en miniatura.
 */
export async function reintentarAdjuntosPendientes(): Promise<{ intentados: number; recuperados: number }> {
  let intentados = 0, recuperados = 0;
  try {
    const pend = (await pool.query(
      `SELECT c.id, c.task_id, c.author_id, c.attachment_url
         FROM task_comments c
        WHERE c.attachment_url LIKE 'http%'
          AND c.attachment_url NOT LIKE '%amazonaws.com%'
          AND c.created_at > NOW() - INTERVAL '7 days'
        ORDER BY c.id DESC LIMIT 20`)).rows;
    for (const c of pend) {
      intentados++;
      const nombre = decodeURIComponent(String(c.attachment_url).split('/').pop()?.split('?')[0] || 'archivo');
      const g = await ingestExternalAttachment(c.task_id, c.attachment_url, nombre, c.author_id);
      if (!g) continue;
      const key = (await pool.query(`SELECT file_key FROM task_attachments WHERE id = $1`, [g.id])).rows[0]?.file_key;
      if (key) await pool.query(`UPDATE task_comments SET attachment_url = $2 WHERE id = $1`, [c.id, key]);
      recuperados++;
    }
    if (recuperados) console.log(`[sync] adjuntos recuperados: ${recuperados}/${intentados}`);
  } catch (e: any) {
    console.warn('[sync] reintentarAdjuntosPendientes:', e?.message);
  }
  return { intentados, recuperados };
}

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
  // Tareas que YA se compartieron con Grupo Rino alguna vez.
  //
  // Antes el envío se decidía preguntando "¿hay alguien de Rino en la tarea
  // AHORA?". Con eso, una tarea que se reasigna a alguien de EntregaX deja de
  // emitir eventos y se congela para siempre del lado de ellos: la 255
  // ("FALLA DE IMPRESORAS HP") se completó aquí el 24-ago y allá seguía abierta
  // porque el último evento que les llegó fue del 12-ago. Una vez compartida,
  // la tarea sigue reportando hasta que muere; si no, mentimos por omisión.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS sync_shared_tasks (
       task_id    INTEGER PRIMARY KEY,
       shared_at  TIMESTAMPTZ DEFAULT NOW(),
       deleted_at TIMESTAMPTZ,
       title      TEXT)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sync_shared_deleted ON sync_shared_tasks(deleted_at)`);
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
    // Se emite si hay alguien de Rino en la tarea AHORA, o si la tarea ya se
    // compartió antes. Lo segundo es lo que evita que una reasignación hacia
    // adentro la deje congelada del otro lado.
    const ext = (await pool.query(
      `SELECT 1
         FROM task_participants tp JOIN users u ON u.id = tp.user_id
        WHERE tp.task_id = $1 AND u.source_app = $2
        UNION
        SELECT 1 FROM users u WHERE u.id = $3 AND u.source_app = $2
        UNION
        SELECT 1 FROM sync_shared_tasks WHERE task_id = $1
        LIMIT 1`, [taskId, EXTERNAL_APP, t.assignee_id])).rows[0];
    if (!ext) return false;
    await pool.query(
      `INSERT INTO sync_shared_tasks (task_id, title) VALUES ($1, $2)
       ON CONFLICT (task_id) DO UPDATE SET title = EXCLUDED.title`,
      [taskId, t.title]).catch(() => {});

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

/**
 * Avisa que una tarea dejó de existir. Se llama ANTES del DELETE, porque
 * después ya no hay de dónde sacar el título.
 *
 * Sin esto, una tarea borrada aquí y una que nadie ha tocado se ven idénticas
 * desde Grupo Rino: la persona la sigue viendo asignada, la sigue contando como
 * pendiente y puede llegar a hacerla.
 */
export async function emitTaskDeleted(taskId: number, actorId: number | null): Promise<boolean> {
  try {
    await ensureSyncSchema();
    const compartida = (await pool.query(
      `SELECT 1 FROM sync_shared_tasks WHERE task_id = $1`, [taskId])).rows[0];
    // Si nunca se compartió, Grupo Rino no sabe que existe: no hay nada que avisar.
    if (!compartida) return false;
    const t = (await pool.query(`SELECT title FROM tasks WHERE id = $1`, [taskId])).rows[0];
    await pool.query(
      `UPDATE sync_shared_tasks SET deleted_at = NOW(), title = COALESCE($2, title) WHERE task_id = $1`,
      [taskId, t?.title || null]);
    await enqueueOutbound('task.deleted', {
      task: { id: taskId, external_id: taskId, title: t?.title || null, status: 'deleted' },
      actor_id: actorId,
    });
    return true;
  } catch (e: any) {
    console.error('[sync] emitTaskDeleted:', e?.message || e);
    return false;
  }
}

/**
 * GET /api/sync/tasks?updated_since=ISO
 *
 * Reconciliación: el estado actual de todas las tareas compartidas, incluidas
 * las borradas —con `deleted: true`—. Los webhooks se pueden perder; esto deja
 * que el otro lado cuadre solo sin depender de que cada aviso haya llegado.
 * Si las borradas simplemente desaparecieran de la lista, no habría forma de
 * distinguir "borrada" de "no cambió".
 */
export async function syncListTasks(req: any, res: any): Promise<any> {
  try {
    // Un GET no lleva cuerpo, así que no hay firma HMAC que verificar: la
    // autorización es la API key, en X-EntregaX-Key o como Bearer.
    const key = req.header('X-EntregaX-Key')
      || String(req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
      || undefined;
    if (!verifyInboundApiKey(key)) {
      await logSyncAttempt({
        endpoint: 'GET /api/sync/tasks', remoteIp: req.ip, key,
        diag: key ? 'key_mismatch' : 'no_key',
      });
      return res.status(401).json({ error: 'No autorizado' });
    }
    await ensureSyncSchema();
    const desde = String(req.query.updated_since || '').trim();
    const params: any[] = [];
    let filtro = '';
    if (desde) {
      const d = new Date(desde);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'updated_since inválido (usa ISO 8601)' });
      params.push(d.toISOString());
      filtro = `AND COALESCE(t.updated_at, t.created_at, s.deleted_at, s.shared_at) >= $1::timestamptz`;
    }
    const r = await pool.query(`
      SELECT s.task_id, s.deleted_at, s.title AS titulo_ultimo,
             t.id, t.title, t.description, t.status, t.eisenhower, t.due_at,
             t.commitment_date, t.started_at, t.completed_at, t.created_at, t.updated_at,
             t.assignee_id, t.created_by, b.board_key,
             au.external_id AS assignee_external_id, au.source_app AS assignee_source
        FROM sync_shared_tasks s
        LEFT JOIN tasks t ON t.id = s.task_id
        LEFT JOIN task_boards b ON b.id = t.board_id
        LEFT JOIN users au ON au.id = t.assignee_id
       WHERE TRUE ${filtro}
       ORDER BY COALESCE(t.updated_at, s.deleted_at, s.shared_at) DESC
       LIMIT 500`, params);

    const tasks = await Promise.all(r.rows.map(async (t: any) => {
      // La tarea ya no está en `tasks`: se borró. Se responde la lápida, que es
      // justo el caso que los webhooks perdidos dejaban invisible.
      const borrada = !!t.deleted_at || !t.id;
      if (borrada) {
        return {
          id: t.task_id, external_id: t.task_id,
          title: t.titulo_ultimo || null,
          status: 'deleted', deleted: true, deleted_at: t.deleted_at,
        };
      }
      const participants = (await pool.query(
        `SELECT u.id, u.external_id, u.source_app FROM task_participants tp
           JOIN users u ON u.id = tp.user_id WHERE tp.task_id = $1`, [t.id])).rows;
      return {
        id: t.id, external_id: t.id, deleted: false,
        title: t.title, description: t.description, status: t.status,
        eisenhower: t.eisenhower, board_key: t.board_key,
        assignee_id: t.assignee_id,
        assignee_external_id: t.assignee_source === EXTERNAL_APP ? t.assignee_external_id : null,
        created_by: t.created_by,
        due_at: t.due_at, commitment_date: t.commitment_date,
        started_at: t.started_at, completed_at: t.completed_at,
        created_at: t.created_at, updated_at: t.updated_at,
        participants: participants.map((p: any) => ({
          user_id: p.id, external_id: p.source_app === EXTERNAL_APP ? p.external_id : null,
        })),
        attachments: await attachmentsForTask(t.id),
      };
    }));

    res.json({
      source_app: SYNC_SOURCE,
      updated_since: desde || null,
      generated_at: new Date().toISOString(),
      count: tasks.length,
      tasks,
    });
  } catch (e: any) {
    console.error('[sync] syncListTasks:', e?.message || e);
    res.status(500).json({ error: 'No se pudo listar las tareas' });
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
