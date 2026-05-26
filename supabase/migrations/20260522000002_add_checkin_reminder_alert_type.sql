-- Agregar CHECKIN_REMINDER al constraint de type en alerts
-- y columna resolution_note para registrar el motivo de resolución
DO $$
BEGIN
  -- Eliminar constraint existente
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_type_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
  END IF;

  -- Crear nuevo constraint con CHECKIN_REMINDER
  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
    CHECK (type IN (
      'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'UPCOMING_TRIP',
      'DOCUMENT_MISSING', 'DOCUMENT_EXPIRING', 'BIRTHDAY',
      'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT',
      'RECURRING_PAYMENT', 'TASK_REMINDER', 'TASK_ASSIGNED',
      'MISSING_INVOICE', 'CHECKIN_REMINDER', 'OTHER'
    ));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;

-- Agregar columna para nota de resolución (ej: "aerolínea requiere 24hs", "no aplica")
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolution_note TEXT;
