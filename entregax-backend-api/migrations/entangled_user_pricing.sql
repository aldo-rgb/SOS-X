-- Override de porcentaje de compra ENTANGLED por usuario (cliente).
-- Si existe registro para el user_id, ese porcentaje pisa el global de
-- entangled_pricing_config.porcentaje_compra al cotizar.

CREATE TABLE IF NOT EXISTS entangled_user_pricing (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  porcentaje_compra NUMERIC(5,2) NOT NULL,
  notes TEXT,
  set_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
