-- =====================================================
-- Agregar soporte para documentos en leads
-- Migración 027: Agregar lead_id y scanned_data a documents
-- =====================================================

-- Agregar lead_id a documents
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE;

-- Agregar campo JSONB para guardar datos escaneados por IA
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS scanned_data JSONB;

-- Agregar tipo LICENSE a los tipos de documentos
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_type_check 
  CHECK (type IN ('PASSPORT', 'DNI', 'LICENSE', 'VOUCHER', 'INVOICE', 'PAYMENT_PROOF', 'OTHER'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_documents_lead ON documents(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_scanned_data ON documents USING GIN (scanned_data) WHERE scanned_data IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN documents.lead_id IS 'Lead al que pertenece este documento (opcional)';
COMMENT ON COLUMN documents.scanned_data IS 'Datos extraídos por IA del documento en formato JSON';

