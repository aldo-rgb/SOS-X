-- Registro unico de videos, para tickets y tareas por igual.
--
-- Por que una tabla aparte y no metadatos en cada lado: los adjuntos de ticket
-- viven como arreglo de URLs de TEXTO en ticket_messages.attachments. Meterles
-- objetos con metadatos romperia a todo el que ya los recorre (app, web,
-- Cajito). Y la depuracion de 30 dias necesita un solo lugar donde barrer.

CREATE TABLE IF NOT EXISTS video_adjuntos (
  id               SERIAL PRIMARY KEY,
  scope            TEXT NOT NULL CHECK (scope IN ('ticket','task')),
  ref_id           INTEGER NOT NULL,          -- ticket_id o task_id
  s3_key           TEXT NOT NULL UNIQUE,
  file_name        TEXT NOT NULL,
  mime_type        TEXT,
  size_bytes       BIGINT,
  duration_seconds NUMERIC,
  -- Los cuadros: [{ "key": "...", "segundo": 12.5 }]. Son lo que se puede
  -- LEER del video y lo que sobrevive a la depuracion.
  frames           JSONB NOT NULL DEFAULT '[]'::jsonb,
  frames_status    TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente|listo|fallo
  frames_error     TEXT,
  uploaded_by      INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Cuando se borro el MP4 de S3. La fila NO se borra: queda el rastro de que
  -- hubo un video, con sus cuadros, aunque el pesado ya no este.
  purged_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_adj_ref ON video_adjuntos(scope, ref_id);
-- El barrido de los 30 dias: solo videos vivos.
CREATE INDEX IF NOT EXISTS idx_video_adj_purga ON video_adjuntos(created_at) WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_video_adj_pendientes ON video_adjuntos(frames_status) WHERE frames_status = 'pendiente';
