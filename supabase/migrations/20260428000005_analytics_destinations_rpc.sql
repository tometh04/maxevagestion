-- ============================================================
-- Charts perf: RPC analytics_destinations_summary
-- ============================================================
-- Reemplaza el patrón "fetch all operations + JS reduce by destination"
-- del endpoint /api/analytics/destinations por una sola query SQL con
-- GROUP BY + SUM en Postgres.
--
-- Multi-tenant safe:
--   - SECURITY INVOKER → respeta RLS de operations + destinations.
--   - Filtros explícitos por org_id, role, agency.
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_destinations_summary(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_agency_id  UUID DEFAULT NULL,
  p_limit      INT  DEFAULT 5
)
RETURNS TABLE (
  destination          TEXT,
  total_sales          NUMERIC,
  total_margin         NUMERIC,
  operations_count     BIGINT,
  avg_margin_percent   NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ops AS (
    SELECT
      COALESCE(d.name, o.destination, 'Sin destino') AS destination_label,
      o.sale_amount_total,
      o.margin_amount,
      COALESCE(o.sale_currency, o.currency, 'USD') AS curr,
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date
    FROM operations o
    LEFT JOIN destinations d ON d.id = o.destination_id
    WHERE
      (p_org_id IS NULL OR o.org_id = p_org_id)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
               OR o.agency_id = ANY(p_agency_ids))
        )
      )
      AND (p_agency_id IS NULL OR o.agency_id = p_agency_id)
      AND (p_date_from IS NULL OR o.created_at >= (p_date_from::text || 'T00:00:00.000Z')::timestamptz)
      AND (p_date_to   IS NULL OR o.created_at <= (p_date_to::text   || 'T23:59:59.999Z')::timestamptz)
  ),
  ops_with_fx AS (
    SELECT
      ops.*,
      CASE
        WHEN ops.curr = 'USD' THEN 1::numeric
        ELSE COALESCE(
          (SELECT er.rate FROM exchange_rates er
             WHERE er.from_currency='USD' AND er.to_currency='ARS'
               AND er.rate_date <= ops.rate_date
             ORDER BY er.rate_date DESC LIMIT 1),
          (SELECT er.rate FROM exchange_rates er
             WHERE er.from_currency='USD' AND er.to_currency='ARS'
             ORDER BY er.rate_date DESC LIMIT 1),
          1450::numeric
        )
      END AS fx
    FROM ops
  ),
  dest_agg AS (
    SELECT
      ows.destination_label,
      COALESCE(SUM(CASE WHEN ows.curr='ARS' THEN ows.sale_amount_total / NULLIF(ows.fx, 0) ELSE ows.sale_amount_total END), 0)::numeric AS total_sales,
      COALESCE(SUM(CASE WHEN ows.curr='ARS' THEN ows.margin_amount / NULLIF(ows.fx, 0) ELSE ows.margin_amount END), 0)::numeric AS total_margin,
      COUNT(*)::bigint AS ops_count
    FROM ops_with_fx ows
    GROUP BY ows.destination_label
  )
  SELECT
    da.destination_label AS destination,
    da.total_sales,
    da.total_margin,
    da.ops_count AS operations_count,
    CASE WHEN da.total_sales > 0
      THEN (da.total_margin / da.total_sales * 100)::numeric
      ELSE 0::numeric
    END AS avg_margin_percent
  FROM dest_agg da
  ORDER BY da.total_sales DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 50));
$$;

COMMENT ON FUNCTION analytics_destinations_summary IS
  'Charts perf: top destinations con totalSales + margin + count + avgMarginPercent en USD, agregado en SQL en vez de fetch+JS-reduce.';

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS analytics_destinations_summary(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID, INT);
