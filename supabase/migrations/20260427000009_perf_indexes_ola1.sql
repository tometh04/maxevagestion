-- ============================================================
-- Perf cleanup Ola 1 — Task 1 (A6): Índices CONCURRENTLY
-- ============================================================
-- Fecha: 2026-04-27
-- Spec:  docs/superpowers/specs/2026-04-27-perf-cleanup-design.md
-- Plan:  docs/superpowers/plans/2026-04-27-perf-cleanup-ola1.md
--
-- Riesgo: CERO. Índices estrictamente aditivos.
--   - CONCURRENTLY no toma lock de la tabla → sin downtime.
--   - IF NOT EXISTS protege contra re-ejecución.
--   - Si Postgres no usa el índice (raro), no rompe nada — solo ocupa disco.
--
-- IMPORTANTE — al pegar en Supabase SQL Editor:
--   CREATE INDEX CONCURRENTLY no puede ejecutarse dentro de una transacción.
--   Si pegás TODO de una vez y el editor envuelve en BEGIN/COMMIT, falla.
--   Pegá UNA SENTENCIA POR VEZ y dale Run a cada una. Cada CREATE tarda
--   entre 5 y 60 segundos según tamaño de tabla.
--
-- Multi-tenant: ninguno cambia visibilidad de datos. RLS sigue evaluando
-- igual. Los compuestos (org_id, ...) aceleran el filtro multi-tenant que
-- las RLS policies ya hacen.
-- ============================================================


-- 1. users.auth_id — usado por middleware en CADA request (sin index hoy).
--    El middleware busca users WHERE auth_id = <uuid> en cada navegación.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_auth_id
  ON users(auth_id)
  WHERE auth_id IS NOT NULL;


-- 2. operations(org_id, created_at DESC) compuesto — listings y analytics.
--    Ya existe idx_operations_org_id simple, pero el compuesto evita el
--    sort post-filter en queries que ordenan por created_at.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operations_org_created_at
  ON operations(org_id, created_at DESC)
  WHERE org_id IS NOT NULL;


-- 3. cash_movements(org_id, movement_date DESC) — /cash/movements paginado.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cash_movements_org_date
  ON cash_movements(org_id, movement_date DESC)
  WHERE org_id IS NOT NULL;


-- 4. leads(org_id, updated_at DESC) — kanbans.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_updated
  ON leads(org_id, updated_at DESC)
  WHERE org_id IS NOT NULL;


-- 5. wa_messages(org_id, sent_at DESC) — wha-control listing.
--    Nota: la columna real es sent_at (NOT NULL), no received_at.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_messages_org_sent
  ON wa_messages(org_id, sent_at DESC)
  WHERE org_id IS NOT NULL;


-- 6. operation_customers(operation_id) — JOIN sin índice.
--    Postgres NO auto-indexa columnas FK. Crítico para debts-sales y
--    operation detail (ambos hacen JOIN por operation_id).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_customers_operation
  ON operation_customers(operation_id);


-- 7. operation_customers(customer_id) — mismo motivo, otro lado del JOIN.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_customers_customer
  ON operation_customers(customer_id);


-- 8. payments parcial — para /reports/upcoming-due.
--    Solo PENDING/OVERDUE, ordenados por fecha de vencimiento.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_pending_due
  ON payments(payer_type, status, date_due)
  WHERE status IN ('PENDING','OVERDUE');


-- 9. operator_payments parcial — para /reports/upcoming-due.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operator_payments_pending_due
  ON operator_payments(status, due_date)
  WHERE status IN ('PENDING','OVERDUE');


-- ============================================================
-- VERIFICACIÓN (correr después de los 9 CREATE):
-- ============================================================
-- SELECT relname AS tabla, indexrelname AS index_name,
--        pg_size_pretty(pg_relation_size(indexrelid)) AS size
-- FROM pg_stat_user_indexes
-- WHERE indexrelname IN (
--   'idx_users_auth_id',
--   'idx_operations_org_created_at',
--   'idx_cash_movements_org_date',
--   'idx_leads_org_updated',
--   'idx_wa_messages_org_sent',
--   'idx_operation_customers_operation',
--   'idx_operation_customers_customer',
--   'idx_payments_pending_due',
--   'idx_operator_payments_pending_due'
-- )
-- ORDER BY indexrelname;
-- Esperado: 9 filas.


-- ============================================================
-- ROLLBACK (si algún índice causa regresión, raro):
-- ============================================================
-- DROP INDEX CONCURRENTLY IF EXISTS idx_users_auth_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operations_org_created_at;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_cash_movements_org_date;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_org_updated;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_wa_messages_org_sent;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operation_customers_operation;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operation_customers_customer;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_payments_pending_due;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operator_payments_pending_due;
