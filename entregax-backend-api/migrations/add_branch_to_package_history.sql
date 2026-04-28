-- Agrega columnas branch_id y warehouse_location a package_history
-- para registrar la sucursal/ubicación en cada movimiento.

ALTER TABLE package_history
  ADD COLUMN IF NOT EXISTS branch_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS warehouse_location VARCHAR(50) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_package_history_branch'
  ) THEN
    ALTER TABLE package_history
      ADD CONSTRAINT fk_package_history_branch
      FOREIGN KEY (branch_id) REFERENCES branches(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_package_history_branch_id
  ON package_history(branch_id);

-- Reemplaza el trigger para que también guarde branch_id y warehouse_location
-- desde el registro NEW del paquete.
CREATE OR REPLACE FUNCTION log_package_status_change()
RETURNS trigger AS $trigger$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO package_history
      (package_id, status, notes, created_by, branch_id, warehouse_location, created_at)
    VALUES
      (NEW.id, NEW.status::text, 'Guía registrada en sistema', NULL,
       NEW.current_branch_id, NEW.warehouse_location, NOW());
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
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

  RETURN NEW;
END;
$trigger$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_packages_status_history ON packages;

CREATE TRIGGER trg_packages_status_history
AFTER INSERT OR UPDATE OF status ON packages
FOR EACH ROW
EXECUTE FUNCTION log_package_status_change();

-- Backfill: asignar branch / warehouse del paquete actual a los eventos
-- antiguos que no tengan ubicación registrada (mejor que dejarlos vacíos).
UPDATE package_history ph
   SET branch_id = p.current_branch_id,
       warehouse_location = p.warehouse_location
  FROM packages p
 WHERE ph.package_id = p.id
   AND ph.branch_id IS NULL
   AND ph.warehouse_location IS NULL;
