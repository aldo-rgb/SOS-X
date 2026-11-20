-- El tipo de cambio con el que se cotizó una orden no se guardaba en ninguna
-- parte: ni en la orden ni en la guía (las 3,584 guías aéreas de los últimos
-- 90 días tienen registered_exchange_rate vacío). La cotización se reimprimía
-- con el TC VIGENTE, así que al cambiar la configuración el mismo folio salía
-- con otro número: el 19-nov las órdenes se cotizaron a 18.93 y hoy, con la
-- configuración en 19.23, el PDF de esas mismas órdenes diría 19.23.
--
-- Se sella en pobox_payments porque toda orden —la del asesor y la del
-- cliente— tiene su renglón ahí. Las órdenes viejas quedan en NULL a
-- propósito: ahí el detalle sigue derivando el TC del propio monto (tarea 1086).
ALTER TABLE pobox_payments
  ADD COLUMN IF NOT EXISTS tipo_cambio_usd NUMERIC(10,4);

COMMENT ON COLUMN pobox_payments.tipo_cambio_usd IS
  'Tipo de cambio USD→MXN con el que se cotizó esta orden. Se sella al crearla; NULL en las anteriores al 20-nov-2026.';
