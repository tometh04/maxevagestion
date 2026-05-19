-- Migración: Agregar rol POST_VENTA
--
-- POST_VENTA: rol de seguimiento post-cierre. Puede ver TODAS las operaciones
-- (de todos los vendedores), cargar vouchers enviados, check-in realizado,
-- y consultar/gestionar requisitos de destino.
-- Sin acceso a leads, caja, contabilidad ni comisiones.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'SUPER_ADMIN',
    'ORG_OWNER',
    'ADMIN',
    'CONTABLE',
    'SELLER',
    'VIEWER',
    'POST_VENTA'
  ));

COMMENT ON COLUMN users.role IS
  'Rol dentro del tenant.
   SUPER_ADMIN / ORG_OWNER = dueño/admin total.
   ADMIN = gestión completa sin delete.
   CONTABLE = solo módulos financieros.
   SELLER = solo sus propios datos.
   VIEWER = solo lectura.
   POST_VENTA = seguimiento post-venta (ve todas las operaciones, carga vouchers/check-in).';
