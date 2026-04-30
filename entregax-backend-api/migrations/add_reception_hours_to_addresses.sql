-- Add reception_hours column to addresses table
-- Allows storing delivery reception hours for each address

ALTER TABLE addresses
ADD COLUMN IF NOT EXISTS reception_hours TEXT;

-- Add comment for documentation
COMMENT ON COLUMN addresses.reception_hours IS 'Reception hours for delivery (e.g., "Monday-Friday 9:00 AM - 6:00 PM")';
