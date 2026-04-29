-- ============================================================
-- Charts perf: RPC analytics_cashflow_summary
-- ============================================================
-- Reemplaza el patrón "fetch all cash_movements + JS reduce by date"
-- del endpoint /api/analytics/cashflow por una sola query SQL con
-- GROUP BY movement_date::date + SUM income/expense.
--
-- Mirror EXACTO de la lógica JS:
--   - SELLER → filter por user_id (no agency)
--   - SUPER_ADMIN → sin filtro de agency
--   - Otros + agency_id provided → filter operations de esa agency
--   - Otros sin agency_id pero con agency_ids del user → filter
--     operations de las agencies del user
--   - Suma raw (NO convierte ARS↔USD — mismo comportamiento que JS).
--
-- Multi-tenant safe: SECURITY INVOKER, RLS de cash_movements aplica.
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_cashflow_summary(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_agency_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  date    TEXT,
  income  NUMERIC,
  expense NUMERIC,
  net     NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH filtered_movements AS (
    SELECT
      cm.movement_date,
      cm.type,
      cm.amount
    FROM cash_movements cm
    LEFT JOIN operations o ON o.id = cm.operation_id
    WHERE
      (p_org_id IS NULL OR cm.org_id = p_org_id)
      -- Role-based filter (mirror JS)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND cm.user_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (
            -- Si user no tiene agencies, no se aplica filtro adicional
            cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
            OR (o.agency_id IS NOT NULL AND o.agency_id = ANY(p_agency_ids))
            -- Movimientos sin operation_id pasan (no filtra por agency)
            OR cm.operation_id IS NULL
          )
        )
      )
      -- Filtro opcional explícito por agency_id (sobrescribe)
      AND (p_agency_id IS NULL OR (o.agency_id IS NOT NULL AND o.agency_id = p_agency_id))
      -- Filtros de fecha
      AND (p_date_from IS NULL OR cm.movement_date >= (p_date_from::text || 'T00:00:00.000Z')::timestamptz)
      AND (p_date_to   IS NULL OR cm.movement_date <= (p_date_to::text   || 'T23:59:59.999Z')::timestamptz)
  ),
  by_date AS (
    SELECT
      to_char(fm.movement_date::date, 'YYYY-MM-DD') AS date_str,
      SUM(CASE WHEN fm.type = 'INCOME'  THEN COALESCE(fm.amount, 0) ELSE 0 END)::numeric AS income_total,
      SUM(CASE WHEN fm.type = 'EXPENSE' THEN COALESCE(fm.amount, 0) ELSE 0 END)::numeric AS expense_total
    FROM filtered_movements fm
    GROUP BY to_char(fm.movement_date::date, 'YYYY-MM-DD')
  )
  SELECT
    bd.date_str AS date,
    bd.income_total AS income,
    bd.expense_total AS expense,
    (bd.income_total - bd.expense_total)::numeric AS net
  FROM by_date bd
  ORDER BY bd.date_str ASC;
$$;

COMMENT ON FUNCTION analytics_cashflow_summary IS
  'Charts perf: cashflow agrupado por fecha (income/expense/net) directo en SQL.';

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS analytics_cashflow_summary(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID);
