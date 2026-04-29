-- ============================================================
-- A2-bis: RPC accounting_debts_sales_total
-- ============================================================
-- Reemplaza el patrón "fetch all customers + operations + payments + sumar
-- en JS" por una sola query SUM SQL para el KPI "Deudores" del dashboard.
--
-- IMPORTANTE: solo CREA la función. NO toca schema, NO afecta endpoints.
-- 100% seguro de ejecutar durante uso normal en producción.
--
-- Multi-tenant safe:
--   - SECURITY INVOKER → respeta RLS del usuario que llama.
--   - Filtros explícitos por org_id, role, agency, seller (defense-in-depth).
--
-- Math:
--   debt_usd = max(0, sale_amount_usd - paid_usd)
--   donde:
--     sale_amount_usd = ARS ? sale_amount_total / fx_rate(date) : sale_amount_total
--     paid_usd = SUM de payments PAID, INCOME, CUSTOMER (con amount_usd o conversion)
--   total = SUM(debt_usd) over all matching operations
-- ============================================================

CREATE OR REPLACE FUNCTION accounting_debts_sales_total(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_seller_id  UUID DEFAULT NULL,
  p_date_type  TEXT DEFAULT 'SALIDA' -- SALIDA (departure_date fallback created_at) | CREACION
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ops AS (
    -- Solo operations que tienen al menos un customer asociado (mismo
    -- universo que el endpoint actual que parte de customers + nested join).
    SELECT DISTINCT
      o.id,
      o.sale_amount_total,
      COALESCE(o.sale_currency, o.currency, 'USD') AS curr,
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date,
      o.created_at,
      o.departure_date
    FROM operations o
    INNER JOIN operation_customers oc ON oc.operation_id = o.id
    WHERE
      -- Multi-tenant scope
      (p_org_id IS NULL OR o.org_id = p_org_id)
      -- Role-based filter (mismo patrón que analytics_sales_summary)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
               OR o.agency_id = ANY(p_agency_ids))
        )
      )
      -- Filtro opcional de seller (cuando dashboard manda sellerId)
      AND (p_seller_id IS NULL OR o.seller_id = p_seller_id)
      -- Filtro de fechas según date_type. Usa zona horaria AR (UTC-3) para
      -- matchear startOfDayAR/endOfDayAR del código TS.
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
  payments_paid AS (
    -- Suma de payments PAID por operation, convertidos a USD.
    -- Mirror de la lógica JS:
    --   paidUsd = amount_usd ?? (USD ? amount : ARS ? amount/exchange_rate : 0)
    SELECT
      p.operation_id,
      SUM(
        CASE
          WHEN p.amount_usd IS NOT NULL THEN p.amount_usd::numeric
          WHEN p.currency = 'USD' THEN COALESCE(p.amount, 0)::numeric
          WHEN p.currency = 'ARS' AND p.exchange_rate IS NOT NULL AND p.exchange_rate > 0
            THEN (COALESCE(p.amount, 0) / p.exchange_rate)::numeric
          ELSE 0::numeric
        END
      ) AS paid_usd
    FROM payments p
    WHERE p.operation_id IN (SELECT id FROM ops)
      AND p.direction = 'INCOME'
      AND p.payer_type = 'CUSTOMER'
      AND p.status = 'PAID'
    GROUP BY p.operation_id
  )
  SELECT COALESCE(SUM(GREATEST(
    0::numeric,
    (CASE WHEN ows.curr = 'ARS' THEN ows.sale_amount_total / NULLIF(ows.fx, 0)
          ELSE ows.sale_amount_total END)::numeric
    - COALESCE(pp.paid_usd, 0)::numeric
  )), 0)::numeric
  FROM ops_with_fx ows
  LEFT JOIN payments_paid pp ON pp.operation_id = ows.id;
$$;

COMMENT ON FUNCTION accounting_debts_sales_total IS
  'A2-bis perf: retorna el total de deuda de clientes (Cuentas por Cobrar) en USD para el KPI "Deudores" del dashboard. Reemplaza el fetch+JS-sum del endpoint /api/accounting/debts-sales solo para el caso del KPI total. La vista detallada del módulo /accounting/debts-sales sigue usando el endpoint completo.';

-- ============================================================
-- ROLLBACK:
-- ============================================================
-- DROP FUNCTION IF EXISTS accounting_debts_sales_total(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID, TEXT);
