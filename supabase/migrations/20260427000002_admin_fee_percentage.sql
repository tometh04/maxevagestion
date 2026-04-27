-- ============================================================================
-- MIGRATION — Gastos administrativos per-operador (#7 reunión Gabi)
-- ============================================================================
-- Operadores tienen un % de gastos administrativos default (markup sobre costo).
-- En cada item del cotizador se prefilla del operador y es editable, para que
-- el seller pueda absorber el gasto en operaciones puntuales.
--
-- Default 0 = sin cambio en data existente (no rompe cotizaciones viejas).
-- ============================================================================

ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS admin_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (admin_fee_percentage >= 0 AND admin_fee_percentage <= 100);

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS admin_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (admin_fee_percentage >= 0 AND admin_fee_percentage <= 100);

COMMENT ON COLUMN operators.admin_fee_percentage IS
  'Porcentaje default de gastos administrativos a aplicar sobre el costo del operador';
COMMENT ON COLUMN quotation_items.admin_fee_percentage IS
  'Gastos administrativos aplicados a este item. Prefill desde operators.admin_fee_percentage; editable para absorber en operaciones puntuales';
