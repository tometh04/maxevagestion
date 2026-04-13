-- =====================================================
-- Migración 145: Crear cuenta contable "Percepciones a depositar AFIP"
-- Cuenta de PASIVO CORRIENTE para registrar percepciones cobradas
-- que deben depositarse a AFIP (RG 5617, RG 3819, etc.)
-- =====================================================

-- 1. Crear cuenta en el plan de cuentas
INSERT INTO chart_of_accounts (
  account_code, account_name, category, subcategory, account_type,
  level, is_movement_account, display_order, description
) VALUES (
  '2.1.04',
  'Percepciones a depositar AFIP',
  'PASIVO',
  'CORRIENTE',
  'PERCEPCIONES_AFIP',
  2,
  true,
  4,
  'Percepciones cobradas a clientes pendientes de depósito a AFIP (RG 5617, RG 3819, etc.)'
) ON CONFLICT (account_code) DO NOTHING;

-- 2. Crear la cuenta financiera vinculada (ARS)
-- Se vincula automáticamente al chart_of_accounts creado arriba
INSERT INTO financial_accounts (
  name, type, currency, initial_balance, is_active, chart_account_id
)
SELECT
  'Percepciones a depositar AFIP',
  'OTHER',
  'ARS',
  0,
  true,
  coa.id
FROM chart_of_accounts coa
WHERE coa.account_code = '2.1.04'
  AND NOT EXISTS (
    SELECT 1 FROM financial_accounts fa
    WHERE fa.chart_account_id = coa.id AND fa.currency = 'ARS'
  );
