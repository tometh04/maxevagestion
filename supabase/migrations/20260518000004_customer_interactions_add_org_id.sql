-- Migration 2026-05-18: agregar org_id a customer_interactions.
--
-- CONTEXTO:
--   customer_interactions fue creada en mig 070 (2026-01) sin org_id —
--   solo tenía agency_id. En el sweep cross-tenant del 18/05 quedó como
--   patrón legacy inconsistente: el resto de las tablas con datos por
--   tenant tienen org_id directo.
--
--   El endpoint /api/customer-interactions filtra correctamente via
--   agency_ids del user, pero no aprovecha el patrón canónico
--   `org_id IN (SELECT user_org_ids())` que usan las policies RLS.
--
-- FIX:
--   1. ADD COLUMN org_id (nullable inicialmente para backfill).
--   2. Backfill via agency → agencies.org_id.
--   3. SET NOT NULL.
--   4. Index para queries por org.
--   5. RLS policy canónica que matchea el resto del sistema.
--
-- IDEMPOTENTE: cada step usa IF NOT EXISTS o equivalente.

BEGIN;

-- 1. Agregar columna nullable para el backfill
ALTER TABLE customer_interactions
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. Backfill desde agencies.org_id
UPDATE customer_interactions ci
SET org_id = a.org_id
FROM agencies a
WHERE ci.agency_id = a.id
  AND ci.org_id IS NULL;

-- 3. Verificar que NO quedaron rows sin org_id (sino el SET NOT NULL falla).
--    Si hay alguno, debe ser por agency_id huérfano — log y skip esa fila.
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM customer_interactions
  WHERE org_id IS NULL;

  IF orphan_count > 0 THEN
    RAISE NOTICE '⚠️ Quedan % rows con org_id NULL en customer_interactions. NO se aplicará NOT NULL. Investigar manualmente.', orphan_count;
  END IF;
END $$;

-- 4. SET NOT NULL solo si el backfill cubrió todo
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM customer_interactions WHERE org_id IS NULL) THEN
    ALTER TABLE customer_interactions ALTER COLUMN org_id SET NOT NULL;
    RAISE NOTICE '✅ customer_interactions.org_id ahora es NOT NULL';
  ELSE
    RAISE NOTICE 'ℹ️ customer_interactions.org_id queda nullable hasta resolver huérfanos';
  END IF;
END $$;

-- 5. Index para queries scopeadas por org
CREATE INDEX IF NOT EXISTS idx_customer_interactions_org_id
  ON customer_interactions(org_id);

-- 6. RLS canónica (defense-in-depth + consistencia con el resto del sistema)
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON customer_interactions;
CREATE POLICY "tenant_isolation" ON customer_interactions
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- 7. Trigger para autopopulate org_id en INSERTs nuevos
--    (cualquier insert sin org_id explícito lo deriva de la agency).
CREATE OR REPLACE FUNCTION autopopulate_customer_interactions_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.agency_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM agencies
    WHERE id = NEW.agency_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_interactions_autopopulate_org_id ON customer_interactions;
CREATE TRIGGER trg_customer_interactions_autopopulate_org_id
  BEFORE INSERT ON customer_interactions
  FOR EACH ROW
  EXECUTE FUNCTION autopopulate_customer_interactions_org_id();

COMMIT;

-- Smoke: verificar resultado
SELECT
  COUNT(*) AS total_rows,
  COUNT(org_id) AS rows_con_org,
  COUNT(*) - COUNT(org_id) AS rows_huerfanos
FROM customer_interactions;
