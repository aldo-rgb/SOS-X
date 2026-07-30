// ============================================================
// MÓDULO TAREAS (EntregaX) — Fase 1 · controlador
// Capa de responsabilidad estilo Asana conectada a la operación.
// Gestión: super_admin / admin / director (+ líder dentro de su tablero).
// Asignado: ve y cierra lo suyo, palomea checklist, comenta.
// Ver propuestas/tareas-diseno.html.
// ============================================================
import { Request, Response } from 'express';
import { pool } from './db';

const authUserId = (req: Request): number | null => {
  const u = (req as any).user;
  return Number(u?.userId ?? u?.id) || null;
};
const authRole = (req: Request): string =>
  String((req as any).user?.role || '').toLowerCase();

const MANAGER_ROLES = ['super_admin', 'admin', 'director'];
const isManager = (req: Request): boolean => MANAGER_ROLES.includes(authRole(req));

const EISENHOWER = ['fuego', 'estrella', 'delegar', 'eliminar'];
const XPAY_SEGURO = ['verde', 'amarillo', 'rojo'];

// Bitácora inmutable (no crítica: si falla, no rompe la acción).
async function logActivity(taskId: number, actorId: number | null, action: string, meta: any = {}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO task_activity (task_id, actor_id, action, meta) VALUES ($1,$2,$3,$4::jsonb)`,
      [taskId, actorId, action, JSON.stringify(meta || {})]
    );
  } catch (e: any) { console.warn('[tasks] logActivity:', e?.message); }
}

async function notify(userId: number | null, title: string, message: string, data: any = {}): Promise<void> {
  if (!userId) return;
  try {
    const { createCustomNotification } = require('./notificationController');
    await createCustomNotification(userId, title, message, 'info', 'checkbox', data, '/tareas');
  } catch { /* opcional */ }
  try {
    const { sendPushToUsers } = await import('./pushService');
    await sendPushToUsers([userId], { title, body: message, data: { screen: 'MyTasks', ...data }, notificationType: 'task' });
  } catch { /* opcional */ }
}

// ¿Puede GESTIONAR este tablero? (manager global o líder del tablero)
async function canManageBoard(req: Request, boardId: number): Promise<boolean> {
  if (isManager(req)) return true;
  const uid = authUserId(req);
  if (!uid) return false;
  const r = await pool.query(`SELECT 1 FROM task_boards WHERE id = $1 AND lead_user_id = $2`, [boardId, uid]);
  return r.rows.length > 0;
}

// ─── TABLEROS ───────────────────────────────────────────────
export const listBoards = async (req: Request, res: Response): Promise<any> => {
  try {
    const uid = authUserId(req);
    // Manager ve todos; líder ve el operativo + los suyos.
    const boards = await pool.query(
      isManager(req)
        ? `SELECT b.*, u.full_name AS lead_name FROM task_boards b
             LEFT JOIN users u ON u.id = b.lead_user_id
            WHERE b.is_active = TRUE ORDER BY (b.board_type='operativo') DESC, b.id`
        : `SELECT b.*, u.full_name AS lead_name FROM task_boards b
             LEFT JOIN users u ON u.id = b.lead_user_id
            WHERE b.is_active = TRUE AND (b.board_type='operativo' OR b.lead_user_id = $1)
            ORDER BY (b.board_type='operativo') DESC, b.id`,
      isManager(req) ? [] : [uid]
    );
    const cols = await pool.query(`SELECT * FROM task_columns ORDER BY board_id, sort_order`);
    const byBoard: Record<number, any[]> = {};
    for (const c of cols.rows) (byBoard[c.board_id] ||= []).push(c);
    res.json({ boards: boards.rows.map((b: any) => ({ ...b, columns: byBoard[b.id] || [] })) });
  } catch (e: any) {
    console.error('[tasks] listBoards:', e); res.status(500).json({ error: 'Error al listar tableros' });
  }
};

// ─── TABLEROS: crear (departamento con flujo Nueva→Proceso→Terminado) ──
export const createBoard = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Solo gerencia puede crear tableros' });
    const uid = authUserId(req);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'El nombre del tablero es obligatorio' });
    const leadId = req.body?.lead_user_id ? parseInt(String(req.body.lead_user_id)) : null;
    // board_type 'department': flujo simple con control de tiempo.
    const bRes = await pool.query(
      `INSERT INTO task_boards (board_key, name, board_type, lead_user_id, created_by)
       VALUES (NULL, $1, 'department', $2, $3) RETURNING *`,
      [name, leadId, uid]
    );
    const board = bRes.rows[0];
    // Columnas por defecto del flujo de departamento.
    const cols = [
      { key: 'nueva',      name: '📥 Nueva tarea', ord: 1, color: '#1D6FB8', done: false },
      { key: 'en_proceso', name: '⚙️ En proceso',  ord: 2, color: '#B07206', done: false },
      { key: 'terminado',  name: '✅ Terminado',   ord: 3, color: '#2E7D46', done: true  },
    ];
    for (const c of cols) {
      await pool.query(
        `INSERT INTO task_columns (board_id, col_key, name, sort_order, color, is_done)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [board.id, c.key, c.name, c.ord, c.color, c.done]
      );
    }
    const colRows = await pool.query(`SELECT * FROM task_columns WHERE board_id = $1 ORDER BY sort_order`, [board.id]);
    res.json({ board: { ...board, columns: colRows.rows } });
  } catch (e: any) {
    console.error('[tasks] createBoard:', e); res.status(500).json({ error: 'Error al crear tablero' });
  }
};

