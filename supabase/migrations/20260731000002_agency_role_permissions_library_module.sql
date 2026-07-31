-- VIB-70 — habilitar el modulo "library" en agency_role_permissions.
--
-- La matriz de permisos (lib/permissions.ts) ahora incluye "library". Como el PUT
-- de /api/settings/permissions upsertea TODOS los modulos del rol, si el CHECK no
-- lo permite el guardado revienta con 500 y deja inutilizable la pantalla de
-- Gestion de Permisos de Roles (mismo problema que tuvo "eve" en 20260721000002).
--
-- De paso se agrega "referrals", que ya existe en el type Module pero nunca se
-- incluyo en el CHECK (bug latente: cualquier guardado de permisos que tocara
-- referrals habria fallado).

ALTER TABLE agency_role_permissions
  DROP CONSTRAINT IF EXISTS agency_role_permissions_module_check;

ALTER TABLE agency_role_permissions
  ADD CONSTRAINT agency_role_permissions_module_check
  CHECK (module IN (
    'dashboard', 'leads', 'operations', 'customers', 'operators',
    'cash', 'accounting', 'alerts', 'reports', 'commissions',
    'settings', 'documents', 'tasks', 'eve', 'referrals', 'library'
  ));
