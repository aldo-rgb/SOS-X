-- Memoria de Cajito, POR USUARIO.
--
-- "Si un usuario le pide que guarde algo, lo debe guardar sabiendo que es de
-- ese usuario" (Aldo, 7-sep-2026).
--
-- Es de la PERSONA, no de la empresa: como trabaja, que le importa, sus atajos.
-- Por eso user_id no es opcional y nunca se cruza entre usuarios. No sustituye
-- a cajito_knowledge, que es el conocimiento curado de la empresa y lo ve todo
-- el mundo.

CREATE TABLE IF NOT EXISTS cajito_memorias (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  contenido  TEXT NOT NULL,
  -- De donde salio: 'usuario' = lo pidio explicitamente. Se distingue para
  -- poder limpiar despues sin borrar lo que la persona si pidio guardar.
  origen     TEXT NOT NULL DEFAULT 'usuario',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cajito_mem_user ON cajito_memorias(user_id, created_at DESC);
-- Misma nota dos veces para la misma persona no aporta nada.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cajito_mem_unica
  ON cajito_memorias(user_id, md5(lower(contenido)));
