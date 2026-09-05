-- Videos en tickets y tareas.
--
-- El CEDIS graba con el celular y hoy manda los videos por fuera (WhatsApp).
-- Se suben directo a S3 con URL firmada porque un video de 30s pesa 60-90MB y
-- no cabe por la API.
--
-- CUADROS: nadie puede "leer" un video, ni Cajito ni Claude. Al subirlo se le
-- sacan cuadros con ffmpeg y se guardan como imagenes hijas. Eso es lo que se
-- lee despues, y es lo que sobrevive a la depuracion de 30 dias.

ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS mime_type        TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes       BIGINT,
  -- Un cuadro apunta al video del que salio. CASCADE: si se borra el video
  -- manualmente se van sus cuadros; la depuracion de 30 dias NO borra la fila,
  -- solo el objeto pesado en S3 (ver video_purged_at).
  ADD COLUMN IF NOT EXISTS parent_id        INTEGER REFERENCES task_attachments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS frame_second     NUMERIC,
  ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS frames_status    TEXT,   -- pendiente | listo | fallo | n/a
  ADD COLUMN IF NOT EXISTS video_purged_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_task_att_parent ON task_attachments(parent_id);
-- Para el barrido de depuracion: videos vivos con mas de 30 dias.
CREATE INDEX IF NOT EXISTS idx_task_att_video_purga
  ON task_attachments(created_at)
  WHERE mime_type LIKE 'video/%' AND video_purged_at IS NULL;

-- Los adjuntos de ticket viven en ticket_messages.attachments (jsonb), asi que
-- ahi no hace falta ALTER: cada item gana mime, size, duration, frames[] y
-- purged_at dentro del mismo objeto. Lo unico que se necesita es poder barrer
-- los mensajes que traen video sin recorrer la tabla entera.
CREATE INDEX IF NOT EXISTS idx_ticket_msgs_con_video
  ON ticket_messages USING GIN (attachments jsonb_path_ops);
