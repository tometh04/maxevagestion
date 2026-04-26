-- =====================================================
-- Migración 165: organizations_with_profile_completion v2
-- =====================================================
-- v1 contaba columnas en organizations (mig 164). v2 cuenta keys
-- en organization_settings — fuente real donde el tenant guarda
-- su perfil desde /settings. internal_notes (admin-only) NO suma.

CREATE OR REPLACE VIEW organizations_with_profile_completion AS
SELECT
  o.*,
  (
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('company_name') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('tax_id', 'company_tax_id') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('legajo', 'company_legajo') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('address', 'company_address') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('phone', 'company_phone') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('email', 'company_email') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('website', 'company_website') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('instagram', 'company_instagram') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END)
  ) AS profile_completion
FROM organizations o;

COMMENT ON VIEW organizations_with_profile_completion IS
  'Wrapper de organizations con profile_completion 0-8 calculado desde organization_settings (donde el tenant guarda su perfil real). Reemplaza la versión de mig 164 que contaba columnas en organizations.';
