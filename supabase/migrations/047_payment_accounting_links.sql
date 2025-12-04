-- =====================================================
-- Migración 047: Links entre pagos y movimientos contables
-- =====================================================
-- Conectar payments con ledger_movements y cash_movements

-- 1. Agregar columna ledger_movement_id a payments
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS ledger_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL;

-- 2. Agregar columna payment_id a cash_movements
ALTER TABLE cash_movements 
ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL;

-- 3. Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_payments_ledger_movement ON payments(ledger_movement_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_payment ON cash_movements(payment_id);

-- Comentarios
COMMENT ON COLUMN payments.ledger_movement_id IS 'Referencia al movimiento en el libro mayor generado por este pago';
COMMENT ON COLUMN cash_movements.payment_id IS 'Referencia al pago que generó este movimiento de caja';

