-- Agregar columna recibe_pagos a branches
-- Esta columna indica si una sucursal puede recibir pagos de clientes

ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS recibe_pagos BOOLEAN DEFAULT TRUE;

-- Comentario para documentación
COMMENT ON COLUMN branches.recibe_pagos IS 'Indica si la sucursal está habilitada para recibir pagos de clientes';
