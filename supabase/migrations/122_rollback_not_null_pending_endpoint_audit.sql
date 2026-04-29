-- =====================================================
-- Migration 122: ROLLBACK del SET NOT NULL aplicado en migration 121
-- =====================================================
-- Contexto: el SET NOT NULL en customers/operators/payments/cash_movements
-- se aplicó en 121 con triggers BEFORE INSERT (migration 119) como red
-- de seguridad. Al hacer smoke test post-NOT-NULL en producción (Lozada/
-- Rosario), crear un cliente desde la UI falló con
--   "null value in column agency_id violates not-null constraint"
-- porque el endpoint app/api/customers/route.ts (POST) no pasa agency_id
-- y el trigger basado en auth.uid() no atrapó (server-side context).
--
-- Decisión: hacer rollback del NOT NULL para no romper operatoria de Maxi.
-- La auditoría de endpoints (modificar todos los endpoints que insertan
-- en estas 4 tablas para que pasen agency_id explícito) queda como sprint
-- dedicado posterior.
--
-- ESTADO POST-MIGRATION 122:
--   ✅ Columna agency_id existe en las 4 tablas
--   ✅ Backfill completo (todas las filas existentes tienen agency_id)
--   ✅ Triggers BEFORE INSERT atrapan inserts con auth.uid() o operation_id
--   ❌ Constraint NOT NULL postergada (filas nuevas pueden quedar NULL)
--   ✅ Backups disponibles en *_backup_2026_04_28
--
-- PARA RE-APLICAR EL NOT NULL EN SPRINT FUTURO:
--   1. Auditar TODOS los endpoints en app/api/** y server actions que
--      hacen INSERT en customers/operators/payments/cash_movements
--   2. Modificar cada uno para pasar agency_id explícito
--   3. Deploy
--   4. Re-correr migration 121 (con el catch-up dentro)
-- =====================================================

ALTER TABLE customers ALTER COLUMN agency_id DROP NOT NULL;
ALTER TABLE operators ALTER COLUMN agency_id DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN agency_id DROP NOT NULL;
ALTER TABLE cash_movements ALTER COLUMN agency_id DROP NOT NULL;

-- Verificación: las 4 tablas vuelven a NULLABLE
SELECT
  table_name,
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'agency_id'
  AND table_name IN ('customers', 'operators', 'payments', 'cash_movements')
ORDER BY table_name;
