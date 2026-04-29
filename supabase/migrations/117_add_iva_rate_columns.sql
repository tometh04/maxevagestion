-- Add IVA rate and service type columns to iva_sales
ALTER TABLE iva_sales ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5,4) DEFAULT 0.21;
ALTER TABLE iva_sales ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'INTERMEDIACION';
ALTER TABLE iva_sales ADD COLUMN IF NOT EXISTS is_exempt BOOLEAN DEFAULT false;

-- Add IVA rate column to iva_purchases
ALTER TABLE iva_purchases ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5,4) DEFAULT 0.21;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_iva_sales_service_type ON iva_sales(service_type);
CREATE INDEX IF NOT EXISTS idx_iva_sales_is_exempt ON iva_sales(is_exempt);
