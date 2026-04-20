-- =====================================================
-- Migración 151: Consolidated legacy-policy cleanup + manychat_list_order tenant
-- =====================================================
-- SaaS — 3 gaps residuales después de los Pilares 1-9:
--
-- 1. `financial_settings` tenía policies legacy que dejaban pasar cross-org:
--    "Users can view financial settings for their agencies" (agency-based)
--    "Only admins can modify financial settings" (role check sin org)
--    Como RLS aplica OR entre policies, CUALQUIER match permite. Un SUPER_ADMIN
--    de LOLO matcheaba la segunda → veía el CUIT/IVA config de Maxi.
--
-- 2. `integrations` tenía una policy legacy equivalente:
--    "Admins can manage integrations" (agency-based)
--    LOLO veía la integración AFIP de Lozada por esta puerta.
--
-- 3. `manychat_list_order` sin `org_id`, con policies permisivas (auth.role
--    check sin org). LOLO veía las listas del CRM de Maxi y no podía
--    crear las suyas porque la policy de write era admin-only sin org.
--
-- Fix: drop las legacy, dejar solo `tenant_isolation`, agregar org_id +
-- backfill + trigger auto-org_id a manychat_list_order.

-- ========== 1. financial_settings ==========
DROP POLICY IF EXISTS "Users can view financial settings for their agencies" ON financial_settings;
DROP POLICY IF EXISTS "Only admins can modify financial settings" ON financial_settings;
-- Deja sólo `tenant_isolation` (creada por mig 136).

-- ========== 2. integrations ==========
DROP POLICY IF EXISTS "Admins can manage integrations" ON integrations;
-- Deja sólo `tenant_isolation`.

-- ========== 3. manychat_list_order ==========
ALTER TABLE manychat_list_order
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE manychat_list_order m
SET org_id = a.org_id
FROM agencies a
WHERE m.agency_id = a.id AND m.org_id IS NULL;

UPDATE manychat_list_order
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE manychat_list_order ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_manychat_list_order_org_id ON manychat_list_order(org_id);

DROP POLICY IF EXISTS "Manychat list order is editable by admins" ON manychat_list_order;
DROP POLICY IF EXISTS "Manychat list order is viewable by authenticated users" ON manychat_list_order;

ALTER TABLE manychat_list_order FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manychat_list_order_tenant_isolation" ON manychat_list_order;
CREATE POLICY "manychat_list_order_tenant_isolation" ON manychat_list_order
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- Trigger auto-org_id (mismo patrón que mig 150)
CREATE OR REPLACE FUNCTION auto_set_manychat_list_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.agency_id IS NOT NULL THEN
    NEW.org_id := (SELECT a.org_id FROM agencies a WHERE a.id = NEW.agency_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_auto_org_id_manychat_list_order ON manychat_list_order;
CREATE TRIGGER trg_auto_org_id_manychat_list_order
  BEFORE INSERT ON manychat_list_order
  FOR EACH ROW EXECUTE FUNCTION auto_set_manychat_list_org_id();
