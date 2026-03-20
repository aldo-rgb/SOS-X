-- ============================================
-- MIGRACIÓN: Pago de costos DHL
-- Fecha: 19 de marzo de 2026
-- Propósito: Tracking de pagos de lotes de costo DHL
-- ============================================

-- Tabla de lotes de pago de costos DHL
CREATE TABLE IF NOT EXISTS dhl_cost_payment_batches (
    id SERIAL PRIMARY KEY,
    batch_number VARCHAR(50) NOT NULL UNIQUE,
    total_shipments INTEGER NOT NULL DEFAULT 0,
    total_agencia DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_liberacion DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_otros DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    date_from DATE,
    date_to DATE,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Columnas de pago en dhl_shipments
ALTER TABLE dhl_shipments ADD COLUMN IF NOT EXISTS cost_payment_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE dhl_shipments ADD COLUMN IF NOT EXISTS cost_paid_at TIMESTAMP;
ALTER TABLE dhl_shipments ADD COLUMN IF NOT EXISTS cost_paid_by INTEGER REFERENCES users(id);
ALTER TABLE dhl_shipments ADD COLUMN IF NOT EXISTS cost_payment_batch_id INTEGER REFERENCES dhl_cost_payment_batches(id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_dhl_shipments_cost_payment_status ON dhl_shipments(cost_payment_status);
CREATE INDEX IF NOT EXISTS idx_dhl_shipments_cost_payment_batch ON dhl_shipments(cost_payment_batch_id);
CREATE INDEX IF NOT EXISTS idx_dhl_shipments_created_at ON dhl_shipments(created_at);

COMMENT ON COLUMN dhl_shipments.cost_payment_status IS 'Estado del pago de costo: pending, paid';
COMMENT ON TABLE dhl_cost_payment_batches IS 'Lotes de pago de costos DHL a agencia/liberación';

-- Actualizar envíos existentes: los que tienen costo asignado pero no status de pago
UPDATE dhl_shipments SET cost_payment_status = 'pending' WHERE cost_payment_status IS NULL AND assigned_cost_usd IS NOT NULL;

SELECT 'Migración de pago de costos DHL completada' AS resultado;
