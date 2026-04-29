-- ============================================================
-- A3: RPC analytics_sales_summary
-- ============================================================
-- Reemplaza el patrón "fetch todas las operations + sumar en JS" del
-- endpoint /api/analytics/sales por una sola query SUM en SQL.
--
-- IMPORTANTE: este archivo CREA LA FUNCIÓN. NO cambia schema, NO toca
-- datos existentes, NO afecta endpoints actuales. Es 100% seguro de
-- ejecutar en producción durante uso normal.
--
-- Pasos de validación ANTES de cambiar código del endpoint:
--   1. Ejecutar este SQL en Supabase → función creada.
--   2. Correr el query de prueba al final del archivo con TUS valores.
--   3. Comparar los 5 números retornados vs los que ves en el dashboard.
--   4. Si match → avisar para deploy del code change.
--   5. Si NO match → reportar diferencias para corregir la SQL acá.
--
-- Multi-tenant safe:
--   - SECURITY INVOKER (default) → respeta RLS del usuario que llama.
--   - Filtros explícitos por org_id, role, agency, seller redundantes
--     con RLS (defense-in-depth).
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_sales_summary(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_agency_id  UUID DEFAULT NULL,
  p_seller_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  total_sales_usd     NUMERIC,
  total_margin_usd    NUMERIC,
  total_cost_usd      NUMERIC,
  operations_count    BIGINT,
  avg_margin_percent  NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ops AS (
    SELECT
      o.sale_amount_total,
      o.margin_amount,
      o.operator_cost,
      COALESCE(o.sale_currency, o.currency, 'USD') AS curr,
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date
    FROM operations o
    WHERE
      -- Multi-tenant scope (defense-in-depth encima de RLS)
      (p_org_id IS NULL OR o.org_id = p_org_id)
      -- Role-based filter (mismo que el endpoint actual)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
               OR o.agency_id = ANY(p_agency_ids))
        )
      )
      -- Filtros opcionales del query string
      AND (p_agency_id IS NULL OR o.agency_id = p_agency_id)
      AND (p_seller_id IS NULL OR o.seller_id = p_seller_id)
      -- Filtros de fecha (created_at, igual que el endpoint actual)
      AND (p_date_from IS NULL OR o.created_at >= (p_date_from::text || 'T00:00:00.000Z')::timestamptz)
      AND (p_date_to   IS NULL OR o.created_at <= (p_date_to::text   || 'T23:59:59.999Z')::timestamptz)
  ),
  ops_with_fx AS (
    SELECT
      ops.*,
      CASE
        WHEN ops.curr = 'USD' THEN 1::numeric
        ELSE COALESCE(
          -- Tasa para la fecha de la operación (≤ rate_date, más reciente anterior)
          (
            SELECT er.rate
            FROM exchange_rates er
            WHERE er.from_currency = 'USD'
              AND er.to_currency   = 'ARS'
              AND er.rate_date    <= ops.rate_date
            ORDER BY er.rate_date DESC
            LIMIT 1
          ),
          -- Fallback: tasa más reciente disponible
          (
            SELECT er.rate
            FROM exchange_rates er
            WHERE er.from_currency = 'USD'
              AND er.to_currency   = 'ARS'
            ORDER BY er.rate_date DESC
            LIMIT 1
          ),
          -- Último fallback: DEFAULT_USD_ARS_FALLBACK_RATE del código TS (1450)
          1450::numeric
        )
      END AS fx
    FROM ops
  ),
  totals AS (
    SELECT
      COALESCE(SUM(
        CASE WHEN curr = 'ARS' THEN sale_amount_total / NULLIF(fx, 0)
             ELSE sale_amount_total END
      ), 0)::numeric AS sales_usd,
      COALESCE(SUM(
        CASE WHEN curr = 'ARS' THEN margin_amount / NULLIF(fx, 0)
             ELSE margin_amount END
      ), 0)::numeric AS margin_usd,
      COALESCE(SUM(
        CASE WHEN curr = 'ARS' THEN operator_cost / NULLIF(fx, 0)
             ELSE operator_cost END
      ), 0)::numeric AS cost_usd,
      COUNT(*)::bigint AS ops_count
    FROM ops_with_fx
  )
  SELECT
    sales_usd  AS total_sales_usd,
    margin_usd AS total_margin_usd,
    cost_usd   AS total_cost_usd,
    ops_count  AS operations_count,
    CASE
      WHEN sales_usd > 0 THEN (margin_usd / sales_usd * 100)::numeric
      ELSE 0::numeric
    END AS avg_margin_percent
  FROM totals;
$$;

COMMENT ON FUNCTION analytics_sales_summary IS
  'A3 perf: retorna KPIs de analytics/sales (totalSales, totalMargin, totalCost en USD, count, avgMarginPercent) en una sola query SQL en vez del fetch+JS-sum del endpoint actual. Multi-tenant: filtra explícitamente por org_id + respeta RLS via SECURITY INVOKER.';

-- ============================================================
-- ROLLBACK (no debería hacer falta porque es solo una función nueva):
-- ============================================================
-- DROP FUNCTION IF EXISTS analytics_sales_summary(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID, UUID);

-- ============================================================
-- QUERIES DE VALIDACIÓN — correr DESPUÉS de crear la función.
-- Reemplazar los placeholders con tus valores reales antes de correr.
-- ============================================================

-- Test 1: tu user (SUPER_ADMIN), últimos 30 días, todas las agencias.
-- Esperado: matchear los KPIs del dashboard con filtros default.
--
-- SELECT * FROM analytics_sales_summary(
--   '<TU_USER_ID>'::uuid,
--   '<TU_ORG_ID>'::uuid,
--   'SUPER_ADMIN',
--   ARRAY[]::uuid[],
--   (current_date - INTERVAL '30 days')::date,
--   current_date,
--   NULL,
--   NULL
-- );
--
-- Comparar contra el dashboard:
--   total_sales_usd    ←→ KPI "Ventas" ($ del dashboard)
--   total_margin_usd   ←→ KPI "Margen" ($ del dashboard)
--   operations_count   ←→ "X operaciones" debajo del KPI Ventas
--   avg_margin_percent ←→ "X.X% promedio" debajo del KPI Margen
--
-- Si los 4 números matchean (tolerancia ±0.01 USD por rounding) → RPC OK,
-- procedemos al code change. Si NO matchean → reportar diferencias.
