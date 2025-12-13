-- =====================================================
-- POLÍTICAS RLS PARA CONVERSACIONES DE EMILIA
-- =====================================================

-- Habilitar RLS en las tablas
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Políticas para conversations
-- Los usuarios pueden ver solo sus propias conversaciones
CREATE POLICY "Users can view their own conversations"
  ON conversations
  FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Los usuarios pueden crear sus propias conversaciones
CREATE POLICY "Users can create their own conversations"
  ON conversations
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

-- Los usuarios pueden actualizar sus propias conversaciones
CREATE POLICY "Users can update their own conversations"
  ON conversations
  FOR UPDATE
  USING (auth.uid()::text = user_id::text);

-- Los usuarios pueden eliminar sus propias conversaciones
CREATE POLICY "Users can delete their own conversations"
  ON conversations
  FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- Políticas para messages
-- Los usuarios pueden ver mensajes de sus conversaciones
CREATE POLICY "Users can view messages from their conversations"
  ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id::text
    )
  );

-- Los usuarios pueden crear mensajes en sus conversaciones
CREATE POLICY "Users can create messages in their conversations"
  ON messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id::text
    )
  );

-- Los usuarios pueden actualizar mensajes de sus conversaciones
CREATE POLICY "Users can update messages in their conversations"
  ON messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id::text
    )
  );

-- Los usuarios pueden eliminar mensajes de sus conversaciones
CREATE POLICY "Users can delete messages from their conversations"
  ON messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id::text
    )
  );


