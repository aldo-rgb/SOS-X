// chatController.ts — Chat interno entre staff (admin/operativos/repartidores/asesores).
// MVP REST: socket.io se acopla por separado en index.ts y reutiliza los helpers
// de notificación (notifyMessage / notifyTyping / notifyRead) para emitir eventos
// en tiempo real cuando estén conectados.
import { Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';
import { uploadToS3, getSignedUrlForKey, extractKeyFromUrl } from './s3Service';
import { sendPushToUsers } from './pushService';

// El socket.io server se inyecta desde index.ts una vez inicializado.
let socketEmitter: ((event: string, payload: any, room: string) => void) | null = null;
export const setChatSocketEmitter = (emitter: typeof socketEmitter) => {
  socketEmitter = emitter;
};

// ===================================================================
// Helpers internos
// ===================================================================

const STAFF_ROLES = [
  'super_admin', 'admin', 'director', 'branch_manager', 'customer_service',
  'operaciones', 'counter_staff', 'warehouse_ops', 'repartidor',
  'accountant', 'abogado', 'monitoreo', 'advisor', 'asesor', 'asesor_lider', 'sub_advisor'
];

// Roles que un usuario puede ver al crear un nuevo chat,
// según su propio rol. Si el rol no está en este mapa, ve todo el staff.
const VISIBLE_ROLES_FOR: Record<string, string[]> = {
  monitoreo: ['super_admin', 'admin', 'director', 'branch_manager',
              'operaciones', 'counter_staff', 'warehouse_ops', 'monitoreo'],
  repartidor: ['super_admin', 'admin', 'director', 'branch_manager',
               'operaciones', 'counter_staff', 'warehouse_ops', 'monitoreo', 'repartidor'],
};

// Grupos automáticos por rol — se mantienen sincronizados en cada listConversations
const AUTO_ROLE_GROUPS: { key: string; title: string; roles: string[] }[] = [
  { key: 'role:monitoreo', title: 'Monitoreo',
    roles: ['monitoreo', 'super_admin', 'admin', 'director', 'operaciones'] },
  { key: 'role:repartidores', title: 'Repartidores',
    roles: ['repartidor', 'super_admin', 'admin', 'director', 'branch_manager'] },
  { key: 'role:operaciones', title: 'Operaciones',
    roles: ['operaciones', 'counter_staff', 'warehouse_ops', 'branch_manager',
            'super_admin', 'admin', 'director'] },
  { key: 'role:gerentes', title: 'Gerentes y Dirección',
    roles: ['super_admin', 'admin', 'director', 'branch_manager'] },
];

const isSuperAdmin = (role: string) => String(role).toLowerCase() === 'super_admin';
const isAdminOrAbove = (role: string) => ['super_admin', 'admin', 'director'].includes(String(role).toLowerCase());

/**
 * Asegura que existan los grupos automáticos por rol y que el usuario esté
 * agregado al grupo correspondiente a su rol (idempotente, barato de llamar).
 */
async function ensureAutoRoleGroupsForUser(userId: number, role: string): Promise<void> {
  const userRole = String(role || '').toLowerCase();
  for (const g of AUTO_ROLE_GROUPS) {
    if (!g.roles.includes(userRole)) continue;
    let conv = await pool.query(
      `SELECT id FROM chat_conversations WHERE auto_group_key = $1 LIMIT 1`,
      [g.key]
    );
    let conversationId: number;
    if (conv.rows.length === 0) {
      const ins = await pool.query(
        `INSERT INTO chat_conversations (type, title, auto_group_key, created_by)
         VALUES ('group', $1, $2, $3) RETURNING id`,
        [g.title, g.key, userId]
      );
      conversationId = ins.rows[0].id;
    } else {
      conversationId = conv.rows[0].id;
    }
    await pool.query(
      `INSERT INTO chat_participants (conversation_id, user_id, role)
       VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [conversationId, userId]
    );
  }
}

async function isParticipant(conversationId: number, userId: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM chat_participants
     WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [conversationId, userId]
  );
  return (r.rowCount ?? 0) > 0;
}

async function getActiveParticipantIds(conversationId: number): Promise<number[]> {
  const r = await pool.query(
    `SELECT user_id FROM chat_participants
     WHERE conversation_id = $1 AND left_at IS NULL`,
    [conversationId]
  );
  return r.rows.map((row) => row.user_id);
}

async function resolveAttachmentUrl(s3Key: string): Promise<string> {
  try {
    return await getSignedUrlForKey(s3Key, 3600);
  } catch {
    return '';
  }
}

// ===================================================================
// 1) Listar conversaciones del usuario (con previa última mensaje + unread)
// ===================================================================
export const listConversations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role || '';
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    // Asegurar que el usuario pertenezca a sus grupos automáticos por rol
    try { await ensureAutoRoleGroupsForUser(userId, userRole); } catch (e) {
      console.warn('[chat] ensureAutoRoleGroupsForUser:', (e as any)?.message);
    }

    const result = await pool.query(
      `SELECT c.id, c.type, c.title, c.description, c.avatar_url,
              c.branch_id, c.auto_group_key, c.is_archived,
              c.last_message_at, c.last_message_preview,
              cp.is_muted, cp.last_read_message_id,
              (SELECT COUNT(*)::int
                 FROM chat_messages m
                WHERE m.conversation_id = c.id
                  AND m.deleted_at IS NULL
                  AND m.sender_id <> $1
                  AND (cp.last_read_message_id IS NULL OR m.id > cp.last_read_message_id)) AS unread_count
         FROM chat_conversations c
         JOIN chat_participants cp ON cp.conversation_id = c.id
        WHERE cp.user_id = $1 AND cp.left_at IS NULL
        ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
      [userId]
    );

    // Para conversaciones directas, traer al "otro" usuario para mostrar nombre/foto
    const conversations = await Promise.all(result.rows.map(async (c: any) => {
      let otherUser = null;
      if (c.type === 'direct') {
        const o = await pool.query(
          `SELECT u.id, u.full_name, u.email, u.role, u.profile_photo_url
             FROM chat_participants cp
             JOIN users u ON u.id = cp.user_id
            WHERE cp.conversation_id = $1 AND cp.user_id <> $2 AND cp.left_at IS NULL
            LIMIT 1`,
          [c.id, userId]
        );
        if (o.rows[0]) otherUser = o.rows[0];
      }
      return { ...c, other_user: otherUser };
    }));

    res.json({ conversations });
  } catch (error: any) {
    console.error('[chat] listConversations:', error);
    res.status(500).json({ error: 'Error al listar conversaciones' });
  }
};

// ===================================================================
// 2) Crear conversación (directo o grupo)
// ===================================================================
export const createConversation = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const { type, title, description, participant_ids } = req.body as {
      type: 'direct' | 'group';
      title?: string;
      description?: string;
      participant_ids: number[];
    };

    if (!['direct', 'group'].includes(type)) {
      return res.status(400).json({ error: 'type inválido' });
    }
    if (!Array.isArray(participant_ids) || participant_ids.length === 0) {
      return res.status(400).json({ error: 'participant_ids requerido' });
    }
    if (type === 'group' && !title) {
      return res.status(400).json({ error: 'title requerido para grupos' });
    }

    // Asegurar que el creador esté incluido
    const allIds = Array.from(new Set([userId, ...participant_ids.map(Number)])).filter(Boolean);

    // Validar que todos sean staff (no clientes)
    const usersCheck = await client.query(
      `SELECT id, role FROM users WHERE id = ANY($1::int[])`,
      [allIds]
    );
    if (usersCheck.rows.length !== allIds.length) {
      return res.status(400).json({ error: 'Algún usuario no existe' });
    }
    const nonStaff = usersCheck.rows.filter((u) => !STAFF_ROLES.includes(String(u.role).toLowerCase()));
    if (nonStaff.length > 0) {
      return res.status(403).json({ error: 'Solo staff puede participar en chat interno' });
    }

    // Para directos: si ya existe la conversación entre estos 2, devolver la existente
    if (type === 'direct') {
      if (allIds.length !== 2) {
        return res.status(400).json({ error: 'Conversación directa requiere exactamente 2 usuarios' });
      }
      const existing = await client.query(
        `SELECT c.id FROM chat_conversations c
          WHERE c.type = 'direct'
            AND (SELECT COUNT(*) FROM chat_participants cp
                  WHERE cp.conversation_id = c.id
                    AND cp.user_id = ANY($1::int[])
                    AND cp.left_at IS NULL) = 2
            AND (SELECT COUNT(*) FROM chat_participants cp
                  WHERE cp.conversation_id = c.id AND cp.left_at IS NULL) = 2
          LIMIT 1`,
        [allIds]
      );
      if (existing.rows[0]) {
        return res.json({ conversation_id: existing.rows[0].id, reused: true });
      }
    }

    await client.query('BEGIN');
    const conv = await client.query(
      `INSERT INTO chat_conversations (type, title, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [type, title || null, description || null, userId]
    );
    const conversationId = conv.rows[0].id;

    for (const uid of allIds) {
      const role = uid === userId ? 'owner' : 'member';
      await client.query(
        `INSERT INTO chat_participants (conversation_id, user_id, role)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [conversationId, uid, role]
      );
    }

    // Mensaje de sistema inicial para grupos
    if (type === 'group') {
      await client.query(
        `INSERT INTO chat_messages (conversation_id, sender_id, body, message_type)
         VALUES ($1, $2, $3, 'system')`,
        [conversationId, userId, 'Grupo creado']
      );
    }

    await client.query('COMMIT');
    res.json({ conversation_id: conversationId, reused: false });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[chat] createConversation:', error);
    res.status(500).json({ error: 'Error al crear conversación' });
  } finally {
    client.release();
  }
};

