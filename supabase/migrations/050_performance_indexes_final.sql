-- =====================================================
-- Optimización de Performance - Índices Finales
-- Migración 050: Índices compuestos para queries más comunes
-- =====================================================
-- Este archivo agrega índices compuestos y adicionales para optimizar
-- las queries más frecuentes del sistema, especialmente en producción
-- con grandes volúmenes de datos.

-- =====================================================
-- ÍNDICES COMPUESTOS PARA OPERATIONS
-- =====================================================

-- Query más común: Filtrar operaciones por agencia, estado y ordenar por fecha
CREATE INDEX IF NOT EXISTS idx_operations_agency_status_date 
  ON operations(agency_id, status, operation_date DESC NULLS LAST);

-- Query común: Operaciones por vendedor ordenadas por fecha
CREATE INDEX IF NOT EXISTS idx_operations_seller_date 
  ON operations(seller_id, operation_date DESC NULLS LAST)
  WHERE seller_id IS NOT NULL;

-- Query común: Operaciones por estado y fecha (para dashboards y reportes)
CREATE INDEX IF NOT EXISTS idx_operations_status_date 
  ON operations(status, operation_date DESC NULLS LAST);

-- Query común: Operaciones por operador y fecha
CREATE INDEX IF NOT EXISTS idx_operations_operator_date 
  ON operations(operator_id, operation_date DESC NULLS LAST)
  WHERE operator_id IS NOT NULL;

-- Query común: Búsqueda por código de archivo (file_code es único, pero el índice ayuda)
CREATE INDEX IF NOT EXISTS idx_operations_file_code 
  ON operations(file_code) 
  WHERE file_code IS NOT NULL;

-- =====================================================
-- ÍNDICES PARA LEDGER_MOVEMENTS
-- =====================================================

-- Query común: Movimientos ordenados por fecha (para reportes)
CREATE INDEX IF NOT EXISTS idx_ledger_created_at 
  ON ledger_movements(created_at DESC);

-- Query común: Movimientos por tipo y fecha (para análisis contables)
CREATE INDEX IF NOT EXISTS idx_ledger_type_created 
  ON ledger_movements(type, created_at DESC);

-- Query común: Movimientos por cuenta financiera y fecha
CREATE INDEX IF NOT EXISTS idx_ledger_account_created 
  ON ledger_movements(account_id, created_at DESC)
  WHERE account_id IS NOT NULL;

-- Query común: Movimientos por operación (para detalles de operación)
CREATE INDEX IF NOT EXISTS idx_ledger_operation 
  ON ledger_movements(operation_id)
  WHERE operation_id IS NOT NULL;

-- NOTA: ledger_movements NO tiene payment_id. La relación es al revés:
-- payments tiene ledger_movement_id (ver migración 047)

-- =====================================================
-- ÍNDICES PARA CASH_MOVEMENTS
-- =====================================================

-- Query común: Movimientos ordenados por fecha (para reportes de caja)
CREATE INDEX IF NOT EXISTS idx_cash_movement_date 
  ON cash_movements(movement_date DESC);

-- Query común: Movimientos por agencia y fecha (si agency_id existe)
-- Nota: Verificar si cash_movements tiene agency_id directamente o a través de operation_id
CREATE INDEX IF NOT EXISTS idx_cash_type_date 
  ON cash_movements(type, movement_date DESC);

-- Query común: Movimientos por caja y fecha
CREATE INDEX IF NOT EXISTS idx_cash_box_date 
  ON cash_movements(cash_box_id, movement_date DESC)
  WHERE cash_box_id IS NOT NULL;

-- Query común: Movimientos por operación (para detalles)
CREATE INDEX IF NOT EXISTS idx_cash_operation 
  ON cash_movements(operation_id)
  WHERE operation_id IS NOT NULL;

-- NOTA: El índice para payment_id en cash_movements ya existe en la migración 047
-- como idx_cash_movements_payment. No es necesario crearlo aquí.
-- Si necesitas verificar que existe, ejecuta primero la migración 047.

-- =====================================================
-- ÍNDICES PARA ALERTS
-- =====================================================

-- Query común: Alertas por fecha y estado (para dashboard y calendario)
CREATE INDEX IF NOT EXISTS idx_alerts_date_status 
  ON alerts(date_due, status);

