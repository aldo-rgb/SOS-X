-- Migration: store per-box dimensions/weight for a LOG maritime order
-- so that we can generate PQTX multipieza guides correctly.

ALTER TABLE maritime_orders
  ADD COLUMN IF NOT EXISTS box_dimensions JSONB DEFAULT '[]'::jsonb;

-- index for quick lookups (optional)
CREATE INDEX IF NOT EXISTS idx_maritime_orders_box_dim
  ON maritime_orders((jsonb_array_length(box_dimensions)));
