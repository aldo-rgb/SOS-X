-- ============================================
-- AGREGAR COLUMNAS PARA INSTRUCCIONES DE ENTREGA
-- Ejecutar en la base de datos entregax
-- ============================================

-- Columna para la dirección de entrega seleccionada por el cliente
ALTER TABLE maritime_orders 
ADD COLUMN IF NOT EXISTS delivery_address_id INTEGER REFERENCES addresses(id);

-- Columna para instrucciones adicionales (notas del cliente)
ALTER TABLE maritime_orders 
ADD COLUMN IF NOT EXISTS delivery_instructions TEXT;

-- Columna para el costo estimado calculado
ALTER TABLE maritime_orders 
ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10,2);

-- Columna para registrar cuándo se asignaron las instrucciones
ALTER TABLE maritime_orders 
ADD COLUMN IF NOT EXISTS instructions_assigned_at TIMESTAMP;

-- Índice para mejorar búsquedas por dirección
CREATE INDEX IF NOT EXISTS idx_maritime_orders_delivery_address 
ON maritime_orders(delivery_address_id);

-- Comentarios para documentación
COMMENT ON COLUMN maritime_orders.delivery_address_id IS 'ID de la dirección de entrega seleccionada por el cliente';
COMMENT ON COLUMN maritime_orders.delivery_instructions IS 'Notas adicionales del cliente para la entrega';
COMMENT ON COLUMN maritime_orders.estimated_cost IS 'Costo estimado calculado basado en volumen/peso';
COMMENT ON COLUMN maritime_orders.instructions_assigned_at IS 'Fecha/hora cuando el cliente asignó instrucciones';

-- Verificar que las columnas existen
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'maritime_orders' 
AND column_name IN ('delivery_address_id', 'delivery_instructions', 'estimated_cost', 'instructions_assigned_at');
