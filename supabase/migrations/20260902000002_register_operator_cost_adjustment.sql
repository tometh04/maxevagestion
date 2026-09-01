-- VIB-174 — Registrar y revertir el ajuste de liquidación, en una transacción
--
-- POR QUÉ UNA FUNCIÓN Y NO VARIOS PostgREST
-- -----------------------------------------
-- Registrar un ajuste toca cuatro cosas: crea la fila del ajuste, corrige la
-- deuda al operador, crea las comisiones de corrección y emite el asiento. Si
-- eso se hiciera en llamadas sueltas, un fallo a mitad de camino dejaría la
-- deuda corregida sin comisión, o el asiento sin la deuda: un descuadre que
-- nadie ve hasta el cierre. Acá es una transacción: o queda todo o no queda
-- nada. Es el mismo criterio de `split_agency_expense` (VIB-168).
--
-- QUÉ NO HACE, A PROPÓSITO
-- ------------------------
-- No toca `operation_operators.cost` ni `operations.operator_cost`. La
-- operación conserva su costo ESTIMADO porque sobre ese número ya se liquidaron
-- comisiones y se cerró un mes. La diferencia vive acá, imputada al mes en que
-- se conoció. Esa separación es toda la feature; si alguien "arregla" esto
-- sincronizando el costo, vuelve el problema original.
--
-- EL CANDADO
-- ----------
-- La deuda se toma con FOR UPDATE y además se compara contra el monto y lo
-- pagado que vio quien abrió el diálogo. Dos efectos: un pago concurrente no se
-- pisa, y un doble click no duplica el ajuste —el segundo intento ve la deuda
-- ya corregida y corta con "no hay ajuste que hacer"—.
--
-- SECURITY DEFINER
-- ----------------
-- Como en `split_agency_expense`: el alta de comisiones y de asientos ya corre
-- con service role por los triggers. La protección de tenant no se delega a
-- RLS: `p_org_id` lo pasa la ruta desde la sesión, nunca desde el body, y todo
-- lo que se lee o escribe se acota a esa org. Una deuda de otro tenant devuelve
-- "no encontrada".

BEGIN;

