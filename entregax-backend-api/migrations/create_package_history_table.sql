-- Crea tabla de historial de movimientos de guías

CREATE TABLE IF NOT EXISTS package_history (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL,
  status VARCHAR(100) NOT NULL,
  notes TEXT,
  created_by INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_package_history_package'
  ) THEN
    ALTER TABLE package_history
      ADD CONSTRAINT fk_package_history_package
      FOREIGN KEY (package_id) REFERENCES packages(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_package_history_created_by'
  ) THEN
    ALTER TABLE package_history
      ADD CONSTRAINT fk_package_history_created_by
      FOREIGN KEY (created_by) REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_package_history_package_id_created_at
  ON package_history(package_id, created_at DESC);
