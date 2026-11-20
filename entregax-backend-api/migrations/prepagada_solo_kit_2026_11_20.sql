-- La guia prepagada de 1 kg se compro para mandar el Kit de Bienvenida; no es
-- una opcion de envio del cliente. Se marca en el catalogo para que el portal
-- solo la ofrezca en guias de kit (USK-) y el backend rechace cualquier otra.
ALTER TABLE carrier_service_options
  ADD COLUMN IF NOT EXISTS solo_kit_bienvenida BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE carrier_service_options
   SET solo_kit_bienvenida = TRUE, updated_at = NOW()
 WHERE carrier_key = 'estafeta_pre';
