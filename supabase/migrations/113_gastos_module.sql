-- Migration 113: Gastos Module
-- Adds category_id to cash_movements and creates expense_receipts bridge table

-- A) Add category_id FK to cash_movements (links to recurring_payment_categories)
-- The existing 'category' text column stays for backward compatibility
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES recurring_payment_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cash_movements_category_id ON cash_movements(category_id);

-- B) Create expense_receipts bridge table
-- Links documents (receipts/proofs) to either cash_movements or recurring_payments
CREATE TABLE IF NOT EXISTS expense_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  cash_movement_id UUID REFERENCES cash_movements(id) ON DELETE CASCADE,
  recurring_payment_id UUID REFERENCES recurring_payments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- At least one expense reference must be set
  CONSTRAINT expense_receipts_has_reference CHECK (
    cash_movement_id IS NOT NULL OR recurring_payment_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_cash_movement ON expense_receipts(cash_movement_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_recurring_payment ON expense_receipts(recurring_payment_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_document ON expense_receipts(document_id);

-- Disable RLS (admin-only access via service role key)
ALTER TABLE expense_receipts DISABLE ROW LEVEL SECURITY;

-- Add comment for clarity
COMMENT ON TABLE expense_receipts IS 'Bridge table linking receipt documents to expenses (variable or recurring)';
COMMENT ON TABLE recurring_payment_categories IS 'Categorías de gastos (usadas tanto para fijos/recurrentes como variables)';
