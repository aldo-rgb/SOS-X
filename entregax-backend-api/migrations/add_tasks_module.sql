-- ============================================================
-- MÓDULO TAREAS (EntregaX) — Fase 1 · base de datos
-- ------------------------------------------------------------
-- Capa de responsabilidad estilo Asana, conectada a la operación.
-- Aislado: no toca comisiones, CRM ni packages (solo se LIGA por
-- linked_type/linked_id). Ver propuestas/tareas-diseno.html.
-- ============================================================

-- Tableros (el "Flujo Operativo" + proyectos con líder).
CREATE TABLE IF NOT EXISTS task_boards (
  id            SERIAL PRIMARY KEY,
  board_key     TEXT UNIQUE,                       -- 'flujo_operativo' | null (proyectos)
  name          TEXT NOT NULL,
  board_type    TEXT NOT NULL DEFAULT 'project',   -- 'operativo' | 'project'
  lead_user_id  INTEGER REFERENCES users(id),      -- líder (premio espiritual)
  is_active     BOOLEAN DEFAULT TRUE,
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Columnas del tablero (etapas). Cada una con sus reglas.
CREATE TABLE IF NOT EXISTS task_columns (
  id               SERIAL PRIMARY KEY,
  board_id         INTEGER NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
  col_key          TEXT NOT NULL,
  name             TEXT NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  color            TEXT DEFAULT '#607D8B',
  sla_hours        INTEGER,                         -- SLA por etapa (Fase 2)
  auto_assign_role TEXT,                            -- reasignación por ROL al entrar (Fase 2)
  gate_checklist   BOOLEAN DEFAULT FALSE,           -- exige checklist para avanzar
  crm_stage        TEXT,                            -- si refleja etapa del CRM (lectura)
  guide_stage      TEXT,                            -- si refleja estatus real de la guía
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (board_id, col_key)
);

-- Tareas (la tarjeta = el viaje de un cliente / un pendiente).
CREATE TABLE IF NOT EXISTS tasks (
  id                SERIAL PRIMARY KEY,
  board_id          INTEGER NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
  column_id         INTEGER REFERENCES task_columns(id),
  title             TEXT NOT NULL,                  -- con verbo de acción
  description       TEXT,
  assignee_id       INTEGER REFERENCES users(id),   -- ÚNICO responsable
  due_at            TIMESTAMPTZ,                    -- fecha + hora límite
  eisenhower        TEXT NOT NULL DEFAULT 'estrella', -- 'fuego' | 'estrella' | 'delegar'
  xpay_seguro       TEXT,                           -- 'verde' | 'amarillo' | 'rojo' | null
  status            TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'completed' | 'cancelled'
  completed_at      TIMESTAMPTZ,
  forced_close_by   INTEGER REFERENCES users(id),
  forced_reason     TEXT,
  linked_type       TEXT,                           -- 'client' | 'guide' | 'lead'
  linked_id         TEXT,                           -- box_id / tracking / lead_key
  priority          INTEGER DEFAULT 0,
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_board   ON tasks(board_id, column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_tasks_due     ON tasks(due_at) WHERE status = 'open';

-- Subtareas = el checklist obligatorio (bloquea el cierre).
CREATE TABLE IF NOT EXISTS task_subtasks (
  id             SERIAL PRIMARY KEY,
  task_id        INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  body           TEXT NOT NULL,
  done           BOOLEAN DEFAULT FALSE,
  done_by        INTEGER REFERENCES users(id),
  done_at        TIMESTAMPTZ,
  requires_photo BOOLEAN DEFAULT FALSE,             -- evidencia obligatoria
  evidence_url   TEXT,
  assignee_id    INTEGER REFERENCES users(id),      -- handoff a otra persona (opcional)
  sort_order     INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON task_subtasks(task_id);

-- Comentarios = el Rastro Oficial (@menciones, timestamp, autor).
CREATE TABLE IF NOT EXISTS task_comments (
  id             SERIAL PRIMARY KEY,
  task_id        INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id      INTEGER REFERENCES users(id),
  body           TEXT NOT NULL,
  mentions       JSONB DEFAULT '[]'::jsonb,         -- [user_id, ...]
  attachment_url TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_task ON task_comments(task_id);

-- Bitácora inmutable: quién movió, cerró, reasignó, forzó.
CREATE TABLE IF NOT EXISTS task_activity (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id   INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,                         -- 'created','moved','assigned','completed','forced_close',...
  meta       JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_task ON task_activity(task_id, created_at DESC);

-- ── Seed: tablero "Flujo Operativo" (funnel de CLIENTES) ────
-- Solo etapas de cliente/venta. NO se monitorean guías aquí (sin
-- Almacén/Tránsito/Completado/Problemas): el CRM de guías no se conecta.
INSERT INTO task_boards (board_key, name, board_type)
SELECT 'flujo_operativo', 'Flujo Operativo', 'operativo'
WHERE NOT EXISTS (SELECT 1 FROM task_boards WHERE board_key = 'flujo_operativo');

INSERT INTO task_columns (board_id, col_key, name, sort_order, color, sla_hours, auto_assign_role, gate_checklist, crm_stage, guide_stage)
SELECT b.id, c.col_key, c.name, c.ord, c.color, c.sla, c.role, c.gate, c.crm, c.guide
FROM task_boards b
CROSS JOIN (VALUES
  ('nuevos_prospectos', '📥 Nuevos Prospectos',        1, '#1D6FB8', 24,   NULL, FALSE, 'prospectado', NULL),
  ('cotizacion',        '💬 Cotización y Negociación',  2, '#1D6FB8', NULL, NULL, FALSE, 'contactado',  NULL),
  ('filtro_cierre',     '🛡️ Filtro de Cierre',          3, '#D6521C', NULL, NULL, TRUE,  'reclamado',   NULL)
) AS c(col_key, name, ord, color, sla, role, gate, crm, guide)
WHERE b.board_key = 'flujo_operativo'
  AND NOT EXISTS (SELECT 1 FROM task_columns tc WHERE tc.board_id = b.id AND tc.col_key = c.col_key);
