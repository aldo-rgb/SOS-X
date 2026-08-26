// ============================================================
// SINCRONIZACIÓN CROSS-APP — endpoints receptores (Grupo Rino → nosotros)
//  · POST /api/sync/users/upsert   Grupo Rino empuja su lista de usuarios.
//  · POST /api/webhooks/entregax   eventos de tarea desde Grupo Rino.
//  · GET  /api/sync/health         estado de la integración (auth normal).
// Verificación: X-EntregaX-Key (API key) + X-Signature HMAC del cuerpo crudo.
// ============================================================
import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';
import {
  ensureSyncSchema, verifyInboundApiKey, EXTERNAL_APP, isPeerConfigured,
  diagnoseAuth, type AuthDiag, logSyncAttempt,
} from './syncService';
import { applyInboundTaskEvent } from './tasksController';
import { getSignedUrlForKey } from './s3Service';

const clientIp = (req: Request): string =>
  (String(req.header('x-forwarded-for') || (req.socket && (req.socket as any).remoteAddress) || '').split(',')[0] || '').trim();

// Mensaje claro por cada causa de rechazo (sin filtrar secretos).
const DIAG_MSG: Record<AuthDiag, string> = {
  ok: 'ok',
  server_no_key: 'El servidor no tiene GRUPO_RINO_API_KEY configurada (ponla en Railway).',
  no_key: 'Falta el header X-EntregaX-Key.',
  key_mismatch: 'La API key enviada no coincide con la configurada en el servidor.',
  server_no_secret: 'El servidor no tiene GRUPO_RINO_SHARED_SECRET configurado (ponlo en Railway).',
  no_signature: 'Falta el header X-Signature.',
  signature_mismatch: 'La firma no coincide. Firma HMAC-SHA256 del cuerpo CRUDO con el SHARED_SECRET; formato "sha256=<hex>".',
};

// Verificación común (API key + firma HMAC del rawBody). Devuelve el motivo exacto.
function verifyRequest(req: Request, res: Response): boolean {
  const key = req.header('X-EntregaX-Key') || undefined;
  const sig = req.header('X-Signature') || undefined;
  const diag = diagnoseAuth(key, (req as any).rawBody, sig);
  if (diag !== 'ok') { res.status(401).json({ error: DIAG_MSG[diag], reason: diag }); return false; }
  return true;
}

// POST /api/sync/verify — auto-diagnóstico para Grupo Rino: dice si su API key y
// su firma quedaron bien, con el motivo exacto si algo falla. No cambia estado.
export const verifyAuth = async (req: Request, res: Response): Promise<any> => {
  const key = req.header('X-EntregaX-Key') || undefined;
  const sig = req.header('X-Signature') || undefined;
  const diag = diagnoseAuth(key, (req as any).rawBody, sig);
  res.json({ ok: diag === 'ok', reason: diag, message: DIAG_MSG[diag] });
};

