-- Migration 2026-05-18: arreglar políticas RLS rotas que permitían leak
-- cross-tenant.
--
-- CONTEXTO:
--   El 2026-05-18 VICO reportó ver pagos/vencimientos/data de Lozada
--   en sus pantallas. Investigación reveló 4 tablas con políticas RLS
--   "tóxicas" (USING true / WITH CHECK true) que hacían bypass del
--   scope multi-tenant:
--
--     1. payments.tenant_isolation (ALL, USING true) — coexistía con
--        payments_tenant_isolation que SÍ filtraba pero por OR de
--        políticas PERMISSIVE la mala ganaba.
--     2. payment_passenger_allocations.* (4 policies, todas USING true) —
--        única tabla del set sin policy buena previa.
--     3. organization_settings."Allow authenticated insert" (INSERT,
--        WITH CHECK true) — permitía a cualquier user crear settings
--        en cualquier org.
--     4. journal_entries.journal_entries_insert (INSERT, WITH CHECK true) —
--        permitía a cualquier user crear asientos contables en cualquier
--        org.
--
-- FIX:
--   - DROP policies tóxicas
--   - CREATE policies canónicas con `org_id IN (SELECT user_org_ids())`
--   - Para payment_passenger_allocations (sin org_id directo): filtro
--     via JOIN a payments → org_id.
--
-- DEFENSE-IN-DEPTH:
--   Paralelo a este fix DB, ~50 endpoints del código fueron actualizados
--   para filtrar explícito por org_id sin confiar en RLS (commits
--   a0e401c3, 1f5b525d, c74f4869, 434d4086, cb98936e, 10aa152b,
--   23163da9, f3ac010e, 0dfeb4e1, 47c021af, fb538ec7, 356bbed2 +
--   regla canónica en CLAUDE.md commit 819b4f6d).
--
-- IDEMPOTENTE: cada CREATE va precedido de DROP IF EXISTS por si la
-- migration se re-aplica.

BEGIN;

-- ============================================================
-- 1. payments
-- ============================================================
DROP POLICY IF EXISTS "tenant_isolation" ON payments;
DROP POLICY IF EXISTS "payments_org_isolation" ON payments;

CREATE POLICY "payments_org_isolation" ON payments
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- NOTA: dejamos viva la policy legacy "payments_tenant_isolation" (via
-- agency_id) — no hace daño y mantiene compat con cualquier flow viejo
-- que dependa de user_agencies. Si en el futuro se confirma que
-- user_agencies está desactualizada para nuevos tenants, se puede
-- dropear con: DROP POLICY "payments_tenant_isolation" ON payments;

-- ============================================================
-- 2. organization_settings
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated insert" ON organization_settings;
-- Queda viva "tenant_isolation" (ALL con org_id IN user_org_ids()).

-- ============================================================
-- 3. journal_entries
-- ============================================================
DROP POLICY IF EXISTS "journal_entries_insert" ON journal_entries;
-- Queda viva "tenant_isolation" (ALL con org_id IN user_org_ids()).

-- ============================================================
-- 4. payment_passenger_allocations
--    No tiene org_id directo (solo payment_id). DROP las 4 toxicas
--    y CREATE 1 canónica que filtra via JOIN a payments.
-- ============================================================
DROP POLICY IF EXISTS "payment_passenger_allocations_select" ON payment_passenger_allocations;
DROP POLICY IF EXISTS "payment_passenger_allocations_insert" ON payment_passenger_allocations;
DROP POLICY IF EXISTS "payment_passenger_allocations_update" ON payment_passenger_allocations;
DROP POLICY IF EXISTS "payment_passenger_allocations_delete" ON payment_passenger_allocations;
DROP POLICY IF EXISTS "ppa_org_isolation" ON payment_passenger_allocations;

CREATE POLICY "ppa_org_isolation" ON payment_passenger_allocations
  FOR ALL
  USING (
    payment_id IN (
      SELECT id FROM payments
      WHERE org_id IN (SELECT user_org_ids())
    )
  )
  WITH CHECK (
    payment_id IN (
      SELECT id FROM payments
      WHERE org_id IN (SELECT user_org_ids())
    )
  );

COMMIT;
