-- =====================================================
-- Migración 081: Agregar códigos de reserva (aéreo y hotel) a operations
-- =====================================================
-- Campos para rastrear códigos de reserva de operadores
-- - reservation_code_air: Código de reserva del aéreo (opcional)
-- - reservation_code_hotel: Código de reserva del hotel (opcional)

-- Agregar campos nuevos
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS reservation_code_air TEXT,
  ADD COLUMN IF NOT EXISTS reservation_code_hotel TEXT;

-- Índices para búsqueda rápida (importante para la funcionalidad de búsqueda global)
CREATE INDEX IF NOT EXISTS idx_operations_reservation_code_air 
  ON operations(reservation_code_air) 
  WHERE reservation_code_air IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operations_reservation_code_hotel 
  ON operations(reservation_code_hotel) 
  WHERE reservation_code_hotel IS NOT NULL;

-- Comentarios en columnas para documentación
COMMENT ON COLUMN operations.reservation_code_air IS 'Código de reserva del aéreo proporcionado por el operador. Campo opcional para facilitar el rastreo de reservas.';
COMMENT ON COLUMN operations.reservation_code_hotel IS 'Código de reserva del hotel proporcionado por el operador. Campo opcional para facilitar el rastreo de reservas.';
