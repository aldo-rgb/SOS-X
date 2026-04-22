-- Columnas para marcar un paquete como PERDIDO (acción manual de Servicio a Cliente)
ALTER TABLE packages
    ADD COLUMN IF NOT EXISTS is_lost BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS lost_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS lost_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS lost_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_packages_is_lost ON packages(is_lost) WHERE is_lost = TRUE;
