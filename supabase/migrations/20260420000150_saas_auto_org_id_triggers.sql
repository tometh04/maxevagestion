-- =====================================================
-- Migración 150 v3: Triggers auto-org_id (sin SELECT INTO para el SQL Editor)
-- =====================================================
-- SaaS — INSERTs a tablas tenant-scoped desde JWT fallan con 42501 si el
-- caller no setea org_id. Trigger BEFORE INSERT lo auto-popula desde contexto.
--
-- v1 + v2: el SQL Editor de Supabase se confunde con `SELECT col INTO var`
-- y tira `relation "<var>" does not exist`. v3 elimina `SELECT INTO` y
-- asigna directo a NEW.org_id con subqueries inline.

-- ========== ledger_movements ==========
CREATE OR REPLACE FUNCTION auto_set_ledger_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.operation_id IS NOT NULL THEN
    NEW.org_id := (SELECT o.org_id FROM operations o WHERE o.id = NEW.operation_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    NEW.org_id := (SELECT l.org_id FROM leads l WHERE l.id = NEW.lead_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.id = NEW.created_by);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_auto_org_id_ledger_movements ON ledger_movements;
CREATE TRIGGER trg_auto_org_id_ledger_movements
  BEFORE INSERT ON ledger_movements
  FOR EACH ROW EXECUTE FUNCTION auto_set_ledger_org_id();

-- ========== cash_movements ==========
CREATE OR REPLACE FUNCTION auto_set_cash_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.financial_account_id IS NOT NULL THEN
    NEW.org_id := (SELECT fa.org_id FROM financial_accounts fa WHERE fa.id = NEW.financial_account_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.id = NEW.user_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_auto_org_id_cash_movements ON cash_movements;
CREATE TRIGGER trg_auto_org_id_cash_movements
  BEFORE INSERT ON cash_movements
  FOR EACH ROW EXECUTE FUNCTION auto_set_cash_org_id();

-- ========== tasks ==========
CREATE OR REPLACE FUNCTION auto_set_tasks_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.operation_id IS NOT NULL THEN
    NEW.org_id := (SELECT o.org_id FROM operations o WHERE o.id = NEW.operation_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.id = NEW.created_by);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.id = NEW.assigned_to);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_auto_org_id_tasks ON tasks;
CREATE TRIGGER trg_auto_org_id_tasks
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION auto_set_tasks_org_id();
