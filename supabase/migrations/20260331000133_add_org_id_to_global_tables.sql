-- ============================================================================
-- FASE 1.5 SaaS: Agregar org_id a tablas globales restantes
-- ============================================================================
-- Plan .claude/saas-conversion-plan.md secciones 1.2 y 4.3 marcaban estas
-- tablas como "necesita org_id directo" porque no son inferibles via agency
-- (muchas rows tienen agency_id NULL).
--
-- Tablas afectadas:
--   - financial_accounts: 66 rows, 50 con agency_id NULL (cuentas globales)
--   - pdf_templates: 0 rows en prod, igual agregamos columna para futuro
--   - message_templates: 7 rows, todos con agency_id NULL
--
-- Backfill strategy:
--   - Si row tiene agency_id: org_id = agencies.org_id
--   - Si row NO tiene agency_id: org_id = default org "Lozada Viajes"
--
-- Single-org safety: con solo Lozada activa, todo apunta a 1b326d20-...
-- ============================================================================

-- ============================================================================
-- 1. ADD COLUMN (nullable al principio para poder backfillear)
-- ============================================================================

ALTER TABLE financial_accounts ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE pdf_templates       ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE message_templates   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- ============================================================================
-- 2. BACKFILL
-- ============================================================================

DO $$
DECLARE
  v_default_org_id UUID;
BEGIN
  -- Default org (Lozada Viajes)
  SELECT id INTO v_default_org_id
  FROM organizations
  WHERE slug = 'lozada-viajes'
  LIMIT 1;

  IF v_default_org_id IS NULL THEN
    RAISE EXCEPTION 'Default org lozada-viajes not found. Run migration 132 first.';
  END IF;

  -- 2.1 financial_accounts: si tiene agency, copiar de agencies.org_id; sino, default
  UPDATE financial_accounts fa
  SET org_id = a.org_id
  FROM agencies a
  WHERE fa.agency_id = a.id
    AND fa.org_id IS NULL;

  UPDATE financial_accounts
  SET org_id = v_default_org_id
  WHERE org_id IS NULL;

  -- 2.2 pdf_templates (tabla vacia hoy, pero por las dudas)
  UPDATE pdf_templates pt
  SET org_id = a.org_id
  FROM agencies a
  WHERE pt.agency_id = a.id
    AND pt.org_id IS NULL;

  UPDATE pdf_templates
  SET org_id = v_default_org_id
  WHERE org_id IS NULL;

  -- 2.3 message_templates
  UPDATE message_templates mt
  SET org_id = a.org_id
  FROM agencies a
  WHERE mt.agency_id = a.id
    AND mt.org_id IS NULL;

  UPDATE message_templates
  SET org_id = v_default_org_id
  WHERE org_id IS NULL;

  RAISE NOTICE 'Backfill org_id complete for financial_accounts, pdf_templates, message_templates';
END $$;

-- ============================================================================
-- 3. NOT NULL constraints
-- ============================================================================

ALTER TABLE financial_accounts ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE pdf_templates       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE message_templates   ALTER COLUMN org_id SET NOT NULL;

-- ============================================================================
-- 4. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_financial_accounts_org_id ON financial_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_org_id       ON pdf_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_org_id   ON message_templates(org_id);

-- ============================================================================
-- DONE
-- ============================================================================
