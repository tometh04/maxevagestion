-- VIB-141 — El asiento de cierre necesita viajar por el camino atómico
--
-- `create_journal_entry_atomic` es el único camino que inserta el asiento y sus
-- líneas en una sola transacción. Si el cierre escribiera `close_period` con un
-- UPDATE posterior, entre el INSERT y el UPDATE habría una ventana en la que el
-- índice único `journal_entries_close_unique` no protege nada: dos corridas
-- simultáneas del mismo período crearían los dos asientos antes de que ninguna
-- marcara el suyo, y el duplicado quedaría.
--
-- Por eso las dos columnas se pasan a la función y se escriben en el mismo
-- INSERT que el resto del asiento.
--
-- Se hace DROP y CREATE en vez de CREATE OR REPLACE porque agregar parámetros
-- cambia la firma: dejar viva la anterior haría ambigua toda llamada que no los
-- pase. Es el mismo procedimiento que usó la migración de `agency_id`.

DROP FUNCTION IF EXISTS create_journal_entry_atomic(
  date, text, text, text, jsonb, numeric, numeric, uuid, uuid, text, uuid, uuid, text, uuid
);

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
  p_notes text DEFAULT NULL,
  p_agency_id uuid DEFAULT NULL,
  p_close_period text DEFAULT NULL,
  p_close_kind text DEFAULT NULL
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
    entry_kind, source_movement_id, agency_id, close_period, close_kind
  ) VALUES (
    p_entry_date, p_description, p_operation_id, p_source, true,
    p_total_amount, p_currency, p_notes, p_created_by, p_org_id,
    p_entry_kind, p_source_movement_id, p_agency_id, p_close_period, p_close_kind
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
  'Crea un asiento y sus líneas en UNA transacción (VIB-134/B1-B2). Valida mínimo 2 líneas, balance y Debe XOR Haber. Desde VIB-141 acepta close_period/close_kind para los asientos de cierre mensual, cuya idempotencia depende del índice único que los usa. SECURITY INVOKER: respeta RLS.';

GRANT EXECUTE ON FUNCTION create_journal_entry_atomic TO authenticated, service_role;
