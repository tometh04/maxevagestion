-- ============================================================================
-- MIGRATION — org_integrations (credentials por org, separada de la tabla legacy
--   integration_webhooks de migration 074 que es un event log con otro propósito)
-- Fecha: 2026-05-08
-- ============================================================================
-- Tabla nueva. RLS por org_id. Cero impacto sobre integrations/integration_webhooks/
-- integration_logs de migration 074 — son tablas distintas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_integrations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration     TEXT NOT NULL CHECK (integration IN (
    'manychat', 'callbell-in', 'callbell-out'
  )),
  webhook_token   TEXT NOT NULL UNIQUE,
  webhook_secret  TEXT NOT NULL,                              -- encriptado AES-256-GCM
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, integration)
);

CREATE INDEX IF NOT EXISTS idx_org_integrations_org ON org_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_integrations_token ON org_integrations(webhook_token);

ALTER TABLE org_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON org_integrations;
CREATE POLICY tenant_isolation ON org_integrations
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

DROP TRIGGER IF EXISTS set_updated_at_org_integrations ON org_integrations;
CREATE TRIGGER set_updated_at_org_integrations
  BEFORE UPDATE ON org_integrations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE org_integrations IS
  'Credenciales y config de integraciones (ManyChat, Callbell) por org. Diferente de la legacy integration_webhooks (mig 074) que es un event log. Per-tenant credential store con RLS.';
