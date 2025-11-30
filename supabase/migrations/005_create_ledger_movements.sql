-- =====================================================
-- FASE 1: FUNDACIÓN CONTABLE
-- Migración 005: Crear tabla ledger_movements
-- =====================================================
-- Esta tabla es el CORAZÓN CONTABLE del sistema.
-- TODO movimiento financiero debe pasar por aquí.

CREATE TABLE IF NOT EXISTS ledger_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones (pueden ser null dependiendo del tipo de movimiento)
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Tipo de movimiento
  type TEXT NOT NULL CHECK (type IN (
    'INCOME',           -- Ingreso (pago de cliente)
    'EXPENSE',          -- Gasto (pago a operador)
    'FX_GAIN',          -- Ganancia cambiaria
    'FX_LOSS',          -- Pérdida cambiaria
    'COMMISSION',       -- Pago de comisión
    'OPERATOR_PAYMENT'  -- Pago a operador (alias de EXPENSE con operator_id)
  )),
  
  -- Concepto y descripción
  concept TEXT NOT NULL,
  notes TEXT,
  
  -- Información monetaria
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  amount_original NUMERIC(18,2) NOT NULL,           -- Monto en moneda original
  exchange_rate NUMERIC(18,4),                     -- Tasa de cambio usada (si aplica)
  amount_ars_equivalent NUMERIC(18,2) NOT NULL,    -- Monto equivalente en ARS (siempre requerido)
  
  -- Método de pago
  method TEXT NOT NULL CHECK (method IN ('CASH', 'BANK', 'MP', 'USD', 'OTHER')),
  
  -- Cuenta financiera (FK a financial_accounts)
  -- NOTA: La tabla financial_accounts debe existir antes de ejecutar esta migración
  account_id UUID REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  
  -- Relaciones adicionales
  seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
  operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  
  -- Información adicional
  receipt_number TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ledger_movements_operation ON ledger_movements(operation_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_lead ON ledger_movements(lead_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_type ON ledger_movements(type);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_account ON ledger_movements(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_seller ON ledger_movements(seller_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_operator ON ledger_movements(operator_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_created_at ON ledger_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_currency ON ledger_movements(currency);

-- Comentarios para documentación
COMMENT ON TABLE ledger_movements IS 'Corazón contable del sistema. Todo movimiento financiero debe pasar por aquí.';
COMMENT ON COLUMN ledger_movements.amount_ars_equivalent IS 'Siempre en ARS, calculado automáticamente si currency = USD';
COMMENT ON COLUMN ledger_movements.exchange_rate IS 'Tasa de cambio usada para convertir USD a ARS. Null si currency = ARS';

