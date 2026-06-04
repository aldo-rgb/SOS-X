-- migrations/fix_package_history_dup_trigger.sql
-- Evita que el trigger duplique entradas cuando la app ya insertó
-- manualmente un registro para el mismo cambio de status.
--
-- El trigger anterior insertaba SIEMPRE "Cambio automático de estado: X → Y"
-- al detectar UPDATE de packages.status, generando entradas duplicadas en el
-- historial (una nota descriptiva escrita por la app + la automática del
-- trigger, ambas con el mismo timestamp).
--
-- Nueva lógica:
--   - INSERT: sólo registra "Guía registrada en sistema" si NO existe ya
--     una entrada para ese package_id en los últimos 10 segundos.
--   - UPDATE: sólo registra "Cambio automático de estado: …" si NO existe ya
--     una entrada para ese package_id + NEW.status en los últimos 10 segundos.

CREATE OR REPLACE FUNCTION log_package_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Evitar duplicar el registro inicial si la app ya lo insertó
    IF NOT EXISTS (
      SELECT 1 FROM package_history
       WHERE package_id = NEW.id
         AND created_at > NOW() - INTERVAL '10 seconds'
    ) THEN
      INSERT INTO package_history
        (package_id, status, notes, created_by, branch_id, warehouse_location, created_at)
      VALUES
        (NEW.id, NEW.status::text, 'Guía registrada en sistema', NULL,
         NEW.current_branch_id, NEW.warehouse_location, NOW());
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Evitar duplicar el cambio de status si la app ya escribió la entrada
    -- con su propia nota descriptiva en los últimos 10 segundos.
    IF NOT EXISTS (
      SELECT 1 FROM package_history
       WHERE package_id = NEW.id
         AND status = NEW.status::text
         AND created_at > NOW() - INTERVAL '10 seconds'
    ) THEN
      INSERT INTO package_history
        (package_id, status, notes, created_by, branch_id, warehouse_location, created_at)
      VALUES (
        NEW.id,
        NEW.status::text,
        'Cambio automático de estado: ' || COALESCE(OLD.status::text, 'N/A') || ' → ' || COALESCE(NEW.status::text, 'N/A'),
        NULL,
        NEW.current_branch_id,
        NEW.warehouse_location,
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
