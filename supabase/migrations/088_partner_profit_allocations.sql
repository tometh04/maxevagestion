-- =====================================================
-- Migración 088: Distribución de Ganancias a Socios
-- Sistema de asignación de ganancias y tracking de deudas
-- =====================================================

-- Agregar campo de porcentaje de ganancias a partner_accounts
ALTER TABLE partner_accounts
ADD COLUMN IF NOT EXISTS profit_percentage NUMERIC(5,2) DEFAULT 0 CHECK (profit_percentage >= 0 AND profit_percentage <= 100);

COMMENT ON COLUMN partner_accounts.profit_percentage IS 'Porcentaje de ganancias asignado a este socio (0-100). La suma de todos los porcentajes debe ser 100.';

-- Tabla de asignaciones de ganancias a socios
CREATE TABLE IF NOT EXISTS partner_profit_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  
  -- Período de la ganancia
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  
  -- Montos
  profit_amount NUMERIC(18,2) NOT NULL, -- Monto asignado en USD
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('ARS', 'USD')),
  exchange_rate NUMERIC(18,4), -- TC usado si fue en ARS
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'ALLOCATED' CHECK (status IN ('ALLOCATED', 'WITHDRAWN')),
  
  -- Referencia a la posición mensual
  monthly_position_id UUID, -- Opcional: referencia a alguna tabla futura
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: un socio solo puede tener una asignación por mes/año
  UNIQUE(partner_id, year, month)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_partner_profit_allocations_partner ON partner_profit_allocations(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_profit_allocations_period ON partner_profit_allocations(year, month);
CREATE INDEX IF NOT EXISTS idx_partner_profit_allocations_status ON partner_profit_allocations(status);

-- Comentarios
COMMENT ON TABLE partner_profit_allocations IS 'Asignaciones de ganancias mensuales a socios desde la Posición Mensual';
COMMENT ON COLUMN partner_profit_allocations.profit_amount IS 'Monto asignado en USD (se puede convertir a ARS usando exchange_rate)';
COMMENT ON COLUMN partner_profit_allocations.status IS 'ALLOCATED: Asignado pero no retirado, WITHDRAWN: Retirado completamente';
