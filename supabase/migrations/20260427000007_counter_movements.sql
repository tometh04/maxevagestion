-- Sistema de contra-movimientos (#17 reunión Gabi)
-- Reemplaza "borrar movement" con "reversar": genera movimiento opuesto + audit trail.

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS reverses_movement_id UUID REFERENCES cash_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_movement_id UUID REFERENCES cash_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_cash_movements_reverses
  ON cash_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;

ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS reverses_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_ledger_movements_reverses
  ON ledger_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;

COMMENT ON COLUMN cash_movements.reverses_movement_id IS
  'Si este row es una reversión, apunta al cash_movement original que reversó';
COMMENT ON COLUMN cash_movements.reversed_at IS
  'Si este row fue reversado, cuándo. NULL si no fue reversado.';
