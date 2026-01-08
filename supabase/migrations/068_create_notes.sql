-- =====================================================
-- Migración 068: Crear tablas de Notas Colaborativas
-- Sistema de notas con comentarios y adjuntos
-- =====================================================

-- Tabla de notas
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Contenido
  title TEXT NOT NULL,
  content TEXT, -- Contenido en formato HTML/Markdown
  
  -- Tipo y relaciones
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'operation', 'customer')),
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Visibilidad
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'agency')),
  
  -- Tags (array de strings)
  tags TEXT[] DEFAULT '{}',
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  
  -- Metadata
  is_pinned BOOLEAN DEFAULT FALSE,
  color TEXT, -- Color de la nota (hex)
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de comentarios en notas
CREATE TABLE IF NOT EXISTS note_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES note_comments(id) ON DELETE CASCADE, -- Para threading
  
  -- Contenido
  content TEXT NOT NULL,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de adjuntos en notas
CREATE TABLE IF NOT EXISTS note_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  
  -- Archivo
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- MIME type
  file_size INTEGER NOT NULL, -- En bytes
  file_url TEXT NOT NULL, -- URL en Supabase Storage
  
  -- Auditoría
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_notes_agency ON notes(agency_id);
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);
CREATE INDEX IF NOT EXISTS idx_notes_operation ON notes(operation_id);
CREATE INDEX IF NOT EXISTS idx_notes_customer ON notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by);
CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_note_comments_note ON note_comments(note_id);
CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments(note_id);

-- Comentarios
COMMENT ON TABLE notes IS 'Notas colaborativas del sistema';
COMMENT ON COLUMN notes.note_type IS 'Tipo: general, operation, customer';
COMMENT ON COLUMN notes.visibility IS 'Visibilidad: private, team, agency';
COMMENT ON COLUMN notes.tags IS 'Array de tags para categorización';

-- RLS (Row Level Security)
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_attachments ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view notes based on visibility" ON notes;
DROP POLICY IF EXISTS "Users can create notes" ON notes;
DROP POLICY IF EXISTS "Users can update own notes" ON notes;
DROP POLICY IF EXISTS "Users can view comments on accessible notes" ON note_comments;
DROP POLICY IF EXISTS "Users can create comments" ON note_comments;
DROP POLICY IF EXISTS "Users can view attachments on accessible notes" ON note_attachments;
DROP POLICY IF EXISTS "Users can upload attachments" ON note_attachments;

-- Política: Usuarios pueden ver notas según visibilidad
CREATE POLICY "Users can view notes based on visibility"
  ON notes
  FOR SELECT
  USING (
    -- Notas de su agencia
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND (
      -- Es el creador
      created_by = auth.uid()
      -- O la nota es visible para el equipo/agencia
      OR visibility IN ('team', 'agency')
    )
  );

-- Política: Usuarios pueden crear notas
CREATE POLICY "Users can create notes"
  ON notes
  FOR INSERT
  WITH CHECK (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Usuarios pueden actualizar sus propias notas o notas de agencia (admins)
CREATE POLICY "Users can update own notes"
  ON notes
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

-- Política: Usuarios pueden ver comentarios de notas accesibles
CREATE POLICY "Users can view comments on accessible notes"
  ON note_comments
  FOR SELECT
  USING (
    note_id IN (
      SELECT id FROM notes 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Política: Usuarios pueden crear comentarios
CREATE POLICY "Users can create comments"
  ON note_comments
  FOR ALL
  USING (
    note_id IN (
      SELECT id FROM notes 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Política: Usuarios pueden ver adjuntos de notas accesibles
CREATE POLICY "Users can view attachments on accessible notes"
  ON note_attachments
  FOR SELECT
  USING (
    note_id IN (
      SELECT id FROM notes 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Política: Usuarios pueden subir adjuntos
CREATE POLICY "Users can upload attachments"
  ON note_attachments
  FOR ALL
  USING (
    note_id IN (
      SELECT id FROM notes 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_note_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_note_updated_at ON notes;
CREATE TRIGGER trigger_update_note_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_note_updated_at();

DROP TRIGGER IF EXISTS trigger_update_note_comment_updated_at ON note_comments;
CREATE TRIGGER trigger_update_note_comment_updated_at
  BEFORE UPDATE ON note_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_note_updated_at();
