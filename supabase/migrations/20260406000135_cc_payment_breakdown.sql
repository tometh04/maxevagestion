-- Migration: Credit Card Payment Breakdown
-- Allows breaking down a CC payment into: GASTOS_AGENCIA, VENTAS, RETIRO_PERSONAL

-- Table to group items belonging to the same CC payment
CREATE TABLE IF NOT EXISTS cc_payment_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_card_account_id UUID NOT NULL REFERENCES financial_accounts(id),
  source_account_id UUID NOT NULL REFERENCES financial_accounts(id),
  total_amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  exchange_rate NUMERIC(18,4),
  payment_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cc_payment_groups_date ON cc_payment_groups(payment_date);
CREATE INDEX idx_cc_payment_groups_card ON cc_payment_groups(credit_card_account_id);

-- Add expense classification to cash_movements
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS expense_classification TEXT
    CHECK (expense_classification IN ('GASTOS_AGENCIA', 'VENTAS', 'RETIRO_PERSONAL'));

-- Add FK to link cash_movements to a CC payment group
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS cc_payment_group_id UUID REFERENCES cc_payment_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_cash_movements_cc_group ON cash_movements(cc_payment_group_id)
  WHERE cc_payment_group_id IS NOT NULL;

-- Disable RLS (matches pattern of expense_receipts and other admin tables)
ALTER TABLE cc_payment_groups DISABLE ROW LEVEL SECURITY;
