-- Tarifa por caja + umbral de gratuidad para paqueterías.
--   price_per_package: precio por paquete (MXN) hasta el umbral gratis.
--   free_from_qty:     a partir de este número de paquetes el envío es gratis.
-- Ambos opcionales; si están vacíos, el comportamiento anterior (precio fijo por caja).

ALTER TABLE carrier_service_options
  ADD COLUMN IF NOT EXISTS price_per_package NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS free_from_qty     INTEGER;

COMMENT ON COLUMN carrier_service_options.price_per_package IS
  'Precio por paquete (MXN). Si se ingresa se usa como tarifa unitaria hasta llegar al umbral free_from_qty.';
COMMENT ON COLUMN carrier_service_options.free_from_qty IS
  'Umbral de gratuidad: a partir de este número de paquetes (>= free_from_qty) el envío es gratis.';
