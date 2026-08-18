-- =====================================================
-- Migración: permitir el movimiento de caja del impuesto Ley 25413
-- =====================================================
-- Contexto (VIB-131): al registrar un pago con impuesto a débitos/créditos
-- bancarios, el endpoint crea DOS movimientos de caja con el MISMO payment_id:
-- el principal del pago y el del impuesto (category = 'BANK_TAX').
--
-- El índice único de la migración 110 (`cash_movements_payment_id_unique`,
-- sobre payment_id) permite uno solo, así que el insert del impuesto viola
-- siempre la restricción. El error queda atrapado en un try/catch que solo
-- loguea ("No romper el flujo principal"), de modo que el impuesto pega en el
-- ledger pero NO en caja, en silencio.
--
-- Auditoría al 2026-08-18 (scripts/audit-bank-tax-cash-movements.ts):
--   153 impuestos en el ledger, 0 en caja. Falla sistemática desde el
--   2026-06-02 (día siguiente al alta de la feature) hasta hoy.
--
-- El invariante correcto no es "un pago tiene un solo movimiento de caja" sino
-- "un pago tiene un solo movimiento de caja POR CONCEPTO": el principal y el
-- del impuesto son movimientos distintos y legítimos. Se reemplaza el índice
-- por uno sobre (payment_id, category), que:
--
--   - sigue impidiendo el duplicado que motivó la migración 110 (dos
--     movimientos principales para el mismo pago), y
--   - además impide duplicar el impuesto de un mismo pago,
--   - pero deja convivir principal + impuesto.
--
-- `category` es NOT NULL, así que ninguna fila con payment_id queda fuera del
-- índice por un NULL.
-- =====================================================

DROP INDEX IF EXISTS cash_movements_payment_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_payment_id_category_unique
  ON cash_movements (payment_id, category)
  WHERE payment_id IS NOT NULL;

COMMENT ON INDEX cash_movements_payment_id_category_unique IS
  'Un pago puede tener un movimiento de caja por concepto: el principal y, si corresponde, el del impuesto Ley 25413 (category = BANK_TAX). Reemplaza al índice de la migración 110, que solo permitía uno y hacía fallar en silencio el movimiento del impuesto (VIB-131).';
