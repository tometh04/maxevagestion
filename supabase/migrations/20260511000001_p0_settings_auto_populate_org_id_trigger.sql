-- Migración 2026-05-11: trigger auto-populate org_id en tablas *_settings
--
-- PROBLEMA (P0):
--   Tras tighten policy tenant_isolation (mig 136), INSERTs a:
--     - operation_settings
--     - customer_settings
--     - financial_settings
--     - tools_settings
--   fallan con WITH CHECK violation cuando se inserta sin org_id.
--   Esto rompe la primera visita a /settings/* para tenants nuevos:
--   el endpoint detecta que no hay row, intenta crear default con
--   agency_id pero sin org_id, y la RLS lo rechaza.
--
--   Síntoma observado 2026-05-11: tenant nuevo (vicotravel) entra a
--   Operaciones → Configuración y ve toast "Error al cargar configuración".
--
-- FIX:
--   Trigger BEFORE INSERT en las 4 tablas que auto-popula org_id desde
--   agencies.org_id (todas tienen agency_id NOT NULL FK a agencies).
--   Igual estrategia que mig 6 para alerts. Centraliza la lógica en BD
--   para que ningún INSERT futuro la olvide.
--
-- IMPACTO:
--   - INSERTs con org_id seteado: trigger no-op
--   - INSERTs sin org_id pero con agency_id válido: trigger lo deriva
--   - INSERTs sin org_id ni agency_id válido: queda NULL, RLS lo rechaza
--     (correcto: mejor fail explícito que leak cross-tenant)
--   - Lozada/Rosario: rows existentes intactos. Solo afecta nuevos INSERTs.

BEGIN;

-- Función genérica reusable (cada trigger pasa el nombre via TG_ARGV si quisiéramos)
CREATE OR REPLACE FUNCTION public.settings_auto_populate_org_id()
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

  -- Derivar desde agency_id (todas las tablas *_settings lo tienen NOT NULL)
  IF NEW.agency_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM agencies
    WHERE id = NEW.agency_id
    LIMIT 1;
  END IF;

  -- Si la agencia no tiene org_id (caso legacy raro), queda NULL.
  -- RLS lo rechazará → fail explícito mejor que leak.
  RETURN NEW;
END;
$$;

-- Aplicar trigger a cada tabla
DROP TRIGGER IF EXISTS operation_settings_auto_populate_org_id_trigger ON operation_settings;
CREATE TRIGGER operation_settings_auto_populate_org_id_trigger
  BEFORE INSERT ON operation_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.settings_auto_populate_org_id();

DROP TRIGGER IF EXISTS customer_settings_auto_populate_org_id_trigger ON customer_settings;
CREATE TRIGGER customer_settings_auto_populate_org_id_trigger
  BEFORE INSERT ON customer_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.settings_auto_populate_org_id();

DROP TRIGGER IF EXISTS financial_settings_auto_populate_org_id_trigger ON financial_settings;
CREATE TRIGGER financial_settings_auto_populate_org_id_trigger
  BEFORE INSERT ON financial_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.settings_auto_populate_org_id();

DROP TRIGGER IF EXISTS tools_settings_auto_populate_org_id_trigger ON tools_settings;
CREATE TRIGGER tools_settings_auto_populate_org_id_trigger
  BEFORE INSERT ON tools_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.settings_auto_populate_org_id();

COMMIT;
