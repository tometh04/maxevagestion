-- =====================================================
-- Migración: estado de conciliación bancaria en movimientos de caja
-- =====================================================
-- Contexto (VIB-137, inspirado en el relevamiento de Aptour): vibook no tiene
-- conciliación bancaria. Lo que hoy se llama "reconciliation" en el código es
-- otra cosa — auditoría de integridad de datos (pagos huérfanos) y conciliación
-- de suscripciones de Mercado Pago —, no el cotejo de los movimientos del
-- sistema contra el extracto del banco.
--
-- Aptour modela esto con estados explícitos ("depósitos sin identificar", "en
-- banco sin identificar", "movimiento pendiente"). Esta columna es el
-- equivalente mínimo: permite marcar en qué situación está cada movimiento
-- respecto del extracto bancario.
--
--   NULL (default)  → sin marcar. Es el estado de TODO lo histórico y de los
--                     movimientos que no se concilian (caja en efectivo, etc.).
--                     Comportamiento actual intacto.
--   'PENDING'       → pendiente de conciliar contra el extracto.
--   'UNIDENTIFIED'  → figura en el banco pero no se sabe a qué corresponde
--                     (depósito o movimiento sin identificar).
--   'RECONCILED'    → cotejado y coincide con el extracto.
--
-- ADITIVO a propósito: la columna es nullable y sin default, así que ningún
-- INSERT existente de cash_movements (pagos, percepciones, transferencias,
-- impuesto Ley 25413, gastos) necesita tocarse, y nada aparece como "pendiente"
-- de golpe. La conciliación es opt-in: solo se puebla lo que el usuario marca.
--
-- `reconciled_at` / `reconciled_by` dan trazabilidad de quién concilió y cuándo,
-- siguiendo el patrón de `reversed_at` / `reversed_by_movement_id` de esta misma
-- tabla.
-- =====================================================

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT NULL
    CHECK (
      reconciliation_status IS NULL
      OR reconciliation_status IN ('PENDING', 'UNIDENTIFIED', 'RECONCILED')
    );

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS reconciled_by UUID DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN cash_movements.reconciliation_status IS
  'Estado de conciliación bancaria. NULL = sin marcar (default, y estado de todo lo histórico); PENDING = pendiente de conciliar; UNIDENTIFIED = figura en el banco sin identificar; RECONCILED = cotejado contra el extracto.';

COMMENT ON COLUMN cash_movements.reconciled_at IS
  'Momento en que el movimiento se marcó como conciliado. NULL si nunca se concilió.';

COMMENT ON COLUMN cash_movements.reconciled_by IS
  'Usuario que concilió el movimiento. ON DELETE SET NULL: si se borra el usuario, el movimiento conserva su estado de conciliación.';

-- Índice parcial: la cola de trabajo son los movimientos marcados que todavía
-- NO están conciliados. Los conciliados y los NULL (la enorme mayoría) quedan
-- fuera del índice, así que pesa poco.
CREATE INDEX IF NOT EXISTS idx_cash_movements_pending_reconciliation
  ON cash_movements (org_id, financial_account_id, movement_date)
  WHERE reconciliation_status IN ('PENDING', 'UNIDENTIFIED');