// POST /api/sync/users/upsert
// Body: { users: [{ external_id*, full_name*, email?, role?, active? }] }
// Crea/actualiza cada usuario externo como fila en `users` (source_app=grupo_rino).
// Estos usuarios NO pueden iniciar sesión en nuestro sistema (password no usable).
export const upsertExternalUsers = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSyncSchema();
    const key0 = req.header('X-EntregaX-Key') || undefined;
    const sig0 = req.header('X-Signature') || undefined;
    await logSyncAttempt({ endpoint: 'users/upsert', remoteIp: clientIp(req), key: key0, sig: sig0,
      diag: diagnoseAuth(key0, (req as any).rawBody, sig0), rawBody: (req as any).rawBody });
    if (!verifyRequest(req, res)) return;
    const body = (req as any).rawBody ? JSON.parse((req as any).rawBody.toString('utf8')) : (req.body || {});
    const list: any[] = Array.isArray(body.users) ? body.users : (body.user ? [body.user] : []);
    if (list.length === 0) {
      // Grupo Rino intentó mandar comentarios por aquí. El error decía solo
      // "Falta el arreglo users" y no llevaba a ningún lado; ahora apunta a la
      // ruta correcta.
      const pista = (req.body || {}).event || ((req as any).rawBody?.toString('utf8') || '').includes('"event"');
      return res.status(400).json({
        error: 'Falta el arreglo users',
        ...(pista ? { hint: 'Este endpoint solo da de alta usuarios. Los eventos de tarea y los comentarios van a POST /api/webhooks/entregax' } : {}),
      });
    }

    const results: Array<{ external_id: string; local_id: number; action: string }> = [];
    for (const u of list) {
      const externalId = String(u.external_id ?? u.id ?? '').trim();
      if (!externalId) continue;
      const fullName = String(u.full_name ?? u.name ?? 'Usuario Grupo Rino').trim();
      const email = String(u.email ?? `rino-${externalId}@grupo-rino.ext`).trim().toLowerCase();
      const externalRole = u.role ? String(u.role) : null;
      const active = u.active === undefined ? true : !!u.active;
      // box_id es varchar(20). Los external_id de Grupo Rino son UUID (36) → generamos
      // un box_id corto derivado (no requiere unicidad; el mapeo real es external_id).
      const boxId = ('RINO-' + String(externalId).replace(/[^A-Za-z0-9]/g, '')).slice(0, 20);
      // Password no usable (no es bcrypt → login imposible).
      const noLogin = 'external:' + crypto.randomBytes(24).toString('hex');

      const existing = await pool.query(
        `SELECT id FROM users WHERE source_app=$1 AND external_id=$2 LIMIT 1`, [EXTERNAL_APP, externalId]);
      if (existing.rows[0]) {
        await pool.query(
          `UPDATE users SET full_name=$1, external_role=$2, is_active=$3 WHERE id=$4`,
          [fullName, externalRole, active, existing.rows[0].id]);
        results.push({ external_id: externalId, local_id: existing.rows[0].id, action: 'updated' });
      } else {
        // Evitar colisión de email con un usuario existente (email no es único en la
        // tabla; usamos un correo sintético si el enviado ya existe).
        let finalEmail = email;
        const emailTaken = await pool.query(`SELECT 1 FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`, [finalEmail]);
        if (emailTaken.rows[0]) finalEmail = `rino-${externalId}@grupo-rino.ext`;
        // role='external_partner' para que aparezca en asignables (role<>'client').
        // NOTA: la tabla users NO tiene updated_at (solo created_at) y email no es único.
        const ins = await pool.query(
          `INSERT INTO users (full_name, email, password, box_id, role, is_active, source_app, external_id, external_role, created_at)
           VALUES ($1,$2,$3,$4,'external_partner',$5,$6,$7,$8,NOW())
           RETURNING id`,
          [fullName, finalEmail, noLogin, boxId, active, EXTERNAL_APP, externalId, externalRole]);
        results.push({ external_id: externalId, local_id: ins.rows[0].id, action: 'created' });
      }
    }
    res.json({ ok: true, count: results.length, users: results });
  } catch (e: any) {
    console.error('[sync] upsertExternalUsers:', e); res.status(500).json({ error: 'Error al procesar usuarios', detail: e?.message });
  }
};

/**
 * GET /api/sync/attachments/:id — descarga de un adjunto de tarea.
 *
 * Las imágenes están en S3 con llave privada, así que en el evento va este
 * enlace estable en vez de una URL firmada que caduca. Autentica solo con la
 * API key (un GET no tiene cuerpo que firmar) y responde con un redirect a una
 * URL firmada recién generada. Solo entrega adjuntos de tareas donde Grupo Rino
 * es parte: el resto no es suyo.
 */
export const attachmentDownload = async (req: Request, res: Response): Promise<any> => {
  try {
    const key = req.header('X-EntregaX-Key') || String(req.query.key || '') || undefined;
    if (!verifyInboundApiKey(key)) {
      return res.status(401).json({ error: 'API key inválida o ausente.', reason: 'no_key' });
    }
    const attId = parseInt(String(req.params.id));
    if (!attId) return res.status(400).json({ error: 'Adjunto inválido' });
    const a = (await pool.query(
      `SELECT at.file_key, at.file_name, at.task_id FROM task_attachments at WHERE at.id = $1`, [attId])).rows[0];
    if (!a) return res.status(404).json({ error: 'Adjunto no encontrado' });
    const suyo = (await pool.query(
      `SELECT 1 FROM task_participants tp JOIN users u ON u.id = tp.user_id
        WHERE tp.task_id = $1 AND u.source_app = $2
        UNION
        SELECT 1 FROM tasks t JOIN users u ON u.id = t.assignee_id
        WHERE t.id = $1 AND u.source_app = $2
        LIMIT 1`, [a.task_id, EXTERNAL_APP])).rows[0];
    if (!suyo) return res.status(403).json({ error: 'Esa tarea no involucra a Grupo Rino' });
    const url = await getSignedUrlForKey(a.file_key, 3600);
    return res.redirect(302, url);
  } catch (e: any) {
    console.error('[sync] attachmentDownload:', e);
    res.status(500).json({ error: 'Error al entregar el adjunto' });
  }
};

