-- =====================================================
-- Migración 052: Crear tabla operation_operators
-- Permite múltiples operadores por operación con costos individuales
-- =====================================================

-- Crear tabla de relación many-to-many entre operations y operators
CREATE TABLE IF NOT EXISTS operation_operators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  cost NUMERIC NOT NULL DEFAULT 0,
  cost_currency TEXT NOT NULL DEFAULT 'ARS' CHECK (cost_currency IN ('ARS', 'USD')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(operation_id, operator_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_operation_operators_operation_id ON operation_operators(operation_id);
CREATE INDEX IF NOT EXISTS idx_operation_operators_operator_id ON operation_operators(operator_id);

-- Comentarios
COMMENT ON TABLE operation_operators IS 'Relación many-to-many entre operaciones y operadores. Permite múltiples operadores por operación con costos individuales.';
COMMENT ON COLUMN operation_operators.cost IS 'Costo individual de este operador para esta operación';
COMMENT ON COLUMN operation_operators.cost_currency IS 'Moneda del costo (ARS o USD)';

-- Migrar datos existentes: Si una operación tiene operator_id, crear registro en operation_operators
INSERT INTO operation_operators (operation_id, operator_id, cost, cost_currency)
SELECT 
  id as operation_id,
  operator_id,
  COALESCE(operator_cost, 0) as cost,
  COALESCE(operator_cost_currency, currency, 'ARS') as cost_currency
FROM operations
WHERE operator_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM operation_operators 
    WHERE operation_operators.operation_id = operations.id 
    AND operation_operators.operator_id = operations.operator_id
  )
ON CONFLICT (operation_id, operator_id) DO NOTHING;

-- NOTA: No eliminamos operator_id de operations para mantener compatibilidad hacia atrás
-- El campo operator_id seguirá existiendo pero será considerado como "operador principal"
-- cuando haya múltiples operadores, se calculará la suma de costos de operation_operators

