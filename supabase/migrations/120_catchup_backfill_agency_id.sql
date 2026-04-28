-- =====================================================
-- Migration 120: catch-up backfill agency_id
-- =====================================================
-- Re-corre los UPDATEs de migrations 115-118 para capturar filas que
-- se crearon entre el primer backfill y este momento (mientras la app
-- seguía operando en producción).
--
-- IDEMPOTENTE: solo afecta filas con agency_id IS NULL. Si vuelven a
-- aparecer NULLs después de migration 119 (triggers instalados), es
-- porque hubo INSERTs sin auth.uid() y sin operation_id resolvable.
-- En ese caso revisar caso por caso.
-- =====================================================

-- ─── payments ────────────────────────────────────────
UPDATE payments p
SET agency_id = o.agency_id
FROM operations o
WHERE p.operation_id = o.id
  AND p.agency_id IS NULL;

-- ─── cash_movements ──────────────────────────────────
UPDATE cash_movements cm
SET agency_id = COALESCE(
  (SELECT o.agency_id FROM operations o WHERE o.id = cm.operation_id),
  (SELECT ua.agency_id FROM user_agencies ua WHERE ua.user_id = cm.user_id LIMIT 1)
)
WHERE cm.agency_id IS NULL;

-- ─── customers ───────────────────────────────────────
-- Step 1: happy path
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
    SELECT oc.customer_id
    FROM operation_customers oc
    JOIN operations o ON o.id = oc.operation_id
    GROUP BY oc.customer_id
    HAVING COUNT(DISTINCT o.agency_id) > 1
  );

-- Step 2: customers que quedaron NULL → Rosario por default
-- (regla aprobada: customers nuevos sin operations vinculadas se asignan
--  a Rosario hasta que el endpoint pase agency_id explícito)
UPDATE customers
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;

-- ─── operators ───────────────────────────────────────
-- Step 1: happy path
UPDATE operators op
SET agency_id = (
  SELECT o.agency_id
  FROM operation_operators oo
  JOIN operations o ON o.id = oo.operation_id
  WHERE oo.operator_id = op.id
  LIMIT 1
)
WHERE op.agency_id IS NULL
  AND op.id NOT IN (
    SELECT oo.operator_id
    FROM operation_operators oo
    JOIN operations o ON o.id = oo.operation_id
    GROUP BY oo.operator_id
    HAVING COUNT(DISTINCT o.agency_id) > 1
  );

-- Step 2: operators residuales → Rosario por default
UPDATE operators
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;

-- ─── Verificación final ─────────────────────────────
SELECT 'customers' AS tabla, COUNT(*) AS sin_agency_id
  FROM customers WHERE agency_id IS NULL
UNION ALL SELECT 'operators', COUNT(*)
  FROM operators WHERE agency_id IS NULL
UNION ALL SELECT 'payments', COUNT(*)
  FROM payments WHERE agency_id IS NULL
UNION ALL SELECT 'cash_movements', COUNT(*)
  FROM cash_movements WHERE agency_id IS NULL;