// ─── TABLEROS: eliminar (soft-delete). No el operativo. ─────
export const deleteBoard = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Solo gerencia puede eliminar tableros' });
    const id = parseInt(String(req.params.id));
    const b = await pool.query(`SELECT board_type FROM task_boards WHERE id = $1`, [id]);
    if (b.rows.length === 0) return res.status(404).json({ error: 'Tablero no encontrado' });
    if (b.rows[0].board_type === 'operativo') return res.status(400).json({ error: 'No se puede eliminar el tablero operativo' });
    await pool.query(`UPDATE task_boards SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (e: any) {
    console.error('[tasks] deleteBoard:', e); res.status(500).json({ error: 'Error al eliminar tablero' });
  }
};

// ─── TAREAS: lista de un tablero ────────────────────────────
export const listTasks = async (req: Request, res: Response): Promise<any> => {
  try {
    const boardId = parseInt(String(req.query.board_id || '')) || null;
    if (!boardId) return res.status(400).json({ error: 'board_id requerido' });
    const conds: string[] = ['t.board_id = $1']; const params: any[] = [boardId]; let i = 2;
    const { column_id, assignee_id, eisenhower, status } = req.query;
    if (column_id) { conds.push(`t.column_id = $${i++}`); params.push(column_id); }
    if (assignee_id) { conds.push(`t.assignee_id = $${i++}`); params.push(assignee_id); }
    if (eisenhower) { conds.push(`t.eisenhower = $${i++}`); params.push(eisenhower); }
    conds.push(status ? `t.status = $${i++}` : `t.status <> 'cancelled'`);
    if (status) params.push(status);

    const r = await pool.query(`
      SELECT t.*, u.full_name AS assignee_name,
             (SELECT COUNT(*) FROM task_subtasks s WHERE s.task_id = t.id)::int AS subtasks_total,
             (SELECT COUNT(*) FROM task_subtasks s WHERE s.task_id = t.id AND s.done)::int AS subtasks_done,
             (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id)::int AS comments,
             (t.due_at IS NOT NULL AND t.status='open' AND t.due_at < NOW()) AS overdue
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assignee_id
       WHERE ${conds.join(' AND ')}
       ORDER BY t.column_id, t.priority DESC, t.due_at NULLS LAST, t.id DESC`, params);
    res.json({ tasks: r.rows });
  } catch (e: any) {
    console.error('[tasks] listTasks:', e); res.status(500).json({ error: 'Error al listar tareas' });
  }
};

// ─── TAREAS: mis tareas (app) ───────────────────────────────
export const myTasks = async (req: Request, res: Response): Promise<any> => {
  try {
    const uid = authUserId(req);
    if (!uid) return res.status(401).json({ error: 'No autenticado' });
    const r = await pool.query(`
      SELECT t.*, b.name AS board_name, col.name AS column_name,
             (SELECT COUNT(*) FROM task_subtasks s WHERE s.task_id = t.id)::int AS subtasks_total,
             (SELECT COUNT(*) FROM task_subtasks s WHERE s.task_id = t.id AND s.done)::int AS subtasks_done,
             (t.due_at IS NOT NULL AND t.status='open' AND t.due_at < NOW()) AS overdue
        FROM tasks t
        JOIN task_boards b ON b.id = t.board_id
        LEFT JOIN task_columns col ON col.id = t.column_id
       WHERE t.assignee_id = $1 AND t.status = 'open'
       ORDER BY (t.eisenhower='fuego') DESC, t.due_at NULLS LAST, t.id DESC`, [uid]);
    res.json({ tasks: r.rows });
  } catch (e: any) {
    console.error('[tasks] myTasks:', e); res.status(500).json({ error: 'Error al obtener mis tareas' });
  }
};

// ─── TAREAS: detalle ────────────────────────────────────────
export const getTask = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id));
    const t = await pool.query(`
      SELECT t.*, u.full_name AS assignee_name, cu.full_name AS created_by_name,
             fc.full_name AS forced_close_name, col.name AS column_name
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assignee_id
        LEFT JOIN users cu ON cu.id = t.created_by
        LEFT JOIN users fc ON fc.id = t.forced_close_by
        LEFT JOIN task_columns col ON col.id = t.column_id
       WHERE t.id = $1`, [id]);
    if (t.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    const subs = await pool.query(
      `SELECT s.*, u.full_name AS done_by_name, au.full_name AS assignee_name
         FROM task_subtasks s LEFT JOIN users u ON u.id = s.done_by
         LEFT JOIN users au ON au.id = s.assignee_id
        WHERE s.task_id = $1 ORDER BY s.sort_order, s.id`, [id]);
    const comments = await pool.query(
      `SELECT c.*, u.full_name AS author_name FROM task_comments c
         LEFT JOIN users u ON u.id = c.author_id WHERE c.task_id = $1 ORDER BY c.created_at ASC`, [id]);
    const activity = await pool.query(
      `SELECT a.*, u.full_name AS actor_name FROM task_activity a
         LEFT JOIN users u ON u.id = a.actor_id WHERE a.task_id = $1 ORDER BY a.created_at DESC LIMIT 50`, [id]);
    res.json({ task: t.rows[0], subtasks: subs.rows, comments: comments.rows, activity: activity.rows });
  } catch (e: any) {
    console.error('[tasks] getTask:', e); res.status(500).json({ error: 'Error al obtener tarea' });
  }
};

// ─── TAREAS: crear ──────────────────────────────────────────
export const createTask = async (req: Request, res: Response): Promise<any> => {
  try {
    const uid = authUserId(req);
    const b = req.body || {};
    const boardId = parseInt(String(b.board_id));
    if (!boardId) return res.status(400).json({ error: 'board_id requerido' });
    if (!(await canManageBoard(req, boardId))) return res.status(403).json({ error: 'Sin permiso para este tablero' });
    if (!String(b.title || '').trim()) return res.status(400).json({ error: 'El título es obligatorio (usa un verbo de acción)' });
    const eisenhower = EISENHOWER.includes(b.eisenhower) ? b.eisenhower : null;
    if (!eisenhower) return res.status(400).json({ error: 'La categoría (Matriz de Prioridad) es obligatoria' });
    // Columna inicial: la indicada, o la primera del tablero.
    let columnId = b.column_id ? parseInt(String(b.column_id)) : null;
    if (!columnId) {
      const c = await pool.query(`SELECT id FROM task_columns WHERE board_id = $1 ORDER BY sort_order LIMIT 1`, [boardId]);
      columnId = c.rows[0]?.id || null;
    }
    const r = await pool.query(`
      INSERT INTO tasks (board_id, column_id, title, description, assignee_id, due_at, eisenhower,
                         xpay_seguro, linked_type, linked_id, priority, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [boardId, columnId, String(b.title).trim(), b.description || null, b.assignee_id || null,
       b.due_at || null, eisenhower, XPAY_SEGURO.includes(b.xpay_seguro) ? b.xpay_seguro : null,
       b.linked_type || null, b.linked_id || null, parseInt(String(b.priority || 0)) || 0, uid]);
    const task = r.rows[0];
    // Subtareas (checklist) opcionales al crear.
    if (Array.isArray(b.subtasks)) {
      for (let k = 0; k < b.subtasks.length; k++) {
        const s = b.subtasks[k];
        if (!String(s?.body || '').trim()) continue;
        await pool.query(
          `INSERT INTO task_subtasks (task_id, body, requires_photo, assignee_id, sort_order)
           VALUES ($1,$2,$3,$4,$5)`,
          [task.id, String(s.body).trim(), !!s.requires_photo, s.assignee_id || null, k]);
      }
    }
    await logActivity(task.id, uid, 'created', { title: task.title });
    if (task.assignee_id) await notify(task.assignee_id, '📋 Nueva tarea asignada', task.title, { task_id: task.id });
    res.json({ task });
  } catch (e: any) {
    console.error('[tasks] createTask:', e); res.status(500).json({ error: 'Error al crear tarea' });
  }
};

