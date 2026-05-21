-- Tabla de permisos configurables por agencia y rol
-- Cuando no existe registro para una combinación (agency_id, role, module),
-- la aplicación usa los defaults estáticos definidos en lib/permissions.ts.
-- SUPER_ADMIN y ORG_OWNER no tienen registros aquí: siempre tienen full access hardcoded.

CREATE TABLE IF NOT EXISTS agency_role_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agency_id     UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('ADMIN', 'CONTABLE', 'SELLER', 'VIEWER', 'POST_VENTA')),
  module        TEXT NOT NULL CHECK (module IN (
    'dashboard', 'leads', 'operations', 'customers', 'operators',
    'cash', 'accounting', 'alerts', 'reports', 'commissions',
    'settings', 'documents', 'tasks'
  )),
  can_read      BOOLEAN NOT NULL DEFAULT false,
  can_write     BOOLEAN NOT NULL DEFAULT false,
  can_delete    BOOLEAN NOT NULL DEFAULT false,
  can_export    BOOLEAN NOT NULL DEFAULT false,
  own_data_only BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, role, module)
);

-- Índice para búsquedas frecuentes (resolución de permisos por agencia+rol)
CREATE INDEX idx_agency_role_permissions_lookup
  ON agency_role_permissions (agency_id, role);

-- Índice por org_id para las políticas RLS
CREATE INDEX idx_agency_role_permissions_org
  ON agency_role_permissions (org_id);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_agency_role_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agency_role_permissions_updated_at
  BEFORE UPDATE ON agency_role_permissions
  FOR EACH ROW EXECUTE FUNCTION update_agency_role_permissions_updated_at();

-- RLS
ALTER TABLE agency_role_permissions ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier miembro de la org puede leer los permisos de su org
-- (necesario para que el sistema resuelva permisos en runtime)
CREATE POLICY "org_members_can_read_permissions"
  ON agency_role_permissions
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid() AND org_id IS NOT NULL
    )
  );

-- INSERT / UPDATE / DELETE: solo ADMIN, SUPER_ADMIN y ORG_OWNER de la misma org
CREATE POLICY "admins_can_manage_permissions"
  ON agency_role_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_id = auth.uid()
        AND org_id = agency_role_permissions.org_id
        AND role IN ('SUPER_ADMIN', 'ORG_OWNER', 'ADMIN')
        AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_id = auth.uid()
        AND org_id = agency_role_permissions.org_id
        AND role IN ('SUPER_ADMIN', 'ORG_OWNER', 'ADMIN')
        AND is_active = true
    )
  );
