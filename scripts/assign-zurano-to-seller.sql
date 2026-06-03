-- Asignar created_by de Alberto Javier Zurano (DNI 17798216) a la vendedora
-- que originalmente lo creó. Esto la hace visible para ella en su listado de
-- Clientes (sin esperar a que se cree la operación).
--
-- CORRER EN ORDEN:
--   1) Paso A: encontrar el user_id de la vendedora.
--   2) Paso B: encontrar el(los) customer_id(s) de Zurano.
--   3) Paso C: UPDATE asignando created_by.
--   4) Paso D: verificar.
--
-- IMPORTANTE: reemplazar los placeholders <...> por los valores reales.

-- ============================================================
-- PASO A — ENCONTRAR LA VENDEDORA (read-only)
-- ============================================================
-- Reemplazá <ORG_ID> y filtrá por email o por nombre para ubicarla rápido.
SELECT
  u.id AS user_id,
  u.first_name || ' ' || u.last_name AS nombre,
  u.email,
  u.role
FROM users u
WHERE u.org_id = '<ORG_ID>'    -- ← REEMPLAZAR
  AND u.role = 'SELLER'
  AND (
    u.email ILIKE '%<TEXTO>%'       -- ← REEMPLAZAR por fragmento de email
    OR (u.first_name || ' ' || u.last_name) ILIKE '%<TEXTO>%'  -- ← o por nombre
  )
ORDER BY u.first_name;

-- ============================================================
-- PASO B — ENCONTRAR LOS CLIENTES ZURANO (read-only)
-- ============================================================
SELECT
  id,
  first_name || ' ' || last_name AS nombre,
  document_number,
  created_at,
  created_by
FROM customers
WHERE document_number = '17798216'
  AND org_id = '<ORG_ID>'    -- ← REEMPLAZAR
ORDER BY created_at;

-- ============================================================
-- PASO C — ASIGNAR created_by (UPDATE)
-- ============================================================
-- Actualiza AMBOS clientes con el DNI (si todavía no borraste el duplicado).
-- Si ya borraste el duplicado, solo afecta al sobreviviente.
-- Filtros por DNI + org_id para que sea idempotente y multi-tenant seguro.

UPDATE customers
SET
  created_by = '<USER_ID_VENDEDORA>',  -- ← REEMPLAZAR (lo sacaste del Paso A)
  updated_at = NOW()
WHERE document_number = '17798216'
  AND org_id = '<ORG_ID>'              -- ← REEMPLAZAR
RETURNING
  id,
  first_name || ' ' || last_name AS nombre,
  created_by;

-- ============================================================
-- PASO D — VERIFICAR (read-only)
-- ============================================================
-- Confirmá que el(los) cliente(s) ahora tienen created_by seteado.
SELECT
  c.id,
  c.first_name || ' ' || c.last_name AS nombre,
  c.document_number,
  c.created_by,
  u.first_name || ' ' || u.last_name AS created_by_name
FROM customers c
LEFT JOIN users u ON u.id = c.created_by
WHERE c.document_number = '17798216'
  AND c.org_id = '<ORG_ID>'    -- ← REEMPLAZAR
ORDER BY c.created_at;
