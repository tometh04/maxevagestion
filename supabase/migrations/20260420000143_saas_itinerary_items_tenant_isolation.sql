-- =====================================================
-- Migración 143: Tenant isolation sobre itinerary_items
-- =====================================================
-- SaaS Pilar 2c — Gap descubierto en Pass 2: itinerary_items tenía RLS
-- activada pero con policies permisivas (USING true) y sin columna org_id.
-- La defensa temporal en código (verifyOperationBelongsToUser) cubría los
-- routes conocidos, pero cualquier nuevo caller podía leer/escribir items
-- de otras orgs. Este fix lo resuelve a nivel schema.
--
-- Cambios:
--   1. Agregar columna org_id con backfill desde operations.
--   2. NOT NULL constraint + FK a organizations.
--   3. Index en org_id para performance.
--   4. Drop policies permisivas.
--   5. Force RLS + policy tenant_isolation usando user_org_ids() (SECURITY DEFINER,
--      misma estrategia que mig 137).
--
-- Después de aplicar: la validación en código (verifyOperationBelongsToUser)
-- queda como defensa-en-profundidad, pero ya no es imprescindible.

-- 1. Columna org_id
ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. Backfill desde la operation parent
UPDATE itinerary_items ii
SET org_id = op.org_id
FROM operations op
WHERE ii.operation_id = op.id AND ii.org_id IS NULL;

-- 3. Fallback defensivo: cualquier row huérfano va a Lozada para no romper data
UPDATE itinerary_items
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

-- 4. Enforce NOT NULL ahora que todos tienen valor
ALTER TABLE itinerary_items
  ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_itinerary_items_org_id ON itinerary_items(org_id);

-- 5. Drop policies permisivas previas
DROP POLICY IF EXISTS "itinerary_select" ON itinerary_items;
DROP POLICY IF EXISTS "itinerary_insert" ON itinerary_items;
DROP POLICY IF EXISTS "itinerary_update" ON itinerary_items;
DROP POLICY IF EXISTS "itinerary_delete" ON itinerary_items;

-- 6. Forzar RLS (evita que service_role u owner la saltee por error de config)
ALTER TABLE itinerary_items FORCE ROW LEVEL SECURITY;

-- 7. Policy de tenant_isolation — un único policy para todas las operaciones.
-- user_org_ids() devuelve el array de orgs del caller (ver mig 137).
DROP POLICY IF EXISTS "itinerary_items_tenant_isolation" ON itinerary_items;
CREATE POLICY "itinerary_items_tenant_isolation" ON itinerary_items
  FOR ALL TO authenticated
  USING (org_id = ANY (user_org_ids()))
  WITH CHECK (org_id = ANY (user_org_ids()));

COMMENT ON COLUMN itinerary_items.org_id IS
  'SaaS tenant isolation. Backfill desde operations.org_id en mig 143.';
