-- =====================================================
-- Migración 070: Historial de Interacciones de Clientes
-- Sistema de seguimiento de comunicaciones y actividades
-- =====================================================

-- Tabla de interacciones con clientes
CREATE TABLE IF NOT EXISTS customer_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  
  -- Tipo de interacción
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'call',           -- Llamada telefónica
    'email',          -- Email
    'whatsapp',       -- WhatsApp
    'meeting',        -- Reunión presencial
    'video_call',     -- Videollamada
    'social_media',   -- Redes sociales
    'note',           -- Nota interna
    'task',           -- Tarea/Seguimiento
    'quote_sent',     -- Cotización enviada
    'quote_approved', -- Cotización aprobada
    'payment',        -- Pago recibido
    'complaint',      -- Reclamo
    'feedback',       -- Feedback
    'other'           -- Otro
  )),
  
  -- Dirección (entrada/salida)
  direction TEXT CHECK (direction IN ('inbound', 'outbound', 'internal')),
  
  -- Contenido
  subject TEXT,
  content TEXT,
  
  -- Resultado
  outcome TEXT CHECK (outcome IN (
    'successful',     -- Exitoso
    'no_answer',      -- Sin respuesta
    'callback',       -- Llamar después
    'interested',     -- Interesado
    'not_interested', -- No interesado
    'completed',      -- Completado
    'pending',        -- Pendiente
    'cancelled'       -- Cancelado
  )),
  
  -- Seguimiento
  follow_up_date TIMESTAMP WITH TIME ZONE,
  follow_up_notes TEXT,
  is_follow_up_completed BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  duration_minutes INTEGER, -- Duración (para llamadas/reuniones)
  attachments JSONB DEFAULT '[]', -- Array de URLs de archivos adjuntos
  tags TEXT[] DEFAULT '{}',
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_customer_interactions_agency ON customer_interactions(agency_id);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_customer ON customer_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_operation ON customer_interactions(operation_id);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_type ON customer_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_date ON customer_interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_follow_up ON customer_interactions(follow_up_date) WHERE NOT is_follow_up_completed;
CREATE INDEX IF NOT EXISTS idx_customer_interactions_created_by ON customer_interactions(created_by);

-- Comentarios
COMMENT ON TABLE customer_interactions IS 'Historial de interacciones con clientes';
COMMENT ON COLUMN customer_interactions.interaction_type IS 'Tipo: call, email, whatsapp, meeting, etc';
COMMENT ON COLUMN customer_interactions.direction IS 'Dirección: inbound, outbound, internal';
COMMENT ON COLUMN customer_interactions.outcome IS 'Resultado: successful, no_answer, etc';

-- RLS (Row Level Security)
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view interactions for their agencies" ON customer_interactions;
DROP POLICY IF EXISTS "Users can create interactions" ON customer_interactions;
DROP POLICY IF EXISTS "Users can update own interactions" ON customer_interactions;

-- Política: Usuarios pueden ver interacciones de sus agencias
CREATE POLICY "Users can view interactions for their agencies"
  ON customer_interactions
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Usuarios pueden crear interacciones
CREATE POLICY "Users can create interactions"
  ON customer_interactions
  FOR INSERT
  WITH CHECK (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Usuarios pueden actualizar sus propias interacciones o admins todas
CREATE POLICY "Users can update own interactions"
  ON customer_interactions
  FOR UPDATE
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  );

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_customer_interaction_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_customer_interaction_updated_at ON customer_interactions;
CREATE TRIGGER trigger_update_customer_interaction_updated_at
  BEFORE UPDATE ON customer_interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_interaction_updated_at();