// ─── TAREAS: actualizar (mover columna, reasignar, editar) ──
export const updateTask = async (req: Request, res: Response): Promise<any> => {
  try {
    const uid = authUserId(req);
    const id = parseInt(String(req.params.id));
    const cur = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    const task = cur.rows[0];
    const mgr = await canManageBoard(req, task.board_id);
    if (!mgr) return res.status(403).json({ error: 'Solo gerencia o el líder del tablero puede editar la tarea' });

    const b = req.body || {};
    const sets: string[] = []; const params: any[] = []; let i = 1;
    const set = (col: string, val: any) => { sets.push(`${col} = $${i++}`); params.push(val); };

    if (b.title !== undefined && String(b.title).trim()) set('title', String(b.title).trim());
    if (b.description !== undefined) set('description', b.description);
    if (b.assignee_id !== undefined) set('assignee_id', b.assignee_id || null);
    if (b.due_at !== undefined) set('due_at', b.due_at || null);
    if (b.eisenhower !== undefined && EISENHOWER.includes(b.eisenhower)) set('eisenhower', b.eisenhower);
    if (b.xpay_seguro !== undefined) set('xpay_seguro', XPAY_SEGURO.includes(b.xpay_seguro) ? b.xpay_seguro : null);
    if (b.linked_type !== undefined) set('linked_type', b.linked_type || null);
    if (b.linked_id !== undefined) set('linked_id', b.linked_id || null);
    if (b.priority !== undefined) set('priority', parseInt(String(b.priority)) || 0);

    // Mover de columna: si la columna DESTINO exige checklist para AVANZAR desde
    // el Filtro de Cierre, validar. (Regla: no avanzas de una columna con
    // gate_checklist sin completar el checklist.)
    if (b.column_id !== undefined && Number(b.column_id) !== Number(task.column_id)) {
      const fromCol = task.column_id
        ? (await pool.query(`SELECT gate_checklist, sort_order, is_done FROM task_columns WHERE id = $1`, [task.column_id])).rows[0]
        : null;
      const toCol = (await pool.query(`SELECT sort_order, is_done, auto_assign_role FROM task_columns WHERE id = $1`, [Number(b.column_id)])).rows[0];
      const advancing = fromCol && toCol && Number(toCol.sort_order) > Number(fromCol.sort_order);
      if (fromCol?.gate_checklist && advancing) {
        const pend = await pool.query(`SELECT COUNT(*)::int AS n FROM task_subtasks WHERE task_id = $1 AND done = FALSE`, [id]);
        if ((pend.rows[0]?.n || 0) > 0) {
          return res.status(400).json({ error: 'No puedes avanzar esta tarjeta sin completar el checklist del Filtro de Cierre.' });
        }
      }
      set('column_id', Number(b.column_id));
      // 🏁 Columna terminal (is_done): mover aquí CIERRA la tarea y sella el
      //    tiempo (completed_at). Sacarla de la columna terminal la reabre.
      if (toCol?.is_done && task.status !== 'completed') {
        set('status', 'completed');
        set('completed_at', new Date().toISOString());
        await logActivity(id, uid, 'completed', { via: 'move_to_done' });
      } else if (fromCol?.is_done && !toCol?.is_done && task.status === 'completed') {
        set('status', 'open');
        set('completed_at', null);
        await logActivity(id, uid, 'reopened', {});
      }
      // Auto-reasignación por ROL al entrar a la columna destino.
      const destRole = toCol?.auto_assign_role;
      if (destRole && b.assignee_id === undefined) {
        const cand = await pool.query(
          `SELECT id FROM users WHERE role = $1 AND COALESCE(is_active,true)=true ORDER BY id LIMIT 1`, [destRole]);
        if (cand.rows[0]) { set('assignee_id', cand.rows[0].id); }
      }
      await logActivity(id, uid, 'moved', { to_column: Number(b.column_id) });
    }

    if (sets.length === 0) return res.json({ task });
    set('updated_at', new Date().toISOString());
    params.push(id);
    const r = await pool.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
    const updated = r.rows[0];
    if (b.assignee_id !== undefined && Number(b.assignee_id) && Number(b.assignee_id) !== Number(task.assignee_id)) {
      await logActivity(id, uid, 'assigned', { assignee_id: updated.assignee_id });
      await notify(updated.assignee_id, '📋 Te asignaron una tarea', updated.title, { task_id: id });
    }
    res.json({ task: updated });
  } catch (e: any) {
    console.error('[tasks] updateTask:', e); res.status(500).json({ error: 'Error al actualizar tarea' });
  }
};

