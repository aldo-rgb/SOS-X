// ============================================
// CALENDARIO
// Eventos propios del calendario + tareas con fecha (due/objetivo) mostradas en
// vista de calendario. NO es agenda/control de horario: solo cuándo ocurre cada
// actividad y sus detalles. Los involucrados ven los eventos donde participan.
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

const MANAGER_ROLES = ['super_admin', 'admin', 'director'];
const authUid = (req: Request): number | null => {
  const u = (req as any).user;
  const id = u?.userId ?? u?.id;
  return id ? Number(id) : null;
};
const authRole = (req: Request): string => String((req as any).user?.role || '');
const isManager = (req: Request) => MANAGER_ROLES.includes(authRole(req));

let migrated = false;
export const ensureCalendarTables = async () => {
  if (migrated) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id           SERIAL PRIMARY KEY,
      title        VARCHAR(300) NOT NULL,
      description  TEXT,
      location     VARCHAR(300),
      start_at     TIMESTAMP NOT NULL,
      end_at       TIMESTAMP,
      all_day      BOOLEAN NOT NULL DEFAULT FALSE,
      color        VARCHAR(20),
      created_by   INTEGER,
      created_at   TIMESTAMP DEFAULT NOW(),
      updated_at   TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cal_events_start ON calendar_events(start_at);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_event_participants (
      id        SERIAL PRIMARY KEY,
      event_id  INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(event_id, user_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cal_part_event ON calendar_event_participants(event_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cal_part_user ON calendar_event_participants(user_id);`);
  migrated = true;
};

// Formatea un timestamp-naive (UTC) como ISO con "Z" para que el cliente lo
// convierta bien a hora local (el proceso Node corre en tz Monterrey y el driver
// de PG reinterpretaría el naive → desfase).
const ISO_UTC = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// GET /api/calendar/feed?from=&to=  → { events, tasks }
export const getCalendarFeed = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureCalendarTables();
    const uid = authUid(req);
    if (!uid) return res.status(401).json({ error: 'No autenticado' });
    const from = String(req.query.from || '').slice(0, 10);
    const to = String(req.query.to || '').slice(0, 10);
    if (!from || !to) return res.status(400).json({ error: 'Rango de fechas requerido (from, to)' });
    const mgr = isManager(req);

    // ---- Eventos ----
    // Manager ve todos; el resto solo donde es creador o participante.
    const evWhere = mgr
      ? `e.start_at < ($2::date + interval '1 day') AND COALESCE(e.end_at, e.start_at) >= $1::date`
      : `e.start_at < ($2::date + interval '1 day') AND COALESCE(e.end_at, e.start_at) >= $1::date
         AND (e.created_by = $3 OR EXISTS (SELECT 1 FROM calendar_event_participants p WHERE p.event_id = e.id AND p.user_id = $3))`;
    const evParams: any[] = mgr ? [from, to] : [from, to, uid];
    const eventsRes = await pool.query(`
      SELECT e.id, e.title, e.description, e.location,
             ${ISO_UTC('e.start_at')} AS start_at,
             ${ISO_UTC('e.end_at')}   AS end_at,
             e.all_day, e.color, e.created_by,
             cu.full_name AS created_by_name,
             COALESCE((
               SELECT json_agg(json_build_object('user_id', u.id, 'full_name', u.full_name, 'role', u.role) ORDER BY u.full_name)
                 FROM calendar_event_participants p JOIN users u ON u.id = p.user_id WHERE p.event_id = e.id
             ), '[]'::json) AS participants
        FROM calendar_events e
        LEFT JOIN users cu ON cu.id = e.created_by
       WHERE ${evWhere}
       ORDER BY e.start_at ASC
    `, evParams);

    // ---- Tareas con fecha (objetivo o fecha deseada) ----
    // Manager ve todas; el resto solo donde es responsable, creador o involucrado.
    const taskDate = `COALESCE(t.commitment_date, t.due_at)`;
    const tWhere = mgr
      ? `${taskDate} IS NOT NULL AND ${taskDate} < ($2::date + interval '1 day') AND ${taskDate} >= $1::date`
      : `${taskDate} IS NOT NULL AND ${taskDate} < ($2::date + interval '1 day') AND ${taskDate} >= $1::date
         AND (t.assignee_id = $3 OR t.created_by = $3 OR EXISTS (SELECT 1 FROM task_participants tp WHERE tp.task_id = t.id AND tp.user_id = $3))`;
    const tParams: any[] = mgr ? [from, to] : [from, to, uid];
    const tasksRes = await pool.query(`
      SELECT t.id, t.title, t.eisenhower, t.status,
             ${ISO_UTC(taskDate)} AS date,
             (t.commitment_date IS NOT NULL) AS is_commitment,
             b.name AS board_name,
             u.full_name AS assignee_name
        FROM tasks t
        LEFT JOIN task_boards b ON b.id = t.board_id
        LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.status <> 'cancelled' AND ${tWhere}
       ORDER BY ${taskDate} ASC
    `, tParams);

    res.json({ events: eventsRes.rows, tasks: tasksRes.rows });
  } catch (error) {
    console.error('Error getCalendarFeed:', error);
    res.status(500).json({ error: 'Error al obtener el calendario' });
  }
};

// POST /api/calendar/events
export const createCalendarEvent = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureCalendarTables();
    const uid = authUid(req);
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'El título es obligatorio' });
    if (!b.start_at) return res.status(400).json({ error: 'La fecha/hora de inicio es obligatoria' });
    const r = await pool.query(
      `INSERT INTO calendar_events (title, description, location, start_at, end_at, all_day, color, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [String(b.title).trim(), b.description || null, b.location || null, b.start_at, b.end_at || null, !!b.all_day, b.color || null, uid]
    );
    const eventId = r.rows[0].id;
    const ids: number[] = Array.isArray(b.participant_ids)
      ? b.participant_ids.map((x: any) => parseInt(String(x))).filter((n: number) => Number.isFinite(n) && n > 0) : [];
    const set = Array.from(new Set<number>([...(uid ? [uid] : []), ...ids]));
    for (const p of set) {
      await pool.query(`INSERT INTO calendar_event_participants (event_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [eventId, p]);
    }
    // Notificación in-app a los involucrados (no al creador).
    try {
      const { createCustomNotification } = require('./notificationController');
      for (const p of ids) {
        if (Number(p) === Number(uid)) continue;
        await createCustomNotification(p, '📅 Nuevo evento en tu calendario', String(b.title).trim(), 'info', 'calendar', { event_id: eventId }, '/calendario');
      }
    } catch { /* opcional */ }
    res.json({ event: { id: eventId } });
  } catch (error) {
    console.error('Error createCalendarEvent:', error);
    res.status(500).json({ error: 'Error al crear el evento' });
  }
};

// PUT /api/calendar/events/:id
export const updateCalendarEvent = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureCalendarTables();
    const uid = authUid(req);
    const id = parseInt(String(req.params.id || ''), 10);
    const cur = await pool.query(`SELECT * FROM calendar_events WHERE id = $1`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' });
    if (!isManager(req) && Number(cur.rows[0].created_by) !== Number(uid)) {
      return res.status(403).json({ error: 'Solo el creador o gerencia puede editar el evento' });
    }
    const b = req.body || {};
    const sets: string[] = []; const params: any[] = []; let i = 1;
    const set = (c: string, v: any) => { sets.push(`${c} = $${i++}`); params.push(v); };
    if (b.title !== undefined && String(b.title).trim()) set('title', String(b.title).trim());
    if (b.description !== undefined) set('description', b.description || null);
    if (b.location !== undefined) set('location', b.location || null);
    if (b.start_at !== undefined) set('start_at', b.start_at);
    if (b.end_at !== undefined) set('end_at', b.end_at || null);
    if (b.all_day !== undefined) set('all_day', !!b.all_day);
    if (b.color !== undefined) set('color', b.color || null);
    if (sets.length) {
      sets.push('updated_at = NOW()'); params.push(id);
      await pool.query(`UPDATE calendar_events SET ${sets.join(', ')} WHERE id = $${i}`, params);
    }
    // Reemplazar participantes si se enviaron.
    if (Array.isArray(b.participant_ids)) {
      const ids = b.participant_ids.map((x: any) => parseInt(String(x))).filter((n: number) => Number.isFinite(n) && n > 0);
      const set2 = Array.from(new Set<number>([...(cur.rows[0].created_by ? [Number(cur.rows[0].created_by)] : []), ...ids]));
      await pool.query(`DELETE FROM calendar_event_participants WHERE event_id = $1`, [id]);
      for (const p of set2) {
        await pool.query(`INSERT INTO calendar_event_participants (event_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, p]);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error updateCalendarEvent:', error);
    res.status(500).json({ error: 'Error al actualizar el evento' });
  }
};

// DELETE /api/calendar/events/:id
export const deleteCalendarEvent = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureCalendarTables();
    const uid = authUid(req);
    const id = parseInt(String(req.params.id || ''), 10);
    const cur = await pool.query(`SELECT created_by FROM calendar_events WHERE id = $1`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' });
    if (!isManager(req) && Number(cur.rows[0].created_by) !== Number(uid)) {
      return res.status(403).json({ error: 'Solo el creador o gerencia puede eliminar el evento' });
    }
    await pool.query(`DELETE FROM calendar_events WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleteCalendarEvent:', error);
    res.status(500).json({ error: 'Error al eliminar el evento' });
  }
};
