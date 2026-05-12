-- Migración 2026-05-11: restaurar policies faltantes en payment_passenger_allocations
--
-- PROBLEMA (reportado por Santi):
--   Bug "asigné un pago y no lo tomó". POST /api/payments/allocations devolvía
--   200 success, pero GET inmediato posterior retornaba []. Lo mismo con DELETE:
--   200 status pero no eliminaba nada.
--
-- DIAGNÓSTICO:
--   pg_policies en producción mostraba SOLO 1 policy en la tabla:
--   payment_passenger_allocations_insert (con WITH CHECK = true).
--
--   Las policies de SELECT, UPDATE y DELETE que mig 134 había creado
--   (todas con USING/WITH CHECK = true) FUERON DROPEADAS en algún
--   momento directamente en Supabase (sin versionar en el repo).
--
--   Postgres: cuando RLS está enabled pero NO hay policy para una
--   operación → DENY por default. Por eso:
--     - INSERT con service_role bypaseaba RLS → OK
--     - SELECT con user-auth → 0 rows (deny silencioso)
--     - DELETE con user-auth → 0 rows afectadas (deny silencioso)
--
-- FIX:
--   Recrear las 3 policies como estaban en mig 134 (USING true).
--
--   Tenant isolation queda garantizado en la app: los endpoints filtran
--   por paymentId/operationId, y para ver el payment padre el user
--   necesita RLS de payments (que sí tiene tenant_isolation).
--
-- WORKAROUND adicional (NO depende de esta migración):
--   /api/payments/allocations GET/DELETE usan createAdminClient como
--   defense-in-depth. Si alguien dropea estas policies de nuevo, la
--   app sigue funcionando. La permission check al inicio del handler
--   ya valida acceso (hasPermission cash read/write).

BEGIN;

DROP POLICY IF EXISTS "payment_passenger_allocations_select" ON payment_passenger_allocations;
CREATE POLICY "payment_passenger_allocations_select" ON payment_passenger_allocations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "payment_passenger_allocations_update" ON payment_passenger_allocations;
CREATE POLICY "payment_passenger_allocations_update" ON payment_passenger_allocations
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "payment_passenger_allocations_delete" ON payment_passenger_allocations;
CREATE POLICY "payment_passenger_allocations_delete" ON payment_passenger_allocations
  FOR DELETE USING (true);

COMMIT;
