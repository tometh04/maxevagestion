-- =====================================================
-- FASE 2: FECHAS Y RECORDATORIOS
-- Migración 022: Mejorar expiración de cotizaciones
-- =====================================================
-- El campo valid_until ya existe, solo agregamos índices y lógica de expiración

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_quotations_valid_until ON quotations(valid_until) WHERE status NOT IN ('APPROVED', 'CONVERTED', 'REJECTED');
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);

-- Función para expirar cotizaciones automáticamente
CREATE OR REPLACE FUNCTION expire_quotations()
RETURNS void AS $$
BEGIN
  UPDATE quotations
  SET status = 'EXPIRED',
      updated_at = NOW()
  WHERE status IN ('DRAFT', 'SENT', 'PENDING_APPROVAL')
    AND valid_until < CURRENT_DATE
    AND status != 'EXPIRED';
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON FUNCTION expire_quotations IS 'Expira automáticamente las cotizaciones cuya fecha valid_until ha pasado';

