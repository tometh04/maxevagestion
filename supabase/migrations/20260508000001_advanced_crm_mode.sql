-- ============================================================================
-- MIGRATION — Advanced CRM mode (VICO Callbell integration)
-- Fecha: 2026-05-08
-- ============================================================================
-- Habilita modo CRM avanzado por tenant: tags multi-categoría + funnels custom.
-- Lozada queda en 'legacy' (default), VICO se setea en 'advanced' por seed
-- en una task posterior.
--
-- Impact:
-- - Tabla organizations: columna nueva crm_mode (default 'legacy', no rompe queries existentes)
-- - 5 tablas nuevas con RLS por org_id
-- - Columna nueva leads.funnel_id (nullable, NULL para legacy)
-- - webhook_event_log para idempotencia + auditoría
-- - last_callbell_sync_at en organizations para cron de reconciliación
--
-- 100% additive: cero UPDATE, cero DROP, cero ALTER destructivo sobre data existente.
-- ============================================================================

-- 1. Columna crm_mode en organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS crm_mode TEXT NOT NULL DEFAULT 'legacy'
  CHECK (crm_mode IN ('legacy', 'advanced'));

COMMENT ON COLUMN organizations.crm_mode IS
  'legacy = status enum + region/destination (Lozada). advanced = funnels y tags desde lead_funnels/lead_tag_* (VICO+). Per-tenant CRM model.';

-- 2. last_callbell_sync_at en organizations (para el cron de reconciliación)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS last_callbell_sync_at TIMESTAMPTZ;

COMMENT ON COLUMN organizations.last_callbell_sync_at IS
  'Timestamp del último cron de reconciliación con Callbell. NULL si nunca corrió.';

-- 3. Tabla lead_tag_categories
CREATE TABLE IF NOT EXISTS lead_tag_categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT NOT NULL,
  cardinality     TEXT NOT NULL CHECK (cardinality IN ('one', 'many')),
  display_order   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_lead_tag_categories_org ON lead_tag_categories(org_id);

ALTER TABLE lead_tag_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON lead_tag_categories;
CREATE POLICY tenant_isolation ON lead_tag_categories
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- 4. Tabla lead_tags
CREATE TABLE IF NOT EXISTS lead_tags (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id         UUID NOT NULL REFERENCES lead_tag_categories(id) ON DELETE CASCADE,
  label               TEXT NOT NULL,
  color_override      TEXT,
  display_order       INT NOT NULL DEFAULT 0,
  callbell_tag_uuid   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, label)
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_org ON lead_tags(org_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_category ON lead_tags(category_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_callbell_uuid ON lead_tags(callbell_tag_uuid)
  WHERE callbell_tag_uuid IS NOT NULL;

ALTER TABLE lead_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON lead_tags;
CREATE POLICY tenant_isolation ON lead_tags
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- 5. Tabla lead_tag_assignments
CREATE TABLE IF NOT EXISTS lead_tag_assignments (
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id          UUID NOT NULL REFERENCES lead_tags(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by     UUID REFERENCES users(id),
  PRIMARY KEY (lead_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_lead ON lead_tag_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_org ON lead_tag_assignments(org_id);

ALTER TABLE lead_tag_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON lead_tag_assignments;
CREATE POLICY tenant_isolation ON lead_tag_assignments
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- 6. Tabla lead_funnels
CREATE TABLE IF NOT EXISTS lead_funnels (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  display_order           INT NOT NULL,
  color                   TEXT,
  is_terminal             BOOLEAN NOT NULL DEFAULT FALSE,
  is_default_new          BOOLEAN NOT NULL DEFAULT FALSE,
  callbell_funnel_uuid    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_lead_funnels_org ON lead_funnels(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_funnels_one_default
  ON lead_funnels(org_id) WHERE is_default_new = TRUE;

ALTER TABLE lead_funnels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON lead_funnels;
CREATE POLICY tenant_isolation ON lead_funnels
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- 7. Columna funnel_id en leads (nullable, solo se llena en advanced mode)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES lead_funnels(id);
CREATE INDEX IF NOT EXISTS idx_leads_funnel ON leads(funnel_id) WHERE funnel_id IS NOT NULL;

-- 8. Tabla webhook_event_log (idempotencia + auditoría)
CREATE TABLE IF NOT EXISTS webhook_event_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration     TEXT NOT NULL,
  event_id        TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result          TEXT NOT NULL CHECK (result IN ('ok', 'error', 'duplicate', 'ignored')),
  error_detail    TEXT,
  UNIQUE (org_id, integration, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_log_org_integration
  ON webhook_event_log(org_id, integration);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_processed_at
  ON webhook_event_log(processed_at);

ALTER TABLE webhook_event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON webhook_event_log;
CREATE POLICY tenant_isolation ON webhook_event_log
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- 9. Triggers updated_at (la función trigger_set_updated_at() ya existe globalmente)
DROP TRIGGER IF EXISTS set_updated_at_lead_tag_categories ON lead_tag_categories;
CREATE TRIGGER set_updated_at_lead_tag_categories
  BEFORE UPDATE ON lead_tag_categories
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_lead_tags ON lead_tags;
CREATE TRIGGER set_updated_at_lead_tags
  BEFORE UPDATE ON lead_tags
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_lead_funnels ON lead_funnels;
CREATE TRIGGER set_updated_at_lead_funnels
  BEFORE UPDATE ON lead_funnels
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================================
-- VERIFICACIÓN POST-MIGRATION (correr después y mostrar resultado)
-- ============================================================================
-- Counts de Lozada deben ser idénticos al baseline (docs/staging/lozada-baseline.json):
--   3054 leads, 816 operations, 687 customers, 2960 payments, 5449 ledger_movements
--
-- Verificar aplicación de la migration:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'organizations' AND column_name IN ('crm_mode', 'last_callbell_sync_at');
--   -- Expected: 2 rows
--
--   SELECT crm_mode, COUNT(*) FROM organizations GROUP BY 1;
--   -- Expected: legacy = 22 (todas las orgs incluyendo Lozada)
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('lead_tag_categories','lead_tags','lead_tag_assignments','lead_funnels','webhook_event_log');
--   -- Expected: 5 rows
--
--   SELECT COUNT(*) FROM leads WHERE funnel_id IS NOT NULL;
--   -- Expected: 0
-- ============================================================================
