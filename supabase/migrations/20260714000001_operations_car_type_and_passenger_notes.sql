-- =====================================================
-- Migración: tipo "Alquiler de Auto" (CAR) + fix "Actividad" (ACTIVITY) +
--            campo libre de info para el pasajero a nivel operación.
--
-- 1) operations.type: el CHECK actual (mig 096) NO permite 'CAR' ni 'ACTIVITY'.
--    "Actividad" ya aparecía en el dropdown pero fallaba al guardar (bug latente).
--    Se agregan ambos. NO se recrea el CHECK de operation_operators.product_type:
--    fue eliminado a propósito en 20260611000001 para permitir tipos custom.
--
-- 2) operations.passenger_notes: texto libre con info relevante para el pasajero
--    (all inclusive, traslados incluidos, habitación vista al mar, etc.). Lo usa
--    el PDF "Detalle de la Operación".
-- =====================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'operations_type_check' AND table_name = 'operations'
  ) THEN
    ALTER TABLE operations DROP CONSTRAINT operations_type_check;
  END IF;

  ALTER TABLE operations ADD CONSTRAINT operations_type_check
    CHECK (type IN ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED', 'ASSISTANCE', 'ACTIVITY', 'CAR'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando operations_type_check: %', SQLERRM;
END $$;

ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS passenger_notes TEXT;

COMMENT ON COLUMN operations.passenger_notes IS
  'Info adicional libre para el pasajero (all inclusive, traslados incluidos, vista al mar, etc.). La usa el PDF "Detalle de la Operación".';
