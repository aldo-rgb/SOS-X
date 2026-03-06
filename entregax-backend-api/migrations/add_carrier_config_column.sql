-- Migración para agregar columna carrier_config a addresses
-- Esta columna almacena la configuración de paquetería preferida por servicio para cada dirección
-- Formato JSON: {"usa": "entregax_local", "maritime": "paquete_express", "air": "entregax_local"}

-- Agregar columna carrier_config como JSONB
ALTER TABLE addresses 
ADD COLUMN IF NOT EXISTS carrier_config JSONB DEFAULT NULL;

-- Comentario descriptivo
COMMENT ON COLUMN addresses.carrier_config IS 'Configuración de paquetería preferida por tipo de servicio. JSON con claves: usa, maritime, air y valores: entregax_local, paquete_express';
