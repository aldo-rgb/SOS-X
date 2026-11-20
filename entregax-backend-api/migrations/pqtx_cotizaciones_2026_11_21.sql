-- Bitacora de cotizaciones de Paquete Express.
--
-- No existia ninguna. Cuando un cliente reporto que su CP salia "fuera de
-- cobertura" (TKT-2026-3750, tarea 1087) no habia nada que revisar: al dia
-- siguiente el mismo CP cotizaba bien desde los dos CEDIS, con y sin colonia,
-- con sus medidas reales y sin medidas. O sea, la cotizadora contesto "nada" un
-- momento y el sistema convirtio esa respuesta en un veredicto sobre el codigo
-- postal, sin dejar rastro.
--
-- Con esto se puede medir cada cuando pasa y a quien le pasa.
CREATE TABLE IF NOT EXISTS pqtx_quote_logs (
  id              SERIAL PRIMARY KEY,
  dest_zip        VARCHAR(10),
  colony          VARCHAR(120),
  origin_zip      VARCHAR(10),
  sucursal        VARCHAR(20),
  package_count   INTEGER,
  weight          NUMERIC(10,2),
  dims            VARCHAR(40),
  -- domicilio | ocurre | sin_cobertura | sin_cobertura_con_antecedente | error
  veredicto       VARCHAR(40),
  -- Por que se resolvio asi: "cotizo al primer intento", "cotizo al reintentar",
  -- "ya le hemos generado guia a ese CP", "el CP esta en la lista verificada"...
  motivo          TEXT,
  costo_pqtx      NUMERIC(10,2),
  precio_cliente  NUMERIC(10,2),
  user_id         INTEGER,
  package_id      INTEGER,
  ms              INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pqtx_quote_logs_cp
  ON pqtx_quote_logs (dest_zip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pqtx_quote_logs_veredicto
  ON pqtx_quote_logs (veredicto, created_at DESC);
