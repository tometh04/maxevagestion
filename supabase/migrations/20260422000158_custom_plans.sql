-- SaaS Admin Custom Plans — precio custom por org + descuento temporal + features extras.
-- Spec: docs/superpowers/specs/2026-04-22-admin-custom-plans-design.md

CREATE TABLE IF NOT EXISTS custom_plans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  display_name     TEXT NOT NULL,
  base_price_ars   NUMERIC(12,2) NOT NULL CHECK (base_price_ars > 0),
  discount_percent SMALLINT NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  discount_ends_at TIMESTAMPTZ,
  features         JSONB NOT NULL DEFAULT '{"extras": []}'::jsonb,
  limits           JSONB NOT NULL DEFAULT '{}'::jsonb,
  billing_method   TEXT NOT NULL DEFAULT 'MP' CHECK (billing_method IN ('MP', 'MANUAL')),
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS custom_plans_discount_ends_idx
  ON custom_plans (discount_ends_at)
  WHERE discount_percent > 0;

ALTER TABLE custom_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_plans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_plans_tenant_read ON custom_plans;
CREATE POLICY custom_plans_tenant_read ON custom_plans
  FOR SELECT
  USING (org_id IN (SELECT user_org_ids()));

DROP POLICY IF EXISTS custom_plans_admin_all ON custom_plans;
CREATE POLICY custom_plans_admin_all ON custom_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      WHERE pa.user_id = (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1)
    )
  );

-- Reuse the same updated_at trigger function used by organizations. Si no existe
-- globalmente, crearla aquí.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_set_updated_at') THEN
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $body$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $body$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS custom_plans_updated_at ON custom_plans;
CREATE TRIGGER custom_plans_updated_at
  BEFORE UPDATE ON custom_plans
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();
