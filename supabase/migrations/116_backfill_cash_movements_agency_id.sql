-- =====================================================
-- Migration 116: backfill agency_id en cash_movements
-- =====================================================
-- Estrategia:
--   1. Si cash_movement tiene operation_id no nulo → hereda de operations.agency_id
--   2. Si no tiene operation_id → hereda de user_agencies por user_id
-- Pre-flight 2 (Task 1) confirmó cash_movements_huerfanos = 0,
-- así que el COALESCE va a resolver las 2.343 filas.
--
-- ⚠️ UPDATE sobre data productiva de Rosario, mecánico.
-- Pre-aprobado por Tomi antes de correr.
-- =====================================================

UPDATE cash_movements cm
SET agency_id = COALESCE(
  (SELECT o.agency_id FROM operations o WHERE o.id = cm.operation_id),
  (SELECT ua.agency_id FROM user_agencies ua WHERE ua.user_id = cm.user_id LIMIT 1)
)
WHERE cm.agency_id IS NULL;

-- Verificación 1: cuántas filas quedaron sin agency_id (esperado: 0)
SELECT COUNT(*) AS cash_movements_sin_agency_id
FROM cash_movements WHERE agency_id IS NULL;

-- Verificación 2: distribución por agencia
SELECT a.name AS agencia, COUNT(*) AS cash_movements_count
FROM cash_movements cm
JOIN agencies a ON a.id = cm.agency_id
GROUP BY a.name
ORDER BY cash_movements_count DESC;
