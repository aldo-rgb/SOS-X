-- Initial data for Supplier Payments Module
-- Run this script to populate payment providers and initial exchange rate

-- Insert payment providers
INSERT INTO payment_providers (name, base_cost_percent, fixed_fee, is_active) VALUES
('Intermex', 2.5, 8.00, true),
('Western Union', 3.0, 10.00, true),
('Remitly', 2.0, 5.00, true),
('Wise', 1.5, 3.00, true)
ON CONFLICT DO NOTHING;

-- Insert initial exchange rate (you can adjust the rate)
INSERT INTO exchange_rates (rate, set_by_admin_id) VALUES (20.50, 1);

-- Verify data was inserted
SELECT 'Payment Providers:' as info;
SELECT * FROM payment_providers;

SELECT 'Current Exchange Rate:' as info;
SELECT * FROM exchange_rates ORDER BY created_at DESC LIMIT 1;
