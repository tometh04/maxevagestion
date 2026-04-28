-- ============================================================
-- A-bis: RPC accounting_operator_debts_total
-- ============================================================
-- KPI "Deuda" del dashboard (Cuentas por Pagar a operadores).
-- Reemplaza el patrón "fetch all operator_payments + filter en JS + sum"
-- por una sola query SUM SQL.
--
-- Replica EXACTO la math del endpoint /api/analytics/pending-balances
-- (sección 2 — accountsPayable):
--   - SOLO operator_payments con status PENDING/OVERDUE
--   - pending = max(0, amount - paid_amount)
--   - USD: pending. ARS: pending / latest_exchange_rate.
--   - Filtro de fechas usa operations.created_at en UTC (NO AR-tz, igual
--     que el endpoint actual).
--
-- IMPORTANTE: solo CREA función. NO toca schema. 100% seguro.
--
-- Multi-tenant safe:
--   - SECURITY INVOKER → respeta RLS de operator_payments.
--   - Filtros explícitos por org_id, role, agency.
-- ============================================================

CREATE OR REPLACE FUNCTION accounting_operator_debts_total(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_agency_id  UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH latest_rate AS (
    SELECT COALESCE(
      (SELECT er.rate FROM exchange_rates er
         WHERE er.from_currency='USD' AND er.to_currency='ARS'
         ORDER BY er.rate_date DESC LIMIT 1),
      1450::numeric
    ) AS rate
  )
  SELECT COALESCE(SUM(
    CASE
      WHEN op.currency = 'USD'
        THEN GREATEST(0::numeric, COALESCE(op.amount,0) - COALESCE(op.paid_amount,0))
      WHEN op.currency = 'ARS'
        THEN GREATEST(0::numeric, COALESCE(op.amount,0) - COALESCE(op.paid_amount,0))
             / NULLIF((SELECT rate FROM latest_rate), 0)
      ELSE 0::numeric
    END
  ), 0)::numeric
  FROM operator_payments op
  INNER JOIN operations o ON o.id = op.operation_id
  WHERE
    -- Multi-tenant scope (defense-in-depth con RLS)
    (p_org_id IS NULL OR o.org_id = p_org_id)
    -- Role-based filter (defense-in-depth)
    AND (
      p_role = 'SUPER_ADMIN'
      OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
      OR (
        p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
        AND (cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
             OR o.agency_id = ANY(p_agency_ids))
      )
    )
    -- Solo pendientes
    AND op.status IN ('PENDING', 'OVERDUE')
    -- Filtros opcionales del dashboard
    AND (p_agency_id IS NULL OR o.agency_id = p_agency_id)
    -- Filtro de fechas: operations.created_at en UTC (mismo patrón que
    -- el endpoint actual con `${dateFrom}T00:00:00.000Z`).
    AND (p_date_from IS NULL OR o.created_at >= (p_date_from::text || 'T00:00:00.000Z')::timestamptz)
    AND (p_date_to   IS NULL OR o.created_at <= (p_date_to::text   || 'T23:59:59.999Z')::timestamptz);
$$;

COMMENT ON FUNCTION accounting_operator_debts_total IS
  'A-bis perf: total de deuda pendiente a operadores en USD para el KPI "Deuda" del dashboard. Reemplaza fetch+JS-sum del endpoint /api/analytics/pending-balances (sección accountsPayable).';

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS accounting_operator_debts_total(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID);
