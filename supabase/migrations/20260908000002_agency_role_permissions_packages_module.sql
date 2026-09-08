-- VIB-183 — habilitar el modulo "packages" en agency_role_permissions.
--
-- La matriz de permisos (lib/permissions.ts) ahora incluye "packages". Como el
-- PUT de /api/settings/permissions upsertea TODOS los modulos del rol, si el
-- CHECK no lo permite el guardado revienta con 500 y deja inutilizable la
-- pantalla de Gestion de Permisos de Roles.
--
-- Ya paso dos veces: con "eve" (20260721000002) y con "library" + "referrals"
-- (20260731000002). Agregar un modulo al type Module SIN tocar este CHECK es un
-- bug latente que solo aparece cuando alguien intenta guardar permisos.

ALTER TABLE agency_role_permissions
  DROP CONSTRAINT IF EXISTS agency_role_permissions_module_check;

ALTER TABLE agency_role_permissions
  ADD CONSTRAINT agency_role_permissions_module_check
  CHECK (module IN (
    'dashboard', 'leads', 'operations', 'customers', 'operators',
    'cash', 'accounting', 'alerts', 'reports', 'commissions',
    'settings', 'documents', 'tasks', 'eve', 'referrals', 'library',
    'packages'
  ));
