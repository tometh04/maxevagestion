-- =====================================================
-- FASE 1: FUNDACIÓN CONTABLE
-- Migración 006: Crear tabla financial_accounts
-- =====================================================
-- Cuentas financieras: Caja, Bancos, Mercado Pago, etc.

CREATE TABLE IF NOT EXISTS financial_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Información básica
  name TEXT NOT NULL,
  
  -- Tipo de cuenta
  type TEXT NOT NULL CHECK (type IN ('CASH', 'BANK', 'MP', 'USD')),
  
  -- Moneda de la cuenta
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  
  -- Saldo inicial (para migración de datos existentes)
  initial_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Notas opcionales
  notes TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_financial_accounts_type ON financial_accounts(type);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_currency ON financial_accounts(currency);

-- Comentarios
COMMENT ON TABLE financial_accounts IS 'Cuentas financieras del sistema (Caja, Bancos, Mercado Pago, etc.)';
COMMENT ON COLUMN financial_accounts.initial_balance IS 'Saldo inicial. El balance real se calcula: initial_balance + SUM(ledger_movements.amount_ars_equivalent)';

-- Crear cuentas por defecto (opcional, se pueden crear desde la UI también)
-- Estas son solo ejemplos, se pueden eliminar si no se necesitan
INSERT INTO financial_accounts (name, type, currency, initial_balance)
VALUES 
  ('Caja Principal', 'CASH', 'ARS', 0),
  ('Banco Principal', 'BANK', 'ARS', 0),
  ('Mercado Pago', 'MP', 'ARS', 0)
ON CONFLICT DO NOTHING;

