-- =====================================================
-- Migración 080: Agregar campo procedure_number a customers
-- Número de trámite del documento de identidad
-- =====================================================

-- Agregar columna procedure_number a la tabla customers
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS procedure_number TEXT;

-- Comentario
COMMENT ON COLUMN customers.procedure_number IS 'Número de trámite del documento de identidad (DNI o Pasaporte)';
