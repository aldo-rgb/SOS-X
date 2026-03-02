-- ============================================
-- MIGRACIÓN: Tarifas de Costo DHL
-- Fecha: 2 de marzo de 2026
-- Propósito: Agregar tarifas de costo interno para AA_DHL
-- ============================================

-- Tabla de tarifas de costo DHL (lo que nos cuesta a nosotros)
CREATE TABLE IF NOT EXISTS dhl_cost_rates (
    id SERIAL PRIMARY KEY,
    rate_type VARCHAR(50) NOT NULL UNIQUE, -- 'standard', 'high_value'
    rate_name VARCHAR(100) NOT NULL,
    cost_usd DECIMAL(10,2) NOT NULL DEFAULT 0, -- Costo en USD
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insertar tarifas por defecto si no existen
INSERT INTO dhl_cost_rates (rate_type, rate_name, cost_usd, description)
VALUES 
    ('standard', 'Standard', 0, 'Costo por envío DHL Standard'),
    ('high_value', 'High Value', 0, 'Costo por envío DHL High Value')
ON CONFLICT (rate_type) DO NOTHING;

-- Agregar columna de costo asignado a los envíos DHL (si no existe)
ALTER TABLE dhl_shipments ADD COLUMN IF NOT EXISTS assigned_cost_usd DECIMAL(10,2);
ALTER TABLE dhl_shipments ADD COLUMN IF NOT EXISTS cost_rate_type VARCHAR(50);
ALTER TABLE dhl_shipments ADD COLUMN IF NOT EXISTS cost_assigned_at TIMESTAMP;
ALTER TABLE dhl_shipments ADD COLUMN IF NOT EXISTS cost_assigned_by INTEGER;

-- Agregar foreign key solo si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'dhl_shipments_cost_assigned_by_fkey'
  ) THEN
    ALTER TABLE dhl_shipments 
    ADD CONSTRAINT dhl_shipments_cost_assigned_by_fkey 
    FOREIGN KEY (cost_assigned_by) REFERENCES users(id);
  END IF;
EXCEPTION WHEN others THEN
  -- Ignorar si falla (puede ser que ya exista o no se pueda crear)
  NULL;
END $$;

-- Índice para búsqueda rápida por costo
CREATE INDEX IF NOT EXISTS idx_dhl_shipments_cost ON dhl_shipments(assigned_cost_usd);
CREATE INDEX IF NOT EXISTS idx_dhl_shipments_cost_type ON dhl_shipments(cost_rate_type);

-- Comentarios
COMMENT ON TABLE dhl_cost_rates IS 'Tarifas de costo interno para envíos DHL (lo que nos cuesta)';
COMMENT ON COLUMN dhl_cost_rates.cost_usd IS 'Costo en USD que pagamos a DHL';
COMMENT ON COLUMN dhl_shipments.assigned_cost_usd IS 'Costo asignado a este envío específico';

SELECT 'Migración de tarifas de costo DHL completada' as resultado;
