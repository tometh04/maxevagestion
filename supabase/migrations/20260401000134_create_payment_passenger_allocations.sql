-- ============================================================
-- Migration 134: Payment Passenger Allocations
-- Permite asignar pagos a pasajeros individuales dentro de una operación grupal
-- ============================================================

-- Tabla de asignaciones de pago a pasajeros
CREATE TABLE IF NOT EXISTS payment_passenger_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relaciones
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  operation_customer_id UUID NOT NULL REFERENCES operation_customers(id) ON DELETE CASCADE,

  -- Monto asignado de este pago a este pasajero
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),

  -- Moneda (hereda del pago, pero se almacena para independencia)
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),

  -- Notas opcionales
  notes TEXT,

  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES users(id),

  -- Constraint: un pago no puede asignarse más de una vez al mismo pasajero
  UNIQUE(payment_id, operation_customer_id)
);

-- Índices para consultas frecuentes
CREATE INDEX idx_ppa_payment ON payment_passenger_allocations(payment_id);
CREATE INDEX idx_ppa_operation_customer ON payment_passenger_allocations(operation_customer_id);

-- RLS
ALTER TABLE payment_passenger_allocations ENABLE ROW LEVEL SECURITY;

-- Política: usuarios autenticados pueden ver asignaciones de pagos que pueden ver
CREATE POLICY "payment_passenger_allocations_select" ON payment_passenger_allocations
  FOR SELECT USING (true);

CREATE POLICY "payment_passenger_allocations_insert" ON payment_passenger_allocations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "payment_passenger_allocations_update" ON payment_passenger_allocations
  FOR UPDATE USING (true);

CREATE POLICY "payment_passenger_allocations_delete" ON payment_passenger_allocations
  FOR DELETE USING (true);

-- Comentarios
COMMENT ON TABLE payment_passenger_allocations IS 'Asignación de pagos a pasajeros individuales dentro de operaciones grupales';
COMMENT ON COLUMN payment_passenger_allocations.amount IS 'Monto del pago asignado a este pasajero (debe sumar <= monto total del pago)';
