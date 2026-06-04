-- Idempotencia para webhooks de pago (PayPal capture, Openpay charge).
-- Sin este índice, un reintento del callback de PayPal causa doble registro
-- en openpay_webhook_logs y por tanto doble conteo en el dashboard de cobranza.
--
-- Antes de crear el índice limpiamos duplicados existentes dejando solo el
-- primer registro de cada transaction_id (los duplicados serían reintentos).
WITH dups AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY transaction_id ORDER BY id) AS rn
      FROM openpay_webhook_logs
     WHERE transaction_id IS NOT NULL
       AND transaction_id <> ''
)
DELETE FROM openpay_webhook_logs
 WHERE id IN (SELECT id FROM dups WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS openpay_webhook_logs_transaction_id_uniq
    ON openpay_webhook_logs (transaction_id)
 WHERE transaction_id IS NOT NULL AND transaction_id <> '';
