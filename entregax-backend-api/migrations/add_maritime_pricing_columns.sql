-- Migration: Add missing pricing columns to maritime_orders
-- These columns are needed by pricingEngine.assignPriceToMaritimeOrder()
-- to freeze the price at container assignment time.

-- Sale price in USD (frozen at assignment)
ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS assigned_cost_usd NUMERIC(12,2);

-- When the price was assigned
ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS cost_assigned_at TIMESTAMP;

-- Which admin assigned the price
ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS cost_assigned_by INTEGER REFERENCES users(id);

-- Registered exchange rate at time of pricing
ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS registered_exchange_rate NUMERIC(10,4);

-- Index for unpaid orders
CREATE INDEX IF NOT EXISTS idx_maritime_orders_payment_pending 
ON maritime_orders(payment_status) WHERE payment_status != 'paid';
