-- =====================================================
-- Migración 066: Agregar product_type a operation_operators
-- Permite especificar el tipo de producto por operador
-- =====================================================

-- Agregar columna product_type a operation_operators
ALTER TABLE operation_operators
  ADD COLUMN IF NOT EXISTS product_type TEXT CHECK (product_type IN ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED'));

-- Comentario
COMMENT ON COLUMN operation_operators.product_type IS 'Tipo de producto que maneja este operador en esta operación (FLIGHT, HOTEL, PACKAGE, CRUISE, TRANSFER, MIXED)';

-- Índice para búsquedas por tipo de producto
CREATE INDEX IF NOT EXISTS idx_operation_operators_product_type ON operation_operators(product_type) WHERE product_type IS NOT NULL;
