-- =====================================================
-- Migración 054: Agregar campo billing_margin_amount
-- Permite diferenciar ganancia real vs ganancia para facturación
-- =====================================================

-- Agregar campo billing_margin_amount a operations
ALTER TABLE operations 
ADD COLUMN IF NOT EXISTS billing_margin_amount NUMERIC(18,2);

-- Agregar campo billing_margin_percentage
ALTER TABLE operations 
ADD COLUMN IF NOT EXISTS billing_margin_percentage NUMERIC(5,2);

-- Comentarios
COMMENT ON COLUMN operations.billing_margin_amount IS 'Ganancia para facturación (puede diferir de margin_amount por ajustes contables)';
COMMENT ON COLUMN operations.billing_margin_percentage IS 'Porcentaje de ganancia para facturación';

-- Por defecto, usar margin_amount como billing_margin_amount para operaciones existentes
UPDATE operations 
SET billing_margin_amount = margin_amount,
    billing_margin_percentage = margin_percentage
WHERE billing_margin_amount IS NULL;

-- Índice para búsquedas
CREATE INDEX IF NOT EXISTS idx_operations_billing_margin ON operations(billing_margin_amount) WHERE billing_margin_amount IS NOT NULL;