-- Vincular pagos manuales con el operador y la deuda específica a operador
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES operators(id) ON DELETE SET NULL;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS operator_payment_id UUID REFERENCES operator_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_operator_id ON payments(operator_id)
WHERE operator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_operator_payment_id ON payments(operator_payment_id)
WHERE operator_payment_id IS NOT NULL;

COMMENT ON COLUMN payments.operator_id IS 'Operador asociado al pago cuando payer_type = OPERATOR.';
COMMENT ON COLUMN payments.operator_payment_id IS 'Deuda específica de operator_payments que este pago cancela total o parcialmente.';

-- Backfill para pagos ya existentes que quedaron vinculados al principal
UPDATE payments p
SET operator_id = op.operator_id
FROM operator_payments op
WHERE p.operator_id IS NULL
  AND p.operator_payment_id IS NULL
  AND p.payer_type = 'OPERATOR'
  AND p.operation_id = op.operation_id
  AND p.ledger_movement_id IS NOT NULL
  AND op.ledger_movement_id = p.ledger_movement_id;

UPDATE payments p
SET
  operator_id = COALESCE(p.operator_id, op.operator_id),
  operator_payment_id = COALESCE(p.operator_payment_id, op.id)
FROM operator_payments op
WHERE p.payer_type = 'OPERATOR'
  AND p.operation_id = op.operation_id
  AND p.operator_payment_id IS NULL
  AND p.status = 'PAID'
  AND p.operator_id = op.operator_id
  AND ABS(COALESCE(op.paid_amount, 0) - p.amount) < 0.01;
