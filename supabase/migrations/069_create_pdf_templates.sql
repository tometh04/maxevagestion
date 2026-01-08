-- =====================================================
-- Migración 069: Crear tablas de Templates PDF
-- Sistema de templates para generación de PDFs
-- =====================================================

-- Tabla de templates PDF
CREATE TABLE IF NOT EXISTS pdf_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL,
  description TEXT,
  
  -- Tipo de template
  template_type TEXT NOT NULL CHECK (template_type IN (
    'invoice',          -- Facturas
    'budget',           -- Presupuestos
    'voucher',          -- Vouchers de viaje
    'itinerary',        -- Itinerarios
    'receipt',          -- Recibos
    'contract',         -- Contratos
    'general'           -- General
  )),
  
  -- Contenido del template (HTML con placeholders)
  html_content TEXT NOT NULL,
  
  -- Estilos CSS
  css_styles TEXT,
  
  -- Configuración de página
  page_size TEXT DEFAULT 'A4', -- A4, Letter, Legal, etc
  page_orientation TEXT DEFAULT 'portrait', -- portrait, landscape
  page_margins JSONB DEFAULT '{"top": 20, "right": 20, "bottom": 20, "left": 20}',
  
  -- Header y footer
  header_html TEXT,
  footer_html TEXT,
  show_page_numbers BOOLEAN DEFAULT TRUE,
  
  -- Variables disponibles en el template (para documentación)
  available_variables JSONB DEFAULT '[]',
  
  -- Metadata
  is_default BOOLEAN DEFAULT FALSE, -- Template por defecto para su tipo
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Logo y branding
  logo_url TEXT,
  primary_color TEXT DEFAULT '#000000',
  secondary_color TEXT DEFAULT '#666666',
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de PDFs generados
CREATE TABLE IF NOT EXISTS generated_pdfs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  template_id UUID REFERENCES pdf_templates(id) ON DELETE SET NULL,
  
  -- Tipo y referencia
  pdf_type TEXT NOT NULL,
  reference_id UUID, -- ID de la entidad relacionada (invoice, operation, etc)
  reference_type TEXT, -- Tipo de entidad
  
  -- Archivo generado
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL, -- URL en Supabase Storage
  file_size INTEGER, -- En bytes
  
  -- Datos usados para generar (snapshot)
  data_snapshot JSONB,
  
  -- Metadata
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pdf_templates_agency ON pdf_templates(agency_id);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_type ON pdf_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_default ON pdf_templates(agency_id, template_type, is_default);
CREATE INDEX IF NOT EXISTS idx_generated_pdfs_agency ON generated_pdfs(agency_id);
CREATE INDEX IF NOT EXISTS idx_generated_pdfs_reference ON generated_pdfs(reference_type, reference_id);

-- Comentarios
COMMENT ON TABLE pdf_templates IS 'Templates para generación de PDFs';
COMMENT ON COLUMN pdf_templates.html_content IS 'Contenido HTML con placeholders como {{variable}}';
COMMENT ON COLUMN pdf_templates.available_variables IS 'Lista de variables disponibles para el template';
COMMENT ON TABLE generated_pdfs IS 'Registro de PDFs generados';

-- RLS (Row Level Security)
ALTER TABLE pdf_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_pdfs ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view templates for their agencies" ON pdf_templates;
DROP POLICY IF EXISTS "Admins can manage templates" ON pdf_templates;
DROP POLICY IF EXISTS "Users can view generated pdfs for their agencies" ON generated_pdfs;
DROP POLICY IF EXISTS "Users can create generated pdfs" ON generated_pdfs;

-- Política: Usuarios pueden ver templates de sus agencias
CREATE POLICY "Users can view templates for their agencies"
  ON pdf_templates
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Solo admins pueden gestionar templates
CREATE POLICY "Admins can manage templates"
  ON pdf_templates
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Política: Usuarios pueden ver PDFs generados de sus agencias
CREATE POLICY "Users can view generated pdfs for their agencies"
  ON generated_pdfs
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Usuarios pueden crear PDFs
CREATE POLICY "Users can create generated pdfs"
  ON generated_pdfs
  FOR INSERT
  WITH CHECK (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Función para actualizar updated_at (si no existe)
CREATE OR REPLACE FUNCTION update_pdf_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_pdf_template_updated_at ON pdf_templates;
CREATE TRIGGER trigger_update_pdf_template_updated_at
  BEFORE UPDATE ON pdf_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_pdf_template_updated_at();

-- Insertar templates por defecto (se ejecutará por cada agencia en la app)
-- Los templates reales se insertarán desde la aplicación
