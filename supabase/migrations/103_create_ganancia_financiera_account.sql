-- Crear cuenta financiera "Ganancia Financiera (USD)" para registrar ganancias por depósito
-- Esta cuenta se usa como destino de la bonificación por pago por depósito a operadores

-- Primero asegurar que existe la cuenta del plan de cuentas "Otros Ingresos" (4.1.02)
INSERT INTO chart_of_accounts (account_code, account_name, category, is_active)
VALUES ('4.1.02', 'Otros Ingresos', 'RESULTADO', true)
ON CONFLICT (account_code) DO NOTHING;

-- Crear la cuenta financiera asociada
INSERT INTO financial_accounts (name, type, currency, initial_balance, is_active, chart_account_id)
SELECT
  'Ganancia Financiera (USD)',
  'SAVINGS_USD',
  'USD',
  0,
  true,
  coa.id
FROM chart_of_accounts coa
WHERE coa.account_code = '4.1.02'
AND NOT EXISTS (
  SELECT 1 FROM financial_accounts WHERE name = 'Ganancia Financiera (USD)'
);
