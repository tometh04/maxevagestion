-- ============================================================
-- Bug fix 2026-05-06: KPI Deudores ignora filtro de agencia
-- ============================================================
-- La RPC accounting_debts_sales_total recibía solo `p_agency_ids` (array
-- de TODAS las agencias del user) y filtraba a ese conjunto. Faltaba el
-- parámetro `p_agency_id` (singular) para acotar a UNA agencia específica
-- cuando el user filtra en el dashboard.
--
-- Resultado en prod: en tenants multi-agencia (Lozada = Rosario + Madero)
-- el KPI Deudores sumaba SIEMPRE todas las agencias, sin importar el filtro
-- visual. Asimétrico con `accounting_operator_debts_total` que sí lo soporta.
--
-- Esta migration:
--   1) Drop la función vieja (signature 8 params)
--   2) Re-crear con `p_agency_id UUID DEFAULT NULL` al final
--   3) Filtro en SQL: si p_agency_id IS NOT NULL, restringe operations.agency_id
--      a ese valor — además del filtro previo por p_agency_ids.
--
-- Compatible con callers viejos: el parámetro nuevo tiene DEFAULT NULL,
-- así que llamadas que no lo pasen siguen funcionando como antes.
-- ============================================================

DROP FUNCTION IF EXISTS accounting_debts_sales_total(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID, TEXT);

CREATE OR REPLACE FUNCTION accounting_debts_sales_total(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_seller_id  UUID DEFAULT NULL,
  p_date_type  TEXT DEFAULT 'SALIDA',
  p_agency_id  UUID DEFAULT NULL  -- NUEVO 2026-05-06: filtro opcional a UNA agencia
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
      -- NUEVO: si p_agency_id está seteado, restringe a esa agencia.
      -- Defense-in-depth: chequea que la agencia esté dentro del set
      -- permitido del user (no podés filtrar por una agencia que no
      -- pertenece al tenant del user).
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
  payments_paid AS (
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
  'KPI Deudores total USD. Multi-tenant: respeta org/role/agency_ids del user. Si p_agency_id (singular) está seteado, restringe el cálculo a ESA agencia (defense-in-depth: tiene que estar dentro de p_agency_ids del user). Migration 20260506000001 fixea bug donde el filtro de agencia del dashboard era ignorado.';
