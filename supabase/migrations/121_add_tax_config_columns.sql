-- Add configurable tax rate for Ganancias
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS ganancias_rate NUMERIC(5,2) DEFAULT 35.00;

-- Add multi-jurisdiction IIBB support
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS iibb_jurisdictions JSONB DEFAULT '[]';

-- Add withholding rules configuration
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS withholding_rules JSONB DEFAULT '[]';
