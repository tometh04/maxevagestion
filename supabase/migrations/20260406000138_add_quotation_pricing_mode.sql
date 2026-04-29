ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS pricing_mode TEXT;

UPDATE quotations
SET pricing_mode = 'GROUP_TOTAL'
WHERE pricing_mode IS NULL;

ALTER TABLE quotations
ALTER COLUMN pricing_mode SET DEFAULT 'GROUP_TOTAL';

ALTER TABLE quotations
ALTER COLUMN pricing_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quotations_pricing_mode_check'
  ) THEN
    ALTER TABLE quotations
    ADD CONSTRAINT quotations_pricing_mode_check
    CHECK (pricing_mode IN ('PER_PERSON', 'GROUP_TOTAL'));
  END IF;
END $$;

COMMENT ON COLUMN quotations.pricing_mode IS 'Define si el precio visible se muestra por persona o como total del grupo.';
