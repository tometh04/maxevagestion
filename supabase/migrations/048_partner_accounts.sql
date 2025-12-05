-- =====================================================
-- FASE 2: CUENTAS CORRIENTES DE SOCIOS
-- Migración 048: Crear tablas para gestión de socios
-- =====================================================

-- Tabla de socios/partners
CREATE TABLE IF NOT EXISTS partner_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_name TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de retiros de socios
CREATE TABLE IF NOT EXISTS partner_withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  withdrawal_date DATE NOT NULL,
  account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL,
  cash_movement_id UUID REFERENCES cash_movements(id) ON DELETE SET NULL,
  ledger_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_partner ON partner_withdrawals(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_date ON partner_withdrawals(withdrawal_date);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_user ON partner_accounts(user_id);

-- Comentarios
COMMENT ON TABLE partner_accounts IS 'Cuentas de socios para registro de retiros personales';
COMMENT ON TABLE partner_withdrawals IS 'Retiros de dinero realizados por los socios';
COMMENT ON COLUMN partner_withdrawals.cash_movement_id IS 'Referencia al movimiento de caja generado';
COMMENT ON COLUMN partner_withdrawals.ledger_movement_id IS 'Referencia al movimiento de ledger generado';

