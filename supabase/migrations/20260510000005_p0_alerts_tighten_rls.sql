-- Migración 2026-05-10: alerts tighten RLS — remover bypass org_id IS NULL
--
-- PROBLEMA (P0):
--   La policy `tenant_isolation` actual de `alerts` (mig 137) es:
--     USING (org_id IS NULL OR org_id IN (SELECT user_org_ids()))
--
--   El `org_id IS NULL OR` permite que CUALQUIER tenant vea las alerts
--   con org_id NULL. Hoy hay 1209 alerts NULL → todos los tenants las ven.
--
-- FIX:
--   1. Backfill alerts.org_id desde operations.org_id (donde aplica)
--   2. Backfill desde users.org del user_id (system-level alerts)
--   3. Borrar alerts que quedan NULL sin manera de inferir org (orphan)
--   4. Tighten policy: SOLO org_id IN user_org_ids()
--
-- IMPACTO POSITIVO:
--   - Tenants nuevos no ven alerts ajenas
--   - Los KPIs de "alertas activas" muestran número real per-tenant

BEGIN;

-- 1. Backfill desde operation_id → operations.org_id
UPDATE alerts a
SET org_id = o.org_id
FROM operations o
WHERE a.operation_id = o.id
  AND a.org_id IS NULL
  AND o.org_id IS NOT NULL;

-- 2. Backfill desde lead_id → leads.org_id (si leads tiene org_id)
UPDATE alerts a
SET org_id = l.org_id
FROM leads l
WHERE a.lead_id = l.id
  AND a.org_id IS NULL
  AND l.org_id IS NOT NULL;

-- 3. Backfill desde user_id → primer org_id del user en organization_members
UPDATE alerts a
SET org_id = sub.org_id
FROM (
  SELECT user_id, MIN(organization_id) AS org_id
  FROM organization_members
  WHERE status = 'active'
  GROUP BY user_id
) sub
WHERE a.user_id = sub.user_id
  AND a.org_id IS NULL;

-- 4. Reportar y opcionalmente eliminar los huérfanos restantes
DO $$
DECLARE
  v_orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_orphan_count FROM alerts WHERE org_id IS NULL;
  RAISE NOTICE 'alerts orphans (sin operation, lead ni user válidos): %', v_orphan_count;
  -- Si quedan orphans, los soft-delete marcando dismissed_at en vez de
  -- borrarlos (preserva auditoría)
  IF v_orphan_count > 0 THEN
    -- Marcar como dismissed para que no aparezcan en queries activas
    -- pero queden en la BD para revisión manual
    UPDATE alerts SET dismissed_at = COALESCE(dismissed_at, NOW())
    WHERE org_id IS NULL;
    RAISE NOTICE 'Marcadas como dismissed (no borradas). Revisar manualmente con: SELECT * FROM alerts WHERE org_id IS NULL;';
  END IF;
END $$;

-- 5. Tighten policy — remover org_id IS NULL OR
DROP POLICY IF EXISTS "tenant_isolation" ON alerts;
CREATE POLICY "tenant_isolation" ON alerts
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

COMMIT;
