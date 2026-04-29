-- =====================================================
-- Migración 145: Tabla security_audit_log (Pilar 8)
-- =====================================================
-- SaaS Pilar 8 — registro de eventos de seguridad relevantes para detectar
-- incidentes de aislamiento, acciones sospechosas o fire drills.
--
-- Dos fuentes principales:
--   1. Middleware: detecta cross-org query results inesperados (results
--      con org_id != user.org_id).
--   2. Routes críticos: registran acciones sensibles (delete lead, cambio
--      de rol, impersonación via platform admin).
--
-- La tabla NO es per-tenant: es global de plataforma. Solo platform_admins
-- pueden leerla. Los inserts vienen con service_role desde código confiable.

CREATE TABLE IF NOT EXISTS security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARN', 'ERROR', 'CRITICAL')),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_auth_id UUID,
  actor_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  target_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  target_entity TEXT,
  target_entity_id TEXT,
  request_ip TEXT,
  request_path TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_type ON security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_actor_org ON security_audit_log(actor_org_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at ON security_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_severity ON security_audit_log(severity) WHERE severity IN ('ERROR', 'CRITICAL');

ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log FORCE ROW LEVEL SECURITY;

-- Solo platform admins leen. Inserts/updates/deletes: solo service_role
-- (que bypassea RLS y forced RLS — requiere POSTGRES). No hay policy de
-- write: bloqueo total para authenticated, sin policy.
DROP POLICY IF EXISTS "security_audit_log_platform_admin_read" ON security_audit_log;
CREATE POLICY "security_audit_log_platform_admin_read" ON security_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

COMMENT ON TABLE security_audit_log IS
  'SaaS — registro global de eventos de seguridad (cross-org detection, acciones sensibles, impersonación). Solo platform_admins pueden leer; writes via service_role.';
