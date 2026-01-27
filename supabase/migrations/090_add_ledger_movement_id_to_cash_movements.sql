-- =====================================================
-- Migración 090: ledger_movement_id en cash_movements
-- =====================================================
-- Vincula cada movimiento de caja con su ledger_movement para DELETE
-- correcto e invalidación de caché de balances.

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS ledger_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cash_movements_ledger_movement
  ON cash_movements(ledger_movement_id) WHERE ledger_movement_id IS NOT NULL;

COMMENT ON COLUMN cash_movements.ledger_movement_id IS 'Ledger movement asociado (para eliminación e invalidación de caché)';
