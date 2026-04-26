-- Registra automáticamente movimientos de guía cuando cambia el status
-- Compatible con esquema legacy (columna packages.status)
-- IMPORTANTE: se debe crear primero la tabla package_history.

CREATE OR REPLACE FUNCTION log_package_status_change()
RETURNS trigger AS $trigger$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO package_history (package_id, status, notes, created_by, created_at)
    VALUES (NEW.id, NEW.status::text, 'Guía registrada en sistema', NULL, NOW());
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO package_history (package_id, status, notes, created_by, created_at)
    VALUES (
      NEW.id,
      NEW.status::text,
      'Cambio automático de estado: ' || COALESCE(OLD.status::text, 'N/A') || ' → ' || COALESCE(NEW.status::text, 'N/A'),
      NULL,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$trigger$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_packages_status_history ON packages;

CREATE TRIGGER trg_packages_status_history
AFTER INSERT OR UPDATE OF status ON packages
FOR EACH ROW
EXECUTE FUNCTION log_package_status_change();
