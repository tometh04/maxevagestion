-- Add destination column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS destination TEXT;
