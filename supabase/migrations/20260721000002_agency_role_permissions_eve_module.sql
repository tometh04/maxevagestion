-- Fix: la matriz de permisos por rol (lib/permissions.ts) incluye el modulo "eve",
-- pero el CHECK original de agency_role_permissions (20260521000001) no lo permite.
-- Como el PUT de /api/settings/permissions upsertea TODOS los modulos del rol,
-- cada guardado violaba el CHECK y devolvia 500 ("Error al guardar los permisos"),
-- dejando la pantalla de Gestion de Permisos de Roles inutilizable.

ALTER TABLE agency_role_permissions
  DROP CONSTRAINT IF EXISTS agency_role_permissions_module_check;

ALTER TABLE agency_role_permissions
  ADD CONSTRAINT agency_role_permissions_module_check
  CHECK (module IN (
    'dashboard', 'leads', 'operations', 'customers', 'operators',
    'cash', 'accounting', 'alerts', 'reports', 'commissions',
    'settings', 'documents', 'tasks', 'eve'
  ));
