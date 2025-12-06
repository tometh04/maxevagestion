-- =====================================================
-- Actualización de estructura de financial_accounts
-- Agregar soporte para nuevos tipos de cuenta y agencias
-- =====================================================

-- IMPORTANTE: Primero eliminar todas las cuentas existentes para evitar conflictos con el constraint
-- 1. Eliminar todas las cuentas existentes (seed data)
DELETE FROM financial_accounts;

-- 2. Agregar agency_id si no existe
ALTER TABLE financial_accounts 
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- 3. Agregar is_active si no existe
ALTER TABLE financial_accounts 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 4. Actualizar constraint de type para incluir nuevos tipos
-- Primero eliminar el constraint viejo
ALTER TABLE financial_accounts 
DROP CONSTRAINT IF EXISTS financial_accounts_type_check;

-- Luego crear el nuevo constraint con los nuevos tipos
ALTER TABLE financial_accounts 
ADD CONSTRAINT financial_accounts_type_check 
CHECK (type IN (
  'SAVINGS_ARS',      -- Caja de ahorro ARS
  'SAVINGS_USD',      -- Caja de ahorro USD
  'CHECKING_ARS',     -- Cuenta corriente ARS
  'CHECKING_USD',     -- Cuenta corriente USD
  'CASH_ARS',         -- Caja efectivo ARS
  'CASH_USD',         -- Caja efectivo USD
  'CREDIT_CARD',      -- Tarjeta de crédito
  'ASSETS'            -- Activos
));

-- 5. Agregar campos para tarjetas de crédito
ALTER TABLE financial_accounts 
ADD COLUMN IF NOT EXISTS card_number TEXT,
ADD COLUMN IF NOT EXISTS card_holder TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS card_expiry_date DATE,
ADD COLUMN IF NOT EXISTS card_cvv TEXT;

-- 6. Agregar campos para activos
ALTER TABLE financial_accounts 
ADD COLUMN IF NOT EXISTS asset_type TEXT, -- 'VOUCHER', 'QUOTA', 'HOTEL', 'OTHER'
ADD COLUMN IF NOT EXISTS asset_description TEXT,
ADD COLUMN IF NOT EXISTS asset_quantity INTEGER DEFAULT 0;

-- 7. Agregar número de cuenta bancaria (para cuentas bancarias)
ALTER TABLE financial_accounts 
ADD COLUMN IF NOT EXISTS account_number TEXT;

-- 8. Índices
CREATE INDEX IF NOT EXISTS idx_financial_accounts_agency ON financial_accounts(agency_id);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_active ON financial_accounts(is_active);

-- 9. Comentarios
COMMENT ON COLUMN financial_accounts.agency_id IS 'Agencia a la que pertenece la cuenta';
COMMENT ON COLUMN financial_accounts.card_number IS 'Últimos 4 dígitos de la tarjeta de crédito';
COMMENT ON COLUMN financial_accounts.card_holder IS 'Titular de la tarjeta';
COMMENT ON COLUMN financial_accounts.asset_type IS 'Tipo de activo (VOUCHER, QUOTA, HOTEL, OTHER)';
COMMENT ON COLUMN financial_accounts.asset_description IS 'Descripción del activo';
COMMENT ON COLUMN financial_accounts.asset_quantity IS 'Cantidad de activos (cupos, vouchers, etc)';

