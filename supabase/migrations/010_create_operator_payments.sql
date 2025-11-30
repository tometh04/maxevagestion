-- =====================================================
-- FASE 4: MÓDULO IVA Y OPERATOR PAYMENTS
-- Migración 010: Crear tabla operator_payments
-- =====================================================
-- Tabla para gestionar pagos a operadores (cuentas a pagar)

CREATE TABLE IF NOT EXISTS operator_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  
  -- Información monetaria
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  
  -- Fecha de vencimiento
  due_date DATE NOT NULL,
  
  -- Estado del pago
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'OVERDUE')),
  
  -- Referencia al ledger_movement cuando se marca como pagado
  ledger_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  
  -- Notas adicionales
  notes TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_operator_payments_operation ON operator_payments(operation_id);
CREATE INDEX IF NOT EXISTS idx_operator_payments_operator ON operator_payments(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_payments_status ON operator_payments(status);
CREATE INDEX IF NOT EXISTS idx_operator_payments_due_date ON operator_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_operator_payments_ledger ON operator_payments(ledger_movement_id);

-- Comentarios para documentación
COMMENT ON TABLE operator_payments IS 'Pagos a operadores (cuentas a pagar). Se auto-crean cuando se crea una operación.';
COMMENT ON COLUMN operator_payments.due_date IS 'Fecha de vencimiento. Se calcula según product_type: AEREO = purchase_date + 10 días, HOTEL = checkin_date - 30 días';
COMMENT ON COLUMN operator_payments.status IS 'Estado: PENDING (pendiente), PAID (pagado), OVERDUE (vencido)';
COMMENT ON COLUMN operator_payments.ledger_movement_id IS 'Referencia al ledger_movement cuando el pago se marca como pagado';

