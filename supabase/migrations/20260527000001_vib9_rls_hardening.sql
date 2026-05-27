-- VIB-9: Hardening RLS — user_org_ids() + operation_legs policy
-- ===========================================================================
--
-- 1. user_org_ids(): agregar DISTINCT + STABLE + revocar grant a anon
--    - DISTINCT: evita duplicados si un user tiene memberships repetidos
--    - STABLE: permite al planner cachear entre rows de la misma query
--    - REVOKE anon: usuario anónimo siempre obtiene empty set; innecesario
--
-- 2. operation_legs policy: la policy legacy "Agency members can manage
--    operation_legs" referenciaba organization_members.agency_id que no
--    existe en esa tabla → condición siempre false. Reemplazar por
--    tenant_isolation estándar via agencies.org_id.
-- ===========================================================================

-- 1. Fix user_org_ids()
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND user_id IS NOT NULL
    AND status = 'ACTIVE'
$$;

REVOKE EXECUTE ON FUNCTION public.user_org_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated;

-- 2. Fix operation_legs policy
DROP POLICY IF EXISTS "Agency members can manage operation legs" ON operation_legs;

CREATE POLICY "tenant_isolation" ON operation_legs
  FOR ALL TO authenticated
  USING (
    agency_id IN (
      SELECT id FROM agencies
      WHERE org_id IN (SELECT public.user_org_ids())
    )
  )
  WITH CHECK (
    agency_id IN (
      SELECT id FROM agencies
      WHERE org_id IN (SELECT public.user_org_ids())
    )
  );
