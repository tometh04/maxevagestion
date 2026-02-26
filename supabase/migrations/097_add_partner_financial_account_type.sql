-- Agregar PARTNER al constraint de type en financial_accounts
DO $$
BEGIN
  -- Eliminar constraint existente
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'financial_accounts_type_check' AND table_name = 'financial_accounts'
  ) THEN
    ALTER TABLE financial_accounts DROP CONSTRAINT financial_accounts_type_check;
  END IF;

  -- Crear nuevo constraint con PARTNER
  ALTER TABLE financial_accounts ADD CONSTRAINT financial_accounts_type_check
    CHECK (type IN (
      'SAVINGS_ARS', 'SAVINGS_USD', 'CHECKING_ARS', 'CHECKING_USD',
      'CASH_ARS', 'CASH_USD', 'CREDIT_CARD', 'ASSETS', 'PARTNER'
    ));

EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;
