-- Migración: Rol Accountant + permisos por empresa (fiscal_emitter)
-- Usuarios con role='accountant' pueden gestionar facturas/contabilidad de los emisores
-- que tengan en accountant_emitter_permissions.

-- 1. Tabla de permisos accountant -> fiscal_emitter (N:M)
CREATE TABLE IF NOT EXISTS accountant_emitter_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fiscal_emitter_id INTEGER NOT NULL REFERENCES fiscal_emitters(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT TRUE,
    can_emit_invoice BOOLEAN DEFAULT TRUE,
    can_cancel_invoice BOOLEAN DEFAULT FALSE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, fiscal_emitter_id)
);

CREATE INDEX IF NOT EXISTS idx_accountant_perm_user ON accountant_emitter_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_accountant_perm_emitter ON accountant_emitter_permissions(fiscal_emitter_id);

-- 2. Asegurar columna logo_url en fiscal_emitters (opcional para gateway)
ALTER TABLE fiscal_emitters
    ADD COLUMN IF NOT EXISTS logo_url TEXT;

SELECT 'Migración accountant role completada' AS result;
