-- =====================================================================
-- FACTURAMA: Recepción automática de CFDI (Buzón Fiscal)
-- Multi-emisor: cada RFC tiene sus propias credenciales Facturama
-- =====================================================================

-- 1. Credenciales Facturama por emisor
ALTER TABLE fiscal_emitters
    ADD COLUMN IF NOT EXISTS facturama_username        VARCHAR(255),
    ADD COLUMN IF NOT EXISTS facturama_password        TEXT,
    ADD COLUMN IF NOT EXISTS facturama_environment     VARCHAR(20) DEFAULT 'sandbox',  -- sandbox | production
    ADD COLUMN IF NOT EXISTS facturama_reception_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS facturama_webhook_secret  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS facturama_configured      BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS facturama_last_sync       TIMESTAMP,
    ADD COLUMN IF NOT EXISTS facturama_last_sync_count INTEGER DEFAULT 0;

-- 2. Cuentas por Pagar: extender accounting_received_invoices con flujo de aprobación
ALTER TABLE accounting_received_invoices
    ADD COLUMN IF NOT EXISTS detection_source     VARCHAR(30) DEFAULT 'manual',
        -- manual | facturama_webhook | facturama_sync | sat_descarga_masiva
    ADD COLUMN IF NOT EXISTS facturama_id         VARCHAR(64),
        -- ID interno que Facturama asigna al CFDI recibido
    ADD COLUMN IF NOT EXISTS approval_status      VARCHAR(20) DEFAULT 'pending',
        -- pending | approved | rejected
    ADD COLUMN IF NOT EXISTS approved_by          INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS approved_at          TIMESTAMP,
    ADD COLUMN IF NOT EXISTS rejection_reason     TEXT,
    ADD COLUMN IF NOT EXISTS due_date             DATE,
    ADD COLUMN IF NOT EXISTS xml_url              VARCHAR(500),
    ADD COLUMN IF NOT EXISTS scheduled_payment_date DATE,
    ADD COLUMN IF NOT EXISTS paid_at              TIMESTAMP,
    ADD COLUMN IF NOT EXISTS paid_amount          NUMERIC(14,4),
    ADD COLUMN IF NOT EXISTS paid_reference       VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_acc_recinv_approval ON accounting_received_invoices(approval_status);
CREATE INDEX IF NOT EXISTS idx_acc_recinv_source   ON accounting_received_invoices(detection_source);
CREATE INDEX IF NOT EXISTS idx_acc_recinv_facturama ON accounting_received_invoices(facturama_id);

-- 3. Log de webhooks Facturama (para auditoría / replay)
CREATE TABLE IF NOT EXISTS facturama_webhook_logs (
    id SERIAL PRIMARY KEY,
    fiscal_emitter_id INTEGER REFERENCES fiscal_emitters(id) ON DELETE CASCADE,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    event_type VARCHAR(80),
    raw_payload JSONB,
    signature_header TEXT,
    signature_valid BOOLEAN,
    processed BOOLEAN DEFAULT FALSE,
    received_invoice_id INTEGER REFERENCES accounting_received_invoices(id) ON DELETE SET NULL,
    error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_fac_webhook_emitter ON facturama_webhook_logs(fiscal_emitter_id);
CREATE INDEX IF NOT EXISTS idx_fac_webhook_received ON facturama_webhook_logs(received_at DESC);

-- 4. Permisos de contabilidad: Cuentas por Pagar + Facturama
INSERT INTO permissions (slug, name, category) VALUES
    ('accounting.payables.view',    'Contable: Ver Cuentas por Pagar',     'Contable'),
    ('accounting.payables.approve', 'Contable: Aprobar Cuentas por Pagar', 'Contable'),
    ('accounting.payables.pay',     'Contable: Marcar como Pagada',        'Contable'),
    ('accounting.facturama.config', 'Contable: Configurar Facturama',      'Contable')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category;

-- Super Admin: todos
INSERT INTO role_permissions (role, permission_id)
SELECT 'Super Admin', id FROM permissions
WHERE slug IN ('accounting.payables.view','accounting.payables.approve','accounting.payables.pay','accounting.facturama.config')
ON CONFLICT DO NOTHING;

-- Contador: ver y aprobar (pero no marcar pagada ni configurar credenciales)
INSERT INTO role_permissions (role, permission_id)
SELECT 'Contador', id FROM permissions
WHERE slug IN ('accounting.payables.view','accounting.payables.approve')
ON CONFLICT DO NOTHING;

-- Admin / Director: ver, aprobar y pagar
INSERT INTO role_permissions (role, permission_id)
SELECT r.role, p.id
FROM (VALUES ('Admin'), ('Director')) AS r(role)
CROSS JOIN permissions p
WHERE p.slug IN ('accounting.payables.view','accounting.payables.approve','accounting.payables.pay','accounting.facturama.config')
ON CONFLICT DO NOTHING;
