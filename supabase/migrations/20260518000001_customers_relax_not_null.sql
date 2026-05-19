-- Migración 2026-05-18: relajar NOT NULL en customers para soportar imports
-- con clientes sin teléfono/email/nombre/apellido.
--
-- PROBLEMA:
--   Andrés de VICO reportó al importar CSV de 688 clientes que muchos
--   fallaban con "El campo 'phone' es requerido". Tomi: "no me dejes nada
--   como campo requerido a la hora de importar".
--
--   El fix de código (lib/import/schemas/customers.ts +
--   lib/import/pipelines/customers.ts) saca todos los REQUIRED del lado
--   aplicación, pero la DB todavía tiene NOT NULL en estas columnas según
--   migration 001_initial_schema.sql. Sin esta migration, el insert al
--   pasar null seguiría rompiendo en Postgres con un mensaje peor.
--
-- DECISIÓN:
--   Relajar TODOS los NOT NULL históricamente conservados sin uso real:
--     - first_name
--     - last_name
--     - phone
--     - email
--
--   Quedan NOT NULL: id, agency_id, org_id (multi-tenant), created_at.
--   Esos sí son críticos.
--
--   El código aplicación garantiza que cada fila importada tenga AL MENOS
--   un identificador (nombre, apellido, email, phone o documento), así que
--   no se importan filas vacías.

BEGIN;

ALTER TABLE customers ALTER COLUMN first_name DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN last_name  DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN phone      DROP NOT NULL;
ALTER TABLE customers ALTER COLUMN email      DROP NOT NULL;

COMMIT;

-- Smoke: verificar que ahora son nullable
SELECT
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'customers'
  AND column_name IN ('first_name', 'last_name', 'phone', 'email')
ORDER BY column_name;
