-- =====================================================
-- FASE 6: MEJORAS AL MÓDULO DE COMISIONES
-- Migración 011: Agregar campo percentage a commission_records
-- =====================================================

-- Agregar campo percentage a commission_records
ALTER TABLE commission_records
ADD COLUMN IF NOT EXISTS percentage NUMERIC(5,2);

-- Comentario para documentación
COMMENT ON COLUMN commission_records.percentage IS 'Porcentaje de comisión aplicado sobre el margen';

