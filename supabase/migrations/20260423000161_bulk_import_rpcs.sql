-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260423000161_bulk_import_rpcs.sql

-- Bulk Import RPCs — funciones atómicas SECURITY DEFINER para insertar batches
-- de filas por entidad. Usadas por endpoints /api/import/<entity>.
--
-- Cada función:
--   - Recibe p_org_id uuid + p_rows jsonb (array de objetos row).
--   - INSERT ... ON CONFLICT (org_id, <natural_key>) DO NOTHING.
--   - Devuelve jsonb: { inserted: int, conflicts: jsonb[] }.
-- Spec: docs/superpowers/specs/2026-04-23-bulk-import-design.md
--
-- IMPORTANT: correcciones aplicadas vs plan original (conflictos con schema real):
--   - operators: agrega columna `cuit` (no existía).
--   - users: usa `default_commission_percentage` (no `commission_percentage`).
--   - operations: usa `seller_id` (no `seller_primary_id`). Agrega columnas
--     required (`type`, `margin_amount`, `margin_percentage`, `operation_date`).
--     Relación con customer via `operation_customers` (no FK flat).
--   - payments: usa `method` + `reference` (no `payment_method` / `reference_number`).
--     Agrega `payer_type` derivado de direction. Drop `financial_account_id`.
--   - cash_movements: sin `reference_number`; natural key usa `notes`. Requiere
--     `user_id` (pasado como param separado al RPC).

-- === ALTER TABLE: agregar columnas faltantes ===

ALTER TABLE operators ADD COLUMN IF NOT EXISTS cuit text;

-- === UNIQUE CONSTRAINTS (natural keys por entidad) ===

-- agencies: (org_id, name)
ALTER TABLE agencies DROP CONSTRAINT IF EXISTS agencies_org_name_unique;
ALTER TABLE agencies ADD CONSTRAINT agencies_org_name_unique UNIQUE (org_id, name);

-- financial_accounts: NO UNIQUE — hay 42+2 duplicados legacy en Lozada
-- ("Costo de Operadores" × 42, "Banco Galicia USD" × 2) imposibles de limpiar
-- sin migración de FKs de cash_movements/ledger_movements. Dedupe se hace
-- en el RPC via EXISTS check (mismo pattern que cash_movements).
ALTER TABLE financial_accounts DROP CONSTRAINT IF EXISTS financial_accounts_org_name_unique;

-- customers: NO UNIQUE — 4 duplicados legacy en Lozada (3 DNIs + 1 email).
-- Dedupe en RPC via EXISTS (ya implementado). Drop por si existe de intentos previos.
DROP INDEX IF EXISTS customers_org_document_unique;
DROP INDEX IF EXISTS customers_org_email_unique;

-- operators: (org_id, name) + partial unique por CUIT si presente
ALTER TABLE operators DROP CONSTRAINT IF EXISTS operators_org_name_unique;
ALTER TABLE operators ADD CONSTRAINT operators_org_name_unique UNIQUE (org_id, name);
DROP INDEX IF EXISTS operators_org_cuit_unique;
CREATE UNIQUE INDEX operators_org_cuit_unique
  ON operators (org_id, cuit)
  WHERE cuit IS NOT NULL AND cuit != '';

-- users: (org_id, email)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_org_email_unique;
ALTER TABLE users ADD CONSTRAINT users_org_email_unique UNIQUE (org_id, email);

-- operations: (org_id, file_code) — file_code es nullable; índice parcial.
DROP INDEX IF EXISTS operations_org_file_code_unique;
CREATE UNIQUE INDEX operations_org_file_code_unique
  ON operations (org_id, file_code)
  WHERE file_code IS NOT NULL AND file_code != '';

-- payments: NO UNIQUE — ~30 duplicados legacy composite en Lozada.
-- Dedupe en RPC via EXISTS. Drop por si existe de intentos previos.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_org_composite_unique;

