-- Precios por Cliente: guardar la REGLA, no su resultado.
--
-- La pantalla ofrece niveles A (base), B (-$1) y C (-$2) sobre el costo
-- asignado, pero el navegador calculaba los tres precios y mandaba solo los
-- numeros. En la base quedaba "18.90", no "-2". Como el costo de ruta se mueve
-- —cuatro veces en el ultimo mes: 9.80, 9.50, 9.40, 11.50, 11.90— el numero
-- guardado dejaba de ser el descuento pactado, a la callada. S191 traia 16.92 y
-- al volver a guardar le quedo 18.90 sin que nadie cambiara su acuerdo
-- (tareas 1070, 1086, 1092).
ALTER TABLE air_client_tariffs
  ADD COLUMN IF NOT EXISTS nivel VARCHAR(1);

-- Y que el acuerdo pueda MANDAR sobre el tipo de carga.
--
-- El tipo (Logo / Generico / Flat) sale de la descripcion que manda China: la
-- regla busca "logo", "鞋", "zapato". Un cliente con trato FLAT que manda
-- zapatos cae siempre en Logo, asi que su tarifa Flat nunca se alcanza. De las
-- 14,667 guias aereas del sistema: 9,848 Logo, 4,259 Generico, 518 Start Up y
-- CERO Flat. Con esta marca, el acuerdo del cliente gana sobre la descripcion.
ALTER TABLE air_client_tariffs
  ADD COLUMN IF NOT EXISTS tipo_forzado BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN air_client_tariffs.nivel IS
  'A = tarifa general, B = general menos $1 USD/kg, C = general menos $2. Cuando esta puesto, el precio se calcula al cotizar y sigue al costo de la ruta. NULL = precio fijo en price_per_kg.';
COMMENT ON COLUMN air_client_tariffs.tipo_forzado IS
  'TRUE = toda la carga de este cliente en esta ruta se cobra con ESTE tipo, sin importar lo que diga la descripcion de la mercancia.';

-- Una sola regla puede mandar por cliente y ruta.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tarifa_tipo_forzado_user
  ON air_client_tariffs (user_id, route_id) WHERE tipo_forzado AND user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tarifa_tipo_forzado_legacy
  ON air_client_tariffs (legacy_client_id, route_id) WHERE tipo_forzado AND legacy_client_id IS NOT NULL;
