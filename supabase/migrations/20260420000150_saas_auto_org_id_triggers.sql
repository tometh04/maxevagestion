-- =====================================================
-- Migración 150: Triggers auto-org_id para ledger_movements + cash_movements
-- =====================================================
-- SaaS — tras el refactor del Pilar 2c, cualquier INSERT desde un JWT de
-- user autenticado (sin admin client) rompe con 42501 si no setea
-- `org_id`. La RLS policy requiere `org_id IN user_org_ids()` y el default
-- de la columna es NULL.
--
-- Fix sistémico: BEFORE INSERT trigger que auto-popula `org_id` desde el
-- contexto si el caller no lo pasó:
--
-- ledger_movements:
--   NEW.operation_id → operations.org_id
--   NEW.lead_id → leads.org_id
--   NEW.created_by → users.org_id
--   fallback: users WHERE auth_id = auth.uid()
--
-- cash_movements:
--   NEW.financial_account_id → financial_accounts.org_id
--   NEW.user_id → users.org_id
--   fallback: users WHERE auth_id = auth.uid()
--
-- El trigger respeta NEW.org_id si ya vino seteado — no lo pisa. Así los
-- callers que ya lo inyectan siguen funcionando, y los que no, quedan
-- auto-resueltos. Si no se puede resolver, queda NULL y RLS rechaza
-- (comportamiento explícito, no silent).
--
-- SECURITY DEFINER para que el trigger pueda leer `users`/`operations`/
-- `leads`/`financial_accounts` sin pelear con RLS del caller.

-- ========== ledger_movements ==========
CREATE OR REPLACE FUNCTION auto_set_ledger_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved UUID;
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.operation_id IS NOT NULL THEN
    SELECT org_id INTO resolved FROM operations WHERE id = NEW.operation_id;
    IF resolved IS NOT NULL THEN NEW.org_id := resolved; RETURN NEW; END IF;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    SELECT org_id INTO resolved FROM leads WHERE id = NEW.lead_id;
    IF resolved IS NOT NULL THEN NEW.org_id := resolved; RETURN NEW; END IF;
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    SELECT org_id INTO resolved FROM users WHERE id = NEW.created_by;
    IF resolved IS NOT NULL THEN NEW.org_id := resolved; RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT org_id INTO resolved FROM users WHERE auth_id = auth.uid() LIMIT 1;
    IF resolved IS NOT NULL THEN NEW.org_id := resolved; RETURN NEW; END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_org_id_ledger_movements ON ledger_movements;
CREATE TRIGGER trg_auto_org_id_ledger_movements
  BEFORE INSERT ON ledger_movements
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_ledger_org_id();

-- ========== cash_movements ==========
CREATE OR REPLACE FUNCTION auto_set_cash_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved UUID;
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.financial_account_id IS NOT NULL THEN
    SELECT org_id INTO resolved FROM financial_accounts WHERE id = NEW.financial_account_id;
    IF resolved IS NOT NULL THEN NEW.org_id := resolved; RETURN NEW; END IF;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    SELECT org_id INTO resolved FROM users WHERE id = NEW.user_id;
    IF resolved IS NOT NULL THEN NEW.org_id := resolved; RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT org_id INTO resolved FROM users WHERE auth_id = auth.uid() LIMIT 1;
    IF resolved IS NOT NULL THEN NEW.org_id := resolved; RETURN NEW; END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_org_id_cash_movements ON cash_movements;
CREATE TRIGGER trg_auto_org_id_cash_movements
  BEFORE INSERT ON cash_movements
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_cash_org_id();

COMMENT ON FUNCTION auto_set_ledger_org_id() IS
  'SaaS — BEFORE INSERT trigger resuelve org_id desde operation/lead/user/auth.uid si el caller no lo setea. Evita 42501 en inserts desde server client.';
COMMENT ON FUNCTION auto_set_cash_org_id() IS
  'SaaS — BEFORE INSERT trigger resuelve org_id desde financial_account/user/auth.uid si el caller no lo setea.';
