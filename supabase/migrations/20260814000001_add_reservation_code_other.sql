-- =====================================================
-- Migración: Agregar código de reserva "Otros" a operations (VIB-115)
-- =====================================================
-- Hasta ahora solo se podía cargar código de reserva para aéreo y hotel
-- (migración 081). Para operadores/servicios que no son vuelo ni hotel
-- (transfer, asistencia, excursiones, etc.) no había dónde guardar el
-- localizador. Se agrega un campo genérico a nivel operación:
-- - reservation_code_other: código de reserva de "otros" servicios (opcional)
-- - other_provider_name: nombre del proveedor/servicio asociado (opcional)

ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS reservation_code_other TEXT,
  ADD COLUMN IF NOT EXISTS other_provider_name TEXT;

-- Índice para búsqueda rápida (paridad con aéreo/hotel; la búsqueda global usa
-- estos códigos).
CREATE INDEX IF NOT EXISTS idx_operations_reservation_code_other
  ON operations(reservation_code_other)
  WHERE reservation_code_other IS NOT NULL;

COMMENT ON COLUMN operations.reservation_code_other IS 'Código de reserva de servicios que no son aéreo ni hotel (transfer, asistencia, etc.). Campo opcional.';
COMMENT ON COLUMN operations.other_provider_name IS 'Nombre del proveedor/servicio asociado al código de reserva "otros". Campo opcional.';
