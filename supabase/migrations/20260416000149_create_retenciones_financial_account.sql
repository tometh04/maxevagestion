-- Create financial_account for "Retenciones a Depositar" (2.1.05)
-- Same pattern as "Percepciones a depositar AFIP" (2.1.04)

INSERT INTO financial_accounts (
  name,
  type,
  currency,
  initial_balance,
  is_active,
  chart_account_id
)
SELECT
  'Retenciones a depositar',
  'SAVINGS_ARS',
  'ARS',
  0,
  true,
  ca.id
FROM chart_of_accounts ca
WHERE ca.account_code = '2.1.05'
  AND ca.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM financial_accounts fa
    WHERE fa.chart_account_id = ca.id
  );
