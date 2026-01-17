-- =====================================================
-- Migración 083: Agregar exchange_rate y amount_usd a payments
-- Para tracking correcto de pagos en ARS con su equivalente USD
-- =====================================================

-- Agregar columna exchange_rate (tipo de cambio usado)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,4);

-- Agregar columna amount_usd (monto equivalente en USD)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(18,2);

-- Comentarios
COMMENT ON COLUMN payments.exchange_rate IS 'Tipo de cambio ARS/USD usado al momento del pago';
COMMENT ON COLUMN payments.amount_usd IS 'Monto equivalente en USD (para pagos en ARS: amount / exchange_rate, para USD: amount)';

-- Índice para búsquedas por monto USD
CREATE INDEX IF NOT EXISTS idx_payments_amount_usd ON payments(amount_usd) WHERE amount_usd IS NOT NULL;
