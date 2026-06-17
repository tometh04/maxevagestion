-- ============================================================
-- Bug fix 2026-06-17: KPI Deudores cuenta cobros ARS sin T/C como 0
-- ============================================================
-- La RPC accounting_debts_sales_total dolarizaba cada cobro por separado:
--   WHEN p.currency = 'ARS' AND p.exchange_rate IS NOT NULL → amount/exchange_rate
--   ELSE 0
-- Un cobro en ARS sin exchange_rate ni amount_usd (caso típico: operación en
-- ARS cobrada en ARS, sin tipo de cambio) se contaba como 0 USD. Resultado:
-- operaciones ARS totalmente cobradas figuraban con deuda fantasma en el KPI
-- "Deudores" (y en el detalle/export, arreglado en /api/accounting/debts-sales).
--
-- Fix: sumar los cobros EN LA MONEDA DE LA VENTA y recién convertir el NETO a
-- USD (mismo criterio que la venta). Así una venta ARS cobrada en ARS netea a 0
-- sin depender de que cada pago tenga T/C.
--
-- Signature idéntica a la migration 20260506000001 (CREATE OR REPLACE, sin drop).
-- ============================================================

CREATE OR REPLACE FUNCTION accounting_debts_sales_total(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_seller_id  UUID DEFAULT NULL,
  p_date_type  TEXT DEFAULT 'SALIDA',
  p_agency_id  UUID DEFAULT NULL
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
      o.departure_date
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
  -- Cobros sumados EN LA MONEDA DE LA VENTA (no dolarizados por pago).
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
        THEN GREATEST(0::numeric, ows.sale_amount_total - COALESCE(pn.paid_in_sale_currency, 0)) / NULLIF(ows.fx, 0)
      ELSE GREATEST(0::numeric, ows.sale_amount_total - COALESCE(pn.paid_in_sale_currency, 0))
    END
  ), 0)::numeric
  FROM ops_with_fx ows
  LEFT JOIN paid_native pn ON pn.operation_id = ows.id;
$$;

COMMENT ON FUNCTION accounting_debts_sales_total IS
  'KPI Deudores total USD. Multi-tenant: respeta org/role/agency_ids del user; p_agency_id (singular) restringe a una agencia. Migration 20260617000001 fixea bug donde cobros en ARS sin tipo de cambio se contaban como 0 USD (operaciones ARS cobradas figuraban con deuda fantasma). Ahora suma cobros en la moneda de la venta y convierte el neto a USD.';
