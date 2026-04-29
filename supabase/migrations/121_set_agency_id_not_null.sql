-- =====================================================
-- Migration 121: SET NOT NULL en agency_id de las 4 tablas (atómico)
-- =====================================================
-- Ejecuta catch-up final + SET NOT NULL en una sola transacción.
-- ALTER TABLE adquiere AccessExclusiveLock, bloqueando cualquier
-- INSERT concurrente entre el catch-up y el ALTER.
--
-- Pre-requisitos:
--   - Triggers BEFORE INSERT instalados (migration 119)
--   - Backups disponibles (migration 113)
-- =====================================================

BEGIN;

-- ─── Catch-up final ─────────────────────────────────
-- Cualquier fila que haya quedado NULL desde el último backfill
-- se asigna a Rosario por default (fallback safe).

UPDATE customers
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;

UPDATE operators
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;

UPDATE payments p
SET agency_id = COALESCE(
  o.agency_id,
  '66563aeb-4e8b-40ee-a622-b39defb380dd'::UUID
)
FROM operations o
WHERE p.operation_id = o.id AND p.agency_id IS NULL;

UPDATE cash_movements cm
SET agency_id = COALESCE(
  (SELECT o.agency_id FROM operations o WHERE o.id = cm.operation_id),
  (SELECT ua.agency_id FROM user_agencies ua WHERE ua.user_id = cm.user_id LIMIT 1),
  '66563aeb-4e8b-40ee-a622-b39defb380dd'::UUID
)
WHERE cm.agency_id IS NULL;

-- ─── Guard: abortar si todavía hay NULLs ────────────
DO $$
DECLARE total_null INT;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM customers WHERE agency_id IS NULL) +
    (SELECT COUNT(*) FROM operators WHERE agency_id IS NULL) +
    (SELECT COUNT(*) FROM payments WHERE agency_id IS NULL) +
    (SELECT COUNT(*) FROM cash_movements WHERE agency_id IS NULL)
  INTO total_null;
  IF total_null > 0 THEN
    RAISE EXCEPTION 'Aborting migration 121: % NULL agency_ids remain after catch-up', total_null;
  END IF;
END $$;

-- ─── SET NOT NULL ────────────────────────────────────
ALTER TABLE customers ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE operators ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE payments ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE cash_movements ALTER COLUMN agency_id SET NOT NULL;

COMMIT;

-- ─── Verificación post-COMMIT ───────────────────────
SELECT
  table_name,
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'agency_id'
  AND table_name IN ('customers', 'operators', 'payments', 'cash_movements')
ORDER BY table_name;
