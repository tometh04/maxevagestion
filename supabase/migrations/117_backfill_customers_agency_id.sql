-- =====================================================
-- Migration 117: backfill agency_id en customers
-- =====================================================
-- Estrategia (4 pasos):
--   1. Happy path: customers con operations vinculadas heredan via operation_customers
--      (Pre-flight 5 confirmó 0 multi-agencia, así que la exclusión NO afecta)
--   2. Borrar customer de testing: TEST AUTOMATICO
--   3. Asignar Conciliacion CAJA USD MADERO a Madero
--   4. Asignar el resto de los huérfanos a Rosario por default
--
-- ⚠️ UPDATE + DELETE sobre data productiva. Pre-aprobado por Tomi.
-- Decisiones tomadas en chat el 2026-04-28.
-- =====================================================

-- ─── STEP 1: Happy path ─────────────────────────────
UPDATE customers c
SET agency_id = (
  SELECT o.agency_id
  FROM operation_customers oc
  JOIN operations o ON o.id = oc.operation_id
  WHERE oc.customer_id = c.id
  LIMIT 1
)
WHERE c.agency_id IS NULL
  AND c.id NOT IN (
    -- Excluye customers en múltiples agencias (caso edge — Pre-flight 5 confirmó 0)
    SELECT oc.customer_id
    FROM operation_customers oc
    JOIN operations o ON o.id = oc.operation_id
    GROUP BY oc.customer_id
    HAVING COUNT(DISTINCT o.agency_id) > 1
  );

-- ─── STEP 2: Borrar testing data ────────────────────
DELETE FROM customers WHERE id = '74ca2dc5-eb9b-4147-863b-46a4f200aa67';
-- (TEST AUTOMATICO, creado 2026-03-06, sin operations)

-- ─── STEP 3: Conciliacion CAJA USD MADERO → Madero ──
UPDATE customers
SET agency_id = 'fabbc2e7-81d8-4ca1-85b2-7809c5f88e75'
WHERE id = '75b40bdd-bc87-42cf-8e70-5cfcf1448854';

-- ─── STEP 4: Resto de los huérfanos → Rosario ───────
UPDATE customers
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;

-- ─── Verificaciones ─────────────────────────────────

-- Verificación 1: cuántas filas quedaron sin agency_id (esperado: 0)
SELECT COUNT(*) AS customers_sin_agency_id
FROM customers WHERE agency_id IS NULL;

-- Verificación 2: distribución por agencia
SELECT a.name AS agencia, COUNT(*) AS customers_count
FROM customers c
JOIN agencies a ON a.id = c.agency_id
GROUP BY a.name
ORDER BY customers_count DESC;

-- Verificación 3: confirmar que Madero tenga al Conciliacion
SELECT c.id, c.first_name, c.last_name, a.name AS agencia
FROM customers c
JOIN agencies a ON a.id = c.agency_id
WHERE c.id = '75b40bdd-bc87-42cf-8e70-5cfcf1448854';