// ===================================================================
// 3) Listar mensajes de una conversación (paginado por before_id)
// ===================================================================
export const listMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const conversationId = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const beforeId = req.query.before_id ? Number(req.query.before_id) : null;

    // Permitir super_admin auditar; demás solo si es participante
    const role = String(req.user?.role || '').toLowerCase();
    const allowAudit = isSuperAdmin(role);
    if (!allowAudit) {
      const ok = await isParticipant(conversationId, userId);
      if (!ok) return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const params: any[] = [conversationId, limit];
    let where = 'WHERE m.conversation_id = $1 AND m.deleted_at IS NULL';
    if (beforeId) {
      params.push(beforeId);
      where += ` AND m.id < $${params.length}`;
    }

    const r = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.message_type,
              m.reply_to_id, m.edited_at, m.metadata, m.created_at,
              u.full_name AS sender_name, u.profile_photo_url AS sender_photo, u.role AS sender_role
         FROM chat_messages m
         LEFT JOIN users u ON u.id = m.sender_id
         ${where}
         ORDER BY m.id DESC
         LIMIT $2`,
      params
    );

    // Adjuntos
    const ids = r.rows.map((x) => x.id);
    let attachments: any[] = [];
    if (ids.length > 0) {
      const a = await pool.query(
        `SELECT id, message_id, s3_key, file_name, mime_type, size_bytes,
                width, height, duration_ms
           FROM chat_message_attachments
          WHERE message_id = ANY($1::bigint[])`,
        [ids]
      );
      attachments = await Promise.all(a.rows.map(async (att: any) => ({
        ...att,
        url: await resolveAttachmentUrl(att.s3_key),
      })));
    }

    const messages = r.rows.reverse().map((m: any) => ({
      ...m,
      attachments: attachments.filter((a) => Number(a.message_id) === Number(m.id)),
    }));

    res.json({ messages });
  } catch (error: any) {
    console.error('[chat] listMessages:', error);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
};

// ===================================================================
// 4) Enviar mensaje (texto + adjuntos opcionales por multipart)
// ===================================================================
export const sendMessage = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const conversationId = Number(req.params.id);
    const body: string | undefined = req.body?.body;
    const messageType: string = req.body?.message_type || 'text';
    const replyToId = req.body?.reply_to_id ? Number(req.body.reply_to_id) : null;

    const ok = await isParticipant(conversationId, userId);
    if (!ok) return res.status(403).json({ error: 'No eres participante' });

    const files = (req as any).files as Express.Multer.File[] | undefined;
    if ((!body || !body.trim()) && (!files || files.length === 0)) {
      return res.status(400).json({ error: 'Mensaje vacío' });
    }

    await client.query('BEGIN');
    const finalType = files && files.length > 0
      ? ((): string => {
          const mt = files[0]!.mimetype;
          if (mt.startsWith('image/')) return 'image';
          if (mt.startsWith('audio/')) return 'audio';
          if (mt.startsWith('video/')) return 'video';
          return 'file';
        })()
      : (messageType || 'text');

    const insert = await client.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, body, message_type, reply_to_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [conversationId, userId, body || null, finalType, replyToId]
    );
    const messageId: number = insert.rows[0].id;

    const savedAttachments: any[] = [];
    if (files && files.length > 0) {
      for (const f of files) {
        const safeName = f.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `chat/${conversationId}/${messageId}/${Date.now()}_${safeName}`;
        await uploadToS3(f.buffer, key, f.mimetype);
        const a = await client.query(
          `INSERT INTO chat_message_attachments
             (message_id, s3_key, file_name, mime_type, size_bytes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, s3_key, file_name, mime_type, size_bytes`,
          [messageId, key, f.originalname, f.mimetype, f.size]
        );
        savedAttachments.push(a.rows[0]);
      }
    }

    await client.query('COMMIT');

    // Marcar como leído por el remitente
    await pool.query(
      `UPDATE chat_participants SET last_read_message_id = $1
        WHERE conversation_id = $2 AND user_id = $3`,
      [messageId, conversationId, userId]
    );

    // Hidratar para devolver
    const sender = await pool.query(
      `SELECT full_name, profile_photo_url, role FROM users WHERE id = $1`,
      [userId]
    );
    const attachments = await Promise.all(savedAttachments.map(async (a) => ({
      ...a,
      url: await resolveAttachmentUrl(a.s3_key),
    })));
    const fullMessage = {
      id: messageId,
      conversation_id: conversationId,
      sender_id: userId,
      body: body || null,
      message_type: finalType,
      reply_to_id: replyToId,
      created_at: insert.rows[0].created_at,
      sender_name: sender.rows[0]?.full_name,
      sender_photo: sender.rows[0]?.profile_photo_url,
      sender_role: sender.rows[0]?.role,
      attachments,
    };

    // Emitir por socket.io a todos los participantes
    if (socketEmitter) {
      socketEmitter('message:new', fullMessage, `conversation:${conversationId}`);
    }

    // Push notifications a participantes que NO son el remitente
    const participantIds = await getActiveParticipantIds(conversationId);
    const recipients = participantIds.filter((id) => id !== userId);
    if (recipients.length > 0) {
      const preview = body && body.trim() ? body.slice(0, 200) : '📎 Adjunto';
      const senderName = sender.rows[0]?.full_name || 'Mensaje';
      sendPushToUsers(recipients, {
        title: senderName,
        body: preview,
        data: {
          type: 'chat_message',
          conversation_id: String(conversationId),
          message_id: String(messageId),
        },
      }).catch((err: any) => console.error('[chat] push:', err.message));
    }

    res.status(201).json({ message: fullMessage });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[chat] sendMessage:', error);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  } finally {
    client.release();
  }
};

// ===================================================================
// 5) Marcar conversación como leída
// ===================================================================
export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const conversationId = Number(req.params.id);
    const messageId = req.body?.message_id ? Number(req.body.message_id) : null;

    const ok = await isParticipant(conversationId, userId);
    if (!ok) return res.status(403).json({ error: 'No eres participante' });

    let target = messageId;
    if (!target) {
      const r = await pool.query(
        `SELECT MAX(id) AS max_id FROM chat_messages WHERE conversation_id = $1`,
        [conversationId]
      );
      target = Number(r.rows[0]?.max_id || 0);
    }

    await pool.query(
      `UPDATE chat_participants SET last_read_message_id = $1
        WHERE conversation_id = $2 AND user_id = $3`,
      [target, conversationId, userId]
    );

    if (socketEmitter) {
      socketEmitter('message:read', {
        conversation_id: conversationId,
        user_id: userId,
        last_read_message_id: target,
      }, `conversation:${conversationId}`);
    }

    res.json({ ok: true, last_read_message_id: target });
  } catch (error: any) {
    console.error('[chat] markAsRead:', error);
    res.status(500).json({ error: 'Error al marcar como leído' });
  }
};

// ===================================================================
// 5b) Listar participantes de una conversación
// ===================================================================
export const listParticipants = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const conversationId = parseInt(String(req.params.id || ''), 10);
    if (!conversationId) return res.status(400).json({ error: 'ID inválido' });

    // Verificar acceso (que sea participante)
    const access = await pool.query(
      `SELECT 1 FROM chat_participants
        WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [conversationId, userId]
    );
    if (access.rows.length === 0) {
      const role = String(req.user?.role || '').toLowerCase();
      if (!isSuperAdmin(role)) return res.status(403).json({ error: 'Sin acceso' });
    }

    const conv = await pool.query(
      `SELECT id, type, title, description, avatar_url, auto_group_key, branch_id
         FROM chat_conversations WHERE id = $1`,
      [conversationId]
    );
    if (conv.rows.length === 0) return res.status(404).json({ error: 'No existe' });

    const r = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.profile_photo_url,
              u.branch_id, b.name AS branch_name,
              cp.role AS participant_role, cp.joined_at, cp.is_muted
         FROM chat_participants cp
         JOIN users u ON u.id = cp.user_id
         LEFT JOIN branches b ON b.id = u.branch_id
        WHERE cp.conversation_id = $1 AND cp.left_at IS NULL
        ORDER BY (cp.role = 'admin') DESC, u.full_name ASC`,
      [conversationId]
    );

    res.json({ conversation: conv.rows[0], participants: r.rows });
  } catch (error: any) {
    console.error('[chat] listParticipants:', error);
    res.status(500).json({ error: 'Error al listar participantes' });
  }
};

// ===================================================================
// 6) Buscar staff (para iniciar nuevo chat)
// ===================================================================
export const searchStaff = async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const requesterRole = String(req.user?.role || '').toLowerCase();
    const requesterId = req.user?.userId || 0;
    // Si el rol del solicitante tiene un filtro restringido, usarlo;
    // de lo contrario, ve todo el staff.
    const allowedRoles = VISIBLE_ROLES_FOR[requesterRole] || STAFF_ROLES;
    const r = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.profile_photo_url,
              u.branch_id, b.name AS branch_name
         FROM users u
         LEFT JOIN branches b ON b.id = u.branch_id
        WHERE u.role = ANY($1::text[])
          AND (u.is_blocked IS NULL OR u.is_blocked = FALSE)
          AND u.id <> $2
          AND ($3 = '' OR u.full_name ILIKE '%' || $3 || '%' OR u.email ILIKE '%' || $3 || '%')
        ORDER BY u.role, u.full_name
        LIMIT 100`,
      [allowedRoles, requesterId, q]
    );
    res.json({ users: r.rows });
  } catch (error: any) {
    console.error('[chat] searchStaff:', error);
    res.status(500).json({ error: 'Error al buscar' });
  }
};

