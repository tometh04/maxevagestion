-- =====================================================
-- FASE 3: FACTURACIÓN Y DATOS DE CLIENTES
-- Migración 025: Agregar passenger_id a documents
-- =====================================================
-- Permite vincular documentos a pasajeros específicos

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS passenger_id UUID REFERENCES operation_passengers(id) ON DELETE SET NULL;

-- Índice
CREATE INDEX IF NOT EXISTS idx_documents_passenger ON documents(passenger_id) WHERE passenger_id IS NOT NULL;

-- Comentario
COMMENT ON COLUMN documents.passenger_id IS 'Pasajero al que pertenece este documento (opcional)';

