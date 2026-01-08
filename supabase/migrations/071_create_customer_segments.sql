-- =====================================================
-- Migración 071: Segmentación de Clientes
-- Sistema de segmentos automáticos y manuales
-- =====================================================

-- Tabla de segmentos de clientes
CREATE TABLE IF NOT EXISTS customer_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1', -- Color para identificar el segmento
  icon TEXT DEFAULT 'users', -- Icono del segmento
  
  -- Tipo de segmento
  segment_type TEXT NOT NULL DEFAULT 'manual' CHECK (segment_type IN ('manual', 'automatic', 'hybrid')),
  
  -- Reglas para segmentos automáticos (JSON)
  -- Ejemplo: [{"field": "total_spent", "operator": ">", "value": 10000}, {"field": "operations_count", "operator": ">=", "value": 3}]
  rules JSONB DEFAULT '[]',
  rules_logic TEXT DEFAULT 'AND' CHECK (rules_logic IN ('AND', 'OR')),
  
  -- Configuración
  is_active BOOLEAN DEFAULT TRUE,
  auto_update BOOLEAN DEFAULT TRUE, -- Actualizar automáticamente la membresía
  priority INTEGER DEFAULT 0, -- Prioridad para resolver conflictos
  
  -- Estadísticas (actualizadas periódicamente)
  customer_count INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMP WITH TIME ZONE,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de membresía de clientes en segmentos
CREATE TABLE IF NOT EXISTS customer_segment_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  segment_id UUID NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Tipo de membresía
  membership_type TEXT NOT NULL DEFAULT 'automatic' CHECK (membership_type IN ('automatic', 'manual', 'excluded')),
  
  -- Auditoría
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint
  UNIQUE(segment_id, customer_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_customer_segments_agency ON customer_segments(agency_id);
CREATE INDEX IF NOT EXISTS idx_customer_segments_type ON customer_segments(segment_type);
CREATE INDEX IF NOT EXISTS idx_customer_segments_active ON customer_segments(is_active);
CREATE INDEX IF NOT EXISTS idx_customer_segment_members_segment ON customer_segment_members(segment_id);
CREATE INDEX IF NOT EXISTS idx_customer_segment_members_customer ON customer_segment_members(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_segment_members_type ON customer_segment_members(membership_type);

-- Comentarios
COMMENT ON TABLE customer_segments IS 'Segmentos de clientes para clasificación y marketing';
COMMENT ON COLUMN customer_segments.segment_type IS 'Tipo: manual, automatic, hybrid';
COMMENT ON COLUMN customer_segments.rules IS 'Reglas JSON para segmentos automáticos';
COMMENT ON COLUMN customer_segments.rules_logic IS 'Lógica de combinación: AND, OR';

-- RLS (Row Level Security)
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segment_members ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view segments for their agencies" ON customer_segments;
DROP POLICY IF EXISTS "Admins can manage segments" ON customer_segments;
DROP POLICY IF EXISTS "Users can view segment members" ON customer_segment_members;
DROP POLICY IF EXISTS "Users can manage segment members" ON customer_segment_members;

-- Política: Usuarios pueden ver segmentos de sus agencias
CREATE POLICY "Users can view segments for their agencies"
  ON customer_segments
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Admins pueden gestionar segmentos
CREATE POLICY "Admins can manage segments"
  ON customer_segments
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Usuarios pueden ver membresías de segmentos de sus agencias
CREATE POLICY "Users can view segment members"
  ON customer_segment_members
  FOR SELECT
  USING (
    segment_id IN (
      SELECT id FROM customer_segments 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Política: Usuarios pueden gestionar membresías
CREATE POLICY "Users can manage segment members"
  ON customer_segment_members
  FOR ALL
  USING (
    segment_id IN (
      SELECT id FROM customer_segments 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_customer_segment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_customer_segment_updated_at ON customer_segments;
CREATE TRIGGER trigger_update_customer_segment_updated_at
  BEFORE UPDATE ON customer_segments
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_segment_updated_at();

-- Insertar segmentos predefinidos (se hará desde la app para cada agencia)
-- Ejemplos de segmentos comunes:
-- VIP: total_spent > 50000 AND operations_count >= 5
-- Frecuente: operations_count >= 3 en último año
-- Nuevo: created_at > 30 días
-- Inactivo: last_operation > 365 días
-- Corporativo: customer_type = 'business'
