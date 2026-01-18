-- =====================================================
-- Migración 084: Agregar campo paid_amount a operator_payments
-- Para soportar pagos parciales a operadores
-- =====================================================

-- Agregar columna paid_amount (monto parcialmente pagado)
ALTER TABLE operator_payments
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(18,2) DEFAULT 0;

-- Comentario para documentación
COMMENT ON COLUMN operator_payments.paid_amount IS 'Monto parcialmente pagado. Permite pagos parciales: si paid_amount < amount, el pago sigue siendo PENDING; si paid_amount >= amount, el pago puede marcarse como PAID.';

-- Índice para búsquedas de pagos parciales
CREATE INDEX IF NOT EXISTS idx_operator_payments_paid_amount ON operator_payments(paid_amount) WHERE paid_amount > 0 AND paid_amount < amount;
