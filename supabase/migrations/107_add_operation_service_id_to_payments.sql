-- =====================================================
-- Migración 107: Agregar operation_service_id a payments
-- Permite vincular un pago a un servicio específico de la operación
-- NULL = pago de la operación base; NOT NULL = pago de un servicio
-- =====================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS operation_service_id UUID REFERENCES operation_services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_operation_service_id
  ON payments(operation_service_id);

COMMENT ON COLUMN payments.operation_service_id IS
  'Referencia al servicio de operación. NULL = pago base; NOT NULL = pago de servicio adicional';
