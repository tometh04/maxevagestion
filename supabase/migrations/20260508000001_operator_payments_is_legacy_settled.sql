-- Migración 2026-05-08: operator_payments.is_legacy_settled
--
-- CONTEXTO
--   Algunos tenants (caso real: Lozada Rosario) cargaron sus saldos
--   bancarios al sistema con el dinero ya descontado por pagos a operadores
--   que se hicieron FUERA del sistema (antes de empezar a usarlo). Las
--   `operator_payments` quedaron en PENDING aunque la plata ya salió del
--   banco real hace meses.
--
--   Marcar esos pagos como PAID requiere:
--   1. Cambiar status / paid_amount → manejado por UPDATE
--   2. Que aparezcan en "Historial de Pagos" → INSERT en payments con
--      is_legacy_import=true
--   3. NO crear ledger_movement → preserva el saldo bancario actual
--      (que ya refleja esos pagos hechos fuera)
--   4. NO crear cash_movement → no aparecen como egreso en /cash/movements
--
--   Pareja conceptual con `payments.is_legacy_import` (mig 20260507000003).
--   Acá el flag aplica a operator_payments (la deuda al operador).
--
-- ESCOPE
--   Default false → ningún tenant existente queda tocado por esta columna
--   sola. El backfill / settlement masivo es por script aparte.
--
-- INTEGRIDAD
--   Las queries de auditoría (orphans / reconciliation) deben excluir
--   is_legacy_settled = true para que no aparezcan como "pagos sin
--   asiento contable" — esos rows NO TIENEN asiento por diseño.

ALTER TABLE operator_payments
  ADD COLUMN IF NOT EXISTS is_legacy_settled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN operator_payments.is_legacy_settled IS
  'Si true, este compromiso de pago al operador se settleó retroactivamente porque la plata ya salió del banco real antes de cargar el sistema. NO tiene ledger_movement asociado (preserva saldos bancarios actuales). Pareja conceptual con payments.is_legacy_import.';

CREATE INDEX IF NOT EXISTS idx_operator_payments_is_legacy_settled
  ON operator_payments(is_legacy_settled)
  WHERE is_legacy_settled = true;

-- Extender el CHECK de payments.source para aceptar LEGACY_SETTLEMENT.
-- Lo usa el script scripts/legacy-settlement-lozada-rosario.sql cuando crea
-- los rows sintéticos en payments para que aparezcan en el "Historial de
-- Pagos" de la operación con badge "Histórico".
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_source_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_source_check
  CHECK (source IN ('MANUAL', 'OPERATOR_BULK', 'LEGACY_SETTLEMENT'));
