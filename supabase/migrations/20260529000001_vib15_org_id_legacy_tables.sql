-- VIB-15: Agregar org_id a tablas legacy que solo tienen agency_id
--
-- Tablas: cash_boxes, card_transactions, commission_schemes, commissions, user_goals
--
-- Patrón:
--   1. ADD COLUMN org_id (nullable)
--   2. Backfill via agencies.org_id
--   3. Verificar que no quedan NULL
--   4. SET NOT NULL + CREATE INDEX
--   5. Reemplazar políticas RLS legacy (user_agencies based) por tenant_isolation (org_id)
--
-- Referencia: 20260510000002_p0_seller_objectives_org_id.sql

BEGIN;

-- ============================================================
-- 1. CASH_BOXES
-- ============================================================

ALTER TABLE cash_boxes
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE cash_boxes cb
SET org_id = a.org_id
FROM agencies a
WHERE a.id = cb.agency_id
  AND cb.org_id IS NULL
  AND a.org_id IS NOT NULL;

DO $$
DECLARE v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM cash_boxes WHERE org_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Quedan % cash_boxes con org_id NULL post-backfill. Revisar manualmente.', v_null_count;
  END IF;
END $$;

ALTER TABLE cash_boxes ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cash_boxes_org_id ON cash_boxes(org_id);

-- Reemplazar política legacy (user_agencies) por tenant_isolation (org_id)
DROP POLICY IF EXISTS "Agency members can view cash boxes" ON cash_boxes;
DROP POLICY IF EXISTS "Agency members can manage cash boxes" ON cash_boxes;
DROP POLICY IF EXISTS "tenant_isolation" ON cash_boxes;

CREATE POLICY "tenant_isolation" ON cash_boxes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- ============================================================
-- 2. CARD_TRANSACTIONS
-- ============================================================

ALTER TABLE card_transactions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE card_transactions ct
SET org_id = a.org_id
FROM agencies a
WHERE a.id = ct.agency_id
  AND ct.org_id IS NULL
  AND a.org_id IS NOT NULL;

DO $$
DECLARE v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM card_transactions WHERE org_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Quedan % card_transactions con org_id NULL post-backfill. Revisar manualmente.', v_null_count;
  END IF;
END $$;

ALTER TABLE card_transactions ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_transactions_org_id ON card_transactions(org_id);

-- card_transactions no tenía RLS habilitada — agregar desde cero
ALTER TABLE card_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON card_transactions;

CREATE POLICY "tenant_isolation" ON card_transactions
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- ============================================================
-- 3. COMMISSION_SCHEMES
-- ============================================================

ALTER TABLE commission_schemes
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE commission_schemes cs
SET org_id = a.org_id
FROM agencies a
WHERE a.id = cs.agency_id
  AND cs.org_id IS NULL
  AND a.org_id IS NOT NULL;

DO $$
DECLARE v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM commission_schemes WHERE org_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Quedan % commission_schemes con org_id NULL post-backfill. Revisar manualmente.', v_null_count;
  END IF;
END $$;

ALTER TABLE commission_schemes ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commission_schemes_org_id ON commission_schemes(org_id);

-- Reemplazar políticas legacy (user_agencies) por tenant_isolation (org_id)
DROP POLICY IF EXISTS "Users can view commission schemes" ON commission_schemes;
DROP POLICY IF EXISTS "Admins can manage commission schemes" ON commission_schemes;
DROP POLICY IF EXISTS "tenant_isolation" ON commission_schemes;

CREATE POLICY "tenant_isolation" ON commission_schemes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- ============================================================
-- 4. COMMISSIONS
-- ============================================================

ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE commissions c
SET org_id = a.org_id
FROM agencies a
WHERE a.id = c.agency_id
  AND c.org_id IS NULL
  AND a.org_id IS NOT NULL;

DO $$
DECLARE v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM commissions WHERE org_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Quedan % commissions con org_id NULL post-backfill. Revisar manualmente.', v_null_count;
  END IF;
END $$;

ALTER TABLE commissions ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_org_id ON commissions(org_id);

-- Reemplazar políticas legacy (user_agencies) por tenant_isolation (org_id)
DROP POLICY IF EXISTS "Users can view own commissions" ON commissions;
DROP POLICY IF EXISTS "Admins can manage commissions" ON commissions;
DROP POLICY IF EXISTS "tenant_isolation" ON commissions;

CREATE POLICY "tenant_isolation" ON commissions
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- ============================================================
-- 5. USER_GOALS
-- ============================================================

ALTER TABLE user_goals
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE user_goals ug
SET org_id = a.org_id
FROM agencies a
WHERE a.id = ug.agency_id
  AND ug.org_id IS NULL
  AND a.org_id IS NOT NULL;

DO $$
DECLARE v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM user_goals WHERE org_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Quedan % user_goals con org_id NULL post-backfill. Revisar manualmente.', v_null_count;
  END IF;
END $$;

ALTER TABLE user_goals ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_goals_org_id ON user_goals(org_id);

-- Reemplazar política "Allow all" (sin seguridad) por tenant_isolation
DROP POLICY IF EXISTS "Allow all operations on user_goals" ON user_goals;
DROP POLICY IF EXISTS "Users can view own goals" ON user_goals;
DROP POLICY IF EXISTS "Users can manage own goals" ON user_goals;
DROP POLICY IF EXISTS "tenant_isolation" ON user_goals;

CREATE POLICY "tenant_isolation" ON user_goals
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

COMMIT;
