-- Agregar QUOTATION_ACCEPTED al constraint de type en alerts.
-- Para notificar al seller cuando un cliente acepta una cotización vía link público.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_type_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
  END IF;

  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
    CHECK (type IN (
      'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'UPCOMING_TRIP',
      'DOCUMENT_MISSING', 'DOCUMENT_EXPIRING', 'BIRTHDAY',
      'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT',
      'RECURRING_PAYMENT', 'TASK_REMINDER', 'TASK_ASSIGNED',
      'MISSING_INVOICE', 'QUOTATION_ACCEPTED', 'OTHER'
    ));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;
