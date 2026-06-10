-- Add custom_product_types column to operation_settings
-- Allows agencies to define custom product type options beyond the standard set
ALTER TABLE operation_settings
  ADD COLUMN IF NOT EXISTS custom_product_types JSONB DEFAULT '[]'::jsonb;
