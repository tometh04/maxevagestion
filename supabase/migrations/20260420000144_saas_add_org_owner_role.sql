-- =====================================================
-- Migración 144: Agregar ORG_OWNER a users.role (Pilar 4)
-- =====================================================
-- SaaS Pilar 4 — rol canónico para owners en el modelo SaaS.
--
-- Antes: users.role CHECK era ('SUPER_ADMIN', 'ADMIN', 'CONTABLE', 'SELLER', 'VIEWER').
-- SUPER_ADMIN mezclaba dos conceptos: dueño de tenant y platform admin.
--
-- Ahora: agregamos ORG_OWNER como rol del dueño de tenant. El código lo
-- trata como alias de SUPER_ADMIN (mismo PERMISSIONS matrix), así que:
--   - Ningún user existente cambia de rol.
--   - Maxi sigue como SUPER_ADMIN — efecto práctico idéntico a ORG_OWNER
--     ahora que RLS tenant_isolation (Pilar 1) lo acota a Lozada.
--   - Nuevos tenants al registrarse usan ORG_OWNER.
--   - PLATFORM_ADMIN (Tomi) vive en `platform_admins` (mig 142), separado.
--
-- Migración futura (post-estabilización): renombrar Maxi a ORG_OWNER y
-- eventualmente sacar SUPER_ADMIN del CHECK.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('SUPER_ADMIN', 'ORG_OWNER', 'ADMIN', 'CONTABLE', 'SELLER', 'VIEWER'));

COMMENT ON COLUMN users.role IS
  'Rol dentro del tenant (SaaS). ORG_OWNER = dueño del tenant (canónico). SUPER_ADMIN = alias legacy con mismos permisos. PLATFORM_ADMIN vive aparte en platform_admins.';
