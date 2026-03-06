-- ============================================================
-- MIGRATION 107: Add operation_service_id to payments table
-- Permite vincular un pago con un servicio adicional específico
-- (Asiento, Equipaje, Visa, Transfer, Asistencia)
-- ============================================================

-- 1. Agregar columna operation_service_id (nullable)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS operation_service_id UUID REFERENCES operation_services(id) ON DELETE SET NULL;

-- 2. Índice para filtrar pagos por servicio
CREATE INDEX IF NOT EXISTS idx_payments_operation_service_id
  ON payments(operation_service_id);
