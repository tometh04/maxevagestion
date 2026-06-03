-- Migración 2026-06-03: agregar customers.created_by
--
-- PROBLEMA:
--   Una agencia reportó que una vendedora (rol SELLER) creó un cliente y no
--   lo veía en su listado de Clientes. El owner (ADMIN) sí lo veía. Resultado:
--   la vendedora reintentó y dejó dos clientes duplicados.
--
-- CAUSA:
--   El filtro de SELLER en lib/permissions-api.ts:applyCustomersFilters() solo
--   incluye clientes vinculados a operaciones del vendedor vía
--   operation_customers. Como un cliente recién creado todavía no tiene
--   operación asociada, queda invisible para quien lo creó.
--
--   La tabla customers no tenía forma de saber quién la creó, así que no
--   había manera de incluir "los clientes que ella creó" en el filtro.
--
-- FIX:
--   - Agregar customers.created_by (FK opcional a users).
--   - Setearlo en el POST de /api/customers.
--   - En applyCustomersFilters, para SELLER incluir también los customers
--     donde created_by = user.id (además de los vinculados a sus operaciones).
--
--   created_by es NULLABLE porque:
--     - clientes históricos (pre-migración) no tienen referencia
--     - clientes creados por webhooks/imports pueden no tener user
--     - ON DELETE SET NULL para no perder el cliente si se borra el user

BEGIN;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by);

COMMIT;

-- Smoke: verificar que la columna existe
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'customers' AND column_name = 'created_by';
