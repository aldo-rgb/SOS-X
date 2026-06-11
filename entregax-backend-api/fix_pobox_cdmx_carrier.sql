-- Corregir carrier_config.usa de 'entregax_local_cdmx' → 'entregax_local_mty'
-- para todas las direcciones de clientes que usan PO Box USA
UPDATE addresses
SET carrier_config = jsonb_set(
    COALESCE(carrier_config, '{}'),
    '{usa}',
    '"entregax_local_mty"'
)
WHERE carrier_config->>'usa' = 'entregax_local_cdmx'
  AND default_for_service IS NOT NULL
  AND (default_for_service ILIKE '%po_box%' OR default_for_service ILIKE '%usa%' OR default_for_service ILIKE '%all%');

-- Corregir paquetes PO Box USA que ya tengan national_carrier = 'entregax_local_cdmx'
UPDATE packages
SET national_carrier = 'entregax_local_mty'
WHERE service_type = 'POBOX_USA'
  AND national_carrier = 'entregax_local_cdmx';

-- Verificar cuántos registros se actualizaron
SELECT 
  'addresses corregidas' AS tipo,
  COUNT(*) AS total
FROM addresses
WHERE carrier_config->>'usa' = 'entregax_local_mty'
  AND default_for_service ILIKE '%po_box%'
UNION ALL
SELECT 
  'packages corregidos',
  COUNT(*)
FROM packages
WHERE service_type = 'POBOX_USA'
  AND national_carrier = 'entregax_local_mty';