// ===================================================================
// 7) Auditoría — solo super_admin: listar TODAS las conversaciones
// ===================================================================
export const auditAllConversations = async (req: AuthRequest, res: Response) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!isSuperAdmin(role)) return res.status(403).json({ error: 'Solo super_admin' });

    const r = await pool.query(
      `SELECT c.id, c.type, c.title, c.last_message_at, c.last_message_preview,
              (SELECT COUNT(*)::int FROM chat_participants p WHERE p.conversation_id = c.id AND p.left_at IS NULL) AS members,
              (SELECT COUNT(*)::int FROM chat_messages m WHERE m.conversation_id = c.id) AS message_count
         FROM chat_conversations c
        ORDER BY c.last_message_at DESC NULLS LAST
        LIMIT 500`
    );
    res.json({ conversations: r.rows });
  } catch (error: any) {
    console.error('[chat] auditAllConversations:', error);
    res.status(500).json({ error: 'Error de auditoría' });
  }
};

// ===================================================================
// 8) Registro de push tokens (FCM)
// ===================================================================
export const registerPushToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const { token, platform, device_id, device_name, app_version } = req.body || {};
    if (!token || !platform) return res.status(400).json({ error: 'token y platform requeridos' });
    if (!['ios', 'android', 'web'].includes(String(platform))) {
      return res.status(400).json({ error: 'platform inválido' });
    }

    await pool.query(
      `INSERT INTO user_push_tokens (user_id, token, platform, device_id, device_name, app_version)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, token) DO UPDATE
         SET is_active = TRUE,
             last_seen_at = NOW(),
             platform = EXCLUDED.platform,
             device_id = EXCLUDED.device_id,
             device_name = EXCLUDED.device_name,
             app_version = EXCLUDED.app_version`,
      [userId, token, platform, device_id || null, device_name || null, app_version || null]
    );

    res.json({ ok: true });
  } catch (error: any) {
    console.error('[chat] registerPushToken:', error);
    res.status(500).json({ error: 'Error al registrar token' });
  }
};

