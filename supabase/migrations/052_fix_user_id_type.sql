-- =====================================================
-- FIX: Cambiar user_id de UUID a TEXT (sin FK constraint)
-- Migración 052: Compatibilidad con sistema de auth existente
-- =====================================================

-- PASO 1: Eliminar políticas RLS existentes
DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON conversations;

DROP POLICY IF EXISTS "Users can view messages from their conversations" ON messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can delete messages from their conversations" ON messages;

-- PASO 2: Eliminar constraint de FK
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;

-- PASO 3: Cambiar el tipo de dato de user_id a TEXT
ALTER TABLE conversations ALTER COLUMN user_id TYPE TEXT;

-- NOTA: No agregamos FK constraint porque users.id es UUID y user_id es TEXT
-- La integridad se maneja a nivel de aplicación

-- PASO 4: Recrear políticas RLS con TEXT
-- Políticas para conversations
CREATE POLICY "Users can view their own conversations"
  ON conversations
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create their own conversations"
  ON conversations
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own conversations"
  ON conversations
  FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own conversations"
  ON conversations
  FOR DELETE
  USING (auth.uid()::text = user_id);

-- Políticas para messages (sin cambios, solo las recreamos)
CREATE POLICY "Users can view messages from their conversations"
  ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id
    )
  );

CREATE POLICY "Users can create messages in their conversations"
  ON messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id
    )
  );

CREATE POLICY "Users can update messages in their conversations"
  ON messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id
    )
  );

CREATE POLICY "Users can delete messages from their conversations"
  ON messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id
    )
  );
