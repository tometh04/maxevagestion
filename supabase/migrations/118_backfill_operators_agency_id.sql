-- =====================================================
-- Migration 118: backfill agency_id en operators
-- =====================================================
-- Estrategia (3 pasos):
--   1. Happy path: operators con operations vinculadas heredan via operation_operators
--   2. Borrar operator de testing: SMOKE TEST CLAUDE - Operador
--   3. Asignar el resto de los huérfanos a Rosario por default
--      (Tarjeta de Crédito, Booking)
--
-- ⚠️ UPDATE + DELETE sobre data productiva. Pre-aprobado por Tomi.
-- Decisiones tomadas en chat el 2026-04-28.
-- =====================================================

-- ─── STEP 1: Happy path ─────────────────────────────
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

-- ─── STEP 2: Borrar testing data ────────────────────
DELETE FROM operators WHERE id = '91a56a06-f4e2-4497-877b-e5180379b0ba';
-- (SMOKE TEST CLAUDE - Operador, creado 2026-04-27)

-- ─── STEP 3: Resto de huérfanos → Rosario ───────────
UPDATE operators
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;
-- (Tarjeta de Crédito + Booking + cualquier otro huérfano residual)

-- ─── Verificaciones ─────────────────────────────────

-- Verificación 1: cuántas filas quedaron sin agency_id (esperado: 0)
SELECT COUNT(*) AS operators_sin_agency_id
FROM operators WHERE agency_id IS NULL;

-- Verificación 2: distribución por agencia
SELECT a.name AS agencia, COUNT(*) AS operators_count
FROM operators op
JOIN agencies a ON a.id = op.agency_id
GROUP BY a.name
ORDER BY operators_count DESC;
