-- Responsable (assignee) en tareas programadas.
-- Antes la tarea generada por el cron tomaba como responsable al primer
-- involucrado, que siempre era el creador → nunca se podía delegar.
ALTER TABLE task_schedules
  ADD COLUMN IF NOT EXISTS assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
