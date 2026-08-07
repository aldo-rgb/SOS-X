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
  ensureSyncSchema, verifySignature, verifyInboundApiKey, EXTERNAL_APP, isPeerConfigured,
} from './syncService';
import { applyInboundTaskEvent } from './tasksController';

// Middleware de verificación común (API key + firma HMAC del rawBody).
function verifyRequest(req: Request, res: Response): boolean {
  const key = req.header('X-EntregaX-Key') || req.header('x-entregax-key') || undefined;
  const sig = req.header('X-Signature') || req.header('x-signature') || undefined;
  if (!verifyInboundApiKey(key)) { res.status(401).json({ error: 'API key inválida' }); return false; }
  if (!verifySignature((req as any).rawBody, sig)) { res.status(401).json({ error: 'Firma inválida' }); return false; }
  return true;
}

// POST /api/sync/users/upsert
// Body: { users: [{ external_id*, full_name*, email?, role?, active? }] }
// Crea/actualiza cada usuario externo como fila en `users` (source_app=grupo_rino).
// Estos usuarios NO pueden iniciar sesión en nuestro sistema (password no usable).
export const upsertExternalUsers = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSyncSchema();
    if (!verifyRequest(req, res)) return;
    const body = (req as any).rawBody ? JSON.parse((req as any).rawBody.toString('utf8')) : (req.body || {});
    const list: any[] = Array.isArray(body.users) ? body.users : (body.user ? [body.user] : []);
    if (list.length === 0) return res.status(400).json({ error: 'Falta el arreglo users' });

    const results: Array<{ external_id: string; local_id: number; action: string }> = [];
    for (const u of list) {
      const externalId = String(u.external_id ?? u.id ?? '').trim();
      if (!externalId) continue;
      const fullName = String(u.full_name ?? u.name ?? 'Usuario Grupo Rino').trim();
      const email = String(u.email ?? `rino-${externalId}@grupo-rino.ext`).trim().toLowerCase();
      const externalRole = u.role ? String(u.role) : null;
      const active = u.active === undefined ? true : !!u.active;
      const boxId = `RINO-${externalId}`;
      // Password no usable (no es bcrypt → login imposible).
      const noLogin = 'external:' + crypto.randomBytes(24).toString('hex');

      const existing = await pool.query(
        `SELECT id FROM users WHERE source_app=$1 AND external_id=$2 LIMIT 1`, [EXTERNAL_APP, externalId]);
      if (existing.rows[0]) {
        await pool.query(
          `UPDATE users SET full_name=$1, external_role=$2, is_active=$3, updated_at=NOW() WHERE id=$4`,
          [fullName, externalRole, active, existing.rows[0].id]);
        results.push({ external_id: externalId, local_id: existing.rows[0].id, action: 'updated' });
      } else {
        // role='external_partner' para que aparezca en asignables (role<>'client').
        const ins = await pool.query(
          `INSERT INTO users (full_name, email, password, box_id, role, is_active, source_app, external_id, external_role, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'external_partner',$5,$6,$7,$8,NOW(),NOW())
           ON CONFLICT (email) DO UPDATE SET
             full_name=EXCLUDED.full_name, source_app=EXCLUDED.source_app,
             external_id=EXCLUDED.external_id, external_role=EXCLUDED.external_role,
             is_active=EXCLUDED.is_active, updated_at=NOW()
           RETURNING id`,
          [fullName, email, noLogin, boxId, active, EXTERNAL_APP, externalId, externalRole]);
        results.push({ external_id: externalId, local_id: ins.rows[0].id, action: 'created' });
      }
    }
    res.json({ ok: true, count: results.length, users: results });
  } catch (e: any) {
    console.error('[sync] upsertExternalUsers:', e); res.status(500).json({ error: 'Error al procesar usuarios', detail: e?.message });
  }
};

// POST /api/webhooks/entregax
// Body: { event, occurred_at, source_app, data:{ task:{ id/external_id, ... }, actor_external_id?, comment? } }
// Idempotencia por X-Event-Id (sync_inbox). Aplica el cambio en nuestra tarea
// SIN re-emitir (evita bucle). El actor se mapea por external_id → id local.
export const inboundWebhook = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSyncSchema();
    if (!verifyRequest(req, res)) return;
    const eventId = req.header('X-Event-Id') || req.header('x-event-id') || '';
    if (!eventId) return res.status(400).json({ error: 'Falta X-Event-Id' });

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

    // Mapear el actor externo → usuario local.
    let actorLocalId: number | null = null;
    const actorExternal = data.actor_external_id ?? data.actor_id ?? task.assignee_external_id;
    if (actorExternal != null) {
      const a = await pool.query(
        `SELECT id FROM users WHERE source_app=$1 AND external_id=$2 LIMIT 1`, [EXTERNAL_APP, String(actorExternal)]);
      actorLocalId = a.rows[0]?.id || null;
    }

    if (event.startsWith('task.')) {
      const r = await applyInboundTaskEvent({
        taskId: localTaskId, event, actorId: actorLocalId, body: data.comment || data,
      });
      if (!r.ok) return res.status(422).json({ error: r.error || 'No se pudo aplicar' });
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
