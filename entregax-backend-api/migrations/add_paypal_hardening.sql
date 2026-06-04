-- ============================================================
-- PayPal hardening: webhooks, intents server-side, refunds
-- ============================================================

-- 1) Webhook ID configurado en el dashboard de PayPal por empresa.
ALTER TABLE fiscal_emitters
    ADD COLUMN IF NOT EXISTS paypal_webhook_id text;

-- 2) Intents servidos: la fuente de verdad del monto y los paquetes a pagar
--    se guarda en BD al crear la orden, NO se confía en el query string del
--    callback. El callback solo trae paypal_order_id (token); todo lo demás
--    se relee de aquí.
CREATE TABLE IF NOT EXISTS paypal_payment_intents (
    id              SERIAL PRIMARY KEY,
    paypal_order_id text NOT NULL UNIQUE,
    payment_ref     text NOT NULL,
    user_id         integer NOT NULL,
    package_ids     jsonb NOT NULL,
    amount          numeric(14,2) NOT NULL,
    currency        text NOT NULL DEFAULT 'MXN',
    service_type    text,
    emitter_id      integer REFERENCES fiscal_emitters(id) ON DELETE SET NULL,
    requires_invoice boolean NOT NULL DEFAULT FALSE,
    invoice_data    jsonb,
    payment_order_id integer,
    payment_reference text,
    success_redirect text,
    cancel_redirect  text,
    status          text NOT NULL DEFAULT 'pending',     -- pending | captured | failed | cancelled
    capture_id      text,
    captured_at     timestamptz,
    failure_code    text,
    failure_detail  text,
    created_at      timestamptz NOT NULL DEFAULT NOW(),
    updated_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS paypal_payment_intents_user_idx
    ON paypal_payment_intents (user_id);
CREATE INDEX IF NOT EXISTS paypal_payment_intents_status_idx
    ON paypal_payment_intents (status);
CREATE INDEX IF NOT EXISTS paypal_payment_intents_payment_ref_idx
    ON paypal_payment_intents (payment_ref);

-- 3) Reembolsos: tabla de auditoría para refunds emitidos vía
--    POST /v2/payments/captures/{capture_id}/refund.
CREATE TABLE IF NOT EXISTS paypal_refunds (
    id           SERIAL PRIMARY KEY,
    capture_id   text NOT NULL,                       -- CAPTURE-XXX original
    refund_id    text UNIQUE,                         -- ID del refund de PayPal
    paypal_order_id text,
    intent_id    integer REFERENCES paypal_payment_intents(id) ON DELETE SET NULL,
    amount       numeric(14,2) NOT NULL,
    currency     text NOT NULL,
    reason       text,
    note_to_payer text,
    status       text NOT NULL DEFAULT 'pending',     -- pending | completed | cancelled | failed
    raw_response jsonb,
    issued_by_user_id integer,
    created_at   timestamptz NOT NULL DEFAULT NOW(),
    updated_at   timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS paypal_refunds_capture_idx
    ON paypal_refunds (capture_id);
CREATE INDEX IF NOT EXISTS paypal_refunds_status_idx
    ON paypal_refunds (status);

-- 4) Log de webhooks recibidos para auditoría e idempotencia.
CREATE TABLE IF NOT EXISTS paypal_webhook_events (
    id                 SERIAL PRIMARY KEY,
    paypal_event_id    text UNIQUE NOT NULL,           -- id que PayPal genera por evento
    event_type         text NOT NULL,                  -- PAYMENT.CAPTURE.COMPLETED, etc.
    resource_type      text,
    resource_id        text,                           -- capture_id / order_id según evento
    verified           boolean NOT NULL DEFAULT FALSE, -- pasó la verificación de firma
    processed          boolean NOT NULL DEFAULT FALSE,
    payload            jsonb NOT NULL,
    headers            jsonb,
    error              text,
    received_at        timestamptz NOT NULL DEFAULT NOW(),
    processed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS paypal_webhook_events_type_idx
    ON paypal_webhook_events (event_type);
CREATE INDEX IF NOT EXISTS paypal_webhook_events_resource_idx
    ON paypal_webhook_events (resource_id);
