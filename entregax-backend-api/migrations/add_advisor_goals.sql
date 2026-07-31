-- Metas de asesores (pantalla "Metas" en Comisiones).
-- advisor_goals: definición de cada meta (métrica automática 'new_users' o 'manual').
-- advisor_goal_declarations: la declaración/compromiso de cada asesor por meta.
CREATE TABLE IF NOT EXISTS advisor_goals (
  id             SERIAL PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT,
  metric_key     TEXT NOT NULL DEFAULT 'manual',   -- 'new_users' | 'manual'
  period         TEXT,                             -- 'YYYY-MM' (mes) o null = mes actual
  target_default NUMERIC DEFAULT 0,
  unit           TEXT DEFAULT 'usuarios',
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advisor_goal_declarations (
  id              SERIAL PRIMARY KEY,
  goal_id         INTEGER NOT NULL REFERENCES advisor_goals(id) ON DELETE CASCADE,
  advisor_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  declared_target NUMERIC DEFAULT 0,
  declaration_text TEXT,
  manual_progress NUMERIC,                          -- avance manual (metas 'manual')
  task_id         INTEGER,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (goal_id, advisor_id)
);
CREATE INDEX IF NOT EXISTS idx_goal_decl_goal ON advisor_goal_declarations(goal_id);

-- Seed: primera meta medible.
INSERT INTO advisor_goals (title, description, metric_key, unit, target_default, sort_order)
SELECT 'Usuarios nuevos del mes',
       'Cada asesor declara cuántos clientes nuevos registrará a su nombre este mes. Se mide automáticamente contra los registros reales.',
       'new_users', 'usuarios', 20, 0
WHERE NOT EXISTS (SELECT 1 FROM advisor_goals);
