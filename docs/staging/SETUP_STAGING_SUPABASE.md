# Vibook — Staging Supabase Setup Runbook

**Audience**: Tomi (solo dev)  
**Branch this was written on**: `feature/vico-callbell`  
**Last updated**: 2026-05-03  
**Status of staging**: NOT YET CREATED — follow steps below

---

## Overview

This runbook sets up a fresh `vibook-staging` Supabase project with the full current schema (all 218 migrations up to `20260429000003_commission_pct_overrides`). Staging will be used to validate the VICO CRM feature (Task 1 + downstream tasks) before touching prod.

**What this runbook covers:**
1. Create the Supabase project
2. Save credentials to `.env.staging`
3. Run the bootstrap SQL in the SQL Editor
4. Verify the schema
5. Seed test orgs

**What this runbook does NOT cover:**
- Task 1 migration (`advanced_crm_mode` column) — applied separately after Task 1 is complete
- Railway staging environment setup — separate concern
- CI/CD — not needed yet

---

## Step 1 — Create the Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and sign in as `tomas.sanchez04@gmail.com`
2. Click **New Project**
3. Fill in:
   - **Organization**: select your existing org (same one as prod)
   - **Name**: `vibook-staging`
   - **Database Password**: generate a strong password and save it to your password manager
   - **Region**: same region as prod (to minimize latency when comparing behavior)
   - **Pricing Plan**: Free tier is fine for staging
4. Click **Create new project** and wait ~2 minutes for it to provision

---

## Step 2 — Save credentials

1. In the new project dashboard, go to **Settings → API**
2. Copy the following values:
   - **Project URL** (`https://<ref>.supabase.co`)
   - **anon public** key
   - **service_role** key (click "Reveal")

3. Copy the example file and fill it in:

```bash
cp /Users/tomiisanchezz/Desktop/Repos/erplozada/.env.staging.example \
   /Users/tomiisanchezz/Desktop/Repos/erplozada/.env.staging
```

4. Open `/Users/tomiisanchezz/Desktop/Repos/erplozada/.env.staging` and replace the placeholders:
   - `NEXT_PUBLIC_SUPABASE_URL` → your staging project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → staging anon key
   - `SUPABASE_SERVICE_ROLE_KEY` → staging service role key
   - `CRON_SECRET` → generate a new one: `openssl rand -hex 32`
   - Review each service (MP, Resend, AFIP, etc.) and decide prod vs sandbox

> `.env.staging` is git-ignored. Never commit it.

---

## Step 3 — Run the bootstrap SQL

The bootstrap SQL is at:

```
/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/staging/bootstrap-staging.sql
```

It contains all 218 migrations concatenated in chronological order, wrapped in `BEGIN; ... COMMIT;` for atomicity.

### How to run it:

1. In the Supabase dashboard for `vibook-staging`, go to **SQL Editor**
2. Open the file `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/staging/bootstrap-staging.sql` in your code editor
3. Copy the entire contents (all ~15k lines)
4. Paste into the SQL Editor and click **Run**

> **Note**: The SQL Editor may time out on very large scripts. If it does, split the file at the `-- ===== MIGRATION NNN =====` markers and run in chunks of ~50 migrations. Each chunk is safe to run because statements use `IF NOT EXISTS` / `CREATE OR REPLACE` / `ON CONFLICT DO NOTHING` patterns.

> **If you get an error**: The transaction rolls back automatically. Read the error message — it will reference a migration number (e.g., `MIGRATION 087`). Fix or skip that block and re-run from that point.

---

## Step 4 — Verify the schema

Run this sanity query in the SQL Editor to confirm the schema applied correctly:

```sql
-- Count of tables (expect ~60-80 tables depending on schema state)
SELECT count(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

-- Presence of key tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name IN (
    'organizations',
    'organization_members',
    'users',
    'agencies',
    'leads',
    'operations',
    'payments',
    'cash_movements',
    'ledger_movements',
    'financial_accounts',
    'commission_records',
    'commission_rules',
    'documents',
    'alerts',
    'invoices',
    'purchase_invoices',
    'quotations',
    'customers',
    'operators',
    'tasks',
    'whatsapp_messages',
    'gastos',
    'billing_events'
  )
ORDER BY table_name;

-- Key columns exist on organizations
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'organizations'
ORDER BY ordinal_position;

-- RLS is enabled on core tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'leads', 'operations', 'payments', 'users')
ORDER BY tablename;
```

