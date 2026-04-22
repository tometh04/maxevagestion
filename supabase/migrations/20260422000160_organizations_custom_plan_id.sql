-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260422000160_organizations_custom_plan_id.sql

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS custom_plan_id UUID REFERENCES custom_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organizations_custom_plan_id_idx
  ON organizations (custom_plan_id)
  WHERE custom_plan_id IS NOT NULL;