CREATE OR REPLACE FUNCTION register_operator_cost_adjustment(
  p_operator_payment_id UUID,
  p_org_id UUID,
  p_actual_amount NUMERIC,
  p_reason TEXT,
  p_accrual_date DATE,
  p_expected_amount NUMERIC DEFAULT NULL,
  p_expected_paid_amount NUMERIC DEFAULT NULL,
  p_seller_shares JSONB DEFAULT '[]'::jsonb,
  p_referrer_share NUMERIC DEFAULT 0,
  p_agency_share NUMERIC DEFAULT 0,
  p_exchange_rate NUMERIC DEFAULT NULL,
  p_source TEXT DEFAULT 'MANUAL',
  p_payment_id UUID DEFAULT NULL,
  p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op operator_payments%ROWTYPE;
  v_actual numeric;
  v_delta numeric;
  v_result numeric;
  v_agency uuid;
  v_operation_status text;
  v_operator_name text;
  v_adjustment_id uuid;
  v_share jsonb;
  v_share_amount numeric;
  v_sum_shares numeric := 0;
  v_commission_total numeric := 0;
  v_commission_rows int := 0;
  v_new_status text;
  v_acc_payable uuid;
  v_acc_gain uuid;
  v_acc_loss uuid;
  v_acc_commission uuid;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_entry jsonb;
  v_entry_id uuid;
  v_warning text;
  v_concept text;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'El motivo del ajuste es obligatorio';
  END IF;

  IF p_accrual_date IS NULL THEN
    RAISE EXCEPTION 'Falta la fecha de imputación del ajuste';
  END IF;

  -- ── La deuda, bloqueada y acotada al tenant ──────────────────────────────
  SELECT * INTO v_op
    FROM operator_payments
   WHERE id = p_operator_payment_id
     AND org_id = p_org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deuda a operador no encontrada';
  END IF;

  IF p_expected_amount IS NOT NULL
     AND round(v_op.amount, 2) <> round(p_expected_amount, 2) THEN
    RAISE EXCEPTION 'La deuda cambió mientras cargabas el ajuste (ahora es %). Volvé a abrirlo.',
      round(v_op.amount, 2);
  END IF;

  IF p_expected_paid_amount IS NOT NULL
     AND round(COALESCE(v_op.paid_amount, 0), 2) <> round(p_expected_paid_amount, 2) THEN
    RAISE EXCEPTION 'Se registró un pago mientras cargabas el ajuste. Volvé a abrirlo.';
  END IF;

  v_actual := round(p_actual_amount, 2);

  IF v_actual < 0 THEN
    RAISE EXCEPTION 'El costo real no puede ser negativo';
  END IF;

  v_delta := v_actual - round(v_op.amount, 2);

  IF abs(v_delta) < 0.01 THEN
    RAISE EXCEPTION 'El costo real coincide con la deuda registrada: no hay ajuste que hacer';
  END IF;

  -- Bajar la deuda por debajo de lo ya pagado dejaría un sobrepago que el
  -- sistema no modela como crédito: se perdería de vista.
  IF v_actual < round(COALESCE(v_op.paid_amount, 0), 2) THEN
    RAISE EXCEPTION 'El costo real (%) es menor que lo que ya se le pagó al operador (%). Revertí el pago antes de ajustar.',
      v_actual, round(COALESCE(v_op.paid_amount, 0), 2);
  END IF;

  IF v_op.currency = 'USD' AND (p_exchange_rate IS NULL OR p_exchange_rate <= 0) THEN
    RAISE EXCEPTION 'Falta la cotización del dólar para valuar el ajuste';
  END IF;

  IF v_op.operation_id IS NOT NULL THEN
    SELECT o.agency_id, o.status INTO v_agency, v_operation_status
      FROM operations o
     WHERE o.id = v_op.operation_id;

    IF v_operation_status = 'CANCELLED' THEN
      RAISE EXCEPTION 'No se puede ajustar la deuda de una operación cancelada';
    END IF;
  END IF;

  SELECT name INTO v_operator_name FROM operators WHERE id = v_op.operator_id;

  -- ── El reparto tiene que cerrar ──────────────────────────────────────────
  -- Se calcula en TS (función pura y testeada) y se re-valida acá, igual que
  -- create_journal_entry_atomic revalida el balance: en JS es una convención
  -- que cada caller puede saltear, acá es una barrera para cualquiera.
  v_result := -v_delta;  -- positivo = ganancia para la agencia

  FOR v_share IN SELECT * FROM jsonb_array_elements(COALESCE(p_seller_shares, '[]'::jsonb)) LOOP
    v_sum_shares := v_sum_shares + COALESCE((v_share->>'amount')::numeric, 0);
  END LOOP;

  IF abs((v_sum_shares + COALESCE(p_referrer_share, 0) + COALESCE(p_agency_share, 0)) - v_result) >= 0.01 THEN
    RAISE EXCEPTION 'El reparto no cierra: vendedores % + referidor % + agencia % ≠ resultado %',
      round(v_sum_shares, 2), round(COALESCE(p_referrer_share, 0), 2),
      round(COALESCE(p_agency_share, 0), 2), round(v_result, 2);
  END IF;

  -- ── 1. El ajuste ─────────────────────────────────────────────────────────
  INSERT INTO operator_cost_adjustments (
    org_id, agency_id, operation_id, operator_id, operator_payment_id, operator_name,
    currency, estimated_amount, actual_amount, delta_amount,
    agency_share_amount, referrer_share_amount, seller_shares,
    exchange_rate, accrual_date, reason, source, payment_id, created_by
  ) VALUES (
    p_org_id, v_agency, v_op.operation_id, v_op.operator_id, v_op.id, v_operator_name,
    v_op.currency, round(v_op.amount, 2), v_actual, round(v_delta, 2),
    round(COALESCE(p_agency_share, 0), 2), round(COALESCE(p_referrer_share, 0), 2),
    COALESCE(p_seller_shares, '[]'::jsonb),
    p_exchange_rate, p_accrual_date, btrim(p_reason), p_source, p_payment_id, p_actor
  )
  RETURNING id INTO v_adjustment_id;

  -- ── 2. La deuda queda en el costo real ───────────────────────────────────
  v_new_status := CASE
    WHEN round(COALESCE(v_op.paid_amount, 0), 2) >= v_actual THEN 'PAID'
    WHEN v_op.due_date < CURRENT_DATE THEN 'OVERDUE'
    ELSE 'PENDING'
  END;

  UPDATE operator_payments
     SET amount = v_actual,
         status = v_new_status
   WHERE id = v_op.id;

  -- ── 3. Las comisiones de corrección ──────────────────────────────────────
  -- Filas nuevas, no ediciones: la comisión original puede estar pagada y
  -- `isLocked` la protege. Van al mes del ajuste, no al de la operación.
  IF v_op.operation_id IS NOT NULL THEN
    FOR v_share IN SELECT * FROM jsonb_array_elements(COALESCE(p_seller_shares, '[]'::jsonb)) LOOP
      v_share_amount := round(COALESCE((v_share->>'amount')::numeric, 0), 2);

      IF abs(v_share_amount) >= 0.01 THEN
        INSERT INTO commission_records (
          operation_id, seller_id, agency_id, org_id, amount, percentage,
          status, date_calculated, accrual_date, kind, adjustment_id
        ) VALUES (
          v_op.operation_id,
          (v_share->>'seller_id')::uuid,
          v_agency,
          p_org_id,
          v_share_amount,
          (v_share->>'percentage')::numeric,
          'PENDING',
          CURRENT_DATE,
          p_accrual_date,
          'ADJUSTMENT',
          v_adjustment_id
        );

        v_commission_rows := v_commission_rows + 1;
      END IF;
    END LOOP;
  END IF;

  -- El referidor comparte la cuenta contable con el vendedor (4.3.03): no hay
  -- una cuenta propia de comisiones de referidor en el plan.
  v_commission_total := round(v_sum_shares + COALESCE(p_referrer_share, 0), 2);

  -- ── 4. El asiento ────────────────────────────────────────────────────────
  SELECT id INTO v_acc_payable FROM chart_of_accounts
   WHERE org_id = p_org_id AND account_code = '2.1.01';
  SELECT id INTO v_acc_gain FROM chart_of_accounts
   WHERE org_id = p_org_id AND account_code = '4.1.06';
  SELECT id INTO v_acc_loss FROM chart_of_accounts
   WHERE org_id = p_org_id AND account_code = '4.3.16';
  SELECT id INTO v_acc_commission FROM chart_of_accounts
   WHERE org_id = p_org_id AND account_code = '4.3.03';

  IF v_acc_payable IS NULL OR v_acc_gain IS NULL OR v_acc_loss IS NULL THEN
    -- Una org sin plan de cuentas no tiene contabilidad de doble partida en
    -- ningún flujo. El ajuste igual se registra —la deuda hay que corregirla y
    -- el reporte lee esta tabla, no el mayor— pero se devuelve el aviso en vez
    -- de tragárselo: journal_entry_id queda en NULL y es consultable.
    v_warning := 'La organización no tiene el plan de cuentas completo: el ajuste se registró pero no generó asiento contable.';
  ELSE
    v_concept := CASE WHEN v_delta > 0
      THEN 'Ajuste de liquidación de operador (pérdida)'
      ELSE 'Ajuste de liquidación de operador (ganancia)' END;

    IF v_delta > 0 THEN
      -- El operador cobró más: sube la deuda contra una pérdida.
      v_lines := v_lines || jsonb_build_object(
        'chart_account_id', v_acc_loss,
        'debit_amount', abs(v_delta),
        'concept', v_concept,
        'operator_id', v_op.operator_id
      );
      v_lines := v_lines || jsonb_build_object(
        'chart_account_id', v_acc_payable,
        'credit_amount', abs(v_delta),
        'concept', v_concept,
        'operator_id', v_op.operator_id
      );
    ELSE
      -- El operador cobró menos: baja la deuda contra una ganancia.
      v_lines := v_lines || jsonb_build_object(
        'chart_account_id', v_acc_payable,
        'debit_amount', abs(v_delta),
        'concept', v_concept,
        'operator_id', v_op.operator_id
      );
      v_lines := v_lines || jsonb_build_object(
        'chart_account_id', v_acc_gain,
        'credit_amount', abs(v_delta),
        'concept', v_concept,
        'operator_id', v_op.operator_id
      );
    END IF;

    v_total := abs(v_delta);

    IF abs(v_commission_total) >= 0.01 AND v_acc_commission IS NOT NULL THEN
      IF v_commission_total > 0 THEN
        -- Comisión extra a favor del vendedor: más gasto, más deuda con él.
        v_lines := v_lines || jsonb_build_object(
          'chart_account_id', v_acc_commission,
          'debit_amount', abs(v_commission_total),
          'concept', 'Ajuste de comisión por liquidación de operador'
        );
        v_lines := v_lines || jsonb_build_object(
          'chart_account_id', v_acc_payable,
          'credit_amount', abs(v_commission_total),
          'concept', 'Ajuste de comisión por liquidación de operador'
        );
      ELSE
        -- El vendedor cobró de más: baja el gasto y baja lo que se le debe.
        v_lines := v_lines || jsonb_build_object(
          'chart_account_id', v_acc_payable,
          'debit_amount', abs(v_commission_total),
          'concept', 'Ajuste de comisión por liquidación de operador'
        );
        v_lines := v_lines || jsonb_build_object(
          'chart_account_id', v_acc_commission,
          'credit_amount', abs(v_commission_total),
          'concept', 'Ajuste de comisión por liquidación de operador'
        );
      END IF;

      v_total := v_total + abs(v_commission_total);
    END IF;

    v_entry := create_journal_entry_atomic(
      p_entry_date => p_accrual_date,
      p_description => v_concept || ' — ' || COALESCE(v_operator_name, 'operador'),
      p_source => 'AUTO_ADJUSTMENT',
      p_currency => v_op.currency,
      p_lines => v_lines,
      p_total_amount => v_total,
      p_exchange_rate => p_exchange_rate,
      p_operation_id => v_op.operation_id,
      p_org_id => p_org_id,
      p_entry_kind => NULL,
      p_source_movement_id => NULL,
      p_created_by => p_actor,
      p_notes => btrim(p_reason),
      p_agency_id => v_agency,
      p_close_period => NULL,
      p_close_kind => NULL
    );

    v_entry_id := (v_entry->>'id')::uuid;

    UPDATE operator_cost_adjustments
       SET journal_entry_id = v_entry_id
     WHERE id = v_adjustment_id;
  END IF;

  RETURN jsonb_build_object(
    'adjustment_id', v_adjustment_id,
    'delta_amount', round(v_delta, 2),
    'result_amount', round(v_result, 2),
    'debt_amount', v_actual,
    'debt_status', v_new_status,
    'commission_rows', v_commission_rows,
    'journal_entry_id', v_entry_id,
    'warning', v_warning
  );
END;
$$;

COMMENT ON FUNCTION register_operator_cost_adjustment IS
  'Registra la diferencia entre el costo estimado de un operador y su liquidación definitiva, en una transacción: crea el ajuste, corrige la deuda, emite las comisiones de corrección del mes y asienta el resultado (VIB-174). NO toca el costo ni el margen de la operación: esa historia ya se liquidó.';

GRANT EXECUTE ON FUNCTION register_operator_cost_adjustment TO authenticated, service_role;


-- ============================================================
-- Reversión
-- ============================================================
-- No borra el asiento: el mayor es fuente de verdad y un asiento emitido no se
-- deshace, se contra-asienta. Sí borra las comisiones de corrección que todavía
-- nadie tocó; si alguna ya se pagó, corta antes de escribir nada — primero hay
-- que revertir ese pago desde Comisiones.
CREATE OR REPLACE FUNCTION revert_operator_cost_adjustment(
  p_adjustment_id UUID,
  p_org_id UUID,
  p_reason TEXT,
  p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adj operator_cost_adjustments%ROWTYPE;
  v_op operator_payments%ROWTYPE;
  v_locked int;
  v_deleted int := 0;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_entry jsonb;
  v_entry_id uuid;
  v_total numeric := 0;
  v_new_status text;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'El motivo de la reversión es obligatorio';
  END IF;

  SELECT * INTO v_adj
    FROM operator_cost_adjustments
   WHERE id = p_adjustment_id AND org_id = p_org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ajuste no encontrado';
  END IF;

  IF v_adj.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'El ajuste ya está revertido';
  END IF;

  -- Comisiones de corrección con plata movida: mismo criterio que isLocked.
  SELECT count(*) INTO v_locked
    FROM commission_records
   WHERE adjustment_id = v_adj.id
     AND (status <> 'PENDING' OR COALESCE(amount_paid, 0) > 0 OR settled_at IS NOT NULL);

  IF v_locked > 0 THEN
    RAISE EXCEPTION 'El ajuste tiene % comisión(es) ya liquidadas. Revertí ese pago desde Comisiones antes de revertir el ajuste.', v_locked;
  END IF;

  DELETE FROM commission_records WHERE adjustment_id = v_adj.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- ── La deuda vuelve al estimado ──────────────────────────────────────────
  IF v_adj.operator_payment_id IS NOT NULL THEN
    SELECT * INTO v_op
      FROM operator_payments
     WHERE id = v_adj.operator_payment_id AND org_id = p_org_id
     FOR UPDATE;

    IF FOUND THEN
      IF round(v_op.amount, 2) <> round(v_adj.actual_amount, 2) THEN
        RAISE EXCEPTION 'La deuda ya no vale lo que dejó este ajuste (% vs %). Revisá si hay un ajuste posterior.',
          round(v_op.amount, 2), round(v_adj.actual_amount, 2);
      END IF;

      IF round(COALESCE(v_op.paid_amount, 0), 2) > round(v_adj.estimated_amount, 2) THEN
        RAISE EXCEPTION 'Ya se le pagó al operador más que el monto original de la deuda. No se puede revertir el ajuste.';
      END IF;

      v_new_status := CASE
        WHEN round(COALESCE(v_op.paid_amount, 0), 2) >= round(v_adj.estimated_amount, 2) THEN 'PAID'
        WHEN v_op.due_date < CURRENT_DATE THEN 'OVERDUE'
        ELSE 'PENDING'
      END;

      UPDATE operator_payments
         SET amount = round(v_adj.estimated_amount, 2),
             status = v_new_status
       WHERE id = v_op.id;
    END IF;
  END IF;

  -- ── Contra-asiento: las mismas líneas, dadas vuelta ──────────────────────
  IF v_adj.journal_entry_id IS NOT NULL THEN
    FOR v_line IN
      SELECT jsonb_build_object(
               'chart_account_id', lm.chart_account_id,
               'debit_amount', lm.credit_amount,
               'credit_amount', lm.debit_amount,
               'concept', 'Reversión: ' || COALESCE(lm.concept, ''),
               'operator_id', lm.operator_id
             )
        FROM ledger_movements lm
       WHERE lm.journal_entry_id = v_adj.journal_entry_id
         AND lm.chart_account_id IS NOT NULL
       ORDER BY lm.created_at
    LOOP
      v_lines := v_lines || v_line;
      v_total := v_total + COALESCE((v_line->>'debit_amount')::numeric, 0);
    END LOOP;

    IF jsonb_array_length(v_lines) >= 2 THEN
      v_entry := create_journal_entry_atomic(
        p_entry_date => CURRENT_DATE,
        p_description => 'Reversión de ajuste de liquidación de operador',
        p_source => 'AUTO_ADJUSTMENT',
        p_currency => v_adj.currency,
        p_lines => v_lines,
        p_total_amount => v_total,
        p_exchange_rate => v_adj.exchange_rate,
        p_operation_id => v_adj.operation_id,
        p_org_id => p_org_id,
        p_entry_kind => NULL,
        p_source_movement_id => NULL,
        p_created_by => p_actor,
        p_notes => btrim(p_reason),
        p_agency_id => v_adj.agency_id,
        p_close_period => NULL,
        p_close_kind => NULL
      );

      v_entry_id := (v_entry->>'id')::uuid;
    END IF;
  END IF;

  UPDATE operator_cost_adjustments
     SET reversed_at = NOW(),
         reversed_by = p_actor,
         reversal_reason = btrim(p_reason),
         reversal_journal_entry_id = v_entry_id
   WHERE id = v_adj.id;

  RETURN jsonb_build_object(
    'adjustment_id', v_adj.id,
    'commissions_deleted', v_deleted,
    'reversal_journal_entry_id', v_entry_id
  );
END;
$$;

COMMENT ON FUNCTION revert_operator_cost_adjustment IS
  'Revierte un ajuste de liquidación (VIB-174): borra sus comisiones de corrección si nadie las tocó, devuelve la deuda al monto original y contra-asienta. Si alguna comisión ya se liquidó, corta antes de escribir.';

GRANT EXECUTE ON FUNCTION revert_operator_cost_adjustment TO authenticated, service_role;

COMMIT;
