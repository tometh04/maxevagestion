-- Add payer_name to payments to support receipts issued to the passenger who paid
-- rather than defaulting to the titular of the operation.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_name TEXT;
