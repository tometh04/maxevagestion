-- =====================================================
-- Migración 063: Agregar campos personalizados a customers
-- Almacena valores de campos personalizados configurados
-- =====================================================

-- Agregar columna JSONB para campos personalizados
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- Índice GIN para búsquedas eficientes en JSONB
CREATE INDEX IF NOT EXISTS idx_customers_custom_fields ON customers USING GIN (custom_fields);

-- Comentario
COMMENT ON COLUMN customers.custom_fields IS 'Valores de campos personalizados configurados en customer_settings';

