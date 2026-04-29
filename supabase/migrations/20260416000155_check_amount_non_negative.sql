-- =====================================================
-- CHECK constraints: amount no negativo en tablas de dinero
-- Migración 20260416000155
--
-- Motivación (auditoría B1):
--   Las tablas payments, cash_movements, ledger_movements y
--   operator_payments no tienen CHECK que impida valores negativos.
--   Un bug de cálculo podría insertar -100 y el sistema lo tomaría
--   como válido, ensuciando reportes y balances.
--
--   No se usa amount negativo legítimamente en el código (los reversos
--   se hacen vía DELETE del movimiento, no con un amount contrario).
--
-- Pre-cleanup: si hay filas con amount negativo (bugs históricos),
-- las seteamos a 0 y logueamos cuántas fueron. El usuario puede
-- revisarlas después.
--
-- Idempotente: DROP CONSTRAINT IF EXISTS antes de cada ADD.
-- =====================================================

-- ============================================
-- PASO 1: Limpiar valores negativos históricos (si los hay)
-- ============================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- payments.amount
  UPDATE payments SET amount = 0 WHERE amount < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[payments] % filas con amount negativo reseteadas a 0', v_count; END IF;

  -- cash_movements.amount
  UPDATE cash_movements SET amount = 0 WHERE amount < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[cash_movements] % filas con amount negativo reseteadas a 0', v_count; END IF;

  -- ledger_movements.amount_original
  UPDATE ledger_movements SET amount_original = 0 WHERE amount_original < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[ledger_movements.amount_original] % filas reseteadas a 0', v_count; END IF;

  -- ledger_movements.amount_ars_equivalent
  UPDATE ledger_movements SET amount_ars_equivalent = 0 WHERE amount_ars_equivalent < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[ledger_movements.amount_ars_equivalent] % filas reseteadas a 0', v_count; END IF;

  -- operator_payments.amount
  UPDATE operator_payments SET amount = 0 WHERE amount < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[operator_payments.amount] % filas reseteadas a 0', v_count; END IF;

  -- operator_payments.paid_amount
  UPDATE operator_payments SET paid_amount = 0 WHERE paid_amount < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[operator_payments.paid_amount] % filas reseteadas a 0', v_count; END IF;
END $$;

-- ============================================
-- PASO 2: Agregar CHECK constraints
-- ============================================

-- payments.amount
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_non_negative;
ALTER TABLE payments ADD CONSTRAINT payments_amount_non_negative CHECK (amount >= 0);

-- cash_movements.amount
ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS cash_movements_amount_non_negative;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_amount_non_negative CHECK (amount >= 0);

-- ledger_movements.amount_original
ALTER TABLE ledger_movements DROP CONSTRAINT IF EXISTS ledger_movements_amount_original_non_negative;
ALTER TABLE ledger_movements ADD CONSTRAINT ledger_movements_amount_original_non_negative CHECK (amount_original >= 0);

-- ledger_movements.amount_ars_equivalent
ALTER TABLE ledger_movements DROP CONSTRAINT IF EXISTS ledger_movements_amount_ars_equivalent_non_negative;
ALTER TABLE ledger_movements ADD CONSTRAINT ledger_movements_amount_ars_equivalent_non_negative CHECK (amount_ars_equivalent >= 0);

-- operator_payments.amount
ALTER TABLE operator_payments DROP CONSTRAINT IF EXISTS operator_payments_amount_non_negative;
ALTER TABLE operator_payments ADD CONSTRAINT operator_payments_amount_non_negative CHECK (amount >= 0);

-- operator_payments.paid_amount
ALTER TABLE operator_payments DROP CONSTRAINT IF EXISTS operator_payments_paid_amount_non_negative;
ALTER TABLE operator_payments ADD CONSTRAINT operator_payments_paid_amount_non_negative CHECK (paid_amount >= 0);

COMMENT ON CONSTRAINT payments_amount_non_negative ON payments IS
'Fix B1 auditoría: impide amount negativo. Los reversos se hacen vía DELETE, no cambiando el signo.';
