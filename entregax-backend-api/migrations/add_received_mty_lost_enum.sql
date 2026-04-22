-- Agrega los valores 'received_mty' y 'lost' al enum package_status
-- Necesarios para:
--   - receiveConsolidation: marcar paquetes escaneados como 'received_mty' (no 'received' que es HIDALGO TX)
--   - markPackageAsLost: marcar paquetes perdidos con status='lost'

ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'received_mty';
ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'lost';
