-- =====================================================
-- FASE 4: SEGUIMIENTO Y COMUNICACIÓN
-- Migración 026: Crear tabla communications
-- =====================================================
-- Historial de comunicaciones con clientes, leads, operaciones

CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones (al menos una debe estar presente)
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES operations(id) ON DELETE CASCADE,
  
  -- Tipo de comunicación
  communication_type TEXT NOT NULL CHECK (communication_type IN (
    'CALL',      -- Llamada telefónica
    'EMAIL',     -- Email
    'WHATSAPP',  -- WhatsApp
    'MEETING',   -- Reunión presencial
    'NOTE'       -- Nota interna
  )),
  
  -- Contenido
  subject TEXT,
  content TEXT NOT NULL,
  
  -- Información adicional
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  duration INTEGER, -- Duración en minutos (si es llamada)
  
  -- Seguimiento
  follow_up_date DATE, -- Fecha para hacer seguimiento
  
  -- Usuario que realizó la comunicación
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: al menos una relación debe estar presente
  CONSTRAINT communications_relation_check CHECK (
    customer_id IS NOT NULL OR
    lead_id IS NOT NULL OR
    operation_id IS NOT NULL
  )
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_communications_customer ON communications(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communications_lead ON communications(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communications_operation ON communications(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communications_date ON communications(date);
CREATE INDEX IF NOT EXISTS idx_communications_follow_up ON communications(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communications_type ON communications(communication_type);

-- Comentarios
COMMENT ON TABLE communications IS 'Historial de comunicaciones con clientes, leads y operaciones';
COMMENT ON COLUMN communications.duration IS 'Duración en minutos (solo para llamadas)';
COMMENT ON COLUMN communications.follow_up_date IS 'Fecha sugerida para hacer seguimiento';

