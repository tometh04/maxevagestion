# Bulk CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship un sistema de importación masiva CSV multi-tenant con validación 2 capas (Zod client + RPCs atómicos Postgres) que reemplaza el código legacy roto (sin `org_id`, sin rollback, sin chunking).

**Architecture:** 8 plantillas CSV estrictas. Client parsea con Papaparse + valida con Zod. Server re-valida + resuelve FKs dentro del tenant + ejecuta RPC `bulk_import_<entity>(p_org_id, p_rows jsonb)` con `SECURITY DEFINER` que hace INSERT transaccional con `ON CONFLICT DO NOTHING`. Chunks de 500 filas para archivos grandes. UI en `/settings/import` accesible desde cualquier momento (sin wizard obligatorio) + banner dismissible en dashboard.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + RLS), Papaparse, Zod, Jest, shadcn/ui.

**Spec base:** [`docs/superpowers/specs/2026-04-23-bulk-import-design.md`](/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/specs/2026-04-23-bulk-import-design.md)

**Convenciones críticas (leer antes de arrancar):**
- **Migrations NUNCA con `supabase db push`** — remote desincronizado. Archivo en `supabase/migrations/` + SQL pegado en chat para correr en Supabase SQL Editor (project `pmqvplyyxiobkllapgjp`).
- **Commits locales por default, push con OK explícito del user.**
- **Paths absolutos** al mencionar archivos.
- **Multi-tenant**: `org_id` SIEMPRE viene de `user.org_id` del request — nunca del body.
- **Papaparse** ya está instalado (verificar `package.json`); si no, `npm install papaparse @types/papaparse`.
- **Zod** ya está instalado.

## Correcciones aplicadas en Task 1 — usar estos nombres en TODAS las tasks siguientes

Durante la implementación de Task 1 se encontraron mismatches entre el plan original y el schema real. El archivo de migration SQL ya fue corregido; las tasks 4-9 (schemas Zod + endpoints) deben usar los nombres CORRECTOS:

| Entidad | Plan original decía | Usar en realidad |
|---|---|---|
| operators | `cuit` (no existía) | `cuit` (ahora existe tras ALTER en mig 161) |
| users | `commission_percentage` | DB col: `default_commission_percentage`. CSV header: `commission_percentage` (user-facing). |
| operations | `seller_primary_id` | `seller_id` |
| operations | `customer_id` directo | NO existe. Relación via `operation_customers` M2M (`operation_id + customer_id + role='primary'`). |
| operations | — | `type` REQUIRED: default `'package'`. CSV header opcional. |
| operations | — | `margin_amount` + `margin_percentage` REQUIRED: computados server-side (`margin = sale - cost`, `% = margin*100/sale`). No van en CSV. |
| operations | — | `operation_date` REQUIRED: default = `departure_date` si vacío. |
| payments | `payment_method` | `method` |
| payments | `reference_number` | `reference` |
| payments | `financial_account_id` | NO existe — dropped del plan. Relación account↔payment via `ledger_movements`. |
| payments | — | `payer_type` REQUIRED: derivado de direction (INCOME→customer, EXPENSE→operator). No va en CSV. |
| cash_movements | `reference_number` | NO existe — dropped. Dedupe usa `notes` en su lugar. |
| cash_movements | — | `user_id` REQUIRED: pasado como `p_user_id` al RPC (user autenticado). No va en CSV. |
| cash_movements | `category` opcional | `category` REQUIRED (DB constraint). |

**Regla para subagents**: antes de escribir Zod schema o INSERT/RPC call, hacer `Grep` sobre `lib/supabase/types.ts` para verificar que la columna existe con el nombre exacto. Si hay mismatch, escalar (NEEDS_CONTEXT) en vez de asumir.

**Firma RPC para `bulk_import_cash_movements`**: `(p_org_id uuid, p_user_id uuid, p_rows jsonb)` — 3 params, no 2. Es la única RPC de las 8 que toma user_id separado.

---

## Task 1: Migration 161 — RPCs `bulk_import_*` + UNIQUE constraints

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260423000161_bulk_import_rpcs.sql`

**Context:** Una migration con 8 funciones RPC `SECURITY DEFINER` + UNIQUE constraints por natural key de cada tabla. Las RPCs aceptan `p_org_id uuid + p_rows jsonb[]` y devuelven `{inserted, conflicts}`. Todo atómico por invocación (TX automática de Postgres).

- [ ] **Step 1: Crear archivo migration**

```sql
-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260423000161_bulk_import_rpcs.sql

-- Bulk Import RPCs — funciones atómicas SECURITY DEFINER para insertar batches
-- de filas por entidad. Usadas por endpoints /api/import/<entity>.
--
-- Cada función:
--   - Recibe p_org_id uuid + p_rows jsonb (array de objetos row).
--   - INSERT ... ON CONFLICT (org_id, <natural_key>) DO NOTHING RETURNING id.
--   - Devuelve jsonb: { inserted: int, conflicts: jsonb[] }.
-- Spec: docs/superpowers/specs/2026-04-23-bulk-import-design.md

-- === UNIQUE CONSTRAINTS (natural keys por entidad) ===

-- agencies: (org_id, name)
ALTER TABLE agencies DROP CONSTRAINT IF EXISTS agencies_org_name_unique;
ALTER TABLE agencies ADD CONSTRAINT agencies_org_name_unique UNIQUE (org_id, name);

-- financial_accounts: (org_id, name)
ALTER TABLE financial_accounts DROP CONSTRAINT IF EXISTS financial_accounts_org_name_unique;
ALTER TABLE financial_accounts ADD CONSTRAINT financial_accounts_org_name_unique UNIQUE (org_id, name);

-- customers: usa indexes parciales porque dedupe tiene fallback chain (doc → email → name+phone)
DROP INDEX IF EXISTS customers_org_document_unique;
CREATE UNIQUE INDEX customers_org_document_unique
  ON customers (org_id, document_number)
  WHERE document_number IS NOT NULL AND document_number != '';
DROP INDEX IF EXISTS customers_org_email_unique;
CREATE UNIQUE INDEX customers_org_email_unique
  ON customers (org_id, email)
  WHERE email IS NOT NULL AND email != '' AND (document_number IS NULL OR document_number = '');

-- operators: (org_id, name) + partial unique por CUIT si presente
ALTER TABLE operators DROP CONSTRAINT IF EXISTS operators_org_name_unique;
ALTER TABLE operators ADD CONSTRAINT operators_org_name_unique UNIQUE (org_id, name);
DROP INDEX IF EXISTS operators_org_cuit_unique;
CREATE UNIQUE INDEX operators_org_cuit_unique
  ON operators (org_id, cuit)
  WHERE cuit IS NOT NULL AND cuit != '';

-- users: (org_id, email) ya existe? si no, agregar
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_org_email_unique;
ALTER TABLE users ADD CONSTRAINT users_org_email_unique UNIQUE (org_id, email);

-- operations: (org_id, file_code)
ALTER TABLE operations DROP CONSTRAINT IF EXISTS operations_org_file_code_unique;
ALTER TABLE operations ADD CONSTRAINT operations_org_file_code_unique UNIQUE (org_id, file_code);

-- payments: composite key
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_org_composite_unique;
ALTER TABLE payments ADD CONSTRAINT payments_org_composite_unique
  UNIQUE (org_id, operation_id, amount, date_due, direction);

-- cash_movements: composite key
ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS cash_movements_org_composite_unique;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_org_composite_unique
  UNIQUE (org_id, financial_account_id, movement_date, amount, type, COALESCE(reference_number, ''));

-- === RPCs ===

