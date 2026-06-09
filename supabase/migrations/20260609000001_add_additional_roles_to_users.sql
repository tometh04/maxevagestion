-- Permite asignar múltiples roles a un usuario.
-- El campo `role` sigue siendo el rol primario (backward compat).
-- `additional_roles` almacena los roles adicionales; la capa de aplicación
-- los combina con OR para resolver los permisos efectivos.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS additional_roles text[] NOT NULL DEFAULT '{}';

ALTER TABLE users
  ADD CONSTRAINT users_additional_roles_valid_values
  CHECK (additional_roles <@ ARRAY[
    'SUPER_ADMIN', 'ORG_OWNER', 'ADMIN', 'CONTABLE', 'SELLER', 'VIEWER', 'POST_VENTA'
  ]::text[]);

CREATE INDEX IF NOT EXISTS idx_users_additional_roles
  ON users USING GIN (additional_roles);
