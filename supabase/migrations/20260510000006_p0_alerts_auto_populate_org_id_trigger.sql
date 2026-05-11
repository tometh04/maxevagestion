-- Migración 2026-05-10: trigger auto-populate alerts.org_id
--
-- PROBLEMA (P0):
--   Tras tighten policy en mig 20260510000005, INSERTs a alerts sin
--   org_id quedan invisibles (la policy filtra por org_id IN user_org_ids()).
--   Cualquier cron / endpoint que olvide setear org_id causa que la alert
--   no se vea — ni siquiera al tenant correcto.
--
--   Detectado en deploy 2026-05-10: el cron diario /api/cron/alerts (9 AM)
--   llamaba a funciones en lib/alerts/generate.ts que insertaban sin
--   org_id. Hay 15+ inserts a alerts en el codebase, varios sin org_id.
--
-- FIX:
--   Trigger BEFORE INSERT que auto-popula org_id desde la FK más relevante
--   (operation_id, lead_id, customer_id, user_id en ese orden). Centraliza
--   la lógica en la BD para que ningún INSERT futuro la olvide.
--
-- IMPACTO:
--   - INSERTs con org_id seteado: trigger los respeta (no-op)
--   - INSERTs sin org_id pero con FK relevante: trigger lo deriva
--   - INSERTs sin org_id ni FK útil: queda NULL (invisible por policy)

BEGIN;

CREATE OR REPLACE FUNCTION public.alerts_auto_populate_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Si ya viene seteado, respetar
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Estrategia 1: desde operation_id (caso ~95%)
  IF NEW.operation_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM operations
    WHERE id = NEW.operation_id
    LIMIT 1;
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  -- Estrategia 2: desde lead_id
  IF NEW.lead_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM leads
    WHERE id = NEW.lead_id
    LIMIT 1;
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  -- Estrategia 3: desde customer_id → primera operation con ese customer
  IF NEW.customer_id IS NOT NULL THEN
    SELECT op.org_id INTO NEW.org_id
    FROM operations op
    JOIN operation_customers oc ON oc.operation_id = op.id
    WHERE oc.customer_id = NEW.customer_id
      AND op.org_id IS NOT NULL
    ORDER BY op.created_at DESC
    LIMIT 1;
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  -- Estrategia 4: desde user_id → primera org del user via organization_members
  IF NEW.user_id IS NOT NULL THEN
    SELECT om.organization_id INTO NEW.org_id
    FROM users u
    JOIN organization_members om ON om.user_id = u.auth_id
    WHERE u.id = NEW.user_id AND om.status = 'ACTIVE'
    LIMIT 1;
  END IF;

  -- Si nada matchea, queda NULL. Policy tightened lo invisibiliza
  -- (mejor que leak cross-tenant).
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alerts_auto_populate_org_id_trigger ON alerts;
CREATE TRIGGER alerts_auto_populate_org_id_trigger
  BEFORE INSERT ON alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.alerts_auto_populate_org_id();

COMMIT;
