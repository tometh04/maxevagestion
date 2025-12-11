-- Add destination column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS destination TEXT;

-- Make email nullable (customers from Trello may not have email)
ALTER TABLE customers ALTER COLUMN email DROP NOT NULL;
