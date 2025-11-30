-- =====================================================
-- FASE 1: OPERACIÓN DIARIA
-- Migración 020: Crear tabla recurring_payments
-- =====================================================
-- Sistema de pagos recurrentes a proveedores
-- Permite crear pagos que se generan automáticamente (mensuales, semanales, etc.)

-- Primero, modificar operator_payments para permitir operation_id NULL
-- (los pagos recurrentes no están vinculados a operaciones específicas)
ALTER TABLE operator_payments
  ALTER COLUMN operation_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS recurring_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relación con operador
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  
  -- Información monetaria
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  
  -- Frecuencia de recurrencia
  frequency TEXT NOT NULL CHECK (frequency IN (
    'WEEKLY',      -- Semanal
    'BIWEEKLY',    -- Quincenal
    'MONTHLY',     -- Mensual
    'QUARTERLY',   -- Trimestral
    'YEARLY'       -- Anual
  )),
  
  -- Fechas
  start_date DATE NOT NULL,              -- Fecha de inicio del pago recurrente
  end_date DATE,                          -- Fecha de fin (opcional, null = sin fin)
  next_due_date DATE NOT NULL,            -- Próxima fecha de vencimiento (calculada automáticamente)
  last_generated_date DATE,               -- Última fecha en que se generó un pago
  
  -- Estado
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Descripción y notas
  description TEXT NOT NULL,               -- Descripción del pago (ej: "Alquiler oficina mensual")
  notes TEXT,                              -- Notas adicionales
  
  -- Información de facturación (opcional)
  invoice_number TEXT,                    -- Número de factura si aplica
  reference TEXT,                         -- Referencia adicional
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_recurring_payments_operator ON recurring_payments(operator_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_active ON recurring_payments(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_next_due ON recurring_payments(next_due_date);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_frequency ON recurring_payments(frequency);

-- Comentarios para documentación
COMMENT ON TABLE recurring_payments IS 'Pagos recurrentes a proveedores. Se generan automáticamente según la frecuencia configurada.';
COMMENT ON COLUMN recurring_payments.frequency IS 'Frecuencia: WEEKLY (semanal), BIWEEKLY (quincenal), MONTHLY (mensual), QUARTERLY (trimestral), YEARLY (anual)';
COMMENT ON COLUMN recurring_payments.next_due_date IS 'Próxima fecha en que se debe generar el pago. Se actualiza automáticamente después de generar cada pago.';
COMMENT ON COLUMN recurring_payments.last_generated_date IS 'Última fecha en que se generó un pago desde este registro recurrente.';
COMMENT ON COLUMN recurring_payments.end_date IS 'Fecha de fin del pago recurrente. Si es NULL, el pago continúa indefinidamente.';