-- Helper: build result jsonb
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
      COALESCE(v_row->>'timezone', 'America/Argentina/Buenos_Aires')
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
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_agency_id := NULL;
    IF v_row ? 'agency_id' AND v_row->>'agency_id' IS NOT NULL THEN
      v_agency_id := (v_row->>'agency_id')::uuid;
    END IF;
    INSERT INTO financial_accounts (
      org_id, agency_id, name, type, currency, initial_balance, bank_name, account_number
    )
    VALUES (
      p_org_id,
      v_agency_id,
      v_row->>'name',
      v_row->>'type',
      v_row->>'currency',
      COALESCE((v_row->>'initial_balance')::numeric, 0),
      v_row->>'bank_name',
      v_row->>'account_number'
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
    -- Dedupe logic: if doc exists for org skip, else if email exists skip.
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
      COALESCE((v_row->>'credit_limit')::numeric, 0)
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
-- Nota: no crea auth.users — eso se hace desde la API route via supabase.auth.admin.inviteUserByEmail.
-- El RPC solo inserta en public.users cuando ya existe auth_id (pasado por el endpoint post-invite).
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
    INSERT INTO users (auth_id, org_id, name, email, role, is_active, commission_percentage)
    VALUES (
      (v_row->>'auth_id')::uuid,
      p_org_id,
      v_row->>'name',
      v_row->>'email',
      v_row->>'role',
      true,
      COALESCE((v_row->>'commission_percentage')::numeric, 0)
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
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    INSERT INTO operations (
      org_id, agency_id, file_code, customer_id, operator_id, seller_primary_id,
      destination, departure_date, return_date, adults, children,
      sale_amount_total, operator_cost, currency, status
    )
    VALUES (
      p_org_id,
      (v_row->>'agency_id')::uuid,
      v_row->>'file_code',
      (v_row->>'customer_id')::uuid,
      (v_row->>'operator_id')::uuid,
      (v_row->>'seller_id')::uuid,
      v_row->>'destination',
      (v_row->>'departure_date')::date,
      NULLIF(v_row->>'return_date', '')::date,
      COALESCE((v_row->>'adults')::int, 1),
      COALESCE((v_row->>'children')::int, 0),
      (v_row->>'sale_amount')::numeric,
      (v_row->>'operator_cost')::numeric,
      v_row->>'currency',
      v_row->>'status'
    )
    ON CONFLICT (org_id, file_code) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_conflicts := array_append(v_conflicts, jsonb_build_object('file_code', v_row->>'file_code'));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 7. bulk_import_payments
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
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    INSERT INTO payments (
      org_id, operation_id, direction, amount, currency,
      date_due, date_paid, status, payment_method, financial_account_id, reference_number
    )
    VALUES (
      p_org_id,
      (v_row->>'operation_id')::uuid,
      v_row->>'direction',
      (v_row->>'amount')::numeric,
      v_row->>'currency',
      (v_row->>'date_due')::date,
      NULLIF(v_row->>'date_paid', '')::date,
      COALESCE(v_row->>'status', 'PENDING'),
      NULLIF(v_row->>'method', ''),
      NULLIF(v_row->>'financial_account_id', '')::uuid,
      NULLIF(v_row->>'reference', '')
    )
    ON CONFLICT (org_id, operation_id, amount, date_due, direction) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_conflicts := array_append(v_conflicts, jsonb_build_object(
        'operation_id', v_row->>'operation_id',
        'amount', v_row->>'amount',
        'date_due', v_row->>'date_due'
      ));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 8. bulk_import_cash_movements
CREATE OR REPLACE FUNCTION bulk_import_cash_movements(p_org_id uuid, p_rows jsonb)
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
    INSERT INTO cash_movements (
      org_id, financial_account_id, movement_date, type, amount, currency,
      category, reference_number, notes
    )
    VALUES (
      p_org_id,
      (v_row->>'financial_account_id')::uuid,
      (v_row->>'date')::date,
      v_row->>'type',
      (v_row->>'amount')::numeric,
      v_row->>'currency',
      NULLIF(v_row->>'category', ''),
      NULLIF(v_row->>'reference', ''),
      NULLIF(v_row->>'notes', '')
    )
    ON CONFLICT (org_id, financial_account_id, movement_date, amount, type, COALESCE(reference_number, '')) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_conflicts := array_append(v_conflicts, jsonb_build_object(
        'financial_account_id', v_row->>'financial_account_id',
        'date', v_row->>'date',
        'amount', v_row->>'amount'
      ));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- Grants: permitir ejecución desde authenticated role (el endpoint llama con sesión de user)
GRANT EXECUTE ON FUNCTION bulk_import_agencies(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_financial_accounts(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_customers(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_operators(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_users(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_operations(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_payments(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_cash_movements(uuid, jsonb) TO authenticated, service_role;
```

- [ ] **Step 2: Pegar SQL en el chat y esperar confirmación del user** de que corrió sin errores en el SQL Editor de Supabase.

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add supabase/migrations/20260423000161_bulk_import_rpcs.sql
git commit -m "migration 161: bulk_import_* RPCs + UNIQUE constraints por natural key"
```

---

## Task 2: Regenerar types + verificar RPCs

**Files:**
- Modify: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/supabase/types.ts`

- [ ] **Step 1: Regenerar types**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx supabase gen types typescript --project-id pmqvplyyxiobkllapgjp > lib/supabase/types.ts
```

- [ ] **Step 2: Verificar que las 8 RPCs están en types**

```bash
grep -c "bulk_import_" lib/supabase/types.ts
```

Esperado: `8` o más (cada función aparece en `Functions`).

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add lib/supabase/types.ts
git commit -m "types: regenerar tras migration 161 (bulk_import_*)"
```

---

## Task 3: Core lib — csv-parser.ts + fk-resolver.ts + chunked-upload.ts

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/csv-parser.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/csv-parser.test.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/fk-resolver.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/fk-resolver.test.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/chunked-upload.ts`

**Context:** 3 módulos reutilizables. TDD estricto en csv-parser y fk-resolver. chunked-upload es un client helper simple, sin tests.

- [ ] **Step 1: Verificar/instalar papaparse**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npm list papaparse || npm install papaparse @types/papaparse
```

- [ ] **Step 2: Escribir test de csv-parser (TDD)**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/csv-parser.test.ts`:

```ts
import { parseCsv } from "./csv-parser"
import { z } from "zod"

const testSchema = z.object({
  name: z.string().trim().min(1),
  age: z.coerce.number().int().positive(),
  email: z.string().email().optional().or(z.literal("")),
})
const testHeaders = ["name", "age", "email"] as const

describe("parseCsv", () => {
  it("parses valid CSV with exact headers", async () => {
    const csv = "name,age,email\nAlice,30,a@b.com\nBob,25,"
    const result = await parseCsv(csv, testSchema, testHeaders as any)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ rowNumber: 2, data: { name: "Alice", age: 30, email: "a@b.com" }, errors: [], warnings: [] })
    expect(result.rows[1].data).toEqual({ name: "Bob", age: 25, email: "" })
    expect(result.headerError).toBeNull()
  })

  it("returns headerError when headers don't match", async () => {
    const csv = "nombre,edad\nAlice,30"
    const result = await parseCsv(csv, testSchema, testHeaders as any)
    expect(result.headerError).toMatch(/headers/i)
    expect(result.rows).toHaveLength(0)
  })

  it("marks rows with validation errors", async () => {
    const csv = "name,age,email\n,abc,bademail"
    const result = await parseCsv(csv, testSchema, testHeaders as any)
    expect(result.rows[0].errors.length).toBeGreaterThan(0)
  })

  it("handles BOM correctly", async () => {
    const csv = "\uFEFFname,age,email\nAlice,30,"
    const result = await parseCsv(csv, testSchema, testHeaders as any)
    expect(result.headerError).toBeNull()
    expect(result.rows[0].data.name).toBe("Alice")
  })

  it("ignores empty lines", async () => {
    const csv = "name,age,email\nAlice,30,\n\nBob,25,"
    const result = await parseCsv(csv, testSchema, testHeaders as any)
    expect(result.rows).toHaveLength(2)
  })
})
```

- [ ] **Step 3: Correr tests (esperado FAIL — módulo no existe)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/import/csv-parser.test.ts
```

Esperado: FAIL, `Cannot find module './csv-parser'`.

- [ ] **Step 4: Implementar csv-parser.ts**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/csv-parser.ts`:

```ts
import Papa from "papaparse"
import type { z } from "zod"

export interface ParsedRow<T> {
  rowNumber: number
  data: T
  errors: string[]
  warnings: string[]
}

export interface ParseResult<T> {
  rows: ParsedRow<T>[]
  headerError: string | null
}

/**
 * Parsea CSV strict con Zod. Requiere headers exactos (case-insensitive trim).
 * Devuelve rows con errores/warnings por fila, o headerError si los headers no matchean.
 */
export async function parseCsv<T>(
  csv: string,
  schema: z.ZodType<T>,
  expectedHeaders: readonly string[]
): Promise<ParseResult<T>> {
  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const actualHeaders = parsed.meta.fields?.map((h) => h.toLowerCase()) ?? []
  const expected = expectedHeaders.map((h) => h.toLowerCase())

  const missing = expected.filter((h) => !actualHeaders.includes(h))
  const extra = actualHeaders.filter((h) => !expected.includes(h))

  if (missing.length > 0 || extra.length > 0) {
    const parts: string[] = []
    if (missing.length > 0) parts.push(`faltan: ${missing.join(", ")}`)
    if (extra.length > 0) parts.push(`sobran: ${extra.join(", ")}`)
    return {
      rows: [],
      headerError: `Headers no coinciden con la plantilla. ${parts.join(". ")}. Descargá la plantilla de nuevo.`,
    }
  }

  const rows: ParsedRow<T>[] = (parsed.data as Record<string, string>[]).map((raw, i) => {
    const result = schema.safeParse(raw)
    if (result.success) {
      return { rowNumber: i + 2, data: result.data, errors: [], warnings: [] }
    }
    const errors = result.error.issues.map(
      (iss) => `${iss.path.join(".")}: ${iss.message}`
    )
    return { rowNumber: i + 2, data: raw as unknown as T, errors, warnings: [] }
  })

  return { rows, headerError: null }
}
```

- [ ] **Step 5: Correr tests (esperado PASS)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/import/csv-parser.test.ts
```

Esperado: 5/5 PASS.

- [ ] **Step 6: Escribir test de fk-resolver (TDD)**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/fk-resolver.test.ts`:

```ts
import { resolveFks, FkMapping } from "./fk-resolver"

// Mock supabase admin client
const mockFrom = jest.fn()
const mockAdmin = { from: mockFrom }

describe("resolveFks", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("resolves single FK by unique key within tenant", async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe("customers")
      return {
        select: () => ({
          eq: (_col1: string, _val1: string) => ({
            eq: (_col2: string, _val2: string) => ({
              maybeSingle: async () => ({ data: { id: "cust-1" }, error: null }),
            }),
          }),
        }),
      }
    })

    const mapping: FkMapping = {
      column: "customer_document",
      targetTable: "customers",
      targetColumn: "document_number",
      resolvedKey: "customer_id",
    }
    const rows = [{ customer_document: "12345678" }]
    const result = await resolveFks(mockAdmin as any, "org-1", rows, [mapping])

    expect(result[0].customer_id).toBe("cust-1")
    expect(result[0]._fkErrors).toEqual([])
  })

  it("marks row with _fkErrors when FK doesn't resolve", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    }))

    const mapping: FkMapping = {
      column: "customer_document",
      targetTable: "customers",
      targetColumn: "document_number",
      resolvedKey: "customer_id",
    }
    const rows = [{ customer_document: "99999999" }]
    const result = await resolveFks(mockAdmin as any, "org-1", rows, [mapping])
    expect(result[0]._fkErrors?.[0]).toMatch(/no se encontró/i)
  })
})
```

- [ ] **Step 7: Correr tests (esperado FAIL)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/import/fk-resolver.test.ts
```

- [ ] **Step 8: Implementar fk-resolver.ts**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/fk-resolver.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"

export interface FkMapping {
  column: string
  targetTable: string
  targetColumn: string
  resolvedKey: string
}

export interface RowWithFkResult extends Record<string, unknown> {
  _fkErrors?: string[]
}

/**
 * Resuelve FKs para un batch de rows, scopeado por org_id.
 * Para cada mapping: busca en targetTable WHERE org_id = p_org_id AND targetColumn = row[column].
 * Si encuentra, setea row[resolvedKey] = id. Si no, agrega error a row._fkErrors.
 */
export async function resolveFks(
  admin: SupabaseClient,
  orgId: string,
  rows: Record<string, unknown>[],
  mappings: FkMapping[]
): Promise<RowWithFkResult[]> {
  const result: RowWithFkResult[] = rows.map((r) => ({ ...r, _fkErrors: [] }))

  for (let i = 0; i < rows.length; i++) {
    for (const m of mappings) {
      const lookupValue = rows[i][m.column] as string | undefined
      if (!lookupValue || lookupValue === "") {
        result[i]._fkErrors!.push(`${m.column} vacío — requiere valor para resolver FK`)
        continue
      }
      const { data } = await (admin as any)
        .from(m.targetTable)
        .select("id")
        .eq("org_id", orgId)
        .eq(m.targetColumn, lookupValue)
        .maybeSingle()
      if (data?.id) {
        result[i][m.resolvedKey] = data.id
      } else {
        result[i]._fkErrors!.push(
          `no se encontró ${m.targetTable} con ${m.targetColumn}="${lookupValue}" en tu org`
        )
      }
    }
  }

  return result
}
```

- [ ] **Step 9: Correr tests (esperado PASS)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/import/fk-resolver.test.ts
```

Esperado: 2/2 PASS.

- [ ] **Step 10: Implementar chunked-upload.ts (client helper, sin test unitario)**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/chunked-upload.ts`:

```ts
export interface ChunkedUploadResult {
  totalInserted: number
  totalConflicts: number
  conflicts: unknown[]
  aborted: boolean
  errorMessage?: string
}

/**
 * Uploadea rows a un endpoint en chunks de 500 secuencialmente.
 * Llama onProgress con { current, total } después de cada chunk.
 * Si un chunk falla, aborta siguientes y devuelve aborted=true.
 */
export async function uploadInChunks(
  rows: unknown[],
  endpoint: string,
  onProgress: (p: { current: number; total: number }) => void,
  chunkSize = 500
): Promise<ChunkedUploadResult> {
  const chunks: unknown[][] = []
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize))
  }

  const sessionId = crypto.randomUUID()
  let totalInserted = 0
  const allConflicts: unknown[] = []

  for (let i = 0; i < chunks.length; i++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: chunks[i],
          chunk_index: i,
          total_chunks: chunks.length,
          session_id: sessionId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return {
          totalInserted,
          totalConflicts: allConflicts.length,
          conflicts: allConflicts,
          aborted: true,
          errorMessage: err.error || `HTTP ${res.status}`,
        }
      }
      const body = await res.json()
      totalInserted += body.inserted ?? 0
      if (body.conflicts) allConflicts.push(...body.conflicts)
      onProgress({ current: i + 1, total: chunks.length })
    } catch (e: any) {
      return {
        totalInserted,
        totalConflicts: allConflicts.length,
        conflicts: allConflicts,
        aborted: true,
        errorMessage: e.message || "Network error",
      }
    }
  }

  return {
    totalInserted,
    totalConflicts: allConflicts.length,
    conflicts: allConflicts,
    aborted: false,
  }
}
```

- [ ] **Step 11: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add lib/import/csv-parser.ts lib/import/csv-parser.test.ts lib/import/fk-resolver.ts lib/import/fk-resolver.test.ts lib/import/chunked-upload.ts package.json package-lock.json
git commit -m "feat(import): core libs csv-parser + fk-resolver + chunked-upload (TDD)"
```

---

## Task 4: Schemas — agencies, financial_accounts, customers, operators (TDD)

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/agencies.ts` + `.test.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/financial-accounts.ts` + `.test.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/customers.ts` + `.test.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/operators.ts` + `.test.ts`

**Context:** 4 schemas simples sin FK resolution. Cada uno exporta: `<entity>Schema`, `<Entity>Row` type, `<entity>CsvHeaders`, `<entity>NaturalKey(row)`.

- [ ] **Step 1: Escribir tests TDD para los 4 schemas**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/agencies.test.ts`:

```ts
import { agenciesSchema, agenciesNaturalKey, agenciesCsvHeaders } from "./agencies"

describe("agenciesSchema", () => {
  it("accepts valid row", () => {
    const r = agenciesSchema.safeParse({
      name: "Rosario",
      city: "Rosario",
      timezone: "America/Argentina/Buenos_Aires",
    })
    expect(r.success).toBe(true)
  })
  it("rejects empty name", () => {
    expect(agenciesSchema.safeParse({ name: "", city: "X", timezone: "UTC" }).success).toBe(false)
  })
  it("defaults timezone", () => {
    const r = agenciesSchema.parse({ name: "A", city: "C" })
    expect(r.timezone).toBe("America/Argentina/Buenos_Aires")
  })
  it("naturalKey = name", () => {
    expect(agenciesNaturalKey({ name: "Foo", city: "X", timezone: "Y" })).toBe("Foo")
  })
  it("headers constant", () => {
    expect(agenciesCsvHeaders).toEqual(["name", "city", "timezone"])
  })
})
```

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/financial-accounts.test.ts`:

```ts
import { financialAccountsSchema, financialAccountsCsvHeaders } from "./financial-accounts"

describe("financialAccountsSchema", () => {
  it("accepts CAJA ARS", () => {
    const r = financialAccountsSchema.safeParse({
      name: "Caja ARS Rosario", type: "CAJA", currency: "ARS", initial_balance: "100",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.initial_balance).toBe(100)
  })
  it("rejects invalid type", () => {
    expect(financialAccountsSchema.safeParse({
      name: "X", type: "FOO", currency: "ARS", initial_balance: "0",
    }).success).toBe(false)
  })
  it("rejects invalid currency", () => {
    expect(financialAccountsSchema.safeParse({
      name: "X", type: "CAJA", currency: "EUR", initial_balance: "0",
    }).success).toBe(false)
  })
  it("headers constant", () => {
    expect(financialAccountsCsvHeaders).toContain("name")
    expect(financialAccountsCsvHeaders).toContain("type")
    expect(financialAccountsCsvHeaders).toContain("currency")
    expect(financialAccountsCsvHeaders).toContain("initial_balance")
  })
})
```

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/customers.test.ts`:

```ts
import { customersSchema, customersNaturalKey } from "./customers"

describe("customersSchema", () => {
  it("accepts valid row with doc", () => {
    const r = customersSchema.safeParse({
      first_name: "Juan", last_name: "Pérez", phone: "11 1234-5678",
      email: "j@p.com", document_type: "DNI", document_number: "12345678",
      date_of_birth: "1990-01-15", nationality: "Argentina",
    })
    expect(r.success).toBe(true)
  })
  it("rejects short phone", () => {
    expect(customersSchema.safeParse({
      first_name: "A", last_name: "B", phone: "123",
    }).success).toBe(false)
  })
  it("naturalKey prefers document_number", () => {
    expect(customersNaturalKey({
      first_name: "A", last_name: "B", phone: "11111111",
      document_number: "123", email: "x@y.com",
    } as any)).toBe("doc:123")
  })
  it("naturalKey fallback to email", () => {
    expect(customersNaturalKey({
      first_name: "A", last_name: "B", phone: "11111111",
      document_number: "", email: "x@y.com",
    } as any)).toBe("email:x@y.com")
  })
})
```

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/operators.test.ts`:

```ts
import { operatorsSchema, operatorsNaturalKey } from "./operators"

describe("operatorsSchema", () => {
  it("accepts minimal row", () => {
    expect(operatorsSchema.safeParse({ name: "Despegar" }).success).toBe(true)
  })
  it("rejects empty name", () => {
    expect(operatorsSchema.safeParse({ name: "" }).success).toBe(false)
  })
  it("naturalKey prefers CUIT", () => {
    expect(operatorsNaturalKey({ name: "X", cuit: "30-12345678-9" } as any)).toBe("cuit:30-12345678-9")
  })
  it("naturalKey fallback to name", () => {
    expect(operatorsNaturalKey({ name: "Despegar" } as any)).toBe("name:Despegar")
  })
})
```

- [ ] **Step 2: Run tests (esperado FAIL)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/import/schemas/
```

- [ ] **Step 3: Implementar agencies.ts**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/agencies.ts`:

```ts
import { z } from "zod"

export const agenciesSchema = z.object({
  name: z.string().trim().min(1, "requerido"),
  city: z.string().trim().min(1, "requerido"),
  timezone: z.string().trim().default("America/Argentina/Buenos_Aires"),
})

export type AgenciesRow = z.infer<typeof agenciesSchema>

export const agenciesCsvHeaders = ["name", "city", "timezone"] as const

export function agenciesNaturalKey(row: AgenciesRow): string {
  return row.name
}
```

- [ ] **Step 4: Implementar financial-accounts.ts**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/financial-accounts.ts`:

```ts
import { z } from "zod"

const typeEnum = z.enum(["CAJA", "BANCO", "TARJETA_CREDITO", "BILLETERA_VIRTUAL", "OTRO"])
const currencyEnum = z.enum(["ARS", "USD"])

export const financialAccountsSchema = z.object({
  name: z.string().trim().min(1, "requerido"),
  type: typeEnum,
  currency: currencyEnum,
  initial_balance: z.coerce.number().default(0),
  agency_name: z.string().trim().optional().or(z.literal("")),
  bank_name: z.string().trim().optional().or(z.literal("")),
  account_number: z.string().trim().optional().or(z.literal("")),
})

export type FinancialAccountsRow = z.infer<typeof financialAccountsSchema>

export const financialAccountsCsvHeaders = [
  "name", "type", "currency", "initial_balance",
  "agency_name", "bank_name", "account_number",
] as const

export function financialAccountsNaturalKey(row: FinancialAccountsRow): string {
  return row.name
}
```

- [ ] **Step 5: Implementar customers.ts**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/customers.ts`:

```ts
import { z } from "zod"

const docTypeEnum = z.enum(["DNI", "PASAPORTE", "LC", "LE", "CI"])

export const customersSchema = z.object({
  first_name: z.string().trim().min(1, "requerido"),
  last_name: z.string().trim().min(1, "requerido"),
  phone: z.string().trim().min(8, "mínimo 8 caracteres"),
  email: z.string().email("formato inválido").optional().or(z.literal("")),
  document_type: docTypeEnum.optional().or(z.literal("")),
  document_number: z.string().trim().optional().or(z.literal("")),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD").optional().or(z.literal("")),
  nationality: z.string().trim().optional().or(z.literal("")),
})

export type CustomersRow = z.infer<typeof customersSchema>

export const customersCsvHeaders = [
  "first_name", "last_name", "phone", "email",
  "document_type", "document_number", "date_of_birth", "nationality",
] as const

export function customersNaturalKey(row: CustomersRow): string {
  if (row.document_number && row.document_number !== "") return `doc:${row.document_number}`
  if (row.email && row.email !== "") return `email:${row.email}`
  return `nph:${row.first_name}|${row.last_name}|${row.phone}`
}
```

- [ ] **Step 6: Implementar operators.ts**

`/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/operators.ts`:

```ts
import { z } from "zod"

export const operatorsSchema = z.object({
  name: z.string().trim().min(1, "requerido"),
  cuit: z.string().trim().optional().or(z.literal("")),
  contact_name: z.string().trim().optional().or(z.literal("")),
  contact_email: z.string().email("formato inválido").optional().or(z.literal("")),
  contact_phone: z.string().trim().optional().or(z.literal("")),
  credit_limit: z.coerce.number().default(0),
})

export type OperatorsRow = z.infer<typeof operatorsSchema>

export const operatorsCsvHeaders = [
  "name", "cuit", "contact_name", "contact_email", "contact_phone", "credit_limit",
] as const

export function operatorsNaturalKey(row: OperatorsRow): string {
  if (row.cuit && row.cuit !== "") return `cuit:${row.cuit}`
  return `name:${row.name}`
}
```

- [ ] **Step 7: Run tests (esperado PASS)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/import/schemas/
```

Esperado: todos PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add lib/import/schemas/
git commit -m "feat(import): schemas agencies/financial_accounts/customers/operators con TDD"
```

---

## Task 5: Schema users + operations + payments + cash-movements (TDD)

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/users.ts` + `.test.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/operations.ts` + `.test.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/payments.ts` + `.test.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/import/schemas/cash-movements.ts` + `.test.ts`

- [ ] **Step 1: Escribir tests (4 files)**

`users.test.ts`:

```ts
import { usersSchema, usersNaturalKey } from "./users"

describe("usersSchema", () => {
  it("accepts valid", () => {
    expect(usersSchema.safeParse({
      email: "a@b.com", name: "A", role: "SELLER",
      commission_percentage: "5",
    }).success).toBe(true)
  })
  it("rejects bad email", () => {
    expect(usersSchema.safeParse({ email: "x", name: "A", role: "SELLER" }).success).toBe(false)
  })
  it("rejects SUPER_ADMIN role", () => {
    expect(usersSchema.safeParse({ email: "a@b.com", name: "A", role: "SUPER_ADMIN" }).success).toBe(false)
  })
  it("naturalKey = email", () => {
    expect(usersNaturalKey({ email: "x@y.com", name: "A", role: "SELLER" } as any)).toBe("x@y.com")
  })
})
```

`operations.test.ts`:

```ts
import { operationsSchema } from "./operations"

describe("operationsSchema", () => {
  it("accepts valid", () => {
    expect(operationsSchema.safeParse({
      file_code: "OP-001", customer_document: "12345678", operator_name: "Despegar",
      seller_email: "v@e.com", agency_name: "Rosario", destination: "Cancún",
      departure_date: "2026-05-15", sale_amount: "500000", operator_cost: "400000",
      currency: "ARS", status: "CONFIRMED",
    }).success).toBe(true)
  })
  it("rejects missing file_code", () => {
    expect(operationsSchema.safeParse({
      file_code: "", customer_document: "1", operator_name: "O", seller_email: "a@b.c",
      agency_name: "A", destination: "D", departure_date: "2026-01-01",
      sale_amount: "1", operator_cost: "1", currency: "ARS", status: "CONFIRMED",
    }).success).toBe(false)
  })
  it("rejects invalid status", () => {
    expect(operationsSchema.safeParse({
      file_code: "X", customer_document: "1", operator_name: "O", seller_email: "a@b.c",
      agency_name: "A", destination: "D", departure_date: "2026-01-01",
      sale_amount: "1", operator_cost: "1", currency: "ARS", status: "FOO",
    }).success).toBe(false)
  })
})
```

`payments.test.ts`:

```ts
import { paymentsSchema } from "./payments"

describe("paymentsSchema", () => {
  it("accepts INCOME payment", () => {
    expect(paymentsSchema.safeParse({
      operation_file_code: "OP-001", direction: "INCOME", amount: "100000",
      currency: "ARS", date_due: "2026-01-15",
    }).success).toBe(true)
  })
  it("rejects negative amount", () => {
    expect(paymentsSchema.safeParse({
      operation_file_code: "OP-001", direction: "INCOME", amount: "-1",
      currency: "ARS", date_due: "2026-01-15",
    }).success).toBe(false)
  })
  it("rejects invalid direction", () => {
    expect(paymentsSchema.safeParse({
      operation_file_code: "OP-001", direction: "FOO", amount: "1",
      currency: "ARS", date_due: "2026-01-15",
    }).success).toBe(false)
  })
})
```

`cash-movements.test.ts`:

```ts
import { cashMovementsSchema } from "./cash-movements"

describe("cashMovementsSchema", () => {
  it("accepts valid INCOME", () => {
    expect(cashMovementsSchema.safeParse({
      account_name: "Caja ARS", date: "2026-01-15", type: "INCOME",
      amount: "1000", currency: "ARS",
    }).success).toBe(true)
  })
  it("rejects invalid type", () => {
    expect(cashMovementsSchema.safeParse({
      account_name: "X", date: "2026-01-15", type: "FOO",
      amount: "1", currency: "ARS",
    }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests (FAIL)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/import/schemas/
```

- [ ] **Step 3: Implementar users.ts**

```ts
import { z } from "zod"

const userRoleEnum = z.enum(["SELLER", "ADMIN", "CONTABLE", "VIEWER"]) // no SUPER_ADMIN

export const usersSchema = z.object({
  email: z.string().email("formato inválido"),
  name: z.string().trim().min(1, "requerido"),
  role: userRoleEnum,
  agency_name: z.string().trim().optional().or(z.literal("")),
  commission_percentage: z.coerce.number().min(0).max(100).default(0),
})

export type UsersRow = z.infer<typeof usersSchema>

export const usersCsvHeaders = [
  "email", "name", "role", "agency_name", "commission_percentage",
] as const

export function usersNaturalKey(row: UsersRow): string {
  return row.email
}
```

- [ ] **Step 4: Implementar operations.ts**

```ts
import { z } from "zod"

const currencyEnum = z.enum(["ARS", "USD"])
const statusEnum = z.enum(["RESERVED", "CONFIRMED", "CLOSED", "CANCELLED"])

export const operationsSchema = z.object({
  file_code: z.string().trim().min(1, "requerido"),
  customer_document: z.string().trim().min(1, "requerido"),
  operator_name: z.string().trim().min(1, "requerido"),
  seller_email: z.string().email("formato inválido"),
  agency_name: z.string().trim().min(1, "requerido"),
  destination: z.string().trim().min(1, "requerido"),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD"),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  adults: z.coerce.number().int().positive().default(1),
  children: z.coerce.number().int().min(0).default(0),
  sale_amount: z.coerce.number().positive("debe ser > 0"),
  operator_cost: z.coerce.number().positive("debe ser > 0"),
  currency: currencyEnum,
  status: statusEnum,
})

export type OperationsRow = z.infer<typeof operationsSchema>

export const operationsCsvHeaders = [
  "file_code", "customer_document", "operator_name", "seller_email", "agency_name",
  "destination", "departure_date", "return_date", "adults", "children",
  "sale_amount", "operator_cost", "currency", "status",
] as const

export function operationsNaturalKey(row: OperationsRow): string {
  return row.file_code
}
```

- [ ] **Step 5: Implementar payments.ts**

```ts
import { z } from "zod"

const currencyEnum = z.enum(["ARS", "USD"])
const directionEnum = z.enum(["INCOME", "EXPENSE"])
const statusEnum = z.enum(["PENDING", "PAID", "CANCELLED"])
const methodEnum = z.enum(["CASH", "TRANSFER", "CARD", "OTHER"])

export const paymentsSchema = z.object({
  operation_file_code: z.string().trim().min(1, "requerido"),
  direction: directionEnum,
  amount: z.coerce.number().positive("debe ser > 0"),
  currency: currencyEnum,
  date_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD"),
  date_paid: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  status: statusEnum.optional().default("PENDING"),
  method: methodEnum.optional().or(z.literal("")),
  financial_account_name: z.string().trim().optional().or(z.literal("")),
  reference: z.string().trim().optional().or(z.literal("")),
})

export type PaymentsRow = z.infer<typeof paymentsSchema>

export const paymentsCsvHeaders = [
  "operation_file_code", "direction", "amount", "currency",
  "date_due", "date_paid", "status", "method",
  "financial_account_name", "reference",
] as const

export function paymentsNaturalKey(row: PaymentsRow): string {
  return `${row.operation_file_code}|${row.amount}|${row.date_due}|${row.direction}`
}
```

- [ ] **Step 6: Implementar cash-movements.ts**

```ts
import { z } from "zod"

const currencyEnum = z.enum(["ARS", "USD"])
const typeEnum = z.enum(["INCOME", "EXPENSE", "TRANSFER_IN", "TRANSFER_OUT"])

export const cashMovementsSchema = z.object({
  account_name: z.string().trim().min(1, "requerido"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD"),
  type: typeEnum,
  amount: z.coerce.number().positive("debe ser > 0"),
  currency: currencyEnum,
  category: z.string().trim().optional().or(z.literal("")),
  reference: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
})

export type CashMovementsRow = z.infer<typeof cashMovementsSchema>

export const cashMovementsCsvHeaders = [
  "account_name", "date", "type", "amount", "currency",
  "category", "reference", "notes",
] as const

export function cashMovementsNaturalKey(row: CashMovementsRow): string {
  return `${row.account_name}|${row.date}|${row.amount}|${row.type}|${row.reference ?? ""}`
}
```

- [ ] **Step 7: Run tests (PASS)**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx jest lib/import/schemas/
```

- [ ] **Step 8: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add lib/import/schemas/
git commit -m "feat(import): schemas users/operations/payments/cash_movements con TDD"
```

---

## Task 6: Plantillas CSV + cleanup legacy

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/public/templates/agencies.csv`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/public/templates/financial-accounts.csv`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/public/templates/customers.csv`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/public/templates/operators.csv`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/public/templates/users.csv`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/public/templates/operations.csv`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/public/templates/payments.csv`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/public/templates/cash-movements.csv`
- Delete: endpoints legacy + UI legacy

- [ ] **Step 1: Crear carpeta + 8 plantillas CSV con 2 filas de ejemplo**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
mkdir -p public/templates
```

Crear `public/templates/agencies.csv`:

```csv
name,city,timezone
Rosario,Rosario,America/Argentina/Buenos_Aires
Madero,Buenos Aires,America/Argentina/Buenos_Aires
```

Crear `public/templates/financial-accounts.csv`:

```csv
name,type,currency,initial_balance,agency_name,bank_name,account_number
Caja ARS Rosario,CAJA,ARS,0,Rosario,,
Cuenta BBVA ARS,BANCO,ARS,500000,Rosario,BBVA,123-456-789
```

Crear `public/templates/customers.csv`:

```csv
first_name,last_name,phone,email,document_type,document_number,date_of_birth,nationality
Juan,Pérez,+54 11 1234-5678,juan@example.com,DNI,12345678,1990-01-15,Argentina
María,González,+54 11 8765-4321,maria@example.com,DNI,87654321,1985-05-20,Argentina
```

Crear `public/templates/operators.csv`:

```csv
name,cuit,contact_name,contact_email,contact_phone,credit_limit
Despegar,30-12345678-9,Carlos López,ventas@despegar.com,+54 11 5555-1234,1000000
Almundo,30-87654321-2,Ana García,ventas@almundo.com,+54 11 5555-5678,500000
```

Crear `public/templates/users.csv`:

```csv
email,name,role,agency_name,commission_percentage
vendedor1@miagencia.com,Pedro Ramírez,SELLER,Rosario,5
admin@miagencia.com,Laura Fernández,ADMIN,Rosario,0
```

Crear `public/templates/operations.csv`:

```csv
file_code,customer_document,operator_name,seller_email,agency_name,destination,departure_date,return_date,adults,children,sale_amount,operator_cost,currency,status
OP-20260101-001,12345678,Despegar,vendedor1@miagencia.com,Rosario,Cancún,2026-05-15,2026-05-22,2,0,500000,400000,ARS,CONFIRMED
OP-20260101-002,87654321,Almundo,vendedor1@miagencia.com,Rosario,Río de Janeiro,2026-06-10,2026-06-17,2,1,800000,650000,ARS,RESERVED
```

Crear `public/templates/payments.csv`:

```csv
operation_file_code,direction,amount,currency,date_due,date_paid,status,method,financial_account_name,reference
OP-20260101-001,INCOME,250000,ARS,2026-02-01,2026-01-28,PAID,TRANSFER,Cuenta BBVA ARS,REF-001
OP-20260101-001,INCOME,250000,ARS,2026-03-01,,PENDING,,,
```

Crear `public/templates/cash-movements.csv`:

```csv
account_name,date,type,amount,currency,category,reference,notes
Caja ARS Rosario,2026-01-15,INCOME,100000,ARS,VENTA,REF-A1,Cobro cliente Pérez
Caja ARS Rosario,2026-01-20,EXPENSE,50000,ARS,GASTO_OPERATIVO,REF-B2,Pago alquiler
```

- [ ] **Step 2: Borrar código legacy**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
rm app/api/import/customers/route.ts
rm app/api/import/operators/route.ts
rm app/api/import/operations/route.ts
rm app/api/import/payments/route.ts
rm app/api/import/cash_movements/route.ts
# La page de settings/import y el component se reescriben en Task 10 (no borrar aún, usamos la ruta)
```

- [ ] **Step 3: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add public/templates/ app/api/import/
git commit -m "feat(import): 8 plantillas CSV + borrar endpoints legacy rotos (sin org_id)"
```

---

## Task 7: Endpoints simples — agencies, financial_accounts, customers, operators, cash_movements

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/import/agencies/route.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/import/financial-accounts/route.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/import/customers/route.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/import/operators/route.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/import/cash-movements/route.ts`

**Context:** 5 endpoints con pattern idéntico. Validan auth + role + Zod schema + llaman RPC. `financial-accounts` y `cash-movements` resuelven FKs (agency_name, account_name respectivamente).

- [ ] **Step 1: Crear `app/api/import/agencies/route.ts`**

```ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { agenciesSchema } from "@/lib/import/schemas/agencies"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(agenciesSchema).min(1),
  chunk_index: z.number().int().min(0).optional(),
  total_chunks: z.number().int().min(1).optional(),
  session_id: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!["SUPER_ADMIN", "ADMIN", "ORG_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "No tenés permiso para importar" }, { status: 403 })
  }
  const orgId = (user as any).org_id
  if (!orgId) return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", details: parsed.error.issues }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_agencies", {
    p_org_id: orgId,
    p_rows: parsed.data.rows,
  })
  if (error) {
    console.error("import agencies error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
```

- [ ] **Step 2: Crear `app/api/import/financial-accounts/route.ts`** (con FK resolution de agency_name)

```ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { financialAccountsSchema } from "@/lib/import/schemas/financial-accounts"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(financialAccountsSchema).min(1),
  chunk_index: z.number().int().min(0).optional(),
  total_chunks: z.number().int().min(1).optional(),
  session_id: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!["SUPER_ADMIN", "ADMIN", "ORG_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 })
  }
  const orgId = (user as any).org_id
  if (!orgId) return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", details: parsed.error.issues }, { status: 400 })
  }

  // FK resolution: agency_name → agency_id (within org)
  const admin = createAdminClient() as any
  const { data: agencies } = await admin.from("agencies").select("id, name").eq("org_id", orgId)
  const byName = new Map<string, string>((agencies ?? []).map((a: any) => [a.name, a.id]))

  const errors: { row: number; error: string }[] = []
  const rowsWithFk = parsed.data.rows.map((r, i) => {
    let agency_id: string | null = null
    if (r.agency_name && r.agency_name !== "") {
      agency_id = byName.get(r.agency_name) ?? null
      if (!agency_id) errors.push({ row: i + 1, error: `agency "${r.agency_name}" no encontrada` })
    }
    return { ...r, agency_id }
  })

  if (errors.length > 0) {
    return NextResponse.json({ error: "FK no resueltas", fk_errors: errors }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_financial_accounts", {
    p_org_id: orgId,
    p_rows: rowsWithFk,
  })
  if (error) {
    console.error("import financial_accounts error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
```

- [ ] **Step 3: Crear `app/api/import/customers/route.ts`**

```ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { customersSchema } from "@/lib/import/schemas/customers"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(customersSchema).min(1),
  chunk_index: z.number().int().min(0).optional(),
  total_chunks: z.number().int().min(1).optional(),
  session_id: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!["SUPER_ADMIN", "ADMIN", "ORG_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 })
  }
  const orgId = (user as any).org_id
  if (!orgId) return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", details: parsed.error.issues }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_customers", {
    p_org_id: orgId,
    p_rows: parsed.data.rows,
  })
  if (error) {
    console.error("import customers error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
```

- [ ] **Step 4: Crear `app/api/import/operators/route.ts`**

```ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { operatorsSchema } from "@/lib/import/schemas/operators"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(operatorsSchema).min(1),
  chunk_index: z.number().int().min(0).optional(),
  total_chunks: z.number().int().min(1).optional(),
  session_id: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!["SUPER_ADMIN", "ADMIN", "ORG_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 })
  }
  const orgId = (user as any).org_id
  if (!orgId) return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", details: parsed.error.issues }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_operators", {
    p_org_id: orgId,
    p_rows: parsed.data.rows,
  })
  if (error) {
    console.error("import operators error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
```

- [ ] **Step 5: Crear `app/api/import/cash-movements/route.ts`** (FK: account_name → financial_account_id)

```ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { cashMovementsSchema } from "@/lib/import/schemas/cash-movements"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(cashMovementsSchema).min(1),
  chunk_index: z.number().int().min(0).optional(),
  total_chunks: z.number().int().min(1).optional(),
  session_id: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!["SUPER_ADMIN", "ADMIN", "ORG_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 })
  }
  const orgId = (user as any).org_id
  if (!orgId) return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", details: parsed.error.issues }, { status: 400 })
  }

  const admin = createAdminClient() as any
  const { data: accounts } = await admin.from("financial_accounts").select("id, name").eq("org_id", orgId)
  const byName = new Map<string, string>((accounts ?? []).map((a: any) => [a.name, a.id]))

  const errors: { row: number; error: string }[] = []
  const rowsWithFk = parsed.data.rows.map((r, i) => {
    const financial_account_id = byName.get(r.account_name)
    if (!financial_account_id) {
      errors.push({ row: i + 1, error: `cuenta "${r.account_name}" no encontrada` })
    }
    return { ...r, financial_account_id }
  })

  if (errors.length > 0) {
    return NextResponse.json({ error: "FK no resueltas", fk_errors: errors }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_cash_movements", {
    p_org_id: orgId,
    p_rows: rowsWithFk,
  })
  if (error) {
    console.error("import cash_movements error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
```

- [ ] **Step 6: typecheck**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx tsc --noEmit 2>&1 | grep "app/api/import/" || echo "OK"
```

Esperado: `OK`.

- [ ] **Step 7: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add app/api/import/
git commit -m "feat(import-api): endpoints agencies/financial-accounts/customers/operators/cash-movements con FK resolution + RPCs"
```

---

## Task 8: Endpoint users (invites) — crea auth.users antes de insert

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/import/users/route.ts`

**Context:** Este es especial — para cada fila crea un auth.users vía `supabase.auth.admin.inviteUserByEmail` (manda email con link reset password) ANTES de llamar al RPC que inserta en `public.users` con el `auth_id` generado.

- [ ] **Step 1: Crear endpoint**

```ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { usersSchema } from "@/lib/import/schemas/users"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(usersSchema).min(1),
  chunk_index: z.number().int().min(0).optional(),
  total_chunks: z.number().int().min(1).optional(),
  session_id: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!["SUPER_ADMIN", "ADMIN", "ORG_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 })
  }
  const orgId = (user as any).org_id
  if (!orgId) return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", details: parsed.error.issues }, { status: 400 })
  }

  const admin = createAdminClient() as any
  // FK: agency_name → agency_id
  const { data: agencies } = await admin.from("agencies").select("id, name").eq("org_id", orgId)
  const agencyByName = new Map<string, string>((agencies ?? []).map((a: any) => [a.name, a.id]))

  const inviteResults: { email: string; auth_id?: string; error?: string }[] = []
  for (const row of parsed.data.rows) {
    try {
      const { data: inviteRes, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(row.email, {
        data: { full_name: row.name, invited_org_id: orgId },
      })
      if (inviteErr) {
        inviteResults.push({ email: row.email, error: inviteErr.message })
      } else {
        inviteResults.push({ email: row.email, auth_id: inviteRes.user?.id })
      }
    } catch (e: any) {
      inviteResults.push({ email: row.email, error: e.message })
    }
  }

  const rowsWithAuth = parsed.data.rows.flatMap((r, i) => {
    const inv = inviteResults[i]
    if (!inv.auth_id) return [] // skip rows whose invite failed
    const agency_id =
      r.agency_name && r.agency_name !== ""
        ? agencyByName.get(r.agency_name) ?? null
        : null
    return [{
      ...r,
      auth_id: inv.auth_id,
      agency_id,
    }]
  })

  if (rowsWithAuth.length === 0) {
    return NextResponse.json({
      error: "Ninguna invitación fue enviada",
      invites: inviteResults,
    }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_users", {
    p_org_id: orgId,
    p_rows: rowsWithAuth,
  })
  if (error) {
    console.error("import users error", error)
    return NextResponse.json({ error: error.message, invites: inviteResults }, { status: 500 })
  }

  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    invites_sent: inviteResults.filter((i) => i.auth_id).length,
    invites_failed: inviteResults.filter((i) => i.error),
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
```

- [ ] **Step 2: typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx tsc --noEmit 2>&1 | grep "api/import/users" || echo "OK"
git add app/api/import/users/
git commit -m "feat(import-api): users con Supabase Auth invite + FK agency_name"
```

---

## Task 9: Endpoints con FK compleja — operations + payments

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/import/operations/route.ts`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/import/payments/route.ts`

**Context:** operations resuelve 4 FKs (customer_document, operator_name, seller_email, agency_name). payments resuelve 2 (operation_file_code, financial_account_name).

- [ ] **Step 1: Crear `app/api/import/operations/route.ts`**

```ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { operationsSchema } from "@/lib/import/schemas/operations"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(operationsSchema).min(1),
  chunk_index: z.number().int().min(0).optional(),
  total_chunks: z.number().int().min(1).optional(),
  session_id: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!["SUPER_ADMIN", "ADMIN", "ORG_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 })
  }
  const orgId = (user as any).org_id
  if (!orgId) return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", details: parsed.error.issues }, { status: 400 })
  }

  const admin = createAdminClient() as any
  const [custsRes, opsRes, sellersRes, agenciesRes] = await Promise.all([
    admin.from("customers").select("id, document_number").eq("org_id", orgId),
    admin.from("operators").select("id, name").eq("org_id", orgId),
    admin.from("users").select("id, email").eq("org_id", orgId),
    admin.from("agencies").select("id, name").eq("org_id", orgId),
  ])
  const custByDoc = new Map<string, string>((custsRes.data ?? []).map((c: any) => [c.document_number, c.id]))
  const opByName = new Map<string, string>((opsRes.data ?? []).map((o: any) => [o.name, o.id]))
  const sellerByEmail = new Map<string, string>((sellersRes.data ?? []).map((s: any) => [s.email, s.id]))
  const agencyByName = new Map<string, string>((agenciesRes.data ?? []).map((a: any) => [a.name, a.id]))

  const errors: { row: number; error: string }[] = []
  const rowsWithFk = parsed.data.rows.map((r, i) => {
    const customer_id = custByDoc.get(r.customer_document)
    const operator_id = opByName.get(r.operator_name)
    const seller_id = sellerByEmail.get(r.seller_email)
    const agency_id = agencyByName.get(r.agency_name)
    if (!customer_id) errors.push({ row: i + 1, error: `customer document "${r.customer_document}" no encontrado` })
    if (!operator_id) errors.push({ row: i + 1, error: `operator "${r.operator_name}" no encontrado` })
    if (!seller_id) errors.push({ row: i + 1, error: `seller email "${r.seller_email}" no encontrado` })
    if (!agency_id) errors.push({ row: i + 1, error: `agency "${r.agency_name}" no encontrada` })
    return { ...r, customer_id, operator_id, seller_id, agency_id }
  })

  if (errors.length > 0) {
    return NextResponse.json({ error: "FK no resueltas", fk_errors: errors }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_operations", {
    p_org_id: orgId,
    p_rows: rowsWithFk,
  })
  if (error) {
    console.error("import operations error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
```

- [ ] **Step 2: Crear `app/api/import/payments/route.ts`**

```ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { paymentsSchema } from "@/lib/import/schemas/payments"
import { z } from "zod"

const bodySchema = z.object({
  rows: z.array(paymentsSchema).min(1),
  chunk_index: z.number().int().min(0).optional(),
  total_chunks: z.number().int().min(1).optional(),
  session_id: z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!["SUPER_ADMIN", "ADMIN", "ORG_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "No tenés permiso" }, { status: 403 })
  }
  const orgId = (user as any).org_id
  if (!orgId) return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", details: parsed.error.issues }, { status: 400 })
  }

  const admin = createAdminClient() as any
  const [opsRes, accountsRes] = await Promise.all([
    admin.from("operations").select("id, file_code").eq("org_id", orgId),
    admin.from("financial_accounts").select("id, name").eq("org_id", orgId),
  ])
  const opByCode = new Map<string, string>((opsRes.data ?? []).map((o: any) => [o.file_code, o.id]))
  const accByName = new Map<string, string>((accountsRes.data ?? []).map((a: any) => [a.name, a.id]))

  const errors: { row: number; error: string }[] = []
  const rowsWithFk = parsed.data.rows.map((r, i) => {
    const operation_id = opByCode.get(r.operation_file_code)
    if (!operation_id) errors.push({ row: i + 1, error: `operation "${r.operation_file_code}" no encontrada` })
    let financial_account_id: string | null = null
    if (r.financial_account_name && r.financial_account_name !== "") {
      financial_account_id = accByName.get(r.financial_account_name) ?? null
      if (!financial_account_id) {
        errors.push({ row: i + 1, error: `account "${r.financial_account_name}" no encontrada` })
      }
    }
    return { ...r, operation_id, financial_account_id }
  })

  if (errors.length > 0) {
    return NextResponse.json({ error: "FK no resueltas", fk_errors: errors }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase.rpc as any)("bulk_import_payments", {
    p_org_id: orgId,
    p_rows: rowsWithFk,
  })
  if (error) {
    console.error("import payments error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    inserted: data.inserted,
    conflicts: data.conflicts,
    chunk_index: parsed.data.chunk_index,
    total_chunks: parsed.data.total_chunks,
  })
}
```

- [ ] **Step 3: typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx tsc --noEmit 2>&1 | grep "api/import/(operations|payments)" || echo "OK"
git add app/api/import/operations/ app/api/import/payments/
git commit -m "feat(import-api): operations + payments con FK resolution múltiple"
```

---

## Task 10: UI shared — preview-table, error-panel, entity-panel, status-chips

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/import/preview-table.tsx`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/import/error-panel.tsx`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/import/entity-panel.tsx`
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/import/status-chips.tsx`

- [ ] **Step 1: Crear `preview-table.tsx`**

```tsx
"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { ParsedRow } from "@/lib/import/csv-parser"

interface Props<T> {
  rows: ParsedRow<T>[]
  headers: readonly string[]
  maxRows?: number
}

export function PreviewTable<T extends Record<string, unknown>>({ rows, headers, maxRows = 50 }: Props<T>) {
  const visible = rows.slice(0, maxRows)
  return (
    <div className="rounded-md border overflow-x-auto max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Fila</TableHead>
            <TableHead className="w-24">Estado</TableHead>
            {headers.slice(0, 5).map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => (
            <TableRow key={r.rowNumber} className={r.errors.length ? "bg-destructive/10" : ""}>
              <TableCell className="font-mono text-xs">{r.rowNumber}</TableCell>
              <TableCell>
                {r.errors.length > 0 ? (
                  <Badge variant="destructive">Error</Badge>
                ) : (
                  <Badge variant="outline" className="text-green-600">OK</Badge>
                )}
              </TableCell>
              {headers.slice(0, 5).map((h) => (
                <TableCell key={h} className="text-sm">
                  {String((r.data as any)[h] ?? "-")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > maxRows && (
        <p className="text-xs text-slate-500 p-2">Mostrando {maxRows} de {rows.length} filas</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Crear `error-panel.tsx`**

```tsx
"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { XCircle, Download } from "lucide-react"
import type { ParsedRow } from "@/lib/import/csv-parser"

interface Props<T> {
  rows: ParsedRow<T>[]
  headers: readonly string[]
  fileName: string
}

export function ErrorPanel<T extends Record<string, unknown>>({ rows, headers, fileName }: Props<T>) {
  const rowsWithErrors = rows.filter((r) => r.errors.length > 0)
  if (rowsWithErrors.length === 0) return null

  function downloadErrorsCsv() {
    const headerLine = [...headers, "_error"].join(",")
    const bodyLines = rows.map((r) => {
      const values = headers.map((h) => JSON.stringify((r.data as any)[h] ?? ""))
      const errCol = r.errors.length > 0 ? `"${r.errors.join("; ").replace(/"/g, '""')}"` : ""
      return [...values, errCol].join(",")
    })
    const csv = "\uFEFF" + [headerLine, ...bodyLines].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName.replace(/\.csv$/i, "") + "_con_errores.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Alert variant="destructive" className="mt-4">
      <XCircle className="h-4 w-4" />
      <AlertTitle>{rowsWithErrors.length} fila(s) con errores</AlertTitle>
      <AlertDescription>
        <ul className="list-disc list-inside text-sm mt-2 space-y-0.5">
          {rowsWithErrors.slice(0, 10).map((r) => (
            <li key={r.rowNumber}>
              Fila {r.rowNumber}: {r.errors.join(", ")}
            </li>
          ))}
          {rowsWithErrors.length > 10 && <li>…y {rowsWithErrors.length - 10} más.</li>}
        </ul>
        <Button variant="outline" size="sm" onClick={downloadErrorsCsv} className="mt-3">
          <Download className="mr-2 h-4 w-4" /> Descargar CSV con errores
        </Button>
      </AlertDescription>
    </Alert>
  )
}
```

- [ ] **Step 3: Crear `entity-panel.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Download, Upload, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { parseCsv, type ParsedRow } from "@/lib/import/csv-parser"
import { uploadInChunks } from "@/lib/import/chunked-upload"
import { PreviewTable } from "./preview-table"
import { ErrorPanel } from "./error-panel"

interface Props<T> {
  entityKey: string
  title: string
  description: string
  schema: z.ZodType<T>
  headers: readonly string[]
  templatePath: string
  endpoint: string
  deps?: string[]
  onConfirm?: () => boolean | Promise<boolean>
}

export function EntityPanel<T extends Record<string, unknown>>({
  entityKey, title, description, schema, headers, templatePath, endpoint, deps, onConfirm,
}: Props<T>) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ParsedRow<T>[]>([])
  const [headerError, setHeaderError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; conflicts: number } | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.toLowerCase().endsWith(".csv")) {
      toast.error("Solo archivos .csv")
      return
    }
    setFile(f)
    const text = await f.text()
    const res = await parseCsv(text, schema, headers)
    if (res.headerError) {
      setHeaderError(res.headerError)
      setRows([])
      toast.error(res.headerError)
    } else {
      setHeaderError(null)
      setRows(res.rows)
    }
  }

  async function handleImport() {
    if (onConfirm) {
      const ok = await onConfirm()
      if (!ok) return
    }
    const validRows = rows.filter((r) => r.errors.length === 0).map((r) => r.data)
    if (validRows.length === 0) {
      toast.error("No hay filas válidas para importar")
      return
    }
    setIsImporting(true)
    setResult(null)
    const out = await uploadInChunks(validRows, endpoint, setProgress)
    setIsImporting(false)
    if (out.aborted) {
      toast.error(`Error: ${out.errorMessage}. Se importaron ${out.totalInserted} antes del error.`)
    } else {
      setResult({ inserted: out.totalInserted, conflicts: out.totalConflicts })
      toast.success(`Importación OK: ${out.totalInserted} insertadas, ${out.totalConflicts} duplicadas omitidas.`)
      setFile(null)
      setRows([])
      setProgress(null)
    }
  }

  const validCount = rows.filter((r) => r.errors.length === 0).length
  const errorCount = rows.filter((r) => r.errors.length > 0).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
            {deps && deps.length > 0 && (
              <div className="flex gap-1 mt-2">
                <span className="text-xs text-slate-500">Requiere:</span>
                {deps.map((d) => <Badge key={d} variant="outline" className="text-xs">{d}</Badge>)}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" asChild>
            <a href={templatePath} download>
              <Download className="mr-2 h-4 w-4" /> Descargar plantilla
            </a>
          </Button>
          <div className="relative">
            <input
              type="file"
              accept=".csv"
              onChange={handleFile}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isImporting}
            />
            <Button variant="secondary" disabled={isImporting}>
              <Upload className="mr-2 h-4 w-4" /> Subir CSV
            </Button>
          </div>
        </div>

        {headerError && (
          <Alert variant="destructive">
            <AlertDescription>{headerError}</AlertDescription>
          </Alert>
        )}

        {rows.length > 0 && (
          <>
            <div className="text-sm flex gap-4">
              <span>Total: <strong>{rows.length}</strong></span>
              <span className="text-green-600">OK: <strong>{validCount}</strong></span>
              {errorCount > 0 && <span className="text-destructive">Errores: <strong>{errorCount}</strong></span>}
            </div>
            <PreviewTable rows={rows} headers={headers} />
            <ErrorPanel rows={rows} headers={headers} fileName={file?.name || "data.csv"} />
            <div className="flex justify-end">
              <Button
                onClick={handleImport}
                disabled={validCount === 0 || errorCount > 0 || isImporting}
                size="lg"
              >
                {isImporting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando…</>
                  : <><CheckCircle2 className="mr-2 h-4 w-4" /> Importar {validCount} filas</>}
              </Button>
            </div>
            {progress && (
              <div>
                <Progress value={(progress.current / progress.total) * 100} />
                <p className="text-xs text-slate-500 mt-1">
                  Chunk {progress.current} de {progress.total}
                </p>
              </div>
            )}
          </>
        )}

        {result && (
          <Alert>
            <AlertDescription>
              Importación completada: <strong>{result.inserted}</strong> insertadas,{" "}
              <strong>{result.conflicts}</strong> duplicadas omitidas.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Crear `status-chips.tsx`** (placeholder, lo completa la page)

```tsx
"use client"

import { Badge } from "@/components/ui/badge"

interface ChipData { label: string; count: number }

export function StatusChips({ items }: { items: ChipData[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Badge key={i.label} variant="outline" className="px-3 py-1">
          {i.label}: <span className="ml-1 tabular-nums font-semibold">{i.count}</span>
        </Badge>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx tsc --noEmit 2>&1 | grep "components/import/" || echo "OK"
git add components/import/
git commit -m "feat(import-ui): preview-table + error-panel + entity-panel + status-chips"
```

---

## Task 11: Page `/settings/import` rewrite + entity-specific modals

**Files:**
- Overwrite: `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/settings/import/page.tsx`
- Delete: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/settings/import-section.tsx`

- [ ] **Step 1: Borrar el component legacy**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
rm components/settings/import-section.tsx
```

- [ ] **Step 2: Overwrite page.tsx**

```tsx
"use client"

import { useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { EntityPanel } from "@/components/import/entity-panel"
import { StatusChips } from "@/components/import/status-chips"
import { agenciesSchema, agenciesCsvHeaders } from "@/lib/import/schemas/agencies"
import { financialAccountsSchema, financialAccountsCsvHeaders } from "@/lib/import/schemas/financial-accounts"
import { customersSchema, customersCsvHeaders } from "@/lib/import/schemas/customers"
import { operatorsSchema, operatorsCsvHeaders } from "@/lib/import/schemas/operators"
import { usersSchema, usersCsvHeaders } from "@/lib/import/schemas/users"
import { operationsSchema, operationsCsvHeaders } from "@/lib/import/schemas/operations"
import { paymentsSchema, paymentsCsvHeaders } from "@/lib/import/schemas/payments"
import { cashMovementsSchema, cashMovementsCsvHeaders } from "@/lib/import/schemas/cash-movements"

export default function ImportPage() {
  const [confirmUsersOpen, setConfirmUsersOpen] = useState(false)
  const [resolveUsers, setResolveUsers] = useState<((v: boolean) => void) | null>(null)
  const [confirmAccountsOpen, setConfirmAccountsOpen] = useState(false)
  const [resolveAccounts, setResolveAccounts] = useState<((v: boolean) => void) | null>(null)

  function askUsersConfirm(): Promise<boolean> {
    return new Promise((res) => {
      setResolveUsers(() => res)
      setConfirmUsersOpen(true)
    })
  }
  function askAccountsConfirm(): Promise<boolean> {
    return new Promise((res) => {
      setResolveAccounts(() => res)
      setConfirmAccountsOpen(true)
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importación de datos</h1>
        <p className="text-sm text-slate-500">
          Cargá tus datos preexistentes desde CSV. Cada entidad tiene su plantilla estricta — descargala, completala, y subila.
        </p>
      </div>

      <StatusChips items={[]} />

      <Accordion type="multiple" className="space-y-2">
        <AccordionItem value="agencies">
          <AccordionTrigger>Agencias</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="agencies"
              title="Agencias"
              description="Sub-agencias del tenant."
              schema={agenciesSchema}
              headers={agenciesCsvHeaders}
              templatePath="/templates/agencies.csv"
              endpoint="/api/import/agencies"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="financial-accounts">
          <AccordionTrigger>Cuentas financieras (caja, bancos)</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="financial-accounts"
              title="Cuentas financieras"
              description="Caja, bancos, tarjetas, billeteras virtuales."
              schema={financialAccountsSchema}
              headers={financialAccountsCsvHeaders}
              templatePath="/templates/financial-accounts.csv"
              endpoint="/api/import/financial-accounts"
              deps={["agencies"]}
              onConfirm={askAccountsConfirm}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="customers">
          <AccordionTrigger>Clientes</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="customers"
              title="Clientes"
              description="Base de clientes/pasajeros."
              schema={customersSchema}
              headers={customersCsvHeaders}
              templatePath="/templates/customers.csv"
              endpoint="/api/import/customers"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="operators">
          <AccordionTrigger>Operadores</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="operators"
              title="Operadores"
              description="Proveedores mayoristas."
              schema={operatorsSchema}
              headers={operatorsCsvHeaders}
              templatePath="/templates/operators.csv"
              endpoint="/api/import/operators"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="users">
          <AccordionTrigger>Vendedores</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="users"
              title="Vendedores"
              description="Equipo comercial. Se les manda email de invitación."
              schema={usersSchema}
              headers={usersCsvHeaders}
              templatePath="/templates/users.csv"
              endpoint="/api/import/users"
              deps={["agencies"]}
              onConfirm={askUsersConfirm}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="operations">
          <AccordionTrigger>Operaciones (histórico)</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="operations"
              title="Operaciones"
              description="Histórico de operaciones. Opcional."
              schema={operationsSchema}
              headers={operationsCsvHeaders}
              templatePath="/templates/operations.csv"
              endpoint="/api/import/operations"
              deps={["customers", "operators", "users", "agencies"]}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="payments">
          <AccordionTrigger>Pagos (histórico)</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="payments"
              title="Pagos"
              description="Pagos de clientes o a operadores. Opcional."
              schema={paymentsSchema}
              headers={paymentsCsvHeaders}
              templatePath="/templates/payments.csv"
              endpoint="/api/import/payments"
              deps={["operations", "financial-accounts"]}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="cash-movements">
          <AccordionTrigger>Movimientos de caja (histórico)</AccordionTrigger>
          <AccordionContent>
            <EntityPanel
              entityKey="cash-movements"
              title="Movimientos de caja"
              description="Histórico de movimientos de caja. Opcional."
              schema={cashMovementsSchema}
              headers={cashMovementsCsvHeaders}
              templatePath="/templates/cash-movements.csv"
              endpoint="/api/import/cash-movements"
              deps={["financial-accounts"]}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={confirmUsersOpen} onOpenChange={setConfirmUsersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar invitación de vendedores</DialogTitle>
            <DialogDescription>
              A cada email listado se le va a mandar un link de invitación con reset de contraseña.
              No hay vuelta atrás — los emails se envían inmediatamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmUsersOpen(false); resolveUsers?.(false) }}>
              Cancelar
            </Button>
            <Button onClick={() => { setConfirmUsersOpen(false); resolveUsers?.(true) }}>
              Enviar invitaciones
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAccountsOpen} onOpenChange={setConfirmAccountsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saldos iniciales</DialogTitle>
            <DialogDescription>
              Los saldos iniciales de las cuentas van a ser registrados como saldos de apertura.
              Asegurate que los montos sean correctos — después de importar no se pueden editar fácilmente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmAccountsOpen(false); resolveAccounts?.(false) }}>
              Cancelar
            </Button>
            <Button onClick={() => { setConfirmAccountsOpen(false); resolveAccounts?.(true) }}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 3: typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx tsc --noEmit 2>&1 | grep -E "settings/import|components/import" || echo "OK"
git add "app/(dashboard)/settings/import/page.tsx" components/settings/
git commit -m "feat(import-ui): rewrite /settings/import con accordion + modals invite/saldos"
```

---

## Task 12: Dashboard import banner (dismissible)

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/dashboard/import-banner.tsx`
- Modify: el layout o page principal del dashboard para incluir el banner.

- [ ] **Step 1: Crear banner component**

```tsx
"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Upload, X } from "lucide-react"

const STORAGE_KEY = "import_banner_dismissed"

export function ImportBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY) === "true"
    setShow(!dismissed)
  }, [])

  if (!show) return null

  return (
    <Alert className="bg-blue-500/10 border-blue-500/30 mb-4">
      <Upload className="h-4 w-4 text-blue-500" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>
          ¿Traés datos de otro sistema? Importá tu histórico desde CSV en{" "}
          <Link href="/settings/import" className="underline font-medium">Settings → Importación</Link>.
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "true")
            setShow(false)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  )
}
```

- [ ] **Step 2: Incluir banner en el dashboard**

Abrir `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/dashboard/page.tsx` (o la page principal del dashboard). En la parte superior del JSX, agregar:

```tsx
import { ImportBanner } from "@/components/dashboard/import-banner"

// ... dentro del componente, al tope del main content:
<ImportBanner />
```

Si el proyecto tiene múltiples dashboards (ADMIN/SELLER), agregarlo solo al de ADMIN/ORG_OWNER.

- [ ] **Step 3: typecheck + commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
npx tsc --noEmit 2>&1 | grep "import-banner" || echo "OK"
git add components/dashboard/import-banner.tsx "app/(dashboard)/dashboard/"
git commit -m "feat(dashboard): banner dismissible que linkea a /settings/import"
```

---

## Task 13: Smoke E2E manual

**Files:**
- Create: `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/plans/2026-04-23-bulk-import-e2e.md`

**Context:** checklist de testing manual post-deploy, similar al del sprint custom plans.

- [ ] **Step 1: Crear el E2E checklist**

```markdown
# Bulk Import — E2E Smoke Checklist

Ejecutar en staging o con org de test en prod. Cada bloque debe verificar el flow end-to-end.

## Pre-requisitos

- [ ] Migration 161 aplicada en Supabase prod.
- [ ] Deploy Railway OK (commits pusheados).
- [ ] Org de test con un user ORG_OWNER logueado.

## Tests por entidad

### Agencies
- [ ] Descargar plantilla → CSV tiene headers exactos + 2 filas.
- [ ] Completar con 3 filas nuevas → subir → preview muestra 3 OK.
- [ ] Importar → toast "3 insertadas".
- [ ] Verificar en `/settings/agencies` las 3 filas con `org_id = user.org_id`.
- [ ] Re-subir mismo CSV → "0 insertadas, 3 duplicadas omitidas".

### Financial accounts
- [ ] Plantilla → agregar 2 cuentas, una con `agency_name = "Rosario"` (existente).
- [ ] Subir con `agency_name = "NoExiste"` → error "agency no encontrada".
- [ ] Subir con `type = FOO` → preview marca Error en esa fila, botón Importar disabled.
- [ ] Subir CSV válido → importar → modal "Saldos iniciales" → confirmar → 2 insertadas.

### Customers
- [ ] CSV con 5 clientes, 2 con mismo `document_number` → preview marca error en 1 fila por dedupe intra-CSV.
- [ ] Corregir → re-subir → 5 insertadas.
- [ ] Re-subir mismo CSV → "0 insertadas, 5 duplicadas" (dedupe por DNI).

### Operators
- [ ] Subir 3 operators, uno con CUIT duplicado vs fila existente → reportado como conflict.

### Users
- [ ] CSV con 2 emails nuevos + agency_name existente.
- [ ] Subir → modal "Confirmar invitación" → confirmar.
- [ ] 2 emails reciben link de invitación Supabase Auth.
- [ ] `/settings/users` muestra los 2 con status "Invited".

### Operations
- [ ] CSV con 3 ops, una con `seller_email` inexistente → error "seller no encontrado".
- [ ] Corregir → 3 insertadas.

### Payments
- [ ] CSV con 2 pagos sobre operations existentes → insertadas.
- [ ] Pago sobre `operation_file_code = "NoExiste"` → error.

### Cash movements
- [ ] CSV con 50 movimientos → chunk único (sync).
- [ ] Todos insertados.

## Test de volumen (chunked upload)

- [ ] Generar CSV con 2500 clientes (script one-off o gen manual).
- [ ] Subir → preview OK → "Importar 2500 filas".
- [ ] Ver progress bar: "Chunk 1 de 5", "2 de 5", ... "5 de 5".
- [ ] Toast final: "2500 insertadas".
- [ ] Verificar count en DB: `SELECT COUNT(*) FROM customers WHERE org_id = <test-org>` = 2500.

## Test multi-tenant isolation

- [ ] Con user de org A, importar customer con doc "11111111".
- [ ] Con user de org B, importar customer con doc "11111111" → insertado (no colisiona cross-tenant).
- [ ] Verificar en DB: ambos existen, con diferentes `org_id`.

## Test de error recovery

- [ ] CSV con 1000 rows, una con error de FK en fila 600.
- [ ] Preview marca error en esa fila.
- [ ] Descargar "CSV con errores" → contiene solo las rows problemáticas + columna `_error`.
- [ ] Cliente arregla la fila 600, re-sube → 1000 insertadas (las primeras 999 como conflicts silenciosos y la 600 nueva).

## Smoke cleanup

- [ ] Banner dashboard dismissible: clickear X → refrescar → no aparece.
- [ ] localStorage: `import_banner_dismissed = "true"`.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add docs/superpowers/plans/2026-04-23-bulk-import-e2e.md
git commit -m "docs: E2E smoke checklist bulk import"
```

---

## Resumen de entregables

- 1 migration (161) con 8 RPCs `SECURITY DEFINER` + UNIQUE constraints.
- 8 schemas Zod con TDD.
- 3 core libs: csv-parser, fk-resolver, chunked-upload.
- 8 plantillas CSV en `public/templates/`.
- 8 endpoints nuevos en `/api/import/<entity>` (reemplazan 5 rotos anteriores).
- UI rewrite de `/settings/import` + 4 componentes shared.
- Banner dismissible en dashboard.
- E2E checklist manual.

Total: 13 tasks.
