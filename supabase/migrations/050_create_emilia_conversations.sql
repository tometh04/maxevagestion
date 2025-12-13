-- =====================================================
-- SISTEMA DE CONVERSACIONES DE EMILIA
-- Migración 050: Conversaciones y mensajes del chat de búsqueda de viajes
-- =====================================================

-- Tabla de conversaciones
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Usuario propietario
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Información de la conversación
  title TEXT NOT NULL DEFAULT 'Chat',
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'closed')),
  channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp', 'api')),
  
  -- Contexto de búsqueda (CRÍTICO para mantener contexto conversacional)
  -- Guarda el parsed_request de la última búsqueda exitosa
  last_search_context JSONB,
  
  -- Timestamps
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de mensajes
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Conversación a la que pertenece
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Rol del mensaje
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  
  -- Contenido del mensaje (JSONB para flexibilidad)
  -- Estructura: { text?: string, cards?: array, metadata?: object }
  content JSONB NOT NULL,
  
  -- Idempotencia y trazabilidad
  client_id TEXT UNIQUE,                    -- UUID generado por el cliente para idempotencia
  api_request_id TEXT,                      -- request_id enviado a la API externa
  api_search_id TEXT,                       -- search_id recibido de la API externa
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para optimizar queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_active 
  ON conversations(user_id, state, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user_created 
  ON conversations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation 
  ON messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_client_id 
  ON messages(client_id) WHERE client_id IS NOT NULL;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_conversations_updated_at ON conversations;
CREATE TRIGGER trigger_update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_conversations_updated_at();

-- Comentarios para documentación
COMMENT ON TABLE conversations IS 'Conversaciones de Emilia (chat de búsqueda de viajes)';
COMMENT ON COLUMN conversations.last_search_context IS 'Contexto de la última búsqueda (parsed_request) para mantener continuidad conversacional';
COMMENT ON TABLE messages IS 'Mensajes individuales dentro de las conversaciones de Emilia';
COMMENT ON COLUMN messages.content IS 'Contenido JSONB: {text, cards, metadata}';
COMMENT ON COLUMN messages.client_id IS 'ID único generado por el cliente para prevenir duplicados';

