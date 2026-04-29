-- =====================================================
-- Migración 148: Tenant isolation sobre wa_auth_credentials
-- =====================================================
-- SaaS — gap adicional descubierto al verificar mig 147: `wa_auth_credentials`
-- también existía (33 rows, session credentials por device) y quedó con la
-- misma policy permisiva "admin_only" sin filtrar por org.
--
-- Mismo patrón que las otras 5 tablas wa_*: agregar org_id, backfillear
-- desde wa_devices.org_id via device_id, drop policy permisiva, force RLS
-- y crear tenant_isolation.
--
-- SAFETY: el connector WhatsApp escribe/lee credentials con service_role,
-- que bypassa RLS incluso con FORCE — por eso los números conectados NO se
-- desconectan al aplicar esta migration.

ALTER TABLE wa_auth_credentials
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_auth_credentials ac
SET org_id = d.org_id
FROM wa_devices d
WHERE ac.device_id = d.id AND ac.org_id IS NULL;

UPDATE wa_auth_credentials
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_auth_credentials ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_auth_credentials_org_id ON wa_auth_credentials(org_id);

DROP POLICY IF EXISTS "wa_auth_credentials_admin_only" ON wa_auth_credentials;
ALTER TABLE wa_auth_credentials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_auth_credentials_tenant_isolation" ON wa_auth_credentials;
CREATE POLICY "wa_auth_credentials_tenant_isolation" ON wa_auth_credentials
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON COLUMN wa_auth_credentials.org_id IS
  'SaaS tenant isolation — mig 148 backfilleó desde wa_devices.org_id via device_id.';
