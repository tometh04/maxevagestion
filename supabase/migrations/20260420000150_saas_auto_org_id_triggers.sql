-- =====================================================
-- Migración 150: Triggers auto-org_id para ledger_movements + cash_movements
-- =====================================================
-- SaaS — tras el refactor del Pilar 2c, cualquier INSERT desde un JWT de
-- user autenticado rompe con 42501 si no setea `org_id`. Fix sistémico:
-- BEFORE INSERT trigger que auto-popula `org_id` desde el contexto si el
-- caller no lo pasó.
--
-- Notas de implementación:
-- - Variable local v_org_id (prefijo v_) — evita el bug del SQL Editor
--   que interpreta identificadores sin prefijo como relaciones.
-- - Delimitador $body$ (en vez de $$) — mismo motivo.
-- - SECURITY DEFINER para que el trigger pueda leer users/operations/leads
--   sin pelear con RLS del caller.

-- ========== ledger_movements ==========
CREATE OR REPLACE FUNCTION auto_set_ledger_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_org_id UUID;
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.operation_id IS NOT NULL THEN
    SELECT o.org_id INTO v_org_id FROM operations o WHERE o.id = NEW.operation_id;
    IF v_org_id IS NOT NULL THEN NEW.org_id := v_org_id; RETURN NEW; END IF;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    SELECT l.org_id INTO v_org_id FROM leads l WHERE l.id = NEW.lead_id;
    IF v_org_id IS NOT NULL THEN NEW.org_id := v_org_id; RETURN NEW; END IF;
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    SELECT u.org_id INTO v_org_id FROM users u WHERE u.id = NEW.created_by;
    IF v_org_id IS NOT NULL THEN NEW.org_id := v_org_id; RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT u.org_id INTO v_org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1;
    IF v_org_id IS NOT NULL THEN NEW.org_id := v_org_id; RETURN NEW; END IF;
  END IF;

  RETURN NEW;
END;
$body$;

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
AS $body$
DECLARE
  v_org_id UUID;
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.financial_account_id IS NOT NULL THEN
    SELECT fa.org_id INTO v_org_id FROM financial_accounts fa WHERE fa.id = NEW.financial_account_id;
    IF v_org_id IS NOT NULL THEN NEW.org_id := v_org_id; RETURN NEW; END IF;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    SELECT u.org_id INTO v_org_id FROM users u WHERE u.id = NEW.user_id;
    IF v_org_id IS NOT NULL THEN NEW.org_id := v_org_id; RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT u.org_id INTO v_org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1;
    IF v_org_id IS NOT NULL THEN NEW.org_id := v_org_id; RETURN NEW; END IF;
  END IF;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_auto_org_id_cash_movements ON cash_movements;
CREATE TRIGGER trg_auto_org_id_cash_movements
  BEFORE INSERT ON cash_movements
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_cash_org_id();

COMMENT ON FUNCTION auto_set_ledger_org_id() IS
  'SaaS — BEFORE INSERT trigger. Resuelve org_id desde operation/lead/user/auth.uid si el caller no lo setea. Evita 42501 en inserts desde server client.';
COMMENT ON FUNCTION auto_set_cash_org_id() IS
  'SaaS — BEFORE INSERT trigger. Resuelve org_id desde financial_account/user/auth.uid si el caller no lo setea.';
