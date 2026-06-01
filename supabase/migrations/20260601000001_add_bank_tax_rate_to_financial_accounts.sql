-- =====================================================
-- Migración: Imp. Ley 25413 (déb/créd bancarios) en cuentas financieras
-- =====================================================
-- Agrega bank_tax_rate a financial_accounts para que al registrar
-- cobros/pagos con esa cuenta se ofrezca deducir automáticamente
-- el impuesto a débitos y créditos bancarios (0.6% por defecto).
-- =====================================================

ALTER TABLE financial_accounts
  ADD COLUMN IF NOT EXISTS bank_tax_rate NUMERIC(5,3) DEFAULT NULL
    CHECK (bank_tax_rate IS NULL OR (bank_tax_rate >= 0 AND bank_tax_rate <= 100));

COMMENT ON COLUMN financial_accounts.bank_tax_rate IS
  'Tasa del impuesto Ley 25413 (déb/créd bancarios). NULL = no aplica. Cuando está seteada, al registrar cobros/pagos con esta cuenta se ofrece deducir automáticamente el impuesto.';
