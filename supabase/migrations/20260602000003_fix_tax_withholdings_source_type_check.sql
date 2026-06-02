-- =====================================================
-- Fix: tax_withholdings_source_type_check rechazaba "PAYMENT"
-- =====================================================
-- El check constraint original no incluía todos los valores que usa el código
-- (PAYMENT, PURCHASE_INVOICE, OPERATOR_PAYMENT, MANUAL, AUTO), causando que
-- autoCreateWithholdings() lanzara 23514 silenciosamente — las percepciones
-- RG 5617/3819 nunca se persistían a pesar de los checkboxes en la UI.
--
-- Sintomas reportados (2026-06-02):
-- - Lozada/VICO: cobros con RG marcado no aparecían en el recibo ni en la
--   tabla. Tampoco quedaba registro en tax_withholdings.
--
-- Causa raíz confirmada vía /api/admin/diagnose-withholdings:
--   "new row for relation tax_withholdings violates check constraint
--    tax_withholdings_source_type_check"
--
-- Fix: drop + recrear constraint con los valores efectivamente usados.
-- =====================================================

ALTER TABLE tax_withholdings DROP CONSTRAINT IF EXISTS tax_withholdings_source_type_check;

ALTER TABLE tax_withholdings ADD CONSTRAINT tax_withholdings_source_type_check
  CHECK (source_type IN ('PAYMENT', 'PURCHASE_INVOICE', 'OPERATOR_PAYMENT', 'MANUAL', 'AUTO'));
