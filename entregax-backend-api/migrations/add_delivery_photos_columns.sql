-- Fotos de confirmación de entrega capturadas por el monitorista.
ALTER TABLE containers ADD COLUMN IF NOT EXISTS delivery_photo_1_url TEXT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS delivery_photo_2_url TEXT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS delivery_photo_3_url TEXT;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMP;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS delivery_confirmed_by INT REFERENCES users(id);
ALTER TABLE containers ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
