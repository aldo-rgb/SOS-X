-- Revertir status 'shipped' → 'delivered' para paquetes de S2948
-- que tienen paquetería local (entregax_local_mty), ya que entrega local = entregado
UPDATE packages
SET status = 'delivered'
WHERE status = 'shipped'
  AND national_carrier = 'entregax_local_mty'
  AND user_id = (
    SELECT id FROM users WHERE client_id = 'S2948' LIMIT 1
  );

-- Verificar
SELECT tracking_internal, child_no, status, national_carrier, national_tracking
FROM packages
WHERE national_carrier = 'entregax_local_mty'
  AND user_id = (SELECT id FROM users WHERE client_id = 'S2948' LIMIT 1);
