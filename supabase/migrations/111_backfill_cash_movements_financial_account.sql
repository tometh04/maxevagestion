-- Migration 111: Backfill financial_account_id en cash_movements
--
-- PROBLEMA: Los movimientos creados antes de que "financial_account_id" fuera
-- obligatorio (vía el campo del formulario de Caja) quedaron con NULL en esa columna.
-- Como la vista "Caja USD / Caja ARS" filtra por financial_account_id con eq(),
-- estos movimientos viejos son INVISIBLES en la Caja, aunque sí cuentan en el
-- balance total (financial_accounts.current_balance via ledger_movements).
--
-- FIX: Para cada movimiento con financial_account_id IS NULL, asignarle la primera
-- cuenta financiera activa que coincida con su currency (USD → CASH_USD, ARS → CASH_ARS).
-- Prioridad: CASH_USD / CASH_ARS primero (efectivo), luego cualquier cuenta de esa moneda.

UPDATE cash_movements cm
SET financial_account_id = (
  SELECT fa.id
  FROM financial_accounts fa
  WHERE fa.currency = cm.currency
    AND fa.is_active = true
    AND fa.type IN (
      CASE cm.currency
        WHEN 'USD' THEN 'CASH_USD'
        WHEN 'ARS' THEN 'CASH_ARS'
        ELSE 'CASH_ARS'
      END
    )
  ORDER BY fa.created_at ASC
  LIMIT 1
)
WHERE cm.financial_account_id IS NULL
  AND cm.currency IS NOT NULL;

-- Si todavía quedan NULL (no existe cuenta CASH_XX), intentar con cualquier cuenta de esa moneda
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

-- Loguear resultado
DO $$
DECLARE
  remaining_null INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_null
  FROM cash_movements
  WHERE financial_account_id IS NULL;
  RAISE NOTICE 'Backfill completado. Movimientos aún con financial_account_id NULL: %', remaining_null;
END $$;
