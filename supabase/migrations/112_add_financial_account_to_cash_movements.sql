-- Migration 112: Agregar financial_account_id a cash_movements + backfill
--
-- PROBLEMA: La tabla cash_movements nunca tuvo la columna financial_account_id
-- en producción. El código del API la requería y filtraba por ella, pero como
-- no existía, todos los movimientos eran invisibles en la vista Caja USD/ARS.
--
-- SOLUCIÓN:
-- 1. Agregar la columna financial_account_id (nullable, FK a financial_accounts)
-- 2. Backfill: asignar la primera cuenta activa de la moneda correcta (CASH_USD/CASH_ARS)
-- 3. Índice para performance de los filtros

-- PASO 1: Agregar columna
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS financial_account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL;

-- Índice para queries de la Caja
CREATE INDEX IF NOT EXISTS idx_cash_movements_financial_account
  ON cash_movements(financial_account_id)
  WHERE financial_account_id IS NOT NULL;

-- PASO 2: Backfill — asignar cuenta CASH_USD o CASH_ARS según currency
-- Primero intentar con cuentas de tipo CASH_XXX (efectivo)
UPDATE cash_movements cm
SET financial_account_id = (
  SELECT fa.id
  FROM financial_accounts fa
  WHERE fa.currency = cm.currency
    AND fa.is_active = true
    AND fa.type = CASE cm.currency
      WHEN 'USD' THEN 'CASH_USD'
      WHEN 'ARS' THEN 'CASH_ARS'
      ELSE 'CASH_ARS'
    END
  ORDER BY fa.created_at ASC
  LIMIT 1
)
WHERE cm.financial_account_id IS NULL
  AND cm.currency IS NOT NULL;

-- Si todavía quedan NULL (no hay cuenta CASH_XX), usar cualquier cuenta activa de esa moneda
UPDATE cash_movements cm
SET financial_account_id = (
  SELECT fa.id
  FROM financial_accounts fa
  WHERE fa.currency = cm.currency
    AND fa.is_active = true
  ORDER BY fa.created_at ASC
  LIMIT 1
)
WHERE cm.financial_account_id IS NULL
  AND cm.currency IS NOT NULL;

-- PASO 3: Loguear resultado
DO $$
DECLARE
  total_movements INTEGER;
  assigned INTEGER;
  still_null INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_movements FROM cash_movements;
  SELECT COUNT(*) INTO assigned FROM cash_movements WHERE financial_account_id IS NOT NULL;
  SELECT COUNT(*) INTO still_null FROM cash_movements WHERE financial_account_id IS NULL;
  RAISE NOTICE 'Migration 112 completada: % movimientos totales, % con cuenta asignada, % sin cuenta (sin currency o sin cuenta activa)',
    total_movements, assigned, still_null;
END $$;
