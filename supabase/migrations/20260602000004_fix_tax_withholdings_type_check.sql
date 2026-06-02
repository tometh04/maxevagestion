-- =====================================================
-- Fix: tax_withholdings_type_check no incluía PERCEPCION_RG5617_30 ni RG3819_5
-- =====================================================
-- Segundo check constraint que también bloqueaba el INSERT — el primero fix
-- (source_type) reveló este. El constraint viejo solo aceptaba los tipos
-- originales (PERCEPCION_IVA, PERCEPCION_IIBB, RETENCION_*) y no las
-- percepciones RG 5617/3819 agregadas posteriormente al motor.
-- =====================================================

ALTER TABLE tax_withholdings DROP CONSTRAINT IF EXISTS tax_withholdings_type_check;

ALTER TABLE tax_withholdings ADD CONSTRAINT tax_withholdings_type_check
  CHECK (type IN (
    'PERCEPCION_IVA',
    'PERCEPCION_IIBB',
    'RETENCION_GANANCIAS',
    'RETENCION_IVA',
    'RETENCION_IIBB',
    'PERCEPCION_RG5617_30',
    'PERCEPCION_RG3819_5'
  ));
