-- Peso máximo permitido por paquetería (kg). NULL = sin límite.
-- Se aplica al momento de cotizar / asignar carrier en repack / etiquetado.

ALTER TABLE carrier_service_options
  ADD COLUMN IF NOT EXISTS max_weight_kg NUMERIC(10, 2) NULL;

COMMENT ON COLUMN carrier_service_options.max_weight_kg IS
  'Peso máximo permitido por paquete/caja en kg. NULL = sin límite.';
