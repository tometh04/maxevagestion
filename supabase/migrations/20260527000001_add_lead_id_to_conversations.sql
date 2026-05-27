-- Agrega lead_id a conversations para vincular chats de Emilia
-- al lead desde donde se originaron. Migración additiva.

-- 1. Columna nueva nullable (no rompe filas existentes del módulo /emilia)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS lead_id UUID
  REFERENCES leads(id) ON DELETE SET NULL;

-- 2. Index parcial: solo filas con lead_id (la mayoría seguirán siendo
--    chats genéricos sin lead). Ahorra espacio y queries más rápidas.
CREATE INDEX IF NOT EXISTS idx_conversations_lead
  ON conversations(lead_id, last_message_at DESC)
  WHERE lead_id IS NOT NULL;

-- 3. Comentario documental
COMMENT ON COLUMN conversations.lead_id IS
  'Si la conversación se inició desde el modal de un lead específico, link al lead. NULL = chat genérico desde /emilia.';
