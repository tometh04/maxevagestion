-- VIB-143 — Agencia en el asiento contable
--
-- POR QUÉ
-- -------
-- Los asientos solo tienen organización. Pero una organización puede tener
-- varias agencias operando por separado: Lozada Rosario tiene "Rosario" (1.232
-- operaciones) y "Madero" (232), y son sucursales que se miran distinto.
--
-- El resto del sistema ya permite filtrar por agencia —posición mensual,
-- deudores por ventas, libro mayor— y la contabilidad quedaba afuera.
--
-- No parte los libros: el reporte sigue siendo consolidado por defecto y la
-- agencia es un FILTRO, como en las demás pantallas.
--
-- SE PUEDE DEDUCIR, NO HAY QUE CARGARLA
-- -------------------------------------
-- Medido sobre Lozada: de 8.650 asientos, 8.649 se pueden atribuir. 7.636 por
-- la agencia de su operación y 1.013 por la agencia de la cuenta financiera del
-- movimiento que los originó. Uno solo queda sin atribuir.
--
-- Se guarda explícita en vez de deducirla en cada consulta: el reporte no
-- debería depender de recalcular una cadena de joins, y además la agencia de
-- una operación puede cambiar después sin que eso deba reescribir la historia
-- contable.
--
-- ADITIVA
-- -------
-- Columna nullable, sin default y sin backfill acá: el asiento que no la tenga
-- sigue funcionando igual y aparece en el consolidado. El backfill va por
-- script aparte, que puede correr por agencia y verificarse.

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS agency_id uuid;

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_agency_id_fkey;

-- ON DELETE SET NULL: borrar una agencia no puede hacer desaparecer asientos.
-- El asiento queda en el consolidado, que es lo correcto.
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

COMMENT ON COLUMN journal_entries.agency_id IS
  'Agencia a la que corresponde el asiento (VIB-143). Se deduce de la operación o de la cuenta financiera del movimiento de origen. NULL = no atribuible; el asiento igual aparece en el consolidado.';

-- El reporte filtra por (org, agencia, fecha): ese es el índice que necesita.
CREATE INDEX IF NOT EXISTS journal_entries_org_agency_date_idx
  ON journal_entries (org_id, agency_id, entry_date);


-- La función atómica pasa a aceptar la agencia (VIB-143).
--
-- Se DROPEA la firma vieja en vez de usar solo CREATE OR REPLACE: agregar un
-- parámetro cambia la firma y Postgres crearía una SEGUNDA función en vez de
-- reemplazarla. Con las dos vivas, una llamada podría resolver a la vieja y el
-- asiento quedaría sin agencia en silencio.
DROP FUNCTION IF EXISTS create_journal_entry_atomic(
  date, text, text, text, jsonb, numeric, numeric, uuid, uuid, text, uuid, uuid, text
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
  p_agency_id uuid DEFAULT NULL
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
    entry_kind, source_movement_id, agency_id
  ) VALUES (
    p_entry_date, p_description, p_operation_id, p_source, true,
    p_total_amount, p_currency, p_notes, p_created_by, p_org_id,
    p_entry_kind, p_source_movement_id, p_agency_id
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
