-- Migración 2026-05-10: Fix RLS de payments para usar organization_members
--
-- PROBLEMA (P0):
--   La policy actual de RLS en `payments` usa `user_agencies` (modelo viejo
--   pre-SaaS), que solo está poblada para Lozada. Para cualquier nuevo
--   tenant, sus users NO ven sus propios payments porque la policy filtra
--   por una tabla vacía para ellos.
--
--   La policy correcta debe usar `organization_members` (el modelo SaaS
--   actual) + `operations.org_id`.
--
-- IMPACTO:
--   Sin este fix, cualquier tenant nuevo abre /payments y la lista
--   aparece VACÍA, aunque la BD tenga sus payments. Lozada funciona por
--   accidente histórico (su user está en user_agencies legacy).
--
-- VERIFICACIÓN POST-MIGRACIÓN:
--   Loguearse como user de un tenant != Lozada y verificar que
--   /payments lista sus rows correctamente.

-- 1. Drop policy vieja (basada en user_agencies)
DROP POLICY IF EXISTS "Users can view payments in their agencies" ON payments;
DROP POLICY IF EXISTS "Users can insert payments in their agencies" ON payments;
DROP POLICY IF EXISTS "Users can update payments in their agencies" ON payments;
DROP POLICY IF EXISTS "Users can delete payments in their agencies" ON payments;
DROP POLICY IF EXISTS "tenant_isolation" ON payments;

-- 2. Nueva policy: scopear por org_id directo (preferido) o via operation_id
--    Usa la función helper user_org_ids() que ya existe (creada en mig 137).
--    Excluye payments con org_id NULL — esos son orphans históricos que
--    se backfillean en script separado.
CREATE POLICY "tenant_isolation" ON payments
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- 3. Garantizar que RLS está habilitado (idempotente)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- NOTA: Los 331 payments con org_id NULL quedan invisibles a TODOS los
-- tenants tras esta migración (correcto: data huérfana no debe ser
-- visible). El backfill aparte (`scripts/p0-backfill-orphan-payments-org-id.sql`)
-- los recupera asignándolos a su tenant correcto.
