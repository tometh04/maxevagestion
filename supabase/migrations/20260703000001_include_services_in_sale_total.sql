-- ============================================================
-- 2026-07-03: RPCs conscientes de operation_services (flag per-org
--             features.include_services_in_sale_total)
-- ============================================================
-- Los servicios adicionales de una operación (operation_services: asistencia,
-- asiento, transfer, etc.) tienen su propia venta (sale_amount) y costo
-- (cost_amount) pero NO están reflejados en operations.sale_amount_total /
-- operator_cost / margin_amount. Cuando la org activa la flag
-- `features.include_services_in_sale_total`, la deuda del cliente y los KPIs de
-- venta deben SUMAR esos servicios.
--
-- Este archivo agrega un parámetro `p_include_services BOOLEAN DEFAULT false` a
-- las 4 RPCs de agregación y suma, solo cuando el flag está ON, el aporte de los
-- operation_services por operación:
--   svc_sale = Σ sale_amount de servicios cuya sale_currency = moneda de la op
--   svc_cost = Σ cost_amount de servicios cuya cost_currency = moneda de la op
--   margen  += (svc_sale − svc_cost)   [neto, no infla el margen]
--
-- DEDUP POR MONEDA: idéntico criterio que el helper TS
-- getServiceExtrasByOperation (lib/accounting/operation-services-debt.ts) y que
-- el resto de estas RPCs, que tratan operator_cost en la misma moneda `curr` de
-- la venta. Servicios en otra moneda quedan fuera del agregado.
--
-- DEFAULT false → backward-compatible: sin pasar el param, comportamiento
-- idéntico al actual. Se DROPea la firma vieja antes de recrear porque cambia la
-- aridad (Postgres trataría la nueva como un overload separado).
-- ============================================================

