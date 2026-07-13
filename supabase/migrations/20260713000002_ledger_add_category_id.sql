-- =====================================================
-- Migración: agregar category_id a ledger_movements
-- =====================================================
-- Contexto: los gastos recurrentes, al pagarse, crean un ledger_movement con
-- concepto "Gasto recurrente: <description>" que NO conservaba la categoría del
-- gasto. El resumen por categoría (torta de Gastos) tenía que reconstruirla
-- matcheando por descripción contra recurring_payments, lo cual es frágil
-- (descripciones duplicadas / editadas).
--
-- Con esta columna, el pago del recurrente (y los gastos variables) persisten
-- la categoría directamente en el asiento, y el resumen la lee sin heurística.
-- Nullable para no romper asientos existentes ni asientos sin categoría
-- (cobros, comisiones, FX, etc.).

ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS category_id UUID
  REFERENCES recurring_payment_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_movements_category
  ON ledger_movements(category_id)
  WHERE category_id IS NOT NULL;

COMMENT ON COLUMN ledger_movements.category_id IS
  'Categoría del gasto (recurring_payment_categories). Se setea en pagos de gastos recurrentes y variables para el resumen por categoría. NULL para el resto de los asientos.';
