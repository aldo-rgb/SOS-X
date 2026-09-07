-- Estados del aviso, para que Cajito pueda PROPONER sin poder enviar.
--
-- La regla dura: Cajito crea siempre en 'borrador'. Un borrador NUNCA sale.
-- Pasa a 'programado' solo cuando el super admin lo autoriza, y aun asi con
-- una ventana minima por delante para poder cancelarlo.

ALTER TABLE avisos_programados
  ADD COLUMN IF NOT EXISTS estado        TEXT NOT NULL DEFAULT 'programado',
  ADD COLUMN IF NOT EXISTS propuesto_por_cajito BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS autorizado_por INTEGER,
  ADD COLUMN IF NOT EXISTS autorizado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelado_por INTEGER;

-- enviar_at deja de ser obligatorio: un borrador todavia no tiene hora.
ALTER TABLE avisos_programados ALTER COLUMN enviar_at DROP NOT NULL;

-- Los que ya existian son avisos autorizados por Aldo a mano.
UPDATE avisos_programados
   SET estado = CASE WHEN enviado_at IS NOT NULL THEN 'enviado' ELSE 'programado' END
 WHERE estado IS NULL OR estado NOT IN ('borrador','programado','enviado','cancelado');

DROP INDEX IF EXISTS idx_avisos_pendientes;
CREATE INDEX IF NOT EXISTS idx_avisos_por_enviar
  ON avisos_programados(enviar_at) WHERE estado = 'programado' AND enviado_at IS NULL;
