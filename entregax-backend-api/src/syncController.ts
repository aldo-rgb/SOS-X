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
  ensureSyncSchema, verifyInboundApiKey, EXTERNAL_APP, isPeerConfigured, hostsDeArchivosPermitidos,
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
    // El id que mandan significa DOS cosas distintas segun quien creo la tarea:
    //  · tarea NUESTRA  → external_id es NUESTRO id (asi lo mandamos nosotros)
    //  · tarea SUYA     → external_id es el id de ELLOS
    // Por eso se busca primero el mapeo externo: si esa tarea la crearon ellos,
    // ya la tenemos guardada con su id. Si no aparece, es una de las nuestras y
    // el numero es nuestro id, como siempre.
    const refExterna = String(task.external_id ?? task.local_id ?? task.id ?? '').trim();
    if (!refExterna) return res.status(400).json({ error: 'Falta el id de la tarea' });

    // Alta de una tarea SUYA en nuestro tablero.
    if (event === 'task.created') {
      const r = await crearTareaDesdeRino(task, refExterna);
      await pool.query(
        `INSERT INTO sync_inbox (event_id, event) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING`, [eventId, event]);
      return res.status(r.ok ? 200 : 422).json(r);
    }

    const mapeo = await pool.query(
      `SELECT id FROM tasks WHERE external_app = $1 AND external_id = $2 LIMIT 1`, [EXTERNAL_APP, refExterna]);
    const localTaskId = Number(mapeo.rows[0]?.id ?? refExterna);
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
    res.json({
      peer_configured: isPeerConfigured(), external_users: users, outbox: { pending, failed, sent },
      // De qué hosts aceptamos bajar sus adjuntos. Si el de sus archivos no está
      // aquí, la imagen no se baja y solo queda el enlace: se agrega con
      // GRUPO_RINO_FILES_HOSTS.
      hosts_archivos: hostsDeArchivosPermitidos(),
    });
  } catch (e: any) {
    console.error('[sync] health:', e); res.status(500).json({ error: 'Error' });
  }
};

// ============================================================
// GET /api/sync/usuarios — nuestra gente, para que Grupo Rino nos asigne
// ============================================================
/**
 * Espejo de lo que ellos nos dan: la lista completa, no un incremento.
 *
 * SOLO se comparte Direccion y Administracion (hoy Neida Arriaga y Juan
 * Segura). Decision de Aldo, 8-sep-2026: son los unicos que pueden recibir
 * trabajo de un socio externo. Los 73 del personal interno NO se exponen —
 * nombre y puesto de un repartidor o de bodega no le sirven a nadie del otro
 * lado y son datos de nuestra gente.
 *
 * Tampoco va el CORREO. Ellos lo pidieron para mostrarlo al elegir
 * responsable, pero con id y nombre ya pueden; el correo es dato personal que
 * no hace falta para el flujo. Si algun dia se necesita, se agrega aqui.
 *
 * OJO: la lista se arma por ROL. Si se nombra a otro admin o director, entra
 * solo. Es lo correcto para que no se quede vieja, pero conviene saberlo.
 */
const PUESTO_VISIBLE: Record<string, string> = {
  admin: 'Administración',
  director: 'Dirección',
};

export const syncListOurUsers = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!verifyInboundApiKey(req.header('X-EntregaX-Key') || req.header('x-entregax-key') || undefined)) {
      return res.status(401).json({ error: DIAG_MSG.key_mismatch, reason: 'key_mismatch' });
    }
    const r = await pool.query(
      `SELECT id, full_name, role
         FROM users
        WHERE role IN ('admin','director')
          AND COALESCE(is_active, TRUE) = TRUE
          AND deleted_at IS NULL
          AND COALESCE(source_app, '') <> $1
        ORDER BY full_name`,
      [EXTERNAL_APP]
    );
    return res.json({
      ok: true,
      usuarios: r.rows.map((u: any) => ({
        id: Number(u.id),
        nombre: String(u.full_name || ''),
        puesto: PUESTO_VISIBLE[String(u.role)] || String(u.role),
      })),
      nota: 'Lista COMPLETA, no incremento: reemplaza tu copia. Solo Dirección y Administración pueden recibir tareas.',
    });
  } catch (e: any) {
    console.error('[sync] listOurUsers:', e);
    return res.status(500).json({ error: 'Error al listar usuarios' });
  }
};

