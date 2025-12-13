-- =====================================================
-- DESHABILITAR RLS para conversaciones de Emilia
-- Migración 053: El control de acceso se hace en el API
-- =====================================================

-- Eliminar todas las políticas RLS
DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON conversations;

DROP POLICY IF EXISTS "Users can view messages from their conversations" ON messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can delete messages from their conversations" ON messages;

-- Deshabilitar RLS - el control de acceso se maneja en el código del API
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- NOTA: El control de acceso se hace en los endpoints del API
-- verificando que user.id coincide con conversation.user_id


