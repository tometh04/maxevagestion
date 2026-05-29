-- VIB-15: Hardenear org_id nullable en tablas core
--
-- Tablas: leads, alerts, cash_movements
-- leads: tiene agency_id NOT NULL → backfill limpio → SET NOT NULL
-- alerts: sin agency_id directo → backfill best-effort via relationships → no SET NOT NULL aún
-- cash_movements: agency_id nullable → backfill best-effort → no SET NOT NULL aún

BEGIN;

-- ============================================================
-- 1. LEADS — backfill + NOT NULL (agency_id es required, backfill limpio)
-- ============================================================

UPDATE leads l
SET org_id = a.org_id
FROM agencies a
WHERE a.id = l.agency_id
  AND l.org_id IS NULL
  AND a.org_id IS NOT NULL;

DO $$
DECLARE v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM leads WHERE org_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Quedan % leads con org_id NULL post-backfill. Revisar manualmente.', v_null_count;
  END IF;
END $$;

ALTER TABLE leads ALTER COLUMN org_id SET NOT NULL;

-- ============================================================
-- 2. ALERTS — backfill best-effort via relationships
--    (no SET NOT NULL — pueden quedar alerts legacy sin FK)
-- ============================================================

-- Via operation_id
UPDATE alerts al
SET org_id = o.org_id
FROM operations o
WHERE o.id = al.operation_id
  AND al.org_id IS NULL
  AND o.org_id IS NOT NULL;

-- Via lead_id (para leads que ya tienen org_id luego del paso anterior)
UPDATE alerts al
SET org_id = l.org_id
FROM leads l
WHERE l.id = al.lead_id
  AND al.org_id IS NULL
  AND l.org_id IS NOT NULL;

-- Via customer_id → customers (que ya tienen org_id)
UPDATE alerts al
SET org_id = c.org_id
FROM customers c
WHERE c.id = al.customer_id
  AND al.org_id IS NULL
  AND c.org_id IS NOT NULL;

-- Log si quedan NULLs (warning, no bloquea la migración)
DO $$
DECLARE v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM alerts WHERE org_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE WARNING 'Quedan % alerts con org_id NULL después del backfill best-effort. Investigar.', v_null_count;
  END IF;
END $$;

-- ============================================================
-- 3. CASH_MOVEMENTS — backfill best-effort
--    (agency_id es nullable, org_id queda nullable también)
-- ============================================================

-- Via agency_id directo
UPDATE cash_movements cm
SET org_id = a.org_id
FROM agencies a
WHERE a.id = cm.agency_id
  AND cm.org_id IS NULL
  AND a.org_id IS NOT NULL;

-- Via operation_id para los que no tienen agency_id
UPDATE cash_movements cm
SET org_id = o.org_id
FROM operations o
WHERE o.id = cm.operation_id
  AND cm.org_id IS NULL
  AND o.org_id IS NOT NULL;

-- Log si quedan NULLs
DO $$
DECLARE v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM cash_movements WHERE org_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE WARNING 'Quedan % cash_movements con org_id NULL después del backfill best-effort. Investigar.', v_null_count;
  END IF;
END $$;

COMMIT;