// ─── TAREAS: completar (con gate de checklist) ──────────────
export const completeTask = async (req: Request, res: Response): Promise<any> => {
  try {
    const uid = authUserId(req);
    const id = parseInt(String(req.params.id));
    const cur = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    const task = cur.rows[0];
    const mgr = await canManageBoard(req, task.board_id);
    // El asignado también puede cerrar SU tarea (si el checklist está completo).
    if (!mgr && Number(task.assignee_id) !== Number(uid)) {
      return res.status(403).json({ error: 'Solo el responsable o gerencia puede cerrar la tarea' });
    }
    const pend = await pool.query(`SELECT COUNT(*)::int AS n FROM task_subtasks WHERE task_id = $1 AND done = FALSE`, [id]);
    const pending = pend.rows[0]?.n || 0;
    if (pending > 0) {
      // Bloqueo: solo gerencia puede forzar, con motivo obligatorio.
      const reason = String(req.body?.forced_reason || '').trim();
      if (!mgr) return res.status(400).json({ error: `Faltan ${pending} subtarea(s) del checklist por completar.` });
      if (!reason) return res.status(400).json({ error: 'Para forzar el cierre con subtareas pendientes, indica el motivo.' });
      await pool.query(
        `UPDATE tasks SET status='completed', completed_at=NOW(), forced_close_by=$2, forced_reason=$3, updated_at=NOW() WHERE id=$1`,
        [id, uid, reason]);
      await logActivity(id, uid, 'forced_close', { pending, reason });
      return res.json({ success: true, forced: true });
    }
    await pool.query(`UPDATE tasks SET status='completed', completed_at=NOW(), updated_at=NOW() WHERE id=$1`, [id]);
    await logActivity(id, uid, 'completed', {});
    res.json({ success: true, forced: false });
  } catch (e: any) {
    console.error('[tasks] completeTask:', e); res.status(500).json({ error: 'Error al completar tarea' });
  }
};

