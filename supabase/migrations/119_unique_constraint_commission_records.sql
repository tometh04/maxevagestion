-- Prevent duplicate commissions for same operation+seller
-- First, remove any existing duplicates (keep the most recent)
DELETE FROM commission_records a
USING commission_records b
WHERE a.id < b.id
AND a.operation_id = b.operation_id
AND a.seller_id = b.seller_id;

-- Add unique constraint
ALTER TABLE commission_records
ADD CONSTRAINT unique_commission_operation_seller
UNIQUE (operation_id, seller_id);
