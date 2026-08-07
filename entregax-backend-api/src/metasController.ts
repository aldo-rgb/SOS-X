// ============================================================
// METAS DE ASESORES
// Pantalla de metas medibles para asesores/sub-asesores. Cada meta puede tener
// una métrica automática (p.ej. usuarios nuevos del mes) o ser manual. Cada
// asesor DECLARA su compromiso (objetivo + texto), y opcionalmente esa
// declaración se convierte en una tarea asignada.
// ============================================================
import { Request, Response } from 'express';
import { pool } from './db';
import { createAssignedTaskInternal } from './tasksController';

interface AuthRequest extends Request { user?: { userId: number; role: string } }

const ADVISOR_ROLES = ['asesor', 'asesor_lider', 'advisor', 'sub_advisor'];
const LEADER_ROLES = ['asesor_lider', 'advisor'];

let _ready = false;
async function ensureTables() {
  if (_ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS advisor_goals (
      id            SERIAL PRIMARY KEY,
      title         TEXT NOT NULL,
      description   TEXT,
      metric_key    TEXT NOT NULL DEFAULT 'manual',   -- 'new_users' | 'manual'
      period        TEXT,                             -- 'YYYY-MM' (mes) o null = mes actual
      target_default NUMERIC DEFAULT 0,
      unit          TEXT DEFAULT 'usuarios',
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_by    INTEGER REFERENCES users(id),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS advisor_goal_declarations (
      id             SERIAL PRIMARY KEY,
      goal_id        INTEGER NOT NULL REFERENCES advisor_goals(id) ON DELETE CASCADE,
      advisor_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      declared_target NUMERIC DEFAULT 0,
      declaration_text TEXT,
      manual_progress NUMERIC,                         -- avance manual (metas 'manual')
      task_id        INTEGER,
      created_by     INTEGER REFERENCES users(id),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (goal_id, advisor_id)
    );
    CREATE INDEX IF NOT EXISTS idx_goal_decl_goal ON advisor_goal_declarations(goal_id);
  `);
  // Seed: primera meta medible (usuarios nuevos del mes) si no hay ninguna.
  const c = await pool.query(`SELECT COUNT(*)::int AS n FROM advisor_goals`);
  if ((c.rows[0]?.n || 0) === 0) {
    await pool.query(
      `INSERT INTO advisor_goals (title, description, metric_key, unit, target_default, sort_order)
       VALUES ('Usuarios nuevos del mes', 'Cada asesor declara cuántos clientes nuevos registrará a su nombre este mes. Se mide automáticamente contra los registros reales.', 'new_users', 'usuarios', 20, 0)`);
  }
  _ready = true;
}

// Rango [inicio, fin) del mes de una meta ('YYYY-MM' o mes actual).
function monthRange(period?: string | null): { start: string; end: string; label: string } {
  const now = new Date();
  let y = now.getUTCFullYear(), m = now.getUTCMonth(); // 0-11
  if (period && /^\d{4}-\d{2}$/.test(period)) { y = parseInt(period.slice(0, 4)); m = parseInt(period.slice(5, 7)) - 1; }
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  const label = start.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start: start.toISOString(), end: end.toISOString(), label };
}

// GET /api/admin/metas — asesores activos + metas + declaraciones + medición.
export const getMetas = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureTables();

    const goals = (await pool.query(
      `SELECT id, title, description, metric_key, period, target_default, unit, active, sort_order
         FROM advisor_goals WHERE active = TRUE ORDER BY sort_order, id`)).rows;

    // Asesores/sub-asesores activos + su líder.
    const advisors = (await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.referral_code, u.profile_photo_url,
              u.referred_by_id AS leader_id, l.full_name AS leader_name,
              (u.role IN ('asesor_lider','advisor')) AS is_leader
         FROM users u
         LEFT JOIN users l ON l.id = u.referred_by_id
        WHERE u.role = ANY($1)
          AND COALESCE(u.is_active,true)=true AND COALESCE(u.is_blocked,false)=false
        ORDER BY (u.role IN ('asesor_lider','advisor')) DESC, u.full_name`,
      [ADVISOR_ROLES])).rows;

    const declarations = (await pool.query(
      `SELECT goal_id, advisor_id, declared_target, declaration_text, manual_progress, task_id
         FROM advisor_goal_declarations`)).rows;

    // Medición automática por meta (new_users): usuarios cliente atribuidos al
    // asesor (advisor_id OR referred_by_id) creados en el mes de la meta.
    const measured: Record<string, number> = {};
    const periodLabels: Record<number, string> = {};
    for (const g of goals) {
      const mr = monthRange(g.period);
      periodLabels[g.id] = mr.label;
      if (g.metric_key === 'new_users') {
        const rows = (await pool.query(
          `SELECT COALESCE(u.advisor_id, u.referred_by_id) AS adv, COUNT(*)::int AS n
             FROM users u
            WHERE u.role='client'
              AND u.created_at >= $1 AND u.created_at < $2
              AND COALESCE(u.advisor_id, u.referred_by_id) IS NOT NULL
            GROUP BY 1`, [mr.start, mr.end])).rows;
        for (const r of rows) measured[`${g.id}_${r.adv}`] = r.n;
      }
    }

    // Tareas PENDIENTES por asesor: tareas donde es el responsable (assignee)
    // y no están terminadas ni canceladas. Para mostrarlas en las tarjetas de metas.
    const pendingTasks: Record<number, number> = {};
    try {
      const ptRows = (await pool.query(
        `SELECT assignee_id AS adv, COUNT(*)::int AS n
           FROM tasks
          WHERE assignee_id IS NOT NULL
            AND status NOT IN ('completed','cancelled')
          GROUP BY assignee_id`)).rows;
      for (const r of ptRows) pendingTasks[Number(r.adv)] = Number(r.n);
    } catch (e: any) { console.warn('[metas] pendingTasks:', e?.message); }

    // Tiempo PROMEDIO de respuesta por asesor: promedio (en segundos) desde que se
    // crea la tarea hasta que el asesor (responsable) la completa. Solo tareas
    // completadas en los últimos 90 días para que sea representativo del ritmo actual.
    const avgResponseSecs: Record<number, number> = {};
    try {
      const arRows = (await pool.query(
        `SELECT assignee_id AS adv,
                AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))::float AS secs
           FROM tasks
          WHERE assignee_id IS NOT NULL
            AND status = 'completed'
            AND completed_at IS NOT NULL
            AND completed_at >= created_at
            AND completed_at >= NOW() - INTERVAL '90 days'
          GROUP BY assignee_id`)).rows;
      for (const r of arRows) if (r.secs != null) avgResponseSecs[Number(r.adv)] = Math.round(Number(r.secs));
    } catch (e: any) { console.warn('[metas] avgResponseSecs:', e?.message); }

    res.json({ goals, advisors, declarations, measured, periodLabels, pendingTasks, avgResponseSecs });
  } catch (e: any) {
    console.error('[metas] getMetas:', e); res.status(500).json({ error: 'Error al cargar metas' });
  }
};

