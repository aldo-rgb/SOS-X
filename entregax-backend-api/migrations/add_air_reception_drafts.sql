-- ============================================
-- MIGRACIÓN: Panel Correos Entrantes - Aéreo
-- Tabla para borradores de recepciones aéreas
-- ============================================

-- Tabla principal de borradores aéreos
CREATE TABLE IF NOT EXISTS air_reception_drafts (
    id SERIAL PRIMARY KEY,
    
    -- Origen del correo
    from_email VARCHAR(255),
    from_name VARCHAR(255),
    subject TEXT,
    
    -- Tipo de documento
    document_type VARCHAR(20) DEFAULT 'AIR',  -- AIR (siempre aéreo)
    
    -- Datos extraídos por IA (AWB + Excel combinados)
    extracted_data JSONB DEFAULT '{}'::jsonb,
    
    -- Confianza de la extracción IA
    confidence VARCHAR(20) DEFAULT 'low',  -- high, medium, low
    
    -- AWB data (extraído del PDF)
    awb_number VARCHAR(50),           -- MAWB: 272-75669230
    shipper_name TEXT,                 -- MAI RUI ELECTRONICS LIMITED
    consignee TEXT,                    -- GRUPO COORDINADOR EN COMERCIO...
    carrier VARCHAR(100),              -- KALITTA AIR
    origin_airport VARCHAR(10),        -- HKG
    destination_airport VARCHAR(10),   -- NLU
    flight_number VARCHAR(20),         -- K4533
    flight_date DATE,                  -- 2026-03-15
    pieces INTEGER,                    -- 152
    gross_weight_kg NUMERIC(10,2),     -- 3074.0
    total_cost_amount NUMERIC(12,2),   -- 4562.60
    total_cost_currency VARCHAR(10) DEFAULT 'HKD',  -- Currency
    
    -- Archivos adjuntos (URLs a S3)
    awb_pdf_url TEXT,                  -- PDF de la guía aérea
    awb_pdf_filename VARCHAR(255),
    packing_list_excel_url TEXT,       -- Excel del packing list
    packing_list_excel_filename VARCHAR(255),
    
    -- Estado del borrador
    status VARCHAR(20) DEFAULT 'draft',  -- draft, approved, rejected
    rejection_reason TEXT,
    
    -- Quién aprobó/rechazó
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    
    -- Referencia al correo original
    email_message_id VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_air_drafts_status ON air_reception_drafts(status);
CREATE INDEX IF NOT EXISTS idx_air_drafts_awb ON air_reception_drafts(awb_number);
CREATE INDEX IF NOT EXISTS idx_air_drafts_created ON air_reception_drafts(created_at DESC);

-- Whitelist de correos aéreos (reutilizamos la whitelist existente o creamos una separada)
CREATE TABLE IF NOT EXISTS air_email_whitelist (
    id SERIAL PRIMARY KEY,
    email_pattern VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Logs de correos recibidos para diagnóstico
CREATE TABLE IF NOT EXISTS air_email_inbound_logs (
    id SERIAL PRIMARY KEY,
    from_email VARCHAR(255),
    subject TEXT,
    received_at TIMESTAMP DEFAULT NOW(),
    processed BOOLEAN DEFAULT false,
    error_message TEXT,
    raw_headers JSONB
);

SELECT 'Migración air_reception_drafts completada' AS result;
