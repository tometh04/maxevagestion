-- VIB-134/B1-B2 — Asientos atómicos
--
-- PROBLEMA
-- --------
-- `createJournalEntry` arma el asiento con N+1 escrituras sueltas desde JS: un
-- INSERT en journal_entries y después, por cada línea, un INSERT en
-- ledger_movements más un UPDATE con la partida doble. El cliente de Supabase
-- no tiene transacciones, así que si falla la tercera línea de un asiento de
-- cuatro, lo anterior YA está escrito.
--
-- Hoy eso se compensa con un rollback manual en JavaScript que borra los
-- movements creados y el journal_entry. Funciona, pero es la clase de red que
-- falla justo cuando hace falta: si el rollback también falla (timeout, caída de
-- red, error de permisos), queda un asiento DESBALANCEADO en la base, con parte
-- de sus líneas escritas. Un asiento a medias es peor que ningún asiento: cuadra
-- mal el mayor y nadie se entera.
--
-- Importa más ahora que antes: entre los asientos de operaciones y los de
-- movimientos de plata, esto escribió ~24.000 líneas.
--
-- SOLUCIÓN
-- --------
-- Una función plpgsql hace todo en UNA transacción. Si algo falla, Postgres
-- revierte todo y no queda rastro. No hay rollback que pueda fallar porque no
-- hay rollback: hay atomicidad.
--
-- Las validaciones (mínimo 2 líneas, balance, Debe XOR Haber) se replican acá a
-- propósito. En JS son una convención que cada caller puede saltear; acá son una
-- barrera que la base impone a cualquiera, incluidos los scripts.
--
-- SECURITY INVOKER (el default): corre con los permisos del que llama, así que
-- respeta RLS. Con la sesión de un usuario, sus policies de tenant aplican; con
-- service role, se bypasea igual que hoy. No amplía el acceso de nadie.

CREATE OR REPLACE FUNCTION create_journal_entry_atomic(
  p_entry_date date,
  p_description text,
  p_source text,
  p_currency text,
  p_lines jsonb,
  p_total_amount numeric,
  p_exchange_rate numeric DEFAULT NULL,
  p_operation_id uuid DEFAULT NULL,
  p_org_id uuid DEFAULT NULL,
  p_entry_kind text DEFAULT NULL,
  p_source_movement_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry journal_entries%ROWTYPE;
  v_line jsonb;
  v_debit numeric;
  v_credit numeric;
  v_amount numeric;
  v_is_debit boolean;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_movement_ids uuid[] := '{}';
  v_movement_id uuid;
  v_idx int := 0;
BEGIN
  IF jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Un asiento contable requiere al menos 2 líneas';
  END IF;

  -- Balance y Debe XOR Haber, línea por línea.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_idx := v_idx + 1;
    v_debit := COALESCE((v_line->>'debit_amount')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit_amount')::numeric, 0);

    IF v_debit = 0 AND v_credit = 0 THEN
      RAISE EXCEPTION 'Línea %: debe tener Debe o Haber', v_idx;
    END IF;
    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'Línea %: no puede tener Debe y Haber simultáneamente', v_idx;
    END IF;

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  -- Misma tolerancia que validateJournalBalance en JS: menos de un centavo.
  IF abs(v_total_debit - v_total_credit) >= 0.01 THEN
    RAISE EXCEPTION 'Asiento desbalanceado: Debe % ≠ Haber % (diferencia: %)',
      round(v_total_debit, 2), round(v_total_credit, 2), round(abs(v_total_debit - v_total_credit), 2);
  END IF;

  INSERT INTO journal_entries (
    entry_date, description, operation_id, source, is_balanced,
    total_amount, currency, notes, created_by, org_id,
    entry_kind, source_movement_id
  ) VALUES (
    p_entry_date, p_description, p_operation_id, p_source, true,
    p_total_amount, p_currency, p_notes, p_created_by, p_org_id,
    p_entry_kind, p_source_movement_id
  )
  RETURNING * INTO v_entry;

  -- Las líneas del asiento van SIEMPRE con account_id nulo y affects_balance
  -- false: son contabilidad, no movimientos de dinero. Es lo que impide que un
  -- asiento altere el saldo de una cuenta financiera (getAccountBalancesBatch
  -- filtra por affects_balance = true).
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_debit := COALESCE((v_line->>'debit_amount')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit_amount')::numeric, 0);
    v_is_debit := v_debit > 0;
    v_amount := CASE WHEN v_is_debit THEN v_debit ELSE v_credit END;

    INSERT INTO ledger_movements (
      operation_id, lead_id, type, concept, currency,
      amount_original, exchange_rate, amount_ars_equivalent, method,
      account_id, seller_id, operator_id, receipt_number, notes,
      created_by, affects_balance, org_id, movement_date,
      journal_entry_id, debit_amount, credit_amount, chart_account_id
    ) VALUES (
      COALESCE((v_line->>'operation_id')::uuid, p_operation_id),
      NULL,
      COALESCE(v_line->>'legacy_type', CASE WHEN v_is_debit THEN 'EXPENSE' ELSE 'INCOME' END),
      COALESCE(v_line->>'concept', p_description),
      p_currency,
      v_amount,
      p_exchange_rate,
      CASE WHEN p_currency = 'USD' AND p_exchange_rate IS NOT NULL
           THEN v_amount * p_exchange_rate
           ELSE v_amount END,
      COALESCE(v_line->>'legacy_method', 'OTHER'),
      NULL,
      (v_line->>'seller_id')::uuid,
      (v_line->>'operator_id')::uuid,
      v_line->>'receipt_number',
      v_line->>'notes',
      p_created_by,
      false,
      p_org_id,
      p_entry_date::timestamptz,
      v_entry.id,
      CASE WHEN v_is_debit THEN v_amount ELSE NULL END,
      CASE WHEN v_is_debit THEN NULL ELSE v_amount END,
      (v_line->>'chart_account_id')::uuid
    )
    RETURNING id INTO v_movement_id;

    v_movement_ids := array_append(v_movement_ids, v_movement_id);
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_entry.id,
    'entry_number', v_entry.entry_number,
    'entry_date', v_entry.entry_date,
    'description', v_entry.description,
    'source', v_entry.source,
    'total_amount', v_entry.total_amount,
    'currency', v_entry.currency,
    'movement_ids', to_jsonb(v_movement_ids)
  );
END;
$$;

COMMENT ON FUNCTION create_journal_entry_atomic IS
  'Crea un asiento y sus líneas en UNA transacción (VIB-134/B1-B2). Reemplaza el loop de INSERTs con rollback manual en JS, que podía dejar un asiento desbalanceado si el propio rollback fallaba. Valida mínimo 2 líneas, balance y Debe XOR Haber. SECURITY INVOKER: respeta RLS.';

GRANT EXECUTE ON FUNCTION create_journal_entry_atomic TO authenticated, service_role;
