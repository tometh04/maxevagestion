-- =====================================================
-- Migración: Seguro y traslado con monto en cotizaciones
-- =====================================================
-- Agrega insurance_amount (seguro) y transfer_amount (traslado) a
-- quotations como adicionales globales de la cotización. Se cargan desde
-- el flujo "Generar PDF" y se suman al total que ve el cliente, mostrándose
-- desglosados en el PDF/template. 0 = sin adicional (comportamiento previo).
-- =====================================================

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS insurance_amount NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (insurance_amount >= 0);

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS transfer_amount NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (transfer_amount >= 0);

COMMENT ON COLUMN quotations.insurance_amount IS
  'Monto del seguro/asistencia al viajero (adicional global de la cotización, en quotations.currency). Se suma al total mostrado al cliente. 0 = sin seguro.';

COMMENT ON COLUMN quotations.transfer_amount IS
  'Monto del traslado (adicional global de la cotización, en quotations.currency). Se suma al total mostrado al cliente. 0 = sin traslado.';
