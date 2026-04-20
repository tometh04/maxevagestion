-- ============================================================================
-- MIGRATION 140 — RLS en agencies + tablas auxiliares
-- ============================================================================
-- Pilar 1 del spec: cerrar el ultimo 15% de aislamiento DB.
-- Agencies tenia RLS via policies de mig 132 pero posiblemente no enforced.
-- user_agencies idem.
-- ============================================================================

-- 1. agencies: force RLS + limpiar policies viejas + tenant_isolation
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agencies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON agencies', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "tenant_isolation" ON agencies
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- 2. user_agencies: RLS por la agency_id (que infiere org)
ALTER TABLE user_agencies ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_agencies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON user_agencies', r.policyname);
  END LOOP;
END $$;

-- user_agencies no tiene org_id directo, pero agency_id → agencies.org_id.
-- Como agencies ya esta scoped por RLS, basta con chequear que el user
-- pueda ver esa agency (= la agency esta en su org).
CREATE POLICY "tenant_isolation" ON user_agencies
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    agency_id IN (
      SELECT id FROM agencies WHERE org_id IN (SELECT public.user_org_ids())
    )
  )
  WITH CHECK (
    agency_id IN (
      SELECT id FROM agencies WHERE org_id IN (SELECT public.user_org_ids())
    )
  );

-- 3. users: RLS por org_id
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON users', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "tenant_isolation" ON users
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (SELECT public.user_org_ids())
    OR auth_id = auth.uid()
  )
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    OR auth_id = auth.uid()
  );

-- Razon: auth_id = auth.uid() permite que un user vea su propio row
-- incluso si user.org_id is NULL (caso edge de register en progreso).

-- 4. organization_invitations: solo ver invites de tu org
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organization_invitations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON organization_invitations', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "tenant_isolation" ON organization_invitations
  AS PERMISSIVE FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.user_org_ids()));
