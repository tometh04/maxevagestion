-- =====================================================
-- Migración 062: Crear Configuración de Clientes
-- Sistema de configuración para el módulo de clientes
-- =====================================================

-- Tabla de configuración de clientes (una por agencia)
CREATE TABLE IF NOT EXISTS customer_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Campos personalizados (JSON array)
  -- Ejemplo: [{"name": "preferred_destination", "type": "text", "label": "Destino Preferido", "required": false}]
  custom_fields JSONB DEFAULT '[]'::jsonb,
  
  -- Validaciones de datos (JSON object)
  -- Ejemplo: {"email": {"required": true, "format": "email"}, "phone": {"required": true, "format": "phone"}}
  validations JSONB DEFAULT '{}'::jsonb,
  
  -- Notificaciones automáticas (JSON array)
  -- Ejemplo: [{"event": "new_customer", "enabled": true, "channels": ["email", "whatsapp"]}]
  notifications JSONB DEFAULT '[]'::jsonb,
  
  -- Integraciones con otros módulos (JSON object)
  -- Ejemplo: {"operations": {"auto_link": true}, "leads": {"auto_convert": false}}
  integrations JSONB DEFAULT '{}'::jsonb,
  
  -- Configuración general
  auto_assign_lead BOOLEAN DEFAULT false,
  require_document BOOLEAN DEFAULT false,
  duplicate_check_enabled BOOLEAN DEFAULT true,
  duplicate_check_fields TEXT[] DEFAULT ARRAY['email', 'phone'],
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  UNIQUE(agency_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_customer_settings_agency ON customer_settings(agency_id);

-- Comentarios
COMMENT ON TABLE customer_settings IS 'Configuración del módulo de clientes por agencia';
COMMENT ON COLUMN customer_settings.custom_fields IS 'Campos personalizados configurables para clientes';
COMMENT ON COLUMN customer_settings.validations IS 'Reglas de validación para campos de clientes';
COMMENT ON COLUMN customer_settings.notifications IS 'Configuración de notificaciones automáticas';
COMMENT ON COLUMN customer_settings.integrations IS 'Integraciones con otros módulos del sistema';

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_customer_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_customer_settings_updated_at
  BEFORE UPDATE ON customer_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_settings_updated_at();

-- RLS Policies
ALTER TABLE customer_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Solo usuarios con acceso a customers pueden ver/editar configuración
CREATE POLICY "Users with customers access can view customer settings"
  ON customer_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('SUPER_ADMIN', 'ADMIN', 'SELLER')
    )
  );

CREATE POLICY "Users with customers access can insert customer settings"
  ON customer_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

CREATE POLICY "Users with customers access can update customer settings"
  ON customer_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

CREATE POLICY "Only super admins can delete customer settings"
  ON customer_settings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

