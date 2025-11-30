-- =====================================================
-- Migración 031: Agregar deposit_account_id a leads
-- =====================================================
-- Permite asociar el depósito de un lead a una cuenta financiera específica

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS deposit_account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_leads_deposit_account ON leads(deposit_account_id) WHERE deposit_account_id IS NOT NULL;

-- Comentario para documentación
COMMENT ON COLUMN leads.deposit_account_id IS 'Cuenta financiera donde ingresó el depósito del lead';

