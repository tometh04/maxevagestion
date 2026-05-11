-- Migración 2026-05-10: destinations per-tenant
--
-- PROBLEMA (P0):
--   `destinations` (mig 114) tiene RLS USING (true) — catálogo global
--   compartido. Cualquier tenant puede INSERT/UPDATE/DELETE destinations
--   que ven otros tenants. Viola la regla "catálogos per-tenant siempre"
--   (memory feedback_aislamiento_estricto_tenant).
--
-- FIX:
--   1. ADD COLUMN org_id NULLABLE inicialmente
--   2. Backfill: asignar rows existentes al tenant default (Lozada)
--      ya que era global y los registros vienen de uso compartido
--   3. SET NOT NULL después del backfill
--   4. INDEX
--   5. RLS tenant_isolation (reemplaza USING true)
--
-- NOTA: Backfill asigna todos los destinos existentes a Lozada porque
-- históricamente cualquier tenant usaba el mismo pool. Tenants futuros
-- arrancarán con su propio destinations table per-tenant.
-- Si un tenant nuevo necesita destinos de seed, copiarlos desde Lozada
-- al onboarding del tenant (futuro feature).

BEGIN;

-- 1. ADD COLUMN
ALTER TABLE destinations
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. Backfill: rows existentes → primer tenant (Lozada). Si hay otros
-- tenants ya creados que estaban viendo el catálogo global, deberán
-- duplicar los destinos relevantes manualmente (proceso post-deploy).
DO $$
DECLARE
  v_lozada_org_id uuid;
BEGIN
  SELECT id INTO v_lozada_org_id
  FROM organizations
  WHERE slug = 'lozada-viajes' OR name ILIKE '%lozada%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_lozada_org_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró org Lozada para backfill de destinations';
  END IF;

  UPDATE destinations
  SET org_id = v_lozada_org_id
  WHERE org_id IS NULL;

  RAISE NOTICE 'destinations backfilled to org_id %', v_lozada_org_id;
END $$;

-- 3. SET NOT NULL + INDEX
ALTER TABLE destinations ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_destinations_org_id ON destinations(org_id);

-- 4. RLS: reemplazar policies USING(true) por tenant_isolation
DROP POLICY IF EXISTS "Destinations are viewable by everyone" ON destinations;
DROP POLICY IF EXISTS "Destinations are insertable by authenticated" ON destinations;
DROP POLICY IF EXISTS "Destinations are updatable by authenticated" ON destinations;
DROP POLICY IF EXISTS "destinations_select" ON destinations;
DROP POLICY IF EXISTS "destinations_insert" ON destinations;
DROP POLICY IF EXISTS "destinations_update" ON destinations;
DROP POLICY IF EXISTS "tenant_isolation" ON destinations;

ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON destinations
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

COMMIT;
