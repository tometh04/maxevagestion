-- =====================================================
-- Migración 147: Tenant isolation sobre tablas wa_* (WHA Control)
-- =====================================================
-- SaaS — gap crítico descubierto en prod: `wa_devices`, `wa_chats`,
-- `wa_messages`, `wa_daily_metrics`, `wa_auth_keys` tenían RLS activada
-- pero con policy `wa_*_admin_only` que solo chequea
-- `users.role IN ('ADMIN','SUPER_ADMIN')` — sin filtrar por org. Como LOLO
-- es SUPER_ADMIN, veía todos los 16 dispositivos de Lozada.
--
-- Fix: agregar `org_id` a las 5 tablas (cascadas desde `wa_devices.agency_id`
-- → `agencies.org_id`), drop policies permisivas, instalar tenant_isolation
-- usando `user_org_ids()` (mismo patrón que Pilar 1 y mig 143).
--
-- Dato del audit en prod (2026-04-20):
--   wa_devices      : todos con agency_id → resuelven a Lozada
--   wa_chats/msg/metrics/auth_keys : cascadea vía device_id

-- ========== 1. wa_devices ==========
ALTER TABLE wa_devices
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_devices d
SET org_id = a.org_id
FROM agencies a
WHERE d.agency_id = a.id AND d.org_id IS NULL;

UPDATE wa_devices
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_devices ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_devices_org_id ON wa_devices(org_id);

DROP POLICY IF EXISTS "wa_devices_admin_only" ON wa_devices;
ALTER TABLE wa_devices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_devices_tenant_isolation" ON wa_devices;
CREATE POLICY "wa_devices_tenant_isolation" ON wa_devices
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ========== 2. wa_chats ==========
ALTER TABLE wa_chats
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_chats c
SET org_id = d.org_id
FROM wa_devices d
WHERE c.device_id = d.id AND c.org_id IS NULL;

UPDATE wa_chats
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_chats ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_chats_org_id ON wa_chats(org_id);

DROP POLICY IF EXISTS "wa_chats_admin_only" ON wa_chats;
ALTER TABLE wa_chats FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_chats_tenant_isolation" ON wa_chats;
CREATE POLICY "wa_chats_tenant_isolation" ON wa_chats
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ========== 3. wa_messages ==========
ALTER TABLE wa_messages
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_messages m
SET org_id = d.org_id
FROM wa_devices d
WHERE m.device_id = d.id AND m.org_id IS NULL;

UPDATE wa_messages
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_messages ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_messages_org_id ON wa_messages(org_id);

DROP POLICY IF EXISTS "wa_messages_admin_only" ON wa_messages;
ALTER TABLE wa_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_messages_tenant_isolation" ON wa_messages;
CREATE POLICY "wa_messages_tenant_isolation" ON wa_messages
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ========== 4. wa_daily_metrics ==========
ALTER TABLE wa_daily_metrics
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_daily_metrics dm
SET org_id = d.org_id
FROM wa_devices d
WHERE dm.device_id = d.id AND dm.org_id IS NULL;

UPDATE wa_daily_metrics
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_daily_metrics ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_daily_metrics_org_id ON wa_daily_metrics(org_id);

DROP POLICY IF EXISTS "wa_daily_metrics_admin_only" ON wa_daily_metrics;
ALTER TABLE wa_daily_metrics FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_daily_metrics_tenant_isolation" ON wa_daily_metrics;
CREATE POLICY "wa_daily_metrics_tenant_isolation" ON wa_daily_metrics
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ========== 5. wa_auth_keys ==========
ALTER TABLE wa_auth_keys
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_auth_keys ak
SET org_id = d.org_id
FROM wa_devices d
WHERE ak.device_id = d.id AND ak.org_id IS NULL;

UPDATE wa_auth_keys
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_auth_keys ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_auth_keys_org_id ON wa_auth_keys(org_id);

DROP POLICY IF EXISTS "wa_auth_keys_admin_only" ON wa_auth_keys;
ALTER TABLE wa_auth_keys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_auth_keys_tenant_isolation" ON wa_auth_keys;
CREATE POLICY "wa_auth_keys_tenant_isolation" ON wa_auth_keys
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON COLUMN wa_devices.org_id IS 'SaaS tenant isolation — mig 147 backfilleó desde agencies.org_id.';
