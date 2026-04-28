-- =====================================================
-- Migration 115: backfill agency_id en payments
-- =====================================================
-- Cada payment hereda agency_id de la operation a la que está vinculado.
-- payments.operation_id es NOT NULL en el schema, así que sin huérfanos.
-- Pre-flight 1 (Task 1) confirmó payments_huerfanos = 0.
--
-- ⚠️ UPDATE sobre data productiva de Rosario, mecánico.
-- Pre-aprobado por Tomi antes de correr.
-- Spec: docs/superpowers/specs/2026-04-28-import-multitenant-design.md
-- =====================================================

UPDATE payments p
SET agency_id = o.agency_id
FROM operations o
WHERE p.operation_id = o.id
  AND p.agency_id IS NULL;

-- Verificación: cuántas filas quedaron sin agency_id (esperado: 0)
SELECT COUNT(*) AS payments_sin_agency_id
FROM payments WHERE agency_id IS NULL;

-- Verificación adicional: distribución por agencia (control de sanidad)
SELECT a.name AS agencia, COUNT(*) AS payments_count
FROM payments p
JOIN agencies a ON a.id = p.agency_id
GROUP BY a.name
ORDER BY payments_count DESC;
