-- Tabla de auditoría. Existía en el código pero no en la base: los cuatro
-- INSERT que la usan van envueltos en catch vacíos, así que fallaban en
-- silencio y NINGUNA acción quedaba registrada. Se detectó al investigar la
-- tarea #281 (revertir instrucciones), donde no hubo forma de saber qué guías
-- se habían revertido ni quién lo hizo.
--
-- Soporta los dos formatos que ya usa el código sin tener que tocarlo:
--   A) authController        → (user_id, action, metadata, created_at)
--   B) index / legalDocuments→ (action, entity_type, entity_id, user_id, details)
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  action       VARCHAR(80) NOT NULL,
  entity_type  VARCHAR(64),
  entity_id    BIGINT,
  -- SIN foreign key a users a propósito: un log de auditoría debe sobrevivir
  -- al borrado de la entidad que describe. authController registra
  -- 'account_deleted' justo cuando la cuenta ya no existe; con FK ese INSERT
  -- fallaría y perderíamos precisamente el evento que más importa auditar.
  user_id      INTEGER,
  details      JSONB,
  metadata     JSONB,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user    ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
