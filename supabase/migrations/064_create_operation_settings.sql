-- =====================================================
-- Migración 064: Crear Configuración de Operaciones
-- Sistema de configuración para el módulo de operaciones
-- =====================================================

-- Tabla de configuración de operaciones (una por agencia)
CREATE TABLE IF NOT EXISTS operation_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Estados personalizados (JSON array)
  -- Ejemplo: [{"value": "PENDING_APPROVAL", "label": "Pendiente Aprobación", "color": "bg-yellow-500", "order": 1}]
  custom_statuses JSONB DEFAULT '[]'::jsonb,
  
  -- Flujos de trabajo (JSON object)
  -- Ejemplo: {"PRE_RESERVATION": {"next_states": ["RESERVED", "CANCELLED"], "required_fields": ["destination"]}}
  workflows JSONB DEFAULT '{}'::jsonb,
  
  -- Alertas automáticas (JSON array)
  -- Ejemplo: [{"type": "payment_due", "enabled": true, "days_before": 30, "channels": ["email", "whatsapp"]}]
  auto_alerts JSONB DEFAULT '[]'::jsonb,
  
  -- Plantillas de documentos (JSON array)
  -- Ejemplo: [{"name": "Cotización", "template_id": "uuid", "auto_generate": true, "trigger": "CONFIRMED"}]
  document_templates JSONB DEFAULT '[]'::jsonb,
  
  -- Configuración de estados por defecto
  default_status TEXT DEFAULT 'PRE_RESERVATION',
  
  -- Configuración de validaciones
  require_destination BOOLEAN DEFAULT true,
  require_departure_date BOOLEAN DEFAULT true,
  require_operator BOOLEAN DEFAULT false,
  require_customer BOOLEAN DEFAULT false,
  
  -- Configuración de alertas
  alert_payment_due_days INTEGER DEFAULT 30,
  alert_operator_payment_days INTEGER DEFAULT 30,
  alert_upcoming_trip_days INTEGER DEFAULT 7,
  
  -- Configuración de documentos
  auto_generate_quotation BOOLEAN DEFAULT false,
  auto_generate_invoice BOOLEAN DEFAULT false,
  require_documents_before_confirmation BOOLEAN DEFAULT false,
  
  -- Configuración de integraciones
  auto_create_ledger_entry BOOLEAN DEFAULT true,
  auto_create_iva_entry BOOLEAN DEFAULT true,
  auto_create_operator_payment BOOLEAN DEFAULT true,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  UNIQUE(agency_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_operation_settings_agency ON operation_settings(agency_id);

-- Comentarios
COMMENT ON TABLE operation_settings IS 'Configuración del módulo de operaciones por agencia';
COMMENT ON COLUMN operation_settings.custom_statuses IS 'Estados personalizados adicionales a los estados estándar';
COMMENT ON COLUMN operation_settings.workflows IS 'Flujos de trabajo y transiciones de estado permitidas';
COMMENT ON COLUMN operation_settings.auto_alerts IS 'Configuración de alertas automáticas';
COMMENT ON COLUMN operation_settings.document_templates IS 'Plantillas de documentos asociadas a operaciones';

-- RLS (Row Level Security)
ALTER TABLE operation_settings ENABLE ROW LEVEL SECURITY;

-- Política: Solo usuarios con acceso a operaciones pueden ver configuración
CREATE POLICY "Users can view operation settings for their agencies"
  ON operation_settings
  FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      UNION
      SELECT id FROM agencies WHERE owner_id = auth.uid()
    )
  );

-- Política: Solo ADMIN y SUPER_ADMIN pueden modificar configuración
CREATE POLICY "Only admins can modify operation settings"
  ON operation_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );
