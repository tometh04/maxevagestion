-- Migración 2026-05-10: seller_objectives + seller_objective_records org_id + RLS
--
-- PROBLEMA (P0):
--   `seller_objectives` (mig 127) NO tiene org_id NI RLS habilitada.
--   El endpoint /api/commissions/objectives lista TODOS los objectives
--   de TODOS los tenants. ADMIN de tenant A ve objectives de tenant B.
--
-- FIX:
--   1. ADD COLUMN org_id en ambas tablas, NULLABLE inicialmente
--   2. Backfill org_id desde agencies.org_id
--   3. SET NOT NULL después del backfill
--   4. CREATE INDEX para performance
--   5. ENABLE RLS + tenant_isolation policy

BEGIN;

-- ============================================================
-- seller_objectives
-- ============================================================

-- 1. ADD COLUMN org_id (nullable inicialmente)
ALTER TABLE seller_objectives
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. Backfill desde agencies (cada agency ya tiene org_id)
UPDATE seller_objectives so
SET org_id = a.org_id
FROM agencies a
WHERE so.agency_id = a.id
  AND so.org_id IS NULL
  AND a.org_id IS NOT NULL;

-- 3. Verificar que no quedan NULL (RAISE si quedan)
DO $$
DECLARE
  v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM seller_objectives WHERE org_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Quedan % seller_objectives con org_id NULL post-backfill. Revisar manualmente.', v_null_count;
  END IF;
END $$;

-- 4. SET NOT NULL + index
ALTER TABLE seller_objectives ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seller_objectives_org_id ON seller_objectives(org_id);

-- 5. RLS
ALTER TABLE seller_objectives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON seller_objectives;
CREATE POLICY "tenant_isolation" ON seller_objectives
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- ============================================================
-- seller_objective_records
-- ============================================================

ALTER TABLE seller_objective_records
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill desde el seller_objective parent
UPDATE seller_objective_records sor
SET org_id = so.org_id
FROM seller_objectives so
WHERE sor.objective_id = so.id
  AND sor.org_id IS NULL;

DO $$
DECLARE
  v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM seller_objective_records WHERE org_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Quedan % seller_objective_records con org_id NULL post-backfill.', v_null_count;
  END IF;
END $$;

ALTER TABLE seller_objective_records ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seller_objective_records_org_id ON seller_objective_records(org_id);

ALTER TABLE seller_objective_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON seller_objective_records;
CREATE POLICY "tenant_isolation" ON seller_objective_records
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

COMMIT;
