-- =====================================================
-- Migración 141: Fix execute_readonly_query a SECURITY INVOKER
-- =====================================================
-- SaaS Pilar 2 — Bloqueante crítico de tenant isolation.
--
-- La función `execute_readonly_query` era SECURITY DEFINER, es decir corría
-- con los permisos del owner (superuser) y **bypasseaba RLS**. Cualquier
-- caller authenticated podía agregar (SUM / GROUP BY) datos de otras
-- organizaciones vía SQL crudo.
--
-- Callers afectados:
--   - /api/accounting/ledger/stats (agregados de ledger_movements)
--   - /api/cash/daily-balance (series diarias de balance)
--   - AI Companion (Cerebro) — queries ad-hoc generados por el LLM
--
-- Este cambio recrea la función como SECURITY INVOKER: al ejecutarse con
-- los permisos del caller, el EXECUTE interno pasa por RLS y cada tenant
-- solo ve sus propias rows (policy user_org_ids() sobre ledger_movements,
-- invoices, operations, etc). El AI Companion queda protegido automático.
--
-- Las validaciones anti-injection (solo SELECT, un solo statement,
-- comandos peligrosos bloqueados) se preservan tal cual estaban en mig 091.

CREATE OR REPLACE FUNCTION execute_readonly_query(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  normalized_query TEXT;
  result JSONB;
  query_start_time TIMESTAMP;
  query_duration INTERVAL;
  trimmed_query TEXT;
  semicolon_count INTEGER;
BEGIN
  IF query_text IS NULL OR TRIM(query_text) = '' THEN
    RAISE EXCEPTION 'Query vacía no permitida';
  END IF;

  normalized_query := UPPER(REGEXP_REPLACE(TRIM(query_text), '^\s+', '', 'g'));

  IF NOT normalized_query ~ '^SELECT\s' THEN
    RAISE EXCEPTION 'Solo se permiten queries SELECT. Query recibida: %', LEFT(REGEXP_REPLACE(query_text, '\s+', ' ', 'g'), 100);
  END IF;

  IF normalized_query ~ '\m(DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL)\M' THEN
    RAISE EXCEPTION 'Comandos peligrosos no permitidos en queries readonly';
  END IF;

  IF normalized_query ~ ';\s*(DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL)' THEN
    RAISE EXCEPTION 'Múltiples comandos no permitidos';
  END IF;

  trimmed_query := TRIM(TRAILING ';' FROM TRIM(query_text));
  semicolon_count := (SELECT COUNT(*) FROM regexp_split_to_table(trimmed_query, ';'));

  IF semicolon_count > 1 THEN
    RAISE EXCEPTION 'Múltiples statements no permitidos';
  END IF;

  query_start_time := clock_timestamp();

  BEGIN
    EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query_text) INTO result;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error ejecutando query: %', SQLERRM;
  END;

  query_duration := clock_timestamp() - query_start_time;

  IF query_duration > INTERVAL '10 seconds' THEN
    RAISE WARNING 'Query lenta detectada: % segundos. Query: %', EXTRACT(EPOCH FROM query_duration), LEFT(query_text, 200);
  END IF;

  RETURN COALESCE(result, '[]'::JSONB);

END;
$$;

-- El GRANT EXECUTE a authenticated ya fue aplicado en mig 061/064. No hace
-- falta re-grant; CREATE OR REPLACE preserva los privilegios existentes.

COMMENT ON FUNCTION execute_readonly_query IS 'Ejecuta queries SELECT de forma segura para el AI Companion y reportes agregados. SECURITY INVOKER — cada caller ve solo las rows que RLS le permite (SaaS tenant isolation).';
