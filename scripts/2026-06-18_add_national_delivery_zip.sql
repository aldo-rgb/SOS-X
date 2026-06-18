-- Almacena el CP de entrega real (para Ocurre = CP de sucursal, para domicilio = CP del cliente)
ALTER TABLE packages ADD COLUMN IF NOT EXISTS national_delivery_zip VARCHAR(10);
