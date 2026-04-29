-- =====================================================
-- Migración 142: Tabla platform_admins (Pilar 4)
-- =====================================================
-- SaaS Pilar 4 — separación de PLATFORM_ADMIN del modelo de roles por-tenant.
--
-- Antes: `users.role = 'SUPER_ADMIN'` era simultáneamente "acceso total dentro
-- de la org" y "acceso cross-org de plataforma". Con multi-tenant eso se
-- rompe: Maxi es SUPER_ADMIN de Lozada pero NO debe ver otras orgs.
--
-- Ahora: SUPER_ADMIN/ADMIN/CONTABLE/SELLER/VIEWER siguen viviendo dentro de
-- cada tenant (RLS tenant_isolation los acota a su org). PLATFORM_ADMIN vive
-- en esta tabla dedicada — el único rol que puede cruzar orgs (impersonación,
-- admin console, métricas de plataforma).
--
-- Esta migración NO renombra `users.role` para Maxi — ese refactor requiere
-- actualizar el CHECK constraint + todas las comparaciones de role en código
-- y queda para post-launch.

CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_user_id ON platform_admins(user_id);

-- RLS: solo los propios platform admins pueden ver la tabla. El resto, nada.
-- Las mutaciones se hacen con service_role (vía SQL Editor o admin tooling),
-- nunca desde código de app.
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_self_view" ON platform_admins;
CREATE POLICY "platform_admins_self_view" ON platform_admins
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa2
      INNER JOIN users u ON u.id = pa2.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

COMMENT ON TABLE platform_admins IS
  'SaaS — usuarios con privilegios de plataforma (cross-org). Separado de users.role que es por-tenant.';

-- Insertar Tomi como primer platform admin (por email, no por id hardcoded).
INSERT INTO platform_admins (user_id, notes)
SELECT id, 'Platform engineering — seed inicial (Pilar 4)'
FROM users
WHERE email = 'tomas.sanchez04@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