/**
 * Da de alta en NUESTRO tablero una tarea que nos encarga Grupo Rino.
 *
 * Reglas, y las tres importan:
 *
 *  1. Cae en el tablero "Grupo Rino", no revuelta con las nuestras. Asi se ve
 *     de un vistazo que el encargo viene de fuera y quien la atiende sabe con
 *     quien hablar.
 *  2. El responsable solo puede ser alguien de la lista que compartimos
 *     (Direccion y Administracion). Si mandan a otro, se rechaza en vez de
 *     asignarsela a quien sea: un socio externo no le pone trabajo a cualquiera.
 *  3. Se guarda SU id. Los eventos que manden despues —terminada, comentario—
 *     vienen con ese id y sin el no habria como saber de que tarea hablan.
 */
const TABLERO_RINO = 'grupo_rino';
const PUEDEN_RECIBIR_DE_RINO = ['admin', 'director'];

async function crearTareaDesdeRino(task: any, refExterna: string): Promise<any> {
  // Reintento del mismo envio: se devuelve la que ya existe en vez de duplicar.
  const ya = await pool.query(
    `SELECT id FROM tasks WHERE external_app = $1 AND external_id = $2 LIMIT 1`, [EXTERNAL_APP, refExterna]);
  if (ya.rows.length > 0) return { ok: true, task_id: ya.rows[0].id, duplicate: true };

  const titulo = String(task.title || '').trim();
  if (!titulo) return { ok: false, error: 'La tarea necesita título' };

  const tablero = await pool.query(
    `SELECT id FROM task_boards WHERE board_key = $1 AND COALESCE(is_active, TRUE) = TRUE LIMIT 1`, [TABLERO_RINO]);
  const boardId = tablero.rows[0]?.id;
  if (!boardId) return { ok: false, error: 'No existe el tablero de Grupo Rino' };

  // El responsable: id NUESTRO, y solo de quienes compartimos.
  const asignado = Number(task.assignee_id);
  if (!Number.isFinite(asignado) || asignado <= 0) {
    return { ok: false, error: 'Falta assignee_id. Sácalo de GET /api/sync/usuarios.' };
  }
  const u = await pool.query(
    `SELECT id, full_name, role FROM users
      WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE AND deleted_at IS NULL
        AND role = ANY($2::text[])`,
    [asignado, PUEDEN_RECIBIR_DE_RINO]);
  if (u.rows.length === 0) {
    return {
      ok: false,
      error: `El usuario ${asignado} no puede recibir tareas. Solo los que devuelve GET /api/sync/usuarios.`,
    };
  }

  const eisen = ['fuego', 'estrella', 'reloj', 'hoja'].includes(String(task.eisenhower))
    ? String(task.eisenhower) : 'estrella';
  const vence = task.due_at ? new Date(task.due_at) : null;

  const r = await pool.query(
    `INSERT INTO tasks (board_id, title, description, assignee_id, due_at, eisenhower, status,
                        external_app, external_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8,NOW(),NOW())
     RETURNING id, created_at`,
    [boardId, titulo.slice(0, 300), String(task.description || '').slice(0, 4000) || null,
     asignado, vence && !isNaN(vence.getTime()) ? vence : null, eisen, EXTERNAL_APP, refExterna]);

  const taskId = r.rows[0].id;
  console.log(`[sync] Grupo Rino nos encargó la tarea ${taskId} ("${titulo}") para ${u.rows[0].full_name}`);

  try {
    const { createCustomNotification } = await import('./notificationController');
    await createCustomNotification(
      asignado, '📥 Nueva tarea de Grupo Rino', titulo,
      'info', 'clipboard', { screen: 'Tasks', taskId }, '/tareas'
    );
    const { sendPushToUsers } = await import('./pushService');
    await sendPushToUsers([asignado], {
      title: '📥 Nueva tarea de Grupo Rino', body: titulo,
      data: { screen: 'Tasks', taskId: String(taskId) },
      notificationType: 'task_assigned',
    });
  } catch (e: any) { console.warn('[sync] no se pudo avisar la tarea de Rino:', e?.message); }

  return { ok: true, task_id: taskId, assignee: u.rows[0].full_name, board: 'Grupo Rino' };
}
