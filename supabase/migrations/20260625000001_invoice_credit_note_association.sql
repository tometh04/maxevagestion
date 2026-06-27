-- NC/ND: vincular notas de crédito/débito al comprobante original (CbtesAsoc de AFIP)
--
-- Una NC/ND emitida por Web Service DEBE referenciar el comprobante original
-- (campo CbtesAsoc del payload WSFE). Guardamos tanto un FK al invoice original
-- (trazabilidad/UI) como los datos literales que AFIP exige, denormalizados
-- (la factura origen podría no estar en vibook en casos de migración).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS original_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cbte_asoc_tipo INTEGER,
  ADD COLUMN IF NOT EXISTS cbte_asoc_pto_vta INTEGER,
  ADD COLUMN IF NOT EXISTS cbte_asoc_nro INTEGER,
  ADD COLUMN IF NOT EXISTS cbte_asoc_cuit BIGINT,
  ADD COLUMN IF NOT EXISTS cbte_asoc_fch TEXT; -- YYYYMMDD

COMMENT ON COLUMN invoices.original_invoice_id IS 'FK a la factura acreditada/debitada por esta NC/ND (trazabilidad).';
COMMENT ON COLUMN invoices.cbte_asoc_tipo IS 'AFIP CbtesAsoc.Tipo — tipo de comprobante asociado (NC/ND).';
COMMENT ON COLUMN invoices.cbte_asoc_pto_vta IS 'AFIP CbtesAsoc.PtoVta — punto de venta del comprobante asociado.';
COMMENT ON COLUMN invoices.cbte_asoc_nro IS 'AFIP CbtesAsoc.Nro — número del comprobante asociado.';
COMMENT ON COLUMN invoices.cbte_asoc_cuit IS 'AFIP CbtesAsoc.Cuit — CUIT emisor del comprobante asociado (opcional).';
COMMENT ON COLUMN invoices.cbte_asoc_fch IS 'AFIP CbtesAsoc.CbteFch — fecha YYYYMMDD del comprobante asociado (opcional).';

-- Listar las NC/ND emitidas contra una factura dada.
CREATE INDEX IF NOT EXISTS idx_invoices_original_invoice ON invoices(original_invoice_id);
