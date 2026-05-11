-- =============================================================
-- LEGACY SETTLEMENT — LOZADA ROSARIO 2026-05-08
-- =============================================================
--
-- Marca como pagados todos los operator_payments pendientes a Eurovips,
-- Lozada (operador) y Delfos en Lozada Rosario, sin afectar saldos
-- bancarios — porque los saldos cargados al sistema ya descuentan estos
-- pagos (se hicieron fuera del sistema antes del go-live).
--
-- IMPORTANTE: este script está scopeado a UNA sola agencia. NO TOCA
-- ningún otro tenant ni agencia del SaaS.
--
-- Pre-requisitos:
--   1. Migración 20260508000001 ya corrida (columna is_legacy_settled)
--   2. Migración 20260507000003 ya corrida (columna is_legacy_import)
--
-- Qué hace por cada operator_payment pendiente (paid_amount < amount):
--   1. INSERT en payments — registro sintético con status=PAID y
--      is_legacy_import=true → aparece en "Historial de Pagos" de la op
--   2. UPDATE en operator_payments — paid_amount = amount, status=PAID,
--      is_legacy_settled=true → la deuda queda en cero
--   3. NO crea ledger_movement → saldos bancarios intactos
--   4. NO crea cash_movement → no aparece en /cash/movements
--
-- =============================================================
-- VERIFICACIÓN PRE-EJECUCIÓN — corré esto primero y leé los números.
-- Solo seguir si los totales coinciden con lo esperado:
--   Delfos ARS: 80 | Delfos USD: ~185.401
--   Eurovips ARS: 2.000 | Eurovips USD: ~357.074
--   Lozada ARS: ~596.020 | Lozada USD: ~455.157
-- =============================================================

SELECT
  o.name                                                AS operador,
  op.currency                                            AS moneda,
  COUNT(*)                                               AS rows_a_settlear,
  ROUND(SUM(op.amount - op.paid_amount)::numeric, 2)     AS deuda_total_a_eliminar
FROM operator_payments op
JOIN operators o ON o.id = op.operator_id
WHERE o.agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
  AND LOWER(o.name) IN ('eurovips', 'lozada', 'delfos')
  AND op.paid_amount < op.amount
  AND op.status != 'CANCELLED'
GROUP BY o.name, op.currency
ORDER BY o.name, op.currency;

-- =============================================================
-- EJECUCIÓN — correr una vez verificada la query de arriba
-- =============================================================

DO $$
DECLARE
  v_agency_id   uuid := '66563aeb-4e8b-40ee-a622-b39defb380dd';
  v_payments_inserted INTEGER;
  v_op_payments_updated INTEGER;
  v_deuda_restante NUMERIC;
BEGIN
  -- Step 1: INSERT en payments un row sintético por cada operator_payment
  --         pendiente. Esto es lo que hace que aparezca en "Historial de
  --         Pagos" de la operación con badge "Histórico" (is_legacy_import).
  WITH pendientes AS (
    SELECT
      op.id, op.operation_id, op.operator_id, op.currency,
      op.amount, op.paid_amount,
      (op.amount - op.paid_amount) AS delta_pendiente
    FROM operator_payments op
    JOIN operators o ON o.id = op.operator_id
    WHERE o.agency_id = v_agency_id
      AND LOWER(o.name) IN ('eurovips', 'lozada', 'delfos')
      AND op.paid_amount < op.amount
      AND op.status != 'CANCELLED'
  )
  INSERT INTO payments (
    operation_id, operator_id, agency_id,
    payer_type, direction, method, status, source,
    amount, currency,
    date_due, date_paid,
    is_legacy_import,
    operator_payment_id,
    reference
  )
  SELECT
    p.operation_id,
    p.operator_id,
    v_agency_id,
    'OPERATOR',
    'EXPENSE',
    'TRANSFER',
    'PAID',
    'LEGACY_SETTLEMENT',
    p.delta_pendiente,
    p.currency,
    CURRENT_DATE,
    CURRENT_DATE,
    true,
    p.id,
    'Pago histórico declarado fuera del sistema (settlement 2026-05-08)'
  FROM pendientes p;

  GET DIAGNOSTICS v_payments_inserted = ROW_COUNT;
  RAISE NOTICE '[1/3] Payments insertados en historial: %', v_payments_inserted;

  -- Step 2: UPDATE operator_payments → marcar como PAID y settled
  UPDATE operator_payments op
  SET
    paid_amount = op.amount,
    status = 'PAID',
    is_legacy_settled = true,
    updated_at = NOW()
  FROM operators o
  WHERE op.operator_id = o.id
    AND o.agency_id = v_agency_id
    AND LOWER(o.name) IN ('eurovips', 'lozada', 'delfos')
    AND op.paid_amount < op.amount
    AND op.status != 'CANCELLED';

  GET DIAGNOSTICS v_op_payments_updated = ROW_COUNT;
  RAISE NOTICE '[2/3] operator_payments settled: %', v_op_payments_updated;

  -- Step 3: Verificación final → deuda total debe ser 0
  SELECT COALESCE(SUM(op.amount - op.paid_amount), 0)
  INTO v_deuda_restante
  FROM operator_payments op
  JOIN operators o ON o.id = op.operator_id
  WHERE o.agency_id = v_agency_id
    AND LOWER(o.name) IN ('eurovips', 'lozada', 'delfos');

  IF v_deuda_restante > 0.01 THEN
    RAISE EXCEPTION '[3/3] Deuda restante NO es 0: %. Algo no settleo bien. Revertir manualmente.', v_deuda_restante;
  END IF;

  RAISE NOTICE '[3/3] ✅ Deuda total a Eurovips/Lozada/Delfos = 0. Settlement completo.';
END $$;

-- =============================================================
-- POST-CHECK — debería devolver 0 deuda en todos los rows
-- =============================================================

SELECT
  o.name AS operador,
  op.currency AS moneda,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE op.is_legacy_settled = true) AS settled_hoy,
  ROUND(SUM(op.amount)::numeric, 2) AS total_facturado,
  ROUND(SUM(op.paid_amount)::numeric, 2) AS total_pagado,
  ROUND((SUM(op.amount) - SUM(op.paid_amount))::numeric, 2) AS deuda_residual
FROM operator_payments op
JOIN operators o ON o.id = op.operator_id
WHERE o.agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
  AND LOWER(o.name) IN ('eurovips', 'lozada', 'delfos')
GROUP BY o.name, op.currency
ORDER BY o.name, op.currency;
