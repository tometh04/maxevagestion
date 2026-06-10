-- ============================================================
-- Perf cleanup Ola 2 — Índices CONCURRENTLY
-- ============================================================
-- Fecha: 2026-06-10
-- Contexto: Supabase alertó que el proyecto está agotando el
--   Disk IO Budget. Diagnóstico: índices faltantes en la función
--   user_org_ids() + tablas de alto volumen sin índices compuestos
--   con org_id.
--
-- Causa raíz #1 (CRÍTICA):
--   user_org_ids() hace SELECT FROM organization_members
--   WHERE user_id = auth.uid() AND status = 'ACTIVE'.
--   Esta función se evalúa por CADA FILA en CADA query de las 34+
--   tablas con policy "tenant_isolation". Sin índice en
--   organization_members(user_id, status), cada evaluación RLS
--   es un seq scan. Con miles de queries/hora, esto genera IO masivo.
--
-- Causa raíz #2:
--   Tablas de alto volumen (alerts, ledger_movements, payments,
--   operator_payments, recurring_payments) tienen índices simples
--   en org_id y en otras columnas por separado, pero no compuestos.
--   Los cron jobs y listados paginados hacen filter + sort que
--   requieren el compuesto para evitar el sort posterior.
--
-- IMPORTANTE — al pegar en Supabase SQL Editor:
--   CREATE INDEX CONCURRENTLY no puede ejecutarse dentro de una
--   transacción. Pegá UNA SENTENCIA POR VEZ y dale Run a cada una.
--   Cada CREATE tarda entre 5 y 60 segundos según tamaño de tabla.
-- ============================================================


-- ============================================================
-- BLOQUE 1: organization_members — FIX CRÍTICO
-- ============================================================

-- 1. Índice compuesto (user_id, status) — soporte directo para
--    user_org_ids() que hace WHERE user_id = auth.uid() AND status = 'ACTIVE'.
--    Impacto: -50%+ en tiempo de evaluación RLS en todas las 34+ tablas.
--    Partial WHERE status = 'ACTIVE' porque es el único valor que importa.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_user_status
  ON organization_members(user_id, status)
  WHERE status = 'ACTIVE';

-- 2. Índice en (organization_id) para lookup inverso (quiénes son miembros
--    de un org). Usado por policies de INSERT/UPDATE/DELETE en org_members.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_org_id
  ON organization_members(organization_id)
  WHERE status = 'ACTIVE';


-- ============================================================
-- BLOQUE 2: alerts — cron diario + listados de alertas
-- ============================================================

-- 3. Compuesto (org_id, status) — el cron de alerts y la UI filtran
--    por org_id y status='PENDING'. Los índices simples existentes
--    (idx_alerts_status, idx_alerts_date_due) no cubren el filtro multi-tenant.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_org_status
  ON alerts(org_id, status)
  WHERE org_id IS NOT NULL;

-- 4. Compuesto (org_id, date_due) — listados ordenados por vencimiento.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_org_date_due
  ON alerts(org_id, date_due DESC)
  WHERE org_id IS NOT NULL AND status = 'PENDING';


-- ============================================================
-- BLOQUE 3: ledger_movements — contabilidad y reportes
-- ============================================================

-- 5. Compuesto (org_id, movement_date DESC) — listados contables paginados.
--    Ya existe idx_ledger_movements_org_id simple y
--    idx_ledger_movements_movement_date simple, pero el compuesto evita
--    el sort post-filter en queries ORDER BY movement_date.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_movements_org_date
  ON ledger_movements(org_id, movement_date DESC)
  WHERE org_id IS NOT NULL;

-- 6. Compuesto (org_id, type, movement_date) — reportes que filtran
--    por tipo de movimiento dentro de un org.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_movements_org_type_date
  ON ledger_movements(org_id, type, movement_date DESC)
  WHERE org_id IS NOT NULL;


-- ============================================================
-- BLOQUE 4: payments — listados y cron billing-reconcile
-- ============================================================

-- 7. Compuesto (org_id, status) — listados de pagos por estado.
--    El idx_payments_pending_due existente incluye (payer_type, status, date_due)
--    pero sin org_id, por lo que no filtra multi-tenant eficientemente.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_org_status
  ON payments(org_id, status)
  WHERE org_id IS NOT NULL;

-- 8. Compuesto (org_id, created_at DESC) — listados recientes de pagos.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_org_created_at
  ON payments(org_id, created_at DESC)
  WHERE org_id IS NOT NULL;


-- ============================================================
-- BLOQUE 5: operator_payments — deuda al operador + cron audit-drift
-- ============================================================

-- 9. Compuesto (org_id, status) — cálculo de deuda pendiente por org.
--    Ya existe idx_operator_payments_org_id simple y
--    idx_operator_payments_status simple, pero el compuesto evita
--    el filter doble.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operator_payments_org_status
  ON operator_payments(org_id, status)
  WHERE org_id IS NOT NULL;

-- 10. Compuesto (org_id, operator_id) — detalle de deuda por operador.
--     Usado por el panel de operadores y el cron audit-operator-debt-drift.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operator_payments_org_operator
  ON operator_payments(org_id, operator_id)
  WHERE org_id IS NOT NULL;


-- ============================================================
-- BLOQUE 6: recurring_payments — cron mensual
-- ============================================================

-- 11. Compuesto (org_id, is_active) — cron recurring-payments filtra
--     pagos activos por org. Ya existe idx_recurring_payments_org_id simple
--     y idx_recurring_payments_active simple.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recurring_payments_org_active
  ON recurring_payments(org_id, is_active)
  WHERE org_id IS NOT NULL AND is_active = true;


-- ============================================================
-- VERIFICACIÓN (correr después de los 11 CREATE):
-- ============================================================
-- SELECT relname AS tabla, indexrelname AS index_name,
--        pg_size_pretty(pg_relation_size(indexrelid)) AS size
-- FROM pg_stat_user_indexes
-- WHERE indexrelname IN (
--   'idx_org_members_user_status',
--   'idx_org_members_org_id',
--   'idx_alerts_org_status',
--   'idx_alerts_org_date_due',
--   'idx_ledger_movements_org_date',
--   'idx_ledger_movements_org_type_date',
--   'idx_payments_org_status',
--   'idx_payments_org_created_at',
--   'idx_operator_payments_org_status',
--   'idx_operator_payments_org_operator',
--   'idx_recurring_payments_org_active'
-- )
-- ORDER BY indexrelname;
-- Esperado: 11 filas.


-- ============================================================
-- ROLLBACK (si algún índice causa regresión, raro):
-- ============================================================
-- DROP INDEX CONCURRENTLY IF EXISTS idx_org_members_user_status;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_org_members_org_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_alerts_org_status;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_alerts_org_date_due;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_ledger_movements_org_date;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_ledger_movements_org_type_date;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_payments_org_status;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_payments_org_created_at;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operator_payments_org_status;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operator_payments_org_operator;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_recurring_payments_org_active;
