-- ============================================
-- TABLA: advisor_commissions
-- Registro persistente de comisiones generadas
-- por guías/embarques pagados
-- ============================================

CREATE TABLE IF NOT EXISTS advisor_commissions (
    id                      SERIAL PRIMARY KEY,
    
    -- Asesor que recibe la comisión
    advisor_id              INTEGER NOT NULL REFERENCES users(id),
    advisor_name            VARCHAR(255),
    
    -- Líder del asesor (si aplica override)
    leader_id               INTEGER REFERENCES users(id),
    leader_name             VARCHAR(255),
    
    -- Tipo de embarque: PKG, MAR, DHL, GEX
    shipment_type           VARCHAR(20) NOT NULL,
    -- ID del registro fuente (packages.id, maritime_orders.id, dhl_shipments.id, warranties.id)
    shipment_id             INTEGER NOT NULL,
    
    -- Tipo de servicio (coincide con commission_rates.service_type)
    service_type            VARCHAR(50) NOT NULL,
    
    -- Tracking para referencia
    tracking                VARCHAR(255),
    
    -- Cliente que pagó
    client_id               INTEGER REFERENCES users(id),
    client_name             VARCHAR(255),
    
    -- Monto base del pago en MXN
    payment_amount_mxn      DECIMAL(12,2) NOT NULL DEFAULT 0,
    
    -- Comisión del asesor
    commission_rate_pct     DECIMAL(6,2) NOT NULL DEFAULT 0,
    commission_amount_mxn   DECIMAL(12,2) NOT NULL DEFAULT 0,
    
    -- Override del líder
    leader_override_pct     DECIMAL(6,2) DEFAULT 0,
    leader_override_amount  DECIMAL(12,2) DEFAULT 0,
    
    -- Comisión GEX (si aplica)
    gex_commission_mxn      DECIMAL(12,2) DEFAULT 0,
    
    -- Estado de pago al asesor
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | paid
    paid_to_advisor_at      TIMESTAMP,
    paid_by_admin_id        INTEGER REFERENCES users(id),
    payment_notes           TEXT,
    
    -- Auditoría
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_adv_comm_advisor ON advisor_commissions(advisor_id);
CREATE INDEX IF NOT EXISTS idx_adv_comm_client ON advisor_commissions(client_id);
CREATE INDEX IF NOT EXISTS idx_adv_comm_status ON advisor_commissions(status);
CREATE INDEX IF NOT EXISTS idx_adv_comm_service ON advisor_commissions(service_type);
CREATE INDEX IF NOT EXISTS idx_adv_comm_created ON advisor_commissions(created_at);
CREATE INDEX IF NOT EXISTS idx_adv_comm_shipment ON advisor_commissions(shipment_type, shipment_id);

-- Evitar comisiones duplicadas por el mismo embarque+asesor
CREATE UNIQUE INDEX IF NOT EXISTS idx_adv_comm_unique_shipment 
    ON advisor_commissions(advisor_id, shipment_type, shipment_id);

-- Agregar columna is_gex a commission_rates si no existe
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'commission_rates' AND column_name = 'is_gex'
    ) THEN
        ALTER TABLE commission_rates ADD COLUMN is_gex BOOLEAN DEFAULT false;
    END IF;
END $$;
