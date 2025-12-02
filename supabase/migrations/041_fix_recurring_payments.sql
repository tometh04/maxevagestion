-- =====================================================
-- Migración 041: Arreglar recurring_payments
-- =====================================================
-- Cambiar de operator_id a provider_name
-- Crear tabla de proveedores para autocompletado

-- 1. Primero crear la tabla de proveedores para pagos recurrentes
CREATE TABLE IF NOT EXISTS recurring_payment_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_payment_providers_name ON recurring_payment_providers(name);

-- 2. Modificar operator_payments para permitir operation_id NULL
-- (los pagos recurrentes no están vinculados a operaciones específicas)
ALTER TABLE operator_payments
  ALTER COLUMN operation_id DROP NOT NULL;

-- 3. Crear tabla recurring_payments (versión corregida)
CREATE TABLE IF NOT EXISTS recurring_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Proveedor (texto libre, no FK a operators)
  provider_name TEXT NOT NULL,
  
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
  start_date DATE NOT NULL,
  end_date DATE,
  next_due_date DATE NOT NULL,
  last_generated_date DATE,
  
  -- Estado
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Descripción y notas
  description TEXT NOT NULL,
  notes TEXT,
  
  -- Información de facturación (opcional)
  invoice_number TEXT,
  reference TEXT,
  
  -- Agencia
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_recurring_payments_provider ON recurring_payments(provider_name);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_active ON recurring_payments(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_next_due ON recurring_payments(next_due_date);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_agency ON recurring_payments(agency_id);

-- Comentarios
COMMENT ON TABLE recurring_payments IS 'Pagos recurrentes a proveedores genéricos (no operadores turísticos).';
COMMENT ON TABLE recurring_payment_providers IS 'Lista de proveedores usados en pagos recurrentes para autocompletado.';

