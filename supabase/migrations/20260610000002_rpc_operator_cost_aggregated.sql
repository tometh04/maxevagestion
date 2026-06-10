-- ============================================================
-- RPC: get_operator_cost_aggregated
-- ============================================================
-- Contexto: el cron audit-operator-debt-drift necesita agregar
--   operation_operators por (org_id, operator_id, currency) para
--   compararlo contra operator_payments y detectar drift de deuda.
--
-- Sin esta función, el cron caía al fallback: leer TODA la tabla
-- operation_operators fila por fila en chunks de 1000, agregar en
-- memoria en Node.js, y repetir. Con el volumen actual de datos
-- esto consume cientos de MB de Disk IO diariamente.
--
-- Esta RPC hace exactamente lo mismo pero en una sola query SQL
-- dentro de Postgres — 1 round-trip, 0 sort en memoria, índice en
-- operation_operators(operator_id) + operators(id, org_id).
--
-- Seguridad: SECURITY DEFINER para que el cron (admin client) la
-- pueda llamar. No acepta parámetros de usuario — la query es fija,
-- no hay riesgo de SQL injection.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_operator_cost_aggregated()
RETURNS TABLE (
  org_id       UUID,
  operator_id  UUID,
  currency     TEXT,
  declared_total NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    op.org_id,
    oo.operator_id,
    COALESCE(oo.cost_currency, 'ARS') AS currency,
    SUM(oo.cost)                       AS declared_total
  FROM operation_operators oo
  JOIN operators op ON op.id = oo.operator_id
  WHERE op.org_id IS NOT NULL
  GROUP BY op.org_id, oo.operator_id, COALESCE(oo.cost_currency, 'ARS')
$$;

-- Acceso solo para service_role (el admin client del cron).
-- Los usuarios autenticados no necesitan esta función.
REVOKE ALL ON FUNCTION public.get_operator_cost_aggregated() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_operator_cost_aggregated() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_operator_cost_aggregated() TO service_role;


-- ============================================================
-- RPC: get_operator_payments_aggregated
-- ============================================================
-- Agrega operator_payments por (org_id, operator_id, currency).
-- Reemplaza el segundo loop de paginación manual del mismo cron.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_operator_payments_aggregated()
RETURNS TABLE (
  org_id       UUID,
  operator_id  UUID,
  currency     TEXT,
  registered_total NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    org_id,
    operator_id,
    COALESCE(currency, 'ARS') AS currency,
    SUM(amount)               AS registered_total
  FROM operator_payments
  WHERE org_id IS NOT NULL
  GROUP BY org_id, operator_id, COALESCE(currency, 'ARS')
$$;

REVOKE ALL ON FUNCTION public.get_operator_payments_aggregated() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_operator_payments_aggregated() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_operator_payments_aggregated() TO service_role;
