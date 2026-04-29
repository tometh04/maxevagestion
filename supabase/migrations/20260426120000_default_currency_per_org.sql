-- ============================================================================
-- MIGRATION — default_currency per org
-- ============================================================================
-- Para Lozada (y orgs existentes): ARS (compat con todo lo histórico).
-- Nuevos orgs: USD (90% de agencias AR opera en USD).
-- ============================================================================

-- Backfill para orgs existentes que NO tengan ya seteado default_currency
INSERT INTO organization_settings (org_id, key, value, updated_at)
SELECT
  o.id,
  'default_currency',
  CASE WHEN o.slug = 'lozada-viajes' THEN 'ARS' ELSE 'USD' END,
  NOW()
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM organization_settings os
  WHERE os.org_id = o.id
    AND os.key = 'default_currency'
);
