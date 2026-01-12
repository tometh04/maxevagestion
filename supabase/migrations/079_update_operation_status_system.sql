-- =====================================================
-- Migración 079: Actualizar Sistema de Estados de Operaciones
-- Nuevos estados según requerimientos del cliente
-- =====================================================

-- Estados nuevos:
-- RESERVED (Reservado): Cuando se carga la operación (default)
-- CONFIRMED (Confirmado): Cuando se hace recibo por la seña
-- CANCELLED (Cancelado): Modificación manual
-- TRAVELLING (En viaje): Cuando llega fecha de salida
-- TRAVELLED (Viajado): Cuando llega fecha de regreso

-- Eliminar:
-- PRE_RESERVATION (Pre-reserva) -> Migrar a RESERVED
-- CLOSED (Cerrado) -> Migrar a TRAVELLED

-- 1. Migrar datos existentes
UPDATE operations
SET status = 'RESERVED'
WHERE status = 'PRE_RESERVATION';

UPDATE operations
SET status = 'TRAVELLED'
WHERE status = 'CLOSED';

-- 2. Actualizar el CHECK constraint
-- Primero eliminar el constraint existente
ALTER TABLE operations
DROP CONSTRAINT IF EXISTS operations_status_check;

-- Agregar el nuevo constraint con los nuevos estados
ALTER TABLE operations
ADD CONSTRAINT operations_status_check 
CHECK (status IN ('RESERVED', 'CONFIRMED', 'CANCELLED', 'TRAVELLING', 'TRAVELLED'));

-- 3. Cambiar el default status de PRE_RESERVATION a RESERVED
ALTER TABLE operations
ALTER COLUMN status SET DEFAULT 'RESERVED';

-- 4. Actualizar default_status en operation_settings
UPDATE operation_settings
SET default_status = 'RESERVED'
WHERE default_status = 'PRE_RESERVATION';

-- 5. Comentario para documentación
COMMENT ON COLUMN operations.status IS 'Estado de la operación: RESERVED (Reservado), CONFIRMED (Confirmado), CANCELLED (Cancelado), TRAVELLING (En viaje), TRAVELLED (Viajado)';
