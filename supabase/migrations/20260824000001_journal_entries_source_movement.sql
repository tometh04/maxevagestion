-- VIB-142 — Clave de idempotencia para los asientos de movimientos de plata
--
-- CONTEXTO
-- --------
-- De los 21 flujos que crean movimientos de dinero, 18 no generan ningún asiento:
-- queda registrada la venta pero no el cobro, queda el costo pero no el pago.
-- Son ~9.600 movimientos sueltos y siguen sumando ~1.400 por mes.
--
-- Al asentarlos hace falta una clave que impida duplicar. `entry_kind` no sirve
-- acá: su índice único es por (operation_id, entry_kind), y una operación tiene
-- N cobros y N pagos, no uno de cada clase.
--
-- La clave natural es el movimiento que originó el asiento.
--
-- POR QUÉ ES SEGURA
-- -----------------
-- Columna nullable y aditiva: no toca ninguna fila existente. Los asientos que
-- ya existen (de venta, costo, comisión y pago) quedan con NULL y por eso el
-- índice es PARCIAL, para no exigirles nada.
--
-- Ojo con el diseño de arriba: estos asientos NO escriben sobre el movimiento
-- de plata original. `journal_entries.source_movement_id` apunta al movimiento
-- que le dio origen, pero las líneas del asiento son filas nuevas con
-- `account_id` nulo y `affects_balance = false`. Escribir `debit_amount` /
-- `credit_amount` sobre el movimiento existente lo haría cambiar de rama en
-- getAccountBalancesBatch (ledger.ts) y podría mover el saldo de una cuenta
-- real, que es justamente lo que no queremos.

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS source_movement_id uuid;

-- ON DELETE SET NULL y no CASCADE: si alguien borra el movimiento de plata, el
-- asiento no debe desaparecer en silencio; queda huérfano y auditable.
ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_movement_id_fkey;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_source_movement_id_fkey
  FOREIGN KEY (source_movement_id) REFERENCES ledger_movements(id) ON DELETE SET NULL;

COMMENT ON COLUMN journal_entries.source_movement_id IS
  'Movimiento de plata que originó este asiento (VIB-142). Es la clave de idempotencia: ver el índice único parcial journal_entries_source_movement_unique. NULL en los asientos de venta, costo, comisión y pago, que no nacen de un movimiento.';

-- Un movimiento de plata, un asiento. Parcial para no alcanzar a los asientos
-- que no nacen de un movimiento.
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_source_movement_unique
  ON journal_entries (source_movement_id)
  WHERE source_movement_id IS NOT NULL;