-- ------------------------------------------------------------
-- 1) accounting_debts_sales_total  (KPI Deudores por Ventas)
--    Base: 20260617000001 (suma cobros en moneda de venta).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS accounting_debts_sales_total(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION accounting_debts_sales_total(
  p_user_id          UUID,
  p_org_id           UUID,
  p_role             TEXT,
  p_agency_ids       UUID[],
  p_date_from        DATE DEFAULT NULL,
  p_date_to          DATE DEFAULT NULL,
  p_seller_id        UUID DEFAULT NULL,
  p_date_type        TEXT DEFAULT 'SALIDA',
  p_agency_id        UUID DEFAULT NULL,
  p_include_services BOOLEAN DEFAULT false
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ops AS (
    SELECT DISTINCT
      o.id,
      o.sale_amount_total,
      COALESCE(o.sale_currency, o.currency, 'USD') AS curr,
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date,
      o.created_at,
      o.departure_date,
      CASE WHEN p_include_services THEN (
        SELECT COALESCE(SUM(os.sale_amount), 0)::numeric
        FROM operation_services os
        WHERE os.operation_id = o.id
          AND os.sale_currency = COALESCE(o.sale_currency, o.currency, 'USD')
      ) ELSE 0::numeric END AS svc_sale
    FROM operations o
    INNER JOIN operation_customers oc ON oc.operation_id = o.id
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
      AND (
        p_agency_id IS NULL
        OR (
          o.agency_id = p_agency_id
          AND (
            p_role = 'SUPER_ADMIN'
            OR cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
            OR p_agency_id = ANY(p_agency_ids)
          )
        )
      )
      AND (p_seller_id IS NULL OR o.seller_id = p_seller_id)
      AND (
        p_date_from IS NULL OR (
          CASE
            WHEN p_date_type = 'CREACION' THEN o.created_at
            ELSE COALESCE(o.departure_date::timestamptz, o.created_at)
          END
          >= (p_date_from::text || 'T00:00:00-03:00')::timestamptz
        )
      )
      AND (
        p_date_to IS NULL OR (
          CASE
            WHEN p_date_type = 'CREACION' THEN o.created_at
            ELSE COALESCE(o.departure_date::timestamptz, o.created_at)
          END
          <= (p_date_to::text || 'T23:59:59.999-03:00')::timestamptz
        )
      )
  ),
  ops_with_fx AS (
    SELECT
      ops.*,
      CASE
        WHEN ops.curr = 'USD' THEN 1::numeric
        ELSE COALESCE(
          (SELECT er.rate FROM exchange_rates er
             WHERE er.from_currency = 'USD' AND er.to_currency = 'ARS'
               AND er.rate_date <= ops.rate_date
             ORDER BY er.rate_date DESC LIMIT 1),
          (SELECT er.rate FROM exchange_rates er
             WHERE er.from_currency = 'USD' AND er.to_currency = 'ARS'
             ORDER BY er.rate_date DESC LIMIT 1),
          1450::numeric
        )
      END AS fx
    FROM ops
  ),
  paid_native AS (
    SELECT
      ows.id AS operation_id,
      COALESCE(SUM(
        CASE
          WHEN p.id IS NULL THEN 0
          WHEN p.currency = ows.curr THEN COALESCE(p.amount, 0)::numeric
          WHEN ows.curr = 'ARS' AND p.currency = 'USD'
            THEN COALESCE(p.amount, 0)::numeric * COALESCE(NULLIF(p.exchange_rate, 0), ows.fx)
          WHEN ows.curr = 'USD' AND p.currency = 'ARS'
            THEN COALESCE(
                   p.amount_usd::numeric,
                   COALESCE(p.amount, 0)::numeric / NULLIF(COALESCE(NULLIF(p.exchange_rate, 0), ows.fx), 0)
                 )
          ELSE COALESCE(p.amount, 0)::numeric
        END
      ), 0) AS paid_in_sale_currency
    FROM ops_with_fx ows
    LEFT JOIN payments p
      ON p.operation_id = ows.id
     AND p.direction = 'INCOME'
     AND p.payer_type = 'CUSTOMER'
     AND p.status = 'PAID'
    GROUP BY ows.id
  )
  SELECT COALESCE(SUM(
    CASE
      WHEN ows.curr = 'ARS'
        THEN GREATEST(0::numeric, (ows.sale_amount_total + ows.svc_sale) - COALESCE(pn.paid_in_sale_currency, 0)) / NULLIF(ows.fx, 0)
      ELSE GREATEST(0::numeric, (ows.sale_amount_total + ows.svc_sale) - COALESCE(pn.paid_in_sale_currency, 0))
    END
  ), 0)::numeric
  FROM ops_with_fx ows
  LEFT JOIN paid_native pn ON pn.operation_id = ows.id;
$$;

COMMENT ON FUNCTION accounting_debts_sales_total IS
  'KPI Deudores total USD. Multi-tenant (org/role/agency). p_include_services=true suma operation_services impagos (flag features.include_services_in_sale_total). Base 20260617000001 (cobros en moneda de venta).';

-- ------------------------------------------------------------
-- 2) analytics_sales_summary  (KPIs venta/margen/costo)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS analytics_sales_summary(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_sales_summary(
  p_user_id          UUID,
  p_org_id           UUID,
  p_role             TEXT,
  p_agency_ids       UUID[],
  p_date_from        DATE DEFAULT NULL,
  p_date_to          DATE DEFAULT NULL,
  p_agency_id        UUID DEFAULT NULL,
  p_seller_id        UUID DEFAULT NULL,
  p_include_services BOOLEAN DEFAULT false
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
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date,
      CASE WHEN p_include_services THEN (
        SELECT COALESCE(SUM(os.sale_amount), 0)::numeric FROM operation_services os
        WHERE os.operation_id = o.id AND os.sale_currency = COALESCE(o.sale_currency, o.currency, 'USD')
      ) ELSE 0::numeric END AS svc_sale,
      CASE WHEN p_include_services THEN (
        SELECT COALESCE(SUM(os.cost_amount), 0)::numeric FROM operation_services os
        WHERE os.operation_id = o.id AND os.cost_currency = COALESCE(o.sale_currency, o.currency, 'USD')
      ) ELSE 0::numeric END AS svc_cost
    FROM operations o
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
      AND (p_seller_id IS NULL OR o.seller_id = p_seller_id)
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
             WHERE er.from_currency = 'USD' AND er.to_currency = 'ARS'
               AND er.rate_date <= ops.rate_date
             ORDER BY er.rate_date DESC LIMIT 1),
          (SELECT er.rate FROM exchange_rates er
             WHERE er.from_currency = 'USD' AND er.to_currency = 'ARS'
             ORDER BY er.rate_date DESC LIMIT 1),
          1450::numeric
        )
      END AS fx
    FROM ops
  ),
  totals AS (
    SELECT
      COALESCE(SUM(
        CASE WHEN curr = 'ARS' THEN (sale_amount_total + svc_sale) / NULLIF(fx, 0)
             ELSE (sale_amount_total + svc_sale) END
      ), 0)::numeric AS sales_usd,
      COALESCE(SUM(
        CASE WHEN curr = 'ARS' THEN (margin_amount + (svc_sale - svc_cost)) / NULLIF(fx, 0)
             ELSE (margin_amount + (svc_sale - svc_cost)) END
      ), 0)::numeric AS margin_usd,
      COALESCE(SUM(
        CASE WHEN curr = 'ARS' THEN (operator_cost + svc_cost) / NULLIF(fx, 0)
             ELSE (operator_cost + svc_cost) END
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
  'KPIs analytics/sales en USD. p_include_services=true suma operation_services a venta/costo/margen (flag features.include_services_in_sale_total).';

-- ------------------------------------------------------------
-- 3) analytics_sellers_summary  (ranking vendedores)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS analytics_sellers_summary(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID);

CREATE OR REPLACE FUNCTION analytics_sellers_summary(
  p_user_id          UUID,
  p_org_id           UUID,
  p_role             TEXT,
  p_agency_ids       UUID[],
  p_date_from        DATE DEFAULT NULL,
  p_date_to          DATE DEFAULT NULL,
  p_agency_id        UUID DEFAULT NULL,
  p_include_services BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id                   UUID,
  name                 TEXT,
  total_sales          NUMERIC,
  margin               NUMERIC,
  operations_count     BIGINT,
  avg_margin_percent   NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ops AS (
    SELECT
      o.seller_id,
      o.sale_amount_total,
      o.margin_amount,
      COALESCE(o.sale_currency, o.currency, 'USD') AS curr,
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date,
      CASE WHEN p_include_services THEN (
        SELECT COALESCE(SUM(os.sale_amount), 0)::numeric FROM operation_services os
        WHERE os.operation_id = o.id AND os.sale_currency = COALESCE(o.sale_currency, o.currency, 'USD')
      ) ELSE 0::numeric END AS svc_sale,
      CASE WHEN p_include_services THEN (
        SELECT COALESCE(SUM(os.cost_amount), 0)::numeric FROM operation_services os
        WHERE os.operation_id = o.id AND os.cost_currency = COALESCE(o.sale_currency, o.currency, 'USD')
      ) ELSE 0::numeric END AS svc_cost
    FROM operations o
    WHERE
      o.seller_id IS NOT NULL
      AND (p_org_id IS NULL OR o.org_id = p_org_id)
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
  sellers_agg AS (
    SELECT
      ows.seller_id,
      COALESCE(SUM(
        CASE WHEN ows.curr='ARS' THEN (ows.sale_amount_total + ows.svc_sale) / NULLIF(ows.fx, 0)
             ELSE (ows.sale_amount_total + ows.svc_sale) END
      ), 0)::numeric AS total_sales,
      COALESCE(SUM(
        CASE WHEN ows.curr='ARS' THEN (ows.margin_amount + (ows.svc_sale - ows.svc_cost)) / NULLIF(ows.fx, 0)
             ELSE (ows.margin_amount + (ows.svc_sale - ows.svc_cost)) END
      ), 0)::numeric AS total_margin,
      COUNT(*)::bigint AS ops_count
    FROM ops_with_fx ows
    GROUP BY ows.seller_id
  )
  SELECT
    sa.seller_id                                        AS id,
    COALESCE(u.name, 'Vendedor')::text                  AS name,
    sa.total_sales                                      AS total_sales,
    sa.total_margin                                     AS margin,
    sa.ops_count                                        AS operations_count,
    CASE WHEN sa.total_sales > 0
      THEN (sa.total_margin / sa.total_sales * 100)::numeric
      ELSE 0::numeric
    END                                                 AS avg_margin_percent
  FROM sellers_agg sa
  LEFT JOIN users u ON u.id = sa.seller_id
  ORDER BY sa.total_sales DESC;
$$;

COMMENT ON FUNCTION analytics_sellers_summary IS
  'Ranking vendedores en USD. p_include_services=true suma operation_services a venta/margen (flag features.include_services_in_sale_total).';

-- ------------------------------------------------------------
-- 4) analytics_destinations_summary  (top destinos)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS analytics_destinations_summary(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID, INT);

CREATE OR REPLACE FUNCTION analytics_destinations_summary(
  p_user_id          UUID,
  p_org_id           UUID,
  p_role             TEXT,
  p_agency_ids       UUID[],
  p_date_from        DATE DEFAULT NULL,
  p_date_to          DATE DEFAULT NULL,
  p_agency_id        UUID DEFAULT NULL,
  p_limit            INT  DEFAULT 5,
  p_include_services BOOLEAN DEFAULT false
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
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date,
      CASE WHEN p_include_services THEN (
        SELECT COALESCE(SUM(os.sale_amount), 0)::numeric FROM operation_services os
        WHERE os.operation_id = o.id AND os.sale_currency = COALESCE(o.sale_currency, o.currency, 'USD')
      ) ELSE 0::numeric END AS svc_sale,
      CASE WHEN p_include_services THEN (
        SELECT COALESCE(SUM(os.cost_amount), 0)::numeric FROM operation_services os
        WHERE os.operation_id = o.id AND os.cost_currency = COALESCE(o.sale_currency, o.currency, 'USD')
      ) ELSE 0::numeric END AS svc_cost
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
      COALESCE(SUM(CASE WHEN ows.curr='ARS' THEN (ows.sale_amount_total + ows.svc_sale) / NULLIF(ows.fx, 0) ELSE (ows.sale_amount_total + ows.svc_sale) END), 0)::numeric AS total_sales,
      COALESCE(SUM(CASE WHEN ows.curr='ARS' THEN (ows.margin_amount + (ows.svc_sale - ows.svc_cost)) / NULLIF(ows.fx, 0) ELSE (ows.margin_amount + (ows.svc_sale - ows.svc_cost)) END), 0)::numeric AS total_margin,
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
  'Top destinos en USD. p_include_services=true suma operation_services a venta/margen (flag features.include_services_in_sale_total).';
