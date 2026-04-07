-- Add invoice amount entry mode and explicit tax treatment for invoice items

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS amount_entry_mode TEXT NOT NULL DEFAULT 'NET'
CHECK (amount_entry_mode IN ('NET', 'FINAL'));

ALTER TABLE invoice_items
ADD COLUMN IF NOT EXISTS tax_treatment TEXT NOT NULL DEFAULT 'GRAVADO'
CHECK (tax_treatment IN ('GRAVADO', 'EXENTO', 'NO_GRAVADO'));

COMMENT ON COLUMN invoices.amount_entry_mode IS 'How entered amounts should be interpreted: NET or FINAL';
COMMENT ON COLUMN invoice_items.tax_treatment IS 'AFIP tax bucket for the item: GRAVADO, EXENTO, NO_GRAVADO';
