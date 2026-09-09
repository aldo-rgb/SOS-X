-- Tareas que crea Grupo Rino en nuestro tablero.
--
-- Hasta ahora el puente iba en un solo sentido: nosotros les encargabamos y
-- ellos reportaban. Para que ellos puedan encargarnos hace falta guardar SU id,
-- porque los eventos que manden despues (terminada, comentario) vienen con ese
-- id, no con el nuestro.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS external_app TEXT,
  ADD COLUMN IF NOT EXISTS external_id  TEXT;

-- Una tarea suya no puede entrar dos veces. Sirve ademas para que el webhook
-- resuelva el id local en una sola consulta.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_externa
  ON tasks(external_app, external_id)
  WHERE external_app IS NOT NULL AND external_id IS NOT NULL;
