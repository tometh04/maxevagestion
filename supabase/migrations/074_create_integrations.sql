-- =====================================================
-- Migración 074: Sistema de Integraciones
-- Gestión de integraciones con servicios externos
-- =====================================================

-- Tabla de integraciones
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL,
  integration_type TEXT NOT NULL CHECK (integration_type IN (
    'trello', 'manychat', 'whatsapp', 'afip', 'email', 
    'calendar', 'slack', 'webhook', 'zapier', 'other'
  )),
  description TEXT,
  
  -- Configuración
  config JSONB DEFAULT '{}',
  -- Ejemplos de config:
  -- trello: { board_id, api_key, token, list_mappings }
  -- manychat: { api_key, page_id, flows }
  -- whatsapp: { phone_number_id, access_token, webhook_verify_token }
  -- afip: { cuit, cert_path, key_path, production }
  -- email: { smtp_host, smtp_port, smtp_user, smtp_pass, from_email }
  -- calendar: { provider, client_id, client_secret, refresh_token }
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'pending')),
  error_message TEXT,
  
  -- Sincronización
  sync_enabled BOOLEAN DEFAULT FALSE,
  sync_frequency TEXT CHECK (sync_frequency IN ('realtime', 'hourly', 'daily', 'weekly', 'manual')),
  last_sync_at TIMESTAMP WITH TIME ZONE,
  next_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Permisos
  permissions JSONB DEFAULT '{}',
  -- { read: true, write: true, delete: false }
  
  -- Webhooks
  webhook_url TEXT,
  webhook_secret TEXT,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de logs de integraciones
CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  
  -- Tipo de log
  log_type TEXT NOT NULL CHECK (log_type IN ('info', 'success', 'warning', 'error', 'debug')),
  
  -- Contenido
  action TEXT NOT NULL, -- sync, webhook, api_call, auth, etc.
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  
  -- Request/Response
  request_data JSONB,
  response_data JSONB,
  response_status INTEGER,
  
  -- Duración
  duration_ms INTEGER,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de webhooks entrantes
CREATE TABLE IF NOT EXISTS integration_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  
  -- Datos del webhook
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB,
  
  -- Estado de procesamiento
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'ignored')),
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  -- Timestamp
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_integrations_agency ON integrations(agency_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);
CREATE INDEX IF NOT EXISTS idx_integration_logs_integration ON integration_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_type ON integration_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON integration_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_integration ON integration_webhooks(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_status ON integration_webhooks(status);

-- Comentarios
COMMENT ON TABLE integrations IS 'Integraciones con servicios externos';
COMMENT ON TABLE integration_logs IS 'Logs de actividad de integraciones';
COMMENT ON TABLE integration_webhooks IS 'Webhooks entrantes de integraciones';
COMMENT ON COLUMN integrations.config IS 'Configuración específica de cada tipo de integración';

-- RLS (Row Level Security)
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_webhooks ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view integrations for their agencies" ON integrations;
DROP POLICY IF EXISTS "Admins can manage integrations" ON integrations;
DROP POLICY IF EXISTS "Users can view logs for their integrations" ON integration_logs;
DROP POLICY IF EXISTS "System can create logs" ON integration_logs;
DROP POLICY IF EXISTS "Users can view webhooks for their integrations" ON integration_webhooks;
DROP POLICY IF EXISTS "System can manage webhooks" ON integration_webhooks;

-- Políticas para integrations
CREATE POLICY "Users can view integrations for their agencies"
  ON integrations
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage integrations"
  ON integrations
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Políticas para integration_logs
CREATE POLICY "Users can view logs for their integrations"
  ON integration_logs
  FOR SELECT
  USING (
    integration_id IN (
      SELECT id FROM integrations 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "System can create logs"
  ON integration_logs
  FOR INSERT
  WITH CHECK (true);

-- Políticas para integration_webhooks
CREATE POLICY "Users can view webhooks for their integrations"
  ON integration_webhooks
  FOR SELECT
  USING (
    integration_id IN (
      SELECT id FROM integrations 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "System can manage webhooks"
  ON integration_webhooks
  FOR ALL
  USING (true);

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS trigger_update_integration_updated_at ON integrations;
CREATE TRIGGER trigger_update_integration_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_integration_updated_at();

-- Función para limpiar logs antiguos (ejecutar periódicamente)
CREATE OR REPLACE FUNCTION cleanup_old_integration_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM integration_logs 
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