export const unregisterPushToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token requerido' });

    await pool.query(
      `UPDATE user_push_tokens SET is_active = FALSE
        WHERE user_id = $1 AND token = $2`,
      [userId, token]
    );
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[chat] unregisterPushToken:', error);
    res.status(500).json({ error: 'Error al desregistrar token' });
  }
};

// ===================================================================
// 9) Auto-creación / sincronización de grupos por sucursal y rol
// ===================================================================
export const syncAutoGroups = async (req: AuthRequest, res: Response) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!isAdminOrAbove(role)) return res.status(403).json({ error: 'No autorizado' });

    // 1) Grupo por sucursal: todos los empleados de la sucursal
    const branches = await pool.query(`SELECT id, name FROM branches WHERE is_active IS NOT FALSE`);
    let createdGroups = 0;
    let addedMembers = 0;

    for (const b of branches.rows) {
      const key = `branch:${b.id}`;
      let conv = await pool.query(
        `SELECT id FROM chat_conversations WHERE auto_group_key = $1 LIMIT 1`,
        [key]
      );
      let conversationId: number;
      if (conv.rows.length === 0) {
        const ins = await pool.query(
          `INSERT INTO chat_conversations (type, title, auto_group_key, branch_id, created_by)
           VALUES ('group', $1, $2, $3, $4) RETURNING id`,
          [`Sucursal ${b.name}`, key, b.id, req.user?.userId || null]
        );
        conversationId = ins.rows[0].id;
        createdGroups++;
      } else {
        conversationId = conv.rows[0].id;
      }

      // Agregar a todos los empleados activos de esa sucursal
      const employees = await pool.query(
        `SELECT id FROM users WHERE branch_id = $1 AND role = ANY($2::text[]) AND (is_blocked IS NULL OR is_blocked = FALSE)`,
        [b.id, STAFF_ROLES]
      );
      for (const e of employees.rows) {
        const r = await pool.query(
          `INSERT INTO chat_participants (conversation_id, user_id, role)
           VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
          [conversationId, e.id]
        );
        if (r.rowCount && r.rowCount > 0) addedMembers++;
      }
    }

    // 2) Grupos por rol (mismos que ensureAutoRoleGroupsForUser usa, lazily)
    for (const g of AUTO_ROLE_GROUPS) {
      let conv = await pool.query(
        `SELECT id FROM chat_conversations WHERE auto_group_key = $1 LIMIT 1`,
        [g.key]
      );
      let conversationId: number;
      if (conv.rows.length === 0) {
        const ins = await pool.query(
          `INSERT INTO chat_conversations (type, title, auto_group_key, created_by)
           VALUES ('group', $1, $2, $3) RETURNING id`,
          [g.title, g.key, req.user?.userId || null]
        );
        conversationId = ins.rows[0].id;
        createdGroups++;
      } else {
        conversationId = conv.rows[0].id;
      }
      const users = await pool.query(
        `SELECT id FROM users WHERE role = ANY($1::text[]) AND (is_blocked IS NULL OR is_blocked = FALSE)`,
        [g.roles]
      );
      for (const u of users.rows) {
        const r = await pool.query(
          `INSERT INTO chat_participants (conversation_id, user_id, role)
           VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
          [conversationId, u.id]
        );
        if (r.rowCount && r.rowCount > 0) addedMembers++;
      }
    }

    res.json({ ok: true, createdGroups, addedMembers });
  } catch (error: any) {
    console.error('[chat] syncAutoGroups:', error);
    res.status(500).json({ error: 'Error sincronizando grupos' });
  }
};
