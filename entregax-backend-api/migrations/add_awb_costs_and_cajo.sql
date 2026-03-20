-- ============================================
-- Migration: Air Waybill Costs + CAJO Guides
-- Date: 2026-03-19
-- Purpose: 
--   1. cajo_guides: Guías de clientes no-S (CAJO) 
--   2. air_waybill_costs: Costeo AWB estilo marítimo
-- ============================================

-- ==========================================
-- 1. TABLA: cajo_guides
-- Almacena guías de clientes que NO inician con "S"
-- (registradas desde la extracción AWB+PL)
-- ==========================================
CREATE TABLE IF NOT EXISTS cajo_guides (
    id SERIAL PRIMARY KEY,
    guia_air VARCHAR(100),
    cliente VARCHAR(100),
    no_caja VARCHAR(50),
    peso_kg DECIMAL(10,2),
    largo DECIMAL(10,2),
    ancho DECIMAL(10,2),
    alto DECIMAL(10,2),
    volumen DECIMAL(10,4),
    tipo VARCHAR(50) DEFAULT 'Generico',
    observaciones TEXT,
    vuelo VARCHAR(100),
    guia_vuelo VARCHAR(100),
    mawb VARCHAR(100),
    awb_draft_id INTEGER,
    paqueteria VARCHAR(100),
    guia_entrega VARCHAR(100),
    no_tarima VARCHAR(50),
    fecha_registro DATE DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'registered',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cajo_guides_guia_air ON cajo_guides(guia_air);
CREATE INDEX IF NOT EXISTS idx_cajo_guides_cliente ON cajo_guides(cliente);
CREATE INDEX IF NOT EXISTS idx_cajo_guides_mawb ON cajo_guides(mawb);
CREATE INDEX IF NOT EXISTS idx_cajo_guides_status ON cajo_guides(status);
CREATE INDEX IF NOT EXISTS idx_cajo_guides_draft ON cajo_guides(awb_draft_id);

-- Unique constraint: guia_air + cliente (para upsert)
-- Si ya existe esa combinación, se actualiza
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cajo_guides_unique_guia_cliente'
  ) THEN
    CREATE UNIQUE INDEX idx_cajo_guides_unique_guia_cliente 
      ON cajo_guides(guia_air, cliente) 
      WHERE guia_air IS NOT NULL AND cliente IS NOT NULL;
  END IF;
END
$$;

-- ==========================================
-- 2. TABLA: air_waybill_costs
-- Costeo por Air Waybill (similar a container_costs marítimo)
-- Cada AWB aprobado genera una línea aquí
-- ==========================================
CREATE TABLE IF NOT EXISTS air_waybill_costs (
    id SERIAL PRIMARY KEY,
    awb_number VARCHAR(100) UNIQUE NOT NULL,
    awb_draft_id INTEGER,

    -- Datos del AWB (extraídos por IA)
    shipper_name TEXT,
    consignee TEXT,
    carrier VARCHAR(100),
    origin_airport VARCHAR(10),
    destination_airport VARCHAR(10),
    flight_number VARCHAR(50),
    flight_date DATE,
    pieces INTEGER,
    gross_weight_kg DECIMAL(10,2),
    total_cost_amount DECIMAL(12,2),
    total_cost_currency VARCHAR(10) DEFAULT 'HKD',

    -- Gastos en Origen
    freight_cost DECIMAL(12,2) DEFAULT 0,
    freight_cost_pdf TEXT,
    origin_handling DECIMAL(12,2) DEFAULT 0,
    origin_handling_pdf TEXT,

    -- Gastos de Liberación
    customs_clearance DECIMAL(12,2) DEFAULT 0,
    customs_clearance_pdf TEXT,
    custody_fee DECIMAL(12,2) DEFAULT 0,
    custody_fee_pdf TEXT,
    aa_expenses DECIMAL(12,2) DEFAULT 0,
    aa_expenses_pdf TEXT,
    storage_fee DECIMAL(12,2) DEFAULT 0,
    storage_fee_pdf TEXT,

    -- Gastos Logísticos
    transport_cost DECIMAL(12,2) DEFAULT 0,
    transport_cost_pdf TEXT,
    other_cost DECIMAL(12,2) DEFAULT 0,
    other_cost_pdf TEXT,
    other_cost_description TEXT,

    -- Documentos
    awb_pdf_url TEXT,
    packing_list_url TEXT,

    -- Totales calculados
    calc_total_origin DECIMAL(12,2) DEFAULT 0,
    calc_total_release DECIMAL(12,2) DEFAULT 0,
    calc_total_logistics DECIMAL(12,2) DEFAULT 0,
    calc_grand_total DECIMAL(12,2) DEFAULT 0,
    calc_cost_per_kg DECIMAL(12,4) DEFAULT 0,

    -- Estado
    is_fully_costed BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,

    -- Conteo de paquetes registrados
    total_packages_s INTEGER DEFAULT 0,
    total_packages_cajo INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_awb_costs_status ON air_waybill_costs(status);
CREATE INDEX IF NOT EXISTS idx_awb_costs_draft ON air_waybill_costs(awb_draft_id);
CREATE INDEX IF NOT EXISTS idx_awb_costs_date ON air_waybill_costs(flight_date);

-- ==========================================
-- 3. Agregar columna awb_cost_id a packages (vinculación)
-- ==========================================
ALTER TABLE packages ADD COLUMN IF NOT EXISTS awb_cost_id INTEGER;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS air_source VARCHAR(20) DEFAULT NULL;

-- ==========================================
-- Confirmación
-- ==========================================
DO $$
BEGIN
  RAISE NOTICE '✅ Migration completada: air_waybill_costs + cajo_guides';
END
$$;