-- Query común: Alertas por usuario y estado (para notificaciones personales)
CREATE INDEX IF NOT EXISTS idx_alerts_user_status 
  ON alerts(user_id, status) 
  WHERE user_id IS NOT NULL;

-- Query común: Alertas por operación (para detalle de operación)
CREATE INDEX IF NOT EXISTS idx_alerts_operation 
  ON alerts(operation_id)
  WHERE operation_id IS NOT NULL;

-- Query común: Alertas pendientes ordenadas por fecha (para lista de alertas)
CREATE INDEX IF NOT EXISTS idx_alerts_pending_date 
  ON alerts(date_due)
  WHERE status = 'PENDING';

-- =====================================================
-- ÍNDICES ADICIONALES PARA OPERATIONS
-- =====================================================

-- Índice para operation_date si no existe (ya debería existir de migración 046)
-- Pero lo verificamos y creamos si falta
CREATE INDEX IF NOT EXISTS idx_operations_operation_date 
  ON operations(operation_date DESC NULLS LAST);

-- Query común: Operaciones por fecha de salida (para calendario)
CREATE INDEX IF NOT EXISTS idx_operations_departure_date 
  ON operations(departure_date)
  WHERE departure_date IS NOT NULL;

-- Query común: Operaciones por lead (para ver operaciones de un lead convertido)
CREATE INDEX IF NOT EXISTS idx_operations_lead 
  ON operations(lead_id)
  WHERE lead_id IS NOT NULL;

-- =====================================================
-- ÍNDICES PARA PAYMENTS
-- =====================================================

-- Query común: Pagos por operación y estado (ya existe en 029, pero verificamos)
-- CREATE INDEX IF NOT EXISTS idx_payments_operation_status ON payments(operation_id, status);

-- Query común: Pagos vencidos o próximos a vencer
CREATE INDEX IF NOT EXISTS idx_payments_due_status 
  ON payments(date_due, status)
  WHERE status IN ('PENDING', 'OVERDUE');

-- =====================================================
-- ÍNDICES PARA COMMISSION_RECORDS
-- =====================================================

-- Query común: Comisiones por vendedor y estado
CREATE INDEX IF NOT EXISTS idx_commission_records_seller_status 
  ON commission_records(seller_id, status)
  WHERE seller_id IS NOT NULL;

-- Query común: Comisiones por fecha de cálculo (para reportes)
CREATE INDEX IF NOT EXISTS idx_commission_records_date 
  ON commission_records(date_calculated DESC);

-- =====================================================
-- ÍNDICES PARA OPERATOR_PAYMENTS
-- =====================================================

-- Query común: Pagos a operadores por fecha de vencimiento
CREATE INDEX IF NOT EXISTS idx_operator_payments_due_status 
  ON operator_payments(due_date, status)
  WHERE status = 'PENDING';

-- Query común: Pagos a operadores por operador
CREATE INDEX IF NOT EXISTS idx_operator_payments_operator 
  ON operator_payments(operator_id)
  WHERE operator_id IS NOT NULL;

-- =====================================================
-- ÍNDICES PARA LEADS
-- =====================================================

-- Query común: Leads por vendedor asignado y estado
CREATE INDEX IF NOT EXISTS idx_leads_seller_status 
  ON leads(assigned_seller_id, status)
  WHERE assigned_seller_id IS NOT NULL;

-- Query común: Leads por agencia y estado (para dashboards)
CREATE INDEX IF NOT EXISTS idx_leads_agency_status 
  ON leads(agency_id, status);

-- =====================================================
-- COMENTARIOS
-- =====================================================

COMMENT ON INDEX idx_operations_agency_status_date IS 'Índice compuesto para filtrar operaciones por agencia y estado, ordenadas por fecha (query más común)';
COMMENT ON INDEX idx_ledger_type_created IS 'Índice para reportes contables filtrados por tipo de movimiento';
COMMENT ON INDEX idx_cash_box_date IS 'Índice para reportes de caja filtrados por caja específica';
COMMENT ON INDEX idx_alerts_pending_date IS 'Índice para lista de alertas pendientes ordenadas por fecha de vencimiento';

