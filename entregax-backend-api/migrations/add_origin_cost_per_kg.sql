-- Migration: Add origin_cost_per_kg field to air_waybill_costs
-- Simplifies origin cost entry to just cost per kg in MXN

ALTER TABLE air_waybill_costs
ADD COLUMN IF NOT EXISTS origin_cost_per_kg DECIMAL(12,4) DEFAULT 0;

-- Add comment
COMMENT ON COLUMN air_waybill_costs.origin_cost_per_kg IS 'Costo de origen por kg en MXN';
