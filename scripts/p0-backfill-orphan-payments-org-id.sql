-- =============================================================
-- BACKFILL — payments.org_id NULL (P0)
-- =============================================================
-- Corre DESPUÉS de las migrations 20260510000001-005.
--
-- CONTEXTO:
--   331 payments tienen org_id NULL. Tras el fix de RLS payments
--   (mig 001), esos rows quedan INVISIBLES a todos los tenants.
--   Este script los recupera inferiendo el org correcto desde la
--   FK más confiable (operation_id → operations.org_id).
--
-- ESTRATEGIA DE INFERENCIA (en orden):
--   1. operation_id → operations.org_id (preferido, 90% de los casos)
--   2. customer_id → buscar primera operation con ese customer →
--      operation.org_id
--   3. operator_id + agency_id → agencies.org_id
--   4. Si nada funciona → queda NULL, requiere intervención manual
--
-- SEGURIDAD: NO mezcla tenants. Cada payment se asigna a su org
-- correcto según la FK más confiable disponible.
-- =============================================================

-- DRY RUN PRIMERO — correr este SELECT y revisar números antes
-- de tirar el UPDATE.

-- ============================================================
-- 1. DIAGNÓSTICO
-- ============================================================

SELECT
  CASE
    WHEN p.operation_id IS NOT NULL AND o.org_id IS NOT NULL
      THEN '1. via operation_id'
    WHEN p.customer_id IS NOT NULL AND cust_op.org_id IS NOT NULL
      THEN '2. via customer_id → operation'
    WHEN p.operator_id IS NOT NULL AND p.agency_id IS NOT NULL AND ag.org_id IS NOT NULL
      THEN '3. via agency_id'
    ELSE '4. SIN MATCH (manual)'
  END AS strategy,
  COUNT(*) AS rows,
  ROUND(SUM(p.amount)::numeric, 2) AS total_amount
FROM payments p
LEFT JOIN operations o ON o.id = p.operation_id
LEFT JOIN agencies ag ON ag.id = p.agency_id
LEFT JOIN LATERAL (
  SELECT op.org_id
  FROM operations op
  JOIN operation_customers oc ON oc.operation_id = op.id
  WHERE oc.customer_id = p.customer_id
    AND op.org_id IS NOT NULL
  ORDER BY op.created_at DESC
  LIMIT 1
) cust_op ON true
WHERE p.org_id IS NULL
GROUP BY strategy
ORDER BY strategy;

-- ============================================================
-- 2. BACKFILL ATÓMICO (correr SOLO si diagnóstico ok)
-- ============================================================
-- Comentado por seguridad. Revisar diagnóstico primero, descomentar
-- y correr.
/*

BEGIN;

-- Estrategia 1: via operation_id (preferido)
WITH updated AS (
  UPDATE payments p
  SET org_id = o.org_id, updated_at = NOW()
  FROM operations o
  WHERE p.operation_id = o.id
    AND p.org_id IS NULL
    AND o.org_id IS NOT NULL
  RETURNING p.id
)
SELECT '1. via operation_id' AS step, COUNT(*) AS updated FROM updated;

-- Estrategia 2: via customer_id → first operation with that customer
WITH cust_resolver AS (
  SELECT DISTINCT ON (oc.customer_id) oc.customer_id, op.org_id
  FROM operations op
  JOIN operation_customers oc ON oc.operation_id = op.id
  WHERE op.org_id IS NOT NULL
  ORDER BY oc.customer_id, op.created_at DESC
),
updated AS (
  UPDATE payments p
  SET org_id = cr.org_id, updated_at = NOW()
  FROM cust_resolver cr
  WHERE p.customer_id = cr.customer_id
    AND p.org_id IS NULL
  RETURNING p.id
)
SELECT '2. via customer_id' AS step, COUNT(*) AS updated FROM updated;

-- Estrategia 3: via agency_id
WITH updated AS (
  UPDATE payments p
  SET org_id = a.org_id, updated_at = NOW()
  FROM agencies a
  WHERE p.agency_id = a.id
    AND p.org_id IS NULL
    AND a.org_id IS NOT NULL
  RETURNING p.id
)
SELECT '3. via agency_id' AS step, COUNT(*) AS updated FROM updated;

-- Reporte final
SELECT
  COUNT(*) FILTER (WHERE org_id IS NOT NULL) AS resolved,
  COUNT(*) FILTER (WHERE org_id IS NULL) AS still_null
FROM payments;

-- Si still_null = 0 → COMMIT;
-- Si still_null > 0 → revisar manualmente los rows residuales:
--   SELECT id, operation_id, customer_id, operator_id, agency_id, amount,
--          currency, status, created_at, reference
--   FROM payments WHERE org_id IS NULL ORDER BY created_at;
-- Decidir caso por caso (asignar a Lozada con UPDATE específico, o
-- borrar si son test data antiguos).

COMMIT;
*/

-- ============================================================
-- 3. POST-CHECK
-- ============================================================
-- Después del backfill, verificar que el KPI cuenta correcto:
--
-- SELECT
--   o.name AS tenant,
--   COUNT(*) AS payments_count,
--   ROUND(SUM(p.amount)::numeric, 2) AS total
-- FROM payments p
-- JOIN organizations o ON o.id = p.org_id
-- GROUP BY o.name
-- ORDER BY payments_count DESC;