// POST /api/webhooks/entregax  (+ alias /api/sync/webhook, /api/sync/comments,
// /api/sync/tasks/comments — Grupo Rino los probó y daban 404)
// Body: { event, occurred_at, source_app, data:{ task:{ id/external_id, ... }, actor_external_id?, comment? } }
// Idempotencia por X-Event-Id (sync_inbox). Aplica el cambio en nuestra tarea
// SIN re-emitir (evita bucle). El actor se mapea por external_id → id local.
export const inboundWebhook = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSyncSchema();
    const key0 = req.header('X-EntregaX-Key') || undefined;
    const sig0 = req.header('X-Signature') || undefined;
    await logSyncAttempt({ endpoint: req.path, remoteIp: clientIp(req), key: key0, sig: sig0,
      diag: diagnoseAuth(key0, (req as any).rawBody, sig0), rawBody: (req as any).rawBody });
    if (!verifyRequest(req, res)) return;
    // Idempotencia: preferimos el id que mande el emisor. Si no manda ninguno,
    // se deriva del cuerpo crudo, así un reintento del MISMO evento sigue
    // deduplicándose en vez de rebotar con 400 y perderse.
    const rawForId = (req as any).rawBody ? (req as any).rawBody.toString('utf8') : JSON.stringify(req.body || {});
    const eventId = req.header('X-Event-Id') || req.header('x-event-id')
      || (req.body || {}).event_id
      || 'body:' + crypto.createHash('sha256').update(rawForId, 'utf8').digest('hex');

    // Idempotencia: si ya lo procesamos, ok inmediato.
    const dup = await pool.query(`SELECT 1 FROM sync_inbox WHERE event_id=$1`, [eventId]);
    if (dup.rows[0]) return res.json({ ok: true, duplicate: true });

    const body = (req as any).rawBody ? JSON.parse((req as any).rawBody.toString('utf8')) : (req.body || {});
    const event = String(body.event || '');
    const data = body.data || {};
    const task = data.task || {};
    // Nuestra tarea: Grupo Rino referencia nuestro id como external_id (o id).
    const localTaskId = Number(task.external_id ?? task.local_id ?? task.id);
    if (!localTaskId) return res.status(400).json({ error: 'Falta el id de la tarea' });

    // Mapear el actor externo → usuario local. El autor de un comentario viene
    // dentro de `comment` (así lo mandamos nosotros), no siempre a nivel `data`:
    // se revisan ambos lugares antes de darlo por desconocido.
    let actorLocalId: number | null = null;
    const comentario = data.comment || {};
    const actorExternal = data.actor_external_id ?? data.actor_id
      ?? comentario.author_external_id ?? comentario.author_id
      ?? task.assignee_external_id;
    if (actorExternal != null) {
      const a = await pool.query(
        `SELECT id FROM users WHERE source_app=$1 AND external_id=$2 LIMIT 1`, [EXTERNAL_APP, String(actorExternal)]);
      actorLocalId = a.rows[0]?.id || null;
    }
    // Autor desconocido: el comentario se guarda igual (perderlo sería peor),
    // pero se avisa en la respuesta para que puedan corregir el external_id.
    const autorDesconocido = actorExternal != null && !actorLocalId;
    if (autorDesconocido) {
      console.warn(`[sync] autor externo no reconocido: ${actorExternal} (${comentario.author_name || 's/n'})`);
    }

    if (event.startsWith('task.')) {
      const r = await applyInboundTaskEvent({
        taskId: localTaskId, event, actorId: actorLocalId,
        body: (event === 'task.attachment_added' ? data.attachment : data.comment) || data,
      });
      if (!r.ok) return res.status(422).json({ error: r.error || 'No se pudo aplicar' });
      if (autorDesconocido) {
        await pool.query(
          `INSERT INTO sync_inbox (event_id, event) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING`, [eventId, event]);
        return res.json({
          ok: true,
          warning: 'unknown_author',
          detail: `No reconocemos el external_id "${actorExternal}". El comentario se guardó sin autor. ` +
                  `Manda ese usuario por /api/sync/users/upsert para que quede atribuido.`,
        });
      }
    } else {
      // Eventos de calendario u otros: por ahora sólo se registran.
      console.log('[sync] evento no manejado:', event);
    }

    await pool.query(
      `INSERT INTO sync_inbox (event_id, event) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING`, [eventId, event]);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[sync] inboundWebhook:', e); res.status(500).json({ error: 'Error al procesar webhook', detail: e?.message });
  }
};

// GET /api/sync/health — estado (auth normal, para el panel).
export const syncHealth = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureSyncSchema();
    const users = (await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE source_app=$1`, [EXTERNAL_APP])).rows[0]?.n || 0;
    const outbox = (await pool.query(
      `SELECT status, COUNT(*)::int AS n FROM sync_outbox GROUP BY status`)).rows;
    const pending = outbox.find((r: any) => r.status === 'pending')?.n || 0;
    const failed = outbox.find((r: any) => r.status === 'failed')?.n || 0;
    const sent = outbox.find((r: any) => r.status === 'sent')?.n || 0;
    res.json({ peer_configured: isPeerConfigured(), external_users: users, outbox: { pending, failed, sent } });
  } catch (e: any) {
    console.error('[sync] health:', e); res.status(500).json({ error: 'Error' });
  }
};
