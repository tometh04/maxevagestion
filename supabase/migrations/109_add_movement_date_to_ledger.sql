-- Migration 109: Add movement_date to ledger_movements
--
-- BUG FIX: Los movimientos de caja creados con fecha retroactiva (movement_date)
-- no aparecían en el filtro de la Caja porque getLedgerMovements() filtraba por
-- created_at (fecha de inserción) en vez de por la fecha real del movimiento.
--
-- Esta migración agrega movement_date a ledger_movements, hace backfill con
-- created_at para registros existentes, y agrega un índice para performance.

ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS movement_date TIMESTAMPTZ;

-- Backfill: todos los registros existentes usan su created_at como movement_date
UPDATE ledger_movements
  SET movement_date = created_at
  WHERE movement_date IS NULL;

-- Hacer la columna NOT NULL con default NOW() para nuevos registros
ALTER TABLE ledger_movements
  ALTER COLUMN movement_date SET DEFAULT NOW();

ALTER TABLE ledger_movements
  ALTER COLUMN movement_date SET NOT NULL;

-- Índice para mejorar performance de los filtros por fecha
CREATE INDEX IF NOT EXISTS idx_ledger_movements_movement_date
  ON ledger_movements (movement_date DESC);
