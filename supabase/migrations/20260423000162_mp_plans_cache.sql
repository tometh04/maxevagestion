-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260423000162_mp_plans_cache.sql

-- mp_plans: caché de preapproval_plan IDs de MP para reusar entre tenants.
-- No contiene data sensible — solo IDs y metadata del plan template.
CREATE TABLE IF NOT EXISTS mp_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Key lógica: "PRO_STANDARD" | "STARTER_STANDARD" | "CUSTOM_<org_slug>_<amount>"
  plan_key text NOT NULL UNIQUE,
  -- El ID que devolvió MP al crear el plan
  mp_preapproval_plan_id text NOT NULL UNIQUE,
  -- Monto ARS/mes del plan
  amount_ars numeric NOT NULL,
  -- Si el plan tiene 7d free trial
  include_free_trial boolean NOT NULL DEFAULT true,
  -- init_point cacheado (MP no cambia, pero re-fetch via fetchPreapprovalPlan si dudás)
  init_point text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mp_plans_plan_key_idx ON mp_plans (plan_key);

-- RLS: solo platform_admins leen/escriben. Los tenants NO necesitan acceso.
ALTER TABLE mp_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mp_plans_admin_read ON mp_plans;
CREATE POLICY mp_plans_admin_read ON mp_plans FOR SELECT
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = (
    SELECT id FROM users WHERE auth_id = auth.uid()
  )));

DROP POLICY IF EXISTS mp_plans_admin_write ON mp_plans;
CREATE POLICY mp_plans_admin_write ON mp_plans FOR ALL
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = (
    SELECT id FROM users WHERE auth_id = auth.uid()
  )));

-- service_role bypassea RLS (para crear plans desde endpoints server-side).

COMMENT ON TABLE mp_plans IS 'Cache de preapproval_plan IDs de MercadoPago. 1 plan template reusable por múltiples tenants (ej PRO_STANDARD). Creado on-demand por ensureMpPlan().';
