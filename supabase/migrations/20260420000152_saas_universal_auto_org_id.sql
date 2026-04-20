-- =====================================================
-- Migración 152: Trigger auto-org_id universal
-- =====================================================
-- Mig 150 cubrió ledger_movements/cash_movements/tasks; mig 151 cubrió
-- manychat_list_order. El resto de tablas tenant-scoped (leads, operations,
-- customers, operators, payments, etc.) siguen expuestas al mismo 42501:
-- INSERT desde un JWT user sin `org_id` explícito → RLS rechaza.
--
-- Fix universal: función genérica `auto_set_org_id_from_auth` que resuelve
-- org_id desde `auth.uid() → users.org_id`, y la aplicamos vía trigger
-- BEFORE INSERT a TODAS las tablas con columna `org_id` y RLS activa. Si
-- la tabla ya tiene un trigger específico (mig 150/151), saltamos — PG
-- ejecuta triggers en orden alfabético y los específicos cubren contexto
-- más rico (operation_id, lead_id, financial_account_id).

-- ========== Función genérica ==========
CREATE OR REPLACE FUNCTION auto_set_org_id_from_auth() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  RETURN NEW;
END;
$body$;

COMMENT ON FUNCTION auto_set_org_id_from_auth() IS
  'SaaS — trigger BEFORE INSERT universal. Si org_id es NULL, lo resuelve desde auth.uid() -> users.org_id. Usado en todas las tablas tenant-scoped que no tienen un trigger específico con contexto más rico.';

-- ========== Instalación en todas las tablas tenant-scoped ==========
-- Excluye: tablas con trigger específico (mig 150/151) y tablas sin RLS.
DO $body$
DECLARE
  r RECORD;
  tg_name TEXT;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    INNER JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = c.relname
          AND column_name = 'org_id'
      )
    ORDER BY c.relname
  LOOP
    tg_name := 'trg_auto_org_id_' || r.tbl;

    -- Saltear si ya existe un trigger con ese nombre (mig 150/151 ya cubrió
    -- ledger_movements, cash_movements, tasks, manychat_list_order).
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = tg_name
        AND tgrelid = (SELECT oid FROM pg_class WHERE relname = r.tbl AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION auto_set_org_id_from_auth()',
      tg_name,
      r.tbl
    );
    RAISE NOTICE 'Created trigger % on %', tg_name, r.tbl;
  END LOOP;
END;
$body$;
