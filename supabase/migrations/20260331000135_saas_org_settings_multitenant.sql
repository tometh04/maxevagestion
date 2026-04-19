-- ============================================================================
-- MIGRATION 135 — Multi-tenant: organization_settings
-- ============================================================================
-- Bug: la tabla organization_settings tiene PK/unique en "key" (global),
-- entonces brand_logo / company_name / etc. son compartidos entre todas las
-- orgs. Un tenant nuevo ve el logo y nombre de Lozada.
--
-- Fix: agregar org_id, mover unique a (org_id, key), duplicar los rows
-- existentes por org (solo Lozada hoy), actualizar handler para filtrar
-- por user.org_id y upsertear con (org_id, key).
-- ============================================================================

-- 1. Agregar org_id
ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. Backfill: todas las rows existentes pertenecen a Lozada
UPDATE organization_settings
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

-- 3. Drop unique constraint sobre "key" y crear (org_id, key)
--    El constraint podria llamarse "organization_settings_key_key" o similar.
--    Intentamos ambos nombres comunes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_settings_key_key') THEN
    ALTER TABLE organization_settings DROP CONSTRAINT organization_settings_key_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_settings_key_unique') THEN
    ALTER TABLE organization_settings DROP CONSTRAINT organization_settings_key_unique;
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

DROP INDEX IF EXISTS organization_settings_key_key;
DROP INDEX IF EXISTS organization_settings_key_unique_idx;

-- 4. Nuevo unique constraint por (org_id, key)
ALTER TABLE organization_settings
  ADD CONSTRAINT organization_settings_org_id_key_unique UNIQUE (org_id, key);

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_organization_settings_org_id ON organization_settings(org_id);
