-- Tareas que NO necesitan la confirmacion de quien las asigno.
--
-- La regla general es buena: si el responsable y quien asigno son distintos, el
-- responsable no cierra solo — pasa a "esperando confirmacion". Sirve para el
-- trabajo que se encarga.
--
-- Pero las tarjetas que genera el sistema solas —atender un prospecto— no son
-- un encargo: son la propia chamba del asesor. Ahi la confirmacion no aporta y
-- deja la tarea colgada esperando a alguien que no tiene nada que revisar.
--
-- Se marca en la tarea y no se falsea created_by: quien la asigno se sigue
-- viendo, que es informacion util.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS requiere_confirmacion BOOLEAN NOT NULL DEFAULT TRUE;

-- Las de prospecto que ya existen: tampoco deben pedirla.
UPDATE tasks SET requiere_confirmacion = FALSE
 WHERE linked_type = 'lead' AND requiere_confirmacion = TRUE;
