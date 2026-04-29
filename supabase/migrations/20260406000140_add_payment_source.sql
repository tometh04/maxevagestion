ALTER TABLE payments
ADD COLUMN IF NOT EXISTS source TEXT;

UPDATE payments
SET source = 'MANUAL'
WHERE source IS NULL;

ALTER TABLE payments
ALTER COLUMN source SET DEFAULT 'MANUAL';

ALTER TABLE payments
ALTER COLUMN source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_source_check'
  ) THEN
    ALTER TABLE payments
    ADD CONSTRAINT payments_source_check
    CHECK (source IN ('MANUAL', 'OPERATOR_BULK'));
  END IF;
END $$;

COMMENT ON COLUMN payments.source IS 'Origen funcional del pago. MANUAL para altas individuales y OPERATOR_BULK para pagos masivos a operadores.';
