-- =====================================================
-- Migración 086: Agregar category_id a recurring_payments
-- Relacionar gastos recurrentes con categorías
-- =====================================================

-- Agregar columna category_id (nullable para mantener compatibilidad con datos existentes)
ALTER TABLE recurring_payments
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES recurring_payment_categories(id) ON DELETE SET NULL;

-- Índice para mejorar búsquedas por categoría
CREATE INDEX IF NOT EXISTS idx_recurring_payments_category ON recurring_payments(category_id) WHERE category_id IS NOT NULL;

-- Comentario
COMMENT ON COLUMN recurring_payments.category_id IS 'Categoría del gasto recurrente (Servicios, Alquiler, Marketing, etc.)';

-- Asignar categoría "Otros" a gastos existentes sin categoría (opcional, para datos históricos)
UPDATE recurring_payments
SET category_id = (SELECT id FROM recurring_payment_categories WHERE name = 'Otros' LIMIT 1)
WHERE category_id IS NULL;