// GET /api/admin/altas-por-asesor?period=YYYY-MM — desglose de altas (usuarios
// nuevos) por asesor en el mes. Para el detalle de "Altas este mes" en la app.
export const getAltasPorAsesor = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const mr = monthRange(String(req.query.period || '') || null);
    const rows = (await pool.query(
      `SELECT a.id, a.full_name, a.role, a.referral_code, a.profile_photo_url,
              (a.role IN ('asesor_lider','advisor')) AS is_leader,
              l.full_name AS leader_name,
              COUNT(*)::int AS count
         FROM users u
         JOIN users a ON a.id = COALESCE(u.advisor_id, u.referred_by_id)
         LEFT JOIN users l ON l.id = a.referred_by_id
        WHERE u.role='client'
          AND u.created_at >= $1 AND u.created_at < $2
          AND COALESCE(u.advisor_id, u.referred_by_id) IS NOT NULL
        GROUP BY a.id, a.full_name, a.role, a.referral_code, a.profile_photo_url, is_leader, l.full_name
        ORDER BY count DESC, a.full_name`, [mr.start, mr.end])).rows;
    const total = rows.reduce((s: number, r: any) => s + Number(r.count), 0);
    res.json({ period_label: mr.label, total, advisors: rows });
  } catch (e: any) {
    console.error('[metas] getAltasPorAsesor:', e); res.status(500).json({ error: 'Error al obtener altas por asesor' });
  }
};

// POST /api/admin/metas/goals — crear meta.
export const createGoal = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureTables();
    const b = req.body || {};
    if (!String(b.title || '').trim()) return res.status(400).json({ error: 'El título es obligatorio' });
    const metric = ['new_users', 'manual'].includes(b.metric_key) ? b.metric_key : 'manual';
    const period = /^\d{4}-\d{2}$/.test(String(b.period || '')) ? b.period : null;
    const r = await pool.query(
      `INSERT INTO advisor_goals (title, description, metric_key, period, target_default, unit, sort_order, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE((SELECT MAX(sort_order)+1 FROM advisor_goals),0),$7) RETURNING *`,
      [String(b.title).trim(), b.description || null, metric, period, Number(b.target_default) || 0, String(b.unit || 'usuarios').trim() || 'usuarios', req.user?.userId || null]);
    res.json({ goal: r.rows[0] });
  } catch (e: any) {
    console.error('[metas] createGoal:', e); res.status(500).json({ error: 'Error al crear meta' });
  }
};

// PUT /api/admin/metas/goals/:id — editar meta.
export const updateGoal = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id));
    const b = req.body || {};
    const sets: string[] = []; const params: any[] = []; let i = 1;
    if (b.title !== undefined && String(b.title).trim()) { sets.push(`title=$${i++}`); params.push(String(b.title).trim()); }
    if (b.description !== undefined) { sets.push(`description=$${i++}`); params.push(b.description || null); }
    if (b.target_default !== undefined) { sets.push(`target_default=$${i++}`); params.push(Number(b.target_default) || 0); }
    if (b.unit !== undefined) { sets.push(`unit=$${i++}`); params.push(String(b.unit || 'usuarios')); }
    if (b.period !== undefined) { sets.push(`period=$${i++}`); params.push(/^\d{4}-\d{2}$/.test(String(b.period || '')) ? b.period : null); }
    if (b.active !== undefined) { sets.push(`active=$${i++}`); params.push(!!b.active); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    sets.push(`updated_at=NOW()`); params.push(id);
    const r = await pool.query(`UPDATE advisor_goals SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, params);
    res.json({ goal: r.rows[0] });
  } catch (e: any) {
    console.error('[metas] updateGoal:', e); res.status(500).json({ error: 'Error al actualizar meta' });
  }
};

// DELETE /api/admin/metas/goals/:id — desactivar meta.
export const deleteGoal = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id));
    await pool.query(`UPDATE advisor_goals SET active=FALSE, updated_at=NOW() WHERE id=$1`, [id]);
    res.json({ success: true });
  } catch (e: any) {
    console.error('[metas] deleteGoal:', e); res.status(500).json({ error: 'Error al eliminar meta' });
  }
};

// POST /api/admin/metas/declarations — capturar/actualizar la declaración de un
// asesor para una meta. Con create_task=true, genera una tarea asignada.
export const upsertDeclaration = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureTables();
    const uid = req.user?.userId || null;
    const b = req.body || {};
    const goalId = parseInt(String(b.goal_id));
    const advisorId = parseInt(String(b.advisor_id));
    if (!goalId || !advisorId) return res.status(400).json({ error: 'goal_id y advisor_id son obligatorios' });

    const g = (await pool.query(`SELECT title FROM advisor_goals WHERE id=$1`, [goalId])).rows[0];
    if (!g) return res.status(404).json({ error: 'Meta no encontrada' });

    let taskId: number | null = null;
    if (b.create_task) {
      const decl = String(b.declaration_text || '').trim();
      const target = Number(b.declared_target) || 0;
      const title = `🎯 ${g.title}${target ? ` — meta: ${target}` : ''}`;
      const description = decl || `Declaración de meta: ${g.title}${target ? ` (objetivo ${target})` : ''}.`;
      taskId = await createAssignedTaskInternal({ creatorId: uid || advisorId, assigneeId: advisorId, title, description, dueAt: b.due_at || null });
    }

    const r = await pool.query(
      `INSERT INTO advisor_goal_declarations (goal_id, advisor_id, declared_target, declaration_text, manual_progress, task_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (goal_id, advisor_id) DO UPDATE SET
         declared_target = EXCLUDED.declared_target,
         declaration_text = EXCLUDED.declaration_text,
         manual_progress = COALESCE(EXCLUDED.manual_progress, advisor_goal_declarations.manual_progress),
         task_id = COALESCE(EXCLUDED.task_id, advisor_goal_declarations.task_id),
         updated_at = NOW()
       RETURNING *`,
      [goalId, advisorId, Number(b.declared_target) || 0, b.declaration_text || null,
       b.manual_progress !== undefined && b.manual_progress !== '' ? Number(b.manual_progress) : null, taskId, uid]);
    res.json({ declaration: r.rows[0], task_id: taskId });
  } catch (e: any) {
    console.error('[metas] upsertDeclaration:', e); res.status(500).json({ error: 'Error al guardar la declaración' });
  }
};