export const deleteTask = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id));
    const cur = await pool.query(`SELECT board_id FROM tasks WHERE id = $1`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (!(await canManageBoard(req, cur.rows[0].board_id))) return res.status(403).json({ error: 'Sin permiso' });
    await pool.query(`DELETE FROM tasks WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (e: any) {
    console.error('[tasks] deleteTask:', e); res.status(500).json({ error: 'Error al eliminar tarea' });
  }
};

// ─── SUBTAREAS ──────────────────────────────────────────────
export const addSubtask = async (req: Request, res: Response): Promise<any> => {
  try {
    const taskId = parseInt(String(req.params.id));
    const t = await pool.query(`SELECT board_id FROM tasks WHERE id = $1`, [taskId]);
    if (t.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (!(await canManageBoard(req, t.rows[0].board_id))) return res.status(403).json({ error: 'Sin permiso' });
    const b = req.body || {};
    if (!String(b.body || '').trim()) return res.status(400).json({ error: 'Texto de la subtarea requerido' });
    const ord = (await pool.query(`SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM task_subtasks WHERE task_id=$1`, [taskId])).rows[0].n;
    const r = await pool.query(
      `INSERT INTO task_subtasks (task_id, body, requires_photo, assignee_id, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [taskId, String(b.body).trim(), !!b.requires_photo, b.assignee_id || null, ord]);
    res.json({ subtask: r.rows[0] });
  } catch (e: any) {
    console.error('[tasks] addSubtask:', e); res.status(500).json({ error: 'Error al agregar subtarea' });
  }
};

