-- =============================================================================
-- VIBOOK — Staging Seed: Test Orgs + Users
-- =============================================================================
-- Purpose : Insert minimal test organizations and users for E2E/smoke testing
--           in the vibook-staging Supabase project.
--
-- Run this AFTER bootstrap-staging.sql has been applied successfully.
--
-- ⚠️  DO NOT run this on production. These are dummy records only.
-- ⚠️  The crm_mode column does NOT exist yet (it's added by Task 1 migration).
--     The VICO org is created with defaults; update crm_mode after Task 1 runs.
--     See the POST-SEED CHECKLIST at the bottom.
--
-- Fixed UUIDs for test references (hard-coded for consistency across runs):
--
--   LOZADA TEST ORG    : a1000000-0000-0000-0000-000000000001
--   VICO TEST ORG      : a2000000-0000-0000-0000-000000000002
--   LOZADA AUTH USER   : b1000000-0000-0000-0000-000000000001   (email: lozada-test@vibook-staging.internal)
--   VICO AUTH USER     : b2000000-0000-0000-0000-000000000002   (email: vico-test@vibook-staging.internal)
--   LOZADA TEST AGENCY : c1000000-0000-0000-0000-000000000001
--   VICO TEST AGENCY   : c2000000-0000-0000-0000-000000000002
--
-- Password for both test users: Test1234!
--
-- Absolute path: /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/staging/seed-staging-orgs.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Auth users (auth.users)
--    Insert directly so we can own orgs without a real sign-up flow.
--    Passwords are bcrypt-hashed value of "Test1234!" via gen_salt('bf').
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  aud,
  role,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin
)
VALUES
  (
    'b1000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'lozada-test@vibook-staging.internal',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated',
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Lozada Test Owner"}'::jsonb,
    false
  ),
  (
    'b2000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'vico-test@vibook-staging.internal',
    crypt('Test1234!', gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated',
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"VICO Test Owner"}'::jsonb,
    false
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Organizations
--    Required columns: id, name, slug, plan, owner_id, created_at, updated_at
--    Optional but sensible: features (defaults to '{}'), subscription_status
-- ---------------------------------------------------------------------------

INSERT INTO organizations (
  id,
  name,
  slug,
  plan,
  owner_id,
  subscription_status,
  has_used_trial,
  max_agencies,
  max_users,
  max_operations_per_month,
  features,
  created_at,
  updated_at
)
VALUES
  -- Lozada-like: enterprise, legacy mode (default until Task 1 migration)
  (
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'Lozada Test',
    'lozada-test',
    'enterprise',
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'active',
    false,
    10,
    20,
    500,
    '{}'::jsonb,
    now(),
    now()
  ),
  -- VICO-like: enterprise, will get crm_mode = 'advanced' after Task 1 migration
  (
    'a2000000-0000-0000-0000-000000000002'::uuid,
    'VICO Test',
    'vico-test',
    'enterprise',
    'b2000000-0000-0000-0000-000000000002'::uuid,
    'active',
    false,
    10,
    20,
    500,
    '{}'::jsonb,
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. App users (public.users)
--    Links auth.users → organizations. org_id is nullable per schema.
-- ---------------------------------------------------------------------------

INSERT INTO users (
  id,
  auth_id,
  name,
  email,
  role,
  org_id,
  is_active,
  created_at,
  updated_at
)
VALUES
  (
    gen_random_uuid(),
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'Lozada Test Owner',
    'lozada-test@vibook-staging.internal',
    'ADMIN',
    'a1000000-0000-0000-0000-000000000001'::uuid,
    true,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'b2000000-0000-0000-0000-000000000002'::uuid,
    'VICO Test Owner',
    'vico-test@vibook-staging.internal',
    'ADMIN',
    'a2000000-0000-0000-0000-000000000002'::uuid,
    true,
    now(),
    now()
  )
ON CONFLICT (auth_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Agencies (one per org — minimum viable for the app to function)
--    Required columns per types.ts: id, name, org_id, city, timezone
-- ---------------------------------------------------------------------------

INSERT INTO agencies (
  id,
  name,
  org_id,
  city,
  timezone
)
VALUES
  (
    'c1000000-0000-0000-0000-000000000001'::uuid,
    'Lozada Test Agency',
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'Rosario',
    'America/Argentina/Buenos_Aires'
  ),
  (
    'c2000000-0000-0000-0000-000000000002'::uuid,
    'VICO Test Agency',
    'a2000000-0000-0000-0000-000000000002'::uuid,
    'Buenos Aires',
    'America/Argentina/Buenos_Aires'
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Organization members (organization_members table)
--    Columns: id, organization_id, user_id, role, status, created_at, updated_at
-- ---------------------------------------------------------------------------

INSERT INTO organization_members (
  id,
  organization_id,
  user_id,
  role,
  status,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  'a1000000-0000-0000-0000-000000000001'::uuid,
  id,
  'owner',
  'ACTIVE',
  now(),
  now()
FROM users
WHERE auth_id = 'b1000000-0000-0000-0000-000000000001'::uuid
ON CONFLICT DO NOTHING;

INSERT INTO organization_members (
  id,
  organization_id,
  user_id,
  role,
  status,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  'a2000000-0000-0000-0000-000000000002'::uuid,
  id,
  'owner',
  'ACTIVE',
  now(),
  now()
FROM users
WHERE auth_id = 'b2000000-0000-0000-0000-000000000002'::uuid
ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- POST-SEED CHECKLIST
-- =============================================================================
-- 1. Verify seed applied correctly:
--
--    SELECT id, name, plan, subscription_status FROM organizations;
--    SELECT email, role, org_id FROM users WHERE email LIKE '%vibook-staging%';
--    SELECT id, name, org_id FROM agencies WHERE id IN (
--      'c1000000-0000-0000-0000-000000000001',
--      'c2000000-0000-0000-0000-000000000002'
--    );
--    SELECT organization_id, role, status FROM organization_members;
--
-- 2. After Task 1 migration (advanced_crm_mode column) runs, set VICO mode:
--
--    UPDATE organizations
--    SET crm_mode = 'advanced'
--    WHERE id = 'a2000000-0000-0000-0000-000000000002';
--
-- 3. To sign in as test users in the staging app:
--    Email: lozada-test@vibook-staging.internal  Password: Test1234!
--    Email: vico-test@vibook-staging.internal    Password: Test1234!
-- =============================================================================