**Expected results:**
- All 23 key tables present
- `organizations` has columns: `id`, `name`, `slug`, `plan`, `owner_id`, `subscription_status`, `features`, etc.
- `rowsecurity = true` on `organizations`, `leads`, `operations`, `payments`, `users`
- `crm_mode` column should NOT exist yet (it's added by Task 1)

---

## Step 5 — Seed test organizations

Run the seed file in the SQL Editor:

```
/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/staging/seed-staging-orgs.sql
```

Copy → paste → Run.

### What the seed creates:

| Resource | ID | Details |
|---|---|---|
| Lozada Test org | `a1000000-0000-0000-0000-000000000001` | plan=enterprise, simulates legacy agency |
| VICO Test org | `a2000000-0000-0000-0000-000000000002` | plan=enterprise, will get crm_mode=advanced after Task 1 |
| Lozada test user (auth) | `b1000000-0000-0000-0000-000000000001` | email: `lozada-test@vibook-staging.internal`, password: `Test1234!` |
| VICO test user (auth) | `b2000000-0000-0000-0000-000000000002` | email: `vico-test@vibook-staging.internal`, password: `Test1234!` |
| Lozada test agency | `c1000000-0000-0000-0000-000000000001` | city: Rosario |
| VICO test agency | `c2000000-0000-0000-0000-000000000002` | city: Buenos Aires |

> **Note on VICO's crm_mode**: The `crm_mode` column doesn't exist yet — it's created by the Task 1 migration. After Task 1 runs on staging, set VICO's mode with:
>
> ```sql
> UPDATE organizations
> SET crm_mode = 'advanced'
> WHERE id = 'a2000000-0000-0000-0000-000000000002';
> ```

### Verify the seed:

```sql
SELECT id, name, plan, subscription_status FROM organizations;

SELECT u.email, u.role, u.org_id, o.name AS org_name
FROM users u
LEFT JOIN organizations o ON u.org_id = o.id
WHERE u.email LIKE '%vibook-staging%';

SELECT id, name, org_id FROM agencies
WHERE id IN (
  'c1000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000002'
);

SELECT om.role, om.status, u.email
FROM organization_members om
JOIN users u ON om.user_id = u.id;
```

---

## Step 6 — Connect the staging app (when ready)

When you're ready to point a Railway staging service at this Supabase project:

1. In Railway, create a new service or environment (or just run locally with `.env.staging`)
2. Set env vars from `.env.staging` in Railway's staging environment
3. Start the app — it will use the staging Supabase project automatically

For local testing against staging:
```bash
# From the repo root
cp .env.staging .env.local.staging   # don't overwrite your .env.local
# Then run with the staging env:
DOTENV_CONFIG_PATH=.env.staging npm run dev
```
Or simply swap your `.env.local` temporarily (just remember to swap back).

---

## Reference: Fixed test UUIDs

These UUIDs are stable and used in tests/E2E scripts. Never change them.

```
LOZADA TEST ORG    = a1000000-0000-0000-0000-000000000001
VICO TEST ORG      = a2000000-0000-0000-0000-000000000002
LOZADA AUTH USER   = b1000000-0000-0000-0000-000000000001
VICO AUTH USER     = b2000000-0000-0000-0000-000000000002
LOZADA TEST AGENCY = c1000000-0000-0000-0000-000000000001
VICO TEST AGENCY   = c2000000-0000-0000-0000-000000000002
```

---

## Troubleshooting

**"column X of relation Y does not exist"**  
A migration references a column added by a later migration. Check if the script ran out of order (unlikely — it's sorted) or if there's a known schema drift. Look at which migration number errored and check the surrounding SQL.

**SQL Editor times out**  
Run in chunks. Split at `-- ===== MIGRATION NNN =====` markers. The first 100 migrations is safe to run as one block (~4k lines).

**"permission denied for table auth.users" during seed**  
Make sure you're running in the Supabase SQL Editor (which runs as superuser), not via the anon key. The seed inserts directly into `auth.users` which requires elevated privileges.

**"duplicate key value violates unique constraint"**  
The seed uses `ON CONFLICT DO NOTHING` so re-running is safe. If a specific org/user already exists with the fixed UUID, it will be skipped without error.

**RLS blocking queries in staging**  
The bootstrap applies the same RLS policies as prod. When testing via the app, use JWT tokens for the test users. For raw SQL in the editor, RLS is bypassed (superuser context).