-- cash_movements: NO UNIQUE — hay duplicados legacy en Lozada.
-- Dedupe en RPC via EXISTS. Drop por si existe de intentos previos.
DROP INDEX IF EXISTS cash_movements_org_composite_unique;

-- === RPCs ===

CREATE OR REPLACE FUNCTION _bulk_import_result(inserted_count int, conflicts_arr jsonb[])
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'inserted', inserted_count,
    'conflicts', COALESCE(to_jsonb(conflicts_arr), '[]'::jsonb)
  )
$$;

-- 1. bulk_import_agencies
CREATE OR REPLACE FUNCTION bulk_import_agencies(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    INSERT INTO agencies (org_id, name, city, timezone)
    VALUES (
      p_org_id,
      v_row->>'name',
      v_row->>'city',
      COALESCE(NULLIF(v_row->>'timezone', ''), 'America/Argentina/Buenos_Aires')
    )
    ON CONFLICT (org_id, name) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_conflicts := array_append(v_conflicts, jsonb_build_object('name', v_row->>'name'));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 2. bulk_import_financial_accounts
-- Dedupe via EXISTS (no ON CONFLICT porque no hay UNIQUE por duplicados legacy).
CREATE OR REPLACE FUNCTION bulk_import_financial_accounts(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_agency_id uuid;
  v_id uuid;
  v_name text;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_name := v_row->>'name';
    IF EXISTS (
      SELECT 1 FROM financial_accounts WHERE org_id = p_org_id AND name = v_name
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object('name', v_name));
      CONTINUE;
    END IF;
    v_agency_id := NULL;
    IF v_row ? 'agency_id' AND NULLIF(v_row->>'agency_id', '') IS NOT NULL THEN
      v_agency_id := (v_row->>'agency_id')::uuid;
    END IF;
    INSERT INTO financial_accounts (
      org_id, agency_id, name, type, currency, initial_balance, bank_name, account_number
    )
    VALUES (
      p_org_id,
      v_agency_id,
      v_name,
      v_row->>'type',
      v_row->>'currency',
      COALESCE(NULLIF(v_row->>'initial_balance', '')::numeric, 0),
      NULLIF(v_row->>'bank_name', ''),
      NULLIF(v_row->>'account_number', '')
    )
    RETURNING id INTO v_id;
    v_inserted := v_inserted + 1;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 3. bulk_import_customers
CREATE OR REPLACE FUNCTION bulk_import_customers(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
  v_doc text;
  v_email text;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_doc := NULLIF(v_row->>'document_number', '');
    v_email := NULLIF(v_row->>'email', '');
    -- Dedupe: si doc existe en org, skip. Si no hay doc pero email existe, skip.
    IF v_doc IS NOT NULL AND EXISTS (
      SELECT 1 FROM customers WHERE org_id = p_org_id AND document_number = v_doc
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object('document_number', v_doc));
      CONTINUE;
    END IF;
    IF v_doc IS NULL AND v_email IS NOT NULL AND EXISTS (
      SELECT 1 FROM customers WHERE org_id = p_org_id AND email = v_email
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object('email', v_email));
      CONTINUE;
    END IF;
    INSERT INTO customers (
      org_id, first_name, last_name, phone, email,
      document_type, document_number, date_of_birth, nationality
    )
    VALUES (
      p_org_id,
      v_row->>'first_name',
      v_row->>'last_name',
      v_row->>'phone',
      v_email,
      NULLIF(v_row->>'document_type', ''),
      v_doc,
      NULLIF(v_row->>'date_of_birth', '')::date,
      NULLIF(v_row->>'nationality', '')
    )
    RETURNING id INTO v_id;
    v_inserted := v_inserted + 1;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 4. bulk_import_operators
CREATE OR REPLACE FUNCTION bulk_import_operators(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
  v_cuit text;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_cuit := NULLIF(v_row->>'cuit', '');
    IF v_cuit IS NOT NULL AND EXISTS (
      SELECT 1 FROM operators WHERE org_id = p_org_id AND cuit = v_cuit
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object('cuit', v_cuit));
      CONTINUE;
    END IF;
    INSERT INTO operators (
      org_id, name, cuit, contact_name, contact_email, contact_phone, credit_limit
    )
    VALUES (
      p_org_id,
      v_row->>'name',
      v_cuit,
      NULLIF(v_row->>'contact_name', ''),
      NULLIF(v_row->>'contact_email', ''),
      NULLIF(v_row->>'contact_phone', ''),
      COALESCE(NULLIF(v_row->>'credit_limit', '')::numeric, 0)
    )
    ON CONFLICT (org_id, name) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_conflicts := array_append(v_conflicts, jsonb_build_object('name', v_row->>'name'));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 5. bulk_import_users
-- El endpoint crea auth.users (inviteUserByEmail) antes de llamar a esta RPC,
-- y pasa el auth_id resultante en cada row.
CREATE OR REPLACE FUNCTION bulk_import_users(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    INSERT INTO users (auth_id, org_id, name, email, role, is_active, default_commission_percentage)
    VALUES (
      (v_row->>'auth_id')::uuid,
      p_org_id,
      v_row->>'name',
      v_row->>'email',
      v_row->>'role',
      true,
      COALESCE(NULLIF(v_row->>'commission_percentage', '')::numeric, 0)
    )
    ON CONFLICT (org_id, email) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_conflicts := array_append(v_conflicts, jsonb_build_object('email', v_row->>'email'));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 6. bulk_import_operations
-- El endpoint ya resolvió los FKs: pasa agency_id, customer_id, operator_id, seller_id como uuids.
-- La RPC calcula margin_* server-side y crea operation + operation_customers (role=primary) en misma TX.
CREATE OR REPLACE FUNCTION bulk_import_operations(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
  v_file_code text;
  v_sale numeric;
  v_cost numeric;
  v_margin numeric;
  v_margin_pct numeric;
  v_departure date;
  v_op_date date;
  v_customer_id uuid;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_file_code := NULLIF(v_row->>'file_code', '');
    -- Dedupe por file_code si presente.
    IF v_file_code IS NOT NULL AND EXISTS (
      SELECT 1 FROM operations WHERE org_id = p_org_id AND file_code = v_file_code
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object('file_code', v_file_code));
      CONTINUE;
    END IF;
    v_sale := (v_row->>'sale_amount')::numeric;
    v_cost := (v_row->>'operator_cost')::numeric;
    v_margin := v_sale - v_cost;
    v_margin_pct := CASE WHEN v_sale > 0 THEN (v_margin * 100.0 / v_sale) ELSE 0 END;
    v_departure := (v_row->>'departure_date')::date;
    v_op_date := COALESCE(NULLIF(v_row->>'operation_date', '')::date, v_departure);
    v_customer_id := NULLIF(v_row->>'customer_id', '')::uuid;

    INSERT INTO operations (
      org_id, agency_id, file_code, operator_id, seller_id,
      destination, departure_date, return_date, operation_date,
      adults, children, sale_amount_total, operator_cost, currency, status, type,
      margin_amount, margin_percentage
    )
    VALUES (
      p_org_id,
      (v_row->>'agency_id')::uuid,
      v_file_code,
      NULLIF(v_row->>'operator_id', '')::uuid,
      (v_row->>'seller_id')::uuid,
      v_row->>'destination',
      v_departure,
      NULLIF(v_row->>'return_date', '')::date,
      v_op_date,
      COALESCE(NULLIF(v_row->>'adults', '')::int, 1),
      COALESCE(NULLIF(v_row->>'children', '')::int, 0),
      v_sale,
      v_cost,
      v_row->>'currency',
      v_row->>'status',
      COALESCE(NULLIF(v_row->>'type', ''), 'package'),
      v_margin,
      v_margin_pct
    )
    RETURNING id INTO v_id;

    -- Link primary customer via operation_customers M2M
    IF v_id IS NOT NULL AND v_customer_id IS NOT NULL THEN
      INSERT INTO operation_customers (operation_id, customer_id, org_id, role)
      VALUES (v_id, v_customer_id, p_org_id, 'primary');
    END IF;

    v_inserted := v_inserted + 1;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 7. bulk_import_payments
-- payer_type se deriva de direction: INCOME → customer, EXPENSE → operator.
-- Dedupe via EXISTS (no ON CONFLICT porque no hay UNIQUE por duplicados legacy).
CREATE OR REPLACE FUNCTION bulk_import_payments(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
  v_direction text;
  v_payer text;
  v_op_id uuid;
  v_amount numeric;
  v_date_due date;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_direction := v_row->>'direction';
    v_payer := CASE WHEN v_direction = 'INCOME' THEN 'customer' ELSE 'operator' END;
    v_op_id := (v_row->>'operation_id')::uuid;
    v_amount := (v_row->>'amount')::numeric;
    v_date_due := (v_row->>'date_due')::date;

    IF EXISTS (
      SELECT 1 FROM payments
      WHERE org_id = p_org_id
        AND operation_id = v_op_id
        AND amount = v_amount
        AND date_due = v_date_due
        AND direction = v_direction
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object(
        'operation_id', v_op_id,
        'amount', v_amount,
        'date_due', v_date_due
      ));
      CONTINUE;
    END IF;

    INSERT INTO payments (
      org_id, operation_id, direction, amount, currency,
      date_due, date_paid, status, method, reference, payer_type
    )
    VALUES (
      p_org_id, v_op_id, v_direction, v_amount, v_row->>'currency',
      v_date_due, NULLIF(v_row->>'date_paid', '')::date,
      COALESCE(NULLIF(v_row->>'status', ''), 'PENDING'),
      COALESCE(NULLIF(v_row->>'method', ''), 'OTHER'),
      NULLIF(v_row->>'reference', ''), v_payer
    )
    RETURNING id INTO v_id;
    v_inserted := v_inserted + 1;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 8. bulk_import_cash_movements
-- user_id viene del endpoint (el user autenticado que hace el import).
-- Dedupe manual (EXISTS) porque el índice UNIQUE parcial con expresión COALESCE
-- no siempre matchea vía ON CONFLICT.
CREATE OR REPLACE FUNCTION bulk_import_cash_movements(p_org_id uuid, p_user_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
  v_account_id uuid;
  v_date date;
  v_amount numeric;
  v_type text;
  v_notes text;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_account_id := (v_row->>'financial_account_id')::uuid;
    v_date := (v_row->>'date')::date;
    v_amount := (v_row->>'amount')::numeric;
    v_type := v_row->>'type';
    v_notes := NULLIF(v_row->>'notes', '');

    IF EXISTS (
      SELECT 1 FROM cash_movements
      WHERE org_id = p_org_id
        AND financial_account_id = v_account_id
        AND movement_date = v_date
        AND amount = v_amount
        AND type = v_type
        AND COALESCE(notes, '') = COALESCE(v_notes, '')
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object(
        'financial_account_id', v_account_id,
        'date', v_date,
        'amount', v_amount
      ));
      CONTINUE;
    END IF;

    INSERT INTO cash_movements (
      org_id, user_id, financial_account_id, movement_date, type, amount, currency,
      category, notes
    )
    VALUES (
      p_org_id,
      p_user_id,
      v_account_id,
      v_date,
      v_type,
      v_amount,
      v_row->>'currency',
      v_row->>'category',
      v_notes
    )
    RETURNING id INTO v_id;
    v_inserted := v_inserted + 1;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION bulk_import_agencies(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_financial_accounts(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_customers(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_operators(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_users(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_operations(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_payments(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_cash_movements(uuid, uuid, jsonb) TO authenticated, service_role;
