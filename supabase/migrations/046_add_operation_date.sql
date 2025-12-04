-- Agregar campo operation_date a la tabla operations
-- Esta es la fecha en que se realizó/registró la operación (puede ser diferente a created_at para importaciones históricas)

ALTER TABLE operations 
ADD COLUMN IF NOT EXISTS operation_date DATE DEFAULT CURRENT_DATE;

-- Actualizar operaciones existentes: usar created_at como operation_date
UPDATE operations 
SET operation_date = DATE(created_at)
WHERE operation_date IS NULL;

-- Hacer el campo NOT NULL después de llenar los datos
ALTER TABLE operations 
ALTER COLUMN operation_date SET NOT NULL;

-- Crear índice para búsquedas por fecha de operación
CREATE INDEX IF NOT EXISTS idx_operations_operation_date ON operations(operation_date);

COMMENT ON COLUMN operations.operation_date IS 'Fecha en que se realizó/registró la venta (puede diferir de created_at para importaciones históricas)';

