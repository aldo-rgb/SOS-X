-- ============================================================================
-- ENTANGLED Integration: Triangulación de Pagos y Facturación Internacional
-- ============================================================================
-- Tabla independiente para no afectar el módulo legacy supplier_payments.
-- Aquí se almacenan las solicitudes que viajan al motor externo ENTANGLED.
-- Los webhooks del motor actualizan el estatus, factura_url y comprobante_url.
-- ============================================================================

CREATE TABLE IF NOT EXISTS entangled_payment_requests (
    id                          SERIAL PRIMARY KEY,

    -- Vínculo con XOX
    user_id                     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    advisor_id                  INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Identificador del motor externo (regresa en la respuesta de la Fase 1)
    entangled_transaccion_id    VARCHAR(80) UNIQUE,

    -- Datos fiscales del cliente final (snapshot al momento de la solicitud)
    cf_rfc                      VARCHAR(20)  NOT NULL,
    cf_razon_social             VARCHAR(255) NOT NULL,
    cf_regimen_fiscal           VARCHAR(10)  NOT NULL,
    cf_cp                       VARCHAR(10)  NOT NULL,
    cf_uso_cfdi                 VARCHAR(10)  NOT NULL,
    cf_email                    VARCHAR(180) NOT NULL,

    -- Operación
    op_monto                    NUMERIC(14,2) NOT NULL,
    op_divisa_destino           VARCHAR(8)    NOT NULL DEFAULT 'RMB',
    op_conceptos                JSONB         NOT NULL DEFAULT '[]'::jsonb,
    op_comprobante_cliente_url  TEXT          NOT NULL,

    -- Comisiones
    comision_asesor             NUMERIC(14,2) NOT NULL DEFAULT 0,
    comision_xox                NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- Estatus de las dos rutas asíncronas
    estatus_global              VARCHAR(30) NOT NULL DEFAULT 'pendiente',
        -- pendiente | en_proceso | completado | rechazado | error_envio
    estatus_factura             VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        -- pendiente | emitida | cancelada
    estatus_proveedor           VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        -- pendiente | enviado | completado | rechazado

    -- Documentos entregados por ENTANGLED
    factura_url                 TEXT,
    factura_nombre_archivo      VARCHAR(255),
    factura_emitida_at          TIMESTAMP,

    comprobante_proveedor_url   TEXT,
    proveedor_moneda_enviada    VARCHAR(8),
    proveedor_monto_enviado     NUMERIC(14,2),
    proveedor_cuenta_destino    VARCHAR(255),
    proveedor_pagado_at         TIMESTAMP,

    -- Auditoría
    last_webhook_at             TIMESTAMP,
    raw_response                JSONB,
    error_message               TEXT,

    created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entangled_user_id            ON entangled_payment_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_entangled_transaccion_id     ON entangled_payment_requests(entangled_transaccion_id);
CREATE INDEX IF NOT EXISTS idx_entangled_estatus_global     ON entangled_payment_requests(estatus_global);
CREATE INDEX IF NOT EXISTS idx_entangled_created_at         ON entangled_payment_requests(created_at DESC);

-- Bitácora de webhooks recibidos (debug/auditoría)
CREATE TABLE IF NOT EXISTS entangled_webhook_logs (
    id                  SERIAL PRIMARY KEY,
    request_id          INTEGER REFERENCES entangled_payment_requests(id) ON DELETE SET NULL,
    transaccion_id      VARCHAR(80),
    evento              VARCHAR(60),
    payload             JSONB NOT NULL,
    received_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed           BOOLEAN NOT NULL DEFAULT FALSE,
    process_error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_entangled_logs_transaccion ON entangled_webhook_logs(transaccion_id);
CREATE INDEX IF NOT EXISTS idx_entangled_logs_received_at ON entangled_webhook_logs(received_at DESC);