// Palomear / despalomear subtarea (con evidencia si la exige).
export const toggleSubtask = async (req: Request, res: Response): Promise<any> => {
  try {
    const uid = authUserId(req);
    const subId = parseInt(String(req.params.subId));
    const s = await pool.query(
      `SELECT s.*, t.board_id, t.assignee_id AS task_assignee FROM task_subtasks s JOIN tasks t ON t.id = s.task_id WHERE s.id = $1`, [subId]);
    if (s.rows.length === 0) return res.status(404).json({ error: 'Subtarea no encontrada' });
    const sub = s.rows[0];
    const mgr = await canManageBoard(req, sub.board_id);
    if (!mgr && Number(sub.task_assignee) !== Number(uid) && Number(sub.assignee_id) !== Number(uid)) {
      return res.status(403).json({ error: 'Solo el responsable o gerencia puede marcar esta subtarea' });
    }
    const done = req.body?.done !== undefined ? !!req.body.done : !sub.done;
    const evidenceUrl = req.body?.evidence_url || sub.evidence_url || null;
    if (done && sub.requires_photo && !evidenceUrl) {
      return res.status(400).json({ error: 'Esta subtarea requiere subir una foto/evidencia antes de palomearla.' });
    }
    const r = await pool.query(
      `UPDATE task_subtasks SET done=$2, done_by=$3, done_at=$4, evidence_url=$5 WHERE id=$1 RETURNING *`,
      [subId, done, done ? uid : null, done ? new Date().toISOString() : null, evidenceUrl]);
    await logActivity(sub.task_id, uid, done ? 'subtask_done' : 'subtask_undone', { subtask: subId });
    res.json({ subtask: r.rows[0] });
  } catch (e: any) {
    console.error('[tasks] toggleSubtask:', e); res.status(500).json({ error: 'Error al actualizar subtarea' });
  }
};

export const deleteSubtask = async (req: Request, res: Response): Promise<any> => {
  try {
    const subId = parseInt(String(req.params.subId));
    const s = await pool.query(`SELECT t.board_id, s.task_id FROM task_subtasks s JOIN tasks t ON t.id=s.task_id WHERE s.id=$1`, [subId]);
    if (s.rows.length === 0) return res.status(404).json({ error: 'Subtarea no encontrada' });
    if (!(await canManageBoard(req, s.rows[0].board_id))) return res.status(403).json({ error: 'Sin permiso' });
    await pool.query(`DELETE FROM task_subtasks WHERE id = $1`, [subId]);
    res.json({ success: true });
  } catch (e: any) {
    console.error('[tasks] deleteSubtask:', e); res.status(500).json({ error: 'Error al eliminar subtarea' });
  }
};

// ─── COMENTARIOS (rastro oficial + @menciones) ──────────────
export const addComment = async (req: Request, res: Response): Promise<any> => {
  try {
    const uid = authUserId(req);
    const taskId = parseInt(String(req.params.id));
    const t = await pool.query(`SELECT board_id, title, assignee_id FROM tasks WHERE id = $1`, [taskId]);
    if (t.rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    const b = req.body || {};
    if (!String(b.body || '').trim()) return res.status(400).json({ error: 'Comentario vacío' });
    const mentions: number[] = Array.isArray(b.mentions) ? b.mentions.map((x: any) => Number(x)).filter(Boolean) : [];
    const r = await pool.query(
      `INSERT INTO task_comments (task_id, author_id, body, mentions, attachment_url) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING *`,
      [taskId, uid, String(b.body).trim(), JSON.stringify(mentions), b.attachment_url || null]);
    await logActivity(taskId, uid, 'comment', {});
    // Notificar a los mencionados.
    for (const m of mentions) {
      if (m !== uid) await notify(m, '💬 Te mencionaron en una tarea', t.rows[0].title, { task_id: taskId });
    }
    res.json({ comment: r.rows[0] });
  } catch (e: any) {
    console.error('[tasks] addComment:', e); res.status(500).json({ error: 'Error al comentar' });
  }
};
