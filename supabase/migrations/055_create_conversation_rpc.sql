-- Función RPC para creación rápida de conversaciones
-- Evita múltiples roundtrips y optimiza la inserción

CREATE OR REPLACE FUNCTION create_conversation_fast(
  p_user_id UUID,
  p_title TEXT,
  p_channel TEXT DEFAULT 'web'
) RETURNS TABLE (
  id UUID,
  title TEXT,
  state TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insertar y retornar en una sola operación
  RETURN QUERY
  INSERT INTO conversations (
    user_id,
    title,
    state,
    channel,
    last_message_at,
    last_search_context
  )
  VALUES (
    p_user_id,
    p_title,
    'active',
    p_channel,
    NOW(),
    NULL
  )
  RETURNING
    conversations.id,
    conversations.title,
    conversations.state,
    conversations.created_at;
END;
$$;

-- Grants de permisos
GRANT EXECUTE ON FUNCTION create_conversation_fast TO authenticated;

-- Comentario
COMMENT ON FUNCTION create_conversation_fast IS 'Crea una nueva conversación de forma optimizada. Retorna solo campos esenciales.';
