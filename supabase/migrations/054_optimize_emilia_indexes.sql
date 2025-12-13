-- Optimización de índices para Emilia
-- Mejora performance de queries frecuentes en conversaciones y mensajes

-- Index para lista de conversaciones (query más frecuente)
-- Optimiza: SELECT * FROM conversations WHERE user_id = X AND state = 'active' ORDER BY last_message_at DESC
CREATE INDEX IF NOT EXISTS idx_conversations_user_state_date
ON conversations(user_id, state, last_message_at DESC)
WHERE state = 'active';

-- Index para conversaciones cerradas (menos usado, pero importante)
CREATE INDEX IF NOT EXISTS idx_conversations_user_closed
ON conversations(user_id, last_message_at DESC)
WHERE state = 'closed';

-- Index para mensajes por conversación ordenados por fecha
-- Optimiza: SELECT * FROM messages WHERE conversation_id = X ORDER BY created_at ASC
CREATE INDEX IF NOT EXISTS idx_messages_conversation_date
ON messages(conversation_id, created_at ASC);

-- Index para búsqueda de última mensaje de conversación
-- Optimiza: SELECT content, created_at FROM messages WHERE conversation_id = X ORDER BY created_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_messages_conversation_last
ON messages(conversation_id, created_at DESC);

-- ESTADÍSTICAS: Actualizar stats de las tablas para mejor query planning
ANALYZE conversations;
ANALYZE messages;

-- COMENTARIOS
COMMENT ON INDEX idx_conversations_user_state_date IS 'Optimiza lista de conversaciones activas por usuario';
COMMENT ON INDEX idx_conversations_user_closed IS 'Optimiza lista de conversaciones cerradas por usuario';
COMMENT ON INDEX idx_messages_conversation_date IS 'Optimiza carga de mensajes de una conversación';
COMMENT ON INDEX idx_messages_conversation_last IS 'Optimiza obtención del último mensaje';
