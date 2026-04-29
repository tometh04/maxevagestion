ALTER TABLE quotation_options
  ADD COLUMN IF NOT EXISTS calculated_total_amount NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS manual_total_amount NUMERIC(18,2);

UPDATE quotation_options
SET calculated_total_amount = total_amount
WHERE calculated_total_amount IS NULL;

COMMENT ON COLUMN quotation_options.calculated_total_amount IS 'Suma automática de los servicios de la opción';
COMMENT ON COLUMN quotation_options.manual_total_amount IS 'Precio final manual definido por el asesor para la opción';
