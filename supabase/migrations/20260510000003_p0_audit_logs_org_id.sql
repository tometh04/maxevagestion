-- Migración 2026-05-10: audit_logs org_id + RLS tighten
--
-- PROBLEMA (P0):
--   `audit_logs` no tiene org_id. El endpoint /api/audit-logs GET filtra
--   solo por user.role (ADMIN/SUPER_ADMIN), no por org. ADMIN de tenant A
--   ve who-did-what de tenant B.
--
-- FIX:
--   1. ADD COLUMN org_id (nullable porque hay rows históricos sin info)
--   2. Backfill desde user_id → organization_members (un user puede tener
--      múltiples orgs; tomamos la primera por created_at)
--   3. INDEX
--   4. RLS policy: org_id IN user_org_ids() OR (org_id IS NULL AND SUPER_ADMIN)
--      — para audit logs de system actions sin org claro, solo SUPER_ADMIN

BEGIN;

-- 1. ADD COLUMN
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- 2. Backfill desde organization_members (tomar la primera org del user)
UPDATE audit_logs al
SET org_id = sub.org_id
FROM (
  SELECT user_id, MIN(organization_id) AS org_id
  FROM organization_members
  WHERE status = 'active'
  GROUP BY user_id
) sub
WHERE al.user_id = sub.user_id
  AND al.org_id IS NULL;

-- 3. Reportar cuántos quedaron NULL (system actions sin user_id)
DO $$
DECLARE
  v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM audit_logs WHERE org_id IS NULL;
  RAISE NOTICE 'audit_logs con org_id NULL post-backfill: % (system actions sin user)', v_null_count;
END $$;

-- 4. INDEX
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);

-- 5. RLS — drop policies viejas y crear nueva con org_id check
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Borrar policies viejas (role-based sin org filter)
DROP POLICY IF EXISTS "Audit logs viewable by admins" ON audit_logs;
DROP POLICY IF EXISTS "Audit logs viewable by superadmins" ON audit_logs;
DROP POLICY IF EXISTS "Audit logs insertable by anyone authenticated" ON audit_logs;
DROP POLICY IF EXISTS "tenant_isolation" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;

-- SELECT: ver logs de la propia org. SUPER_ADMIN global ve todos (incluido NULL).
CREATE POLICY "audit_logs_select" ON audit_logs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT public.user_org_ids())
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
    )
  );

-- INSERT: cualquier authenticated puede insertar (los endpoints validan
-- qué loguean; el INSERT en sí mismo no debe ser bloqueado).
CREATE POLICY "audit_logs_insert" ON audit_logs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

COMMIT;
