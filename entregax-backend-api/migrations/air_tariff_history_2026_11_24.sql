-- El tarifario aereo de cada dia, para poder cotizar una guia con la tarifa
-- que estaba vigente el dia en que se recibio en China y no con la de hoy.
--
-- El tipo de cambio ya se cobra asi (tarea 1086), pero la tarifa por kilo no:
-- `air_tariffs` solo guarda la vigente y se sobreescribe cada vez que cambia el
-- costo de la ruta. El costo si tiene historial (air_route_price_history), pero
-- el margen de cada tipo lo teclea la operacion y no queda guardado en ningun
-- lado, asi que de ahi solo se puede reconstruir, no leer (tarea 1115).
CREATE TABLE IF NOT EXISTS air_tariff_history (
  id           SERIAL PRIMARY KEY,
  route_id     INTEGER      NOT NULL,
  tariff_type  VARCHAR(4)   NOT NULL,
  price_per_kg NUMERIC(10,2) NOT NULL,
  changed_by   INTEGER,
  changed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_air_tariff_hist_ruta_tipo_fecha
  ON air_tariff_history (route_id, tariff_type, changed_at DESC);
