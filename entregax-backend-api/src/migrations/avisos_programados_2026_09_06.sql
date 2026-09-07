-- Avisos programados: anunciar mejoras a la gente que de verdad las puede usar.
--
-- Dos decisiones que importan:
--
-- 1. La audiencia se guarda como CLAVE, no como lista de personas. Se resuelve
--    en el momento de enviar, asi que si entre hoy y la hora del aviso alguien
--    recibe el permiso, le llega; y a quien se lo quiten, no. Anunciarle a
--    alguien un boton que no puede ver es peor que no avisarle.
--
-- 2. Un aviso NO es una notificacion por persona por mejora. Si a alguien le
--    tocan tres, recibe UNA sola con las tres adentro. Ya nos habia pasado que
--    una rafaga suene como metralleta y la gente aprenda a ignorarlas.

CREATE TABLE IF NOT EXISTS avisos_programados (
  id          SERIAL PRIMARY KEY,
  audiencia   TEXT NOT NULL,          -- clave; se resuelve al enviar
  titulo      TEXT NOT NULL,
  mensaje     TEXT NOT NULL,
  action_url  TEXT,
  enviar_at   TIMESTAMPTZ NOT NULL,
  enviado_at  TIMESTAMPTZ,
  enviados    INTEGER,
  creado_por  INTEGER,
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_avisos_pendientes
  ON avisos_programados(enviar_at) WHERE enviado_at IS NULL;
