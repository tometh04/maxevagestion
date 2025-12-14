-- Crear tabla para comentarios de leads
-- Permite que los vendedores dejen comentarios en los leads
CREATE TABLE IF NOT EXISTS lead_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_lead_comments_lead_id ON lead_comments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_comments_user_id ON lead_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_comments_created_at ON lead_comments(created_at DESC);

-- Comentarios para documentación
COMMENT ON TABLE lead_comments IS 'Comentarios de vendedores en leads. Permite comunicación interna sobre el lead.';
COMMENT ON COLUMN lead_comments.lead_id IS 'ID del lead al que pertenece el comentario';
COMMENT ON COLUMN lead_comments.user_id IS 'ID del usuario (vendedor) que creó el comentario';
COMMENT ON COLUMN lead_comments.comment IS 'Texto del comentario';

