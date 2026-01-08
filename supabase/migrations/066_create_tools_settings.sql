-- =====================================================
-- Migración 066: Crear Configuración de Herramientas
-- Sistema de configuración para herramientas y notificaciones
-- =====================================================

-- Tabla de configuración de herramientas (una por agencia)
CREATE TABLE IF NOT EXISTS tools_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Configuración de Emilia (AI Copilot)
  emilia_enabled BOOLEAN DEFAULT true,
  emilia_model TEXT DEFAULT 'gpt-4',
  emilia_temperature NUMERIC(3,2) DEFAULT 0.7,
  emilia_max_tokens INTEGER DEFAULT 2000,
  emilia_system_prompt TEXT,
  emilia_allowed_actions JSONB DEFAULT '["search", "summarize", "suggest"]'::jsonb,
  
  -- Configuración de Email
  email_enabled BOOLEAN DEFAULT true,
  email_provider TEXT DEFAULT 'resend',
  email_from_name TEXT DEFAULT 'MAXEVA Gestión',
  email_from_address TEXT,
  email_reply_to TEXT,
  email_signature TEXT,
  email_templates JSONB DEFAULT '{}'::jsonb,
  
  -- Configuración de WhatsApp
  whatsapp_enabled BOOLEAN DEFAULT true,
  whatsapp_provider TEXT DEFAULT 'manual', -- 'manual' | 'api' | 'manychat'
  whatsapp_api_key TEXT,
  whatsapp_default_country_code TEXT DEFAULT '+54',
  whatsapp_templates JSONB DEFAULT '{}'::jsonb,
  
  -- Configuración de Notificaciones del Sistema
  notifications_enabled BOOLEAN DEFAULT true,
  notifications_sound BOOLEAN DEFAULT true,
  notifications_desktop BOOLEAN DEFAULT true,
  notifications_email_digest BOOLEAN DEFAULT false,
  notifications_digest_frequency TEXT DEFAULT 'daily', -- 'daily' | 'weekly' | 'never'
  
  -- Configuración de Exportaciones
  export_default_format TEXT DEFAULT 'xlsx', -- 'xlsx' | 'csv' | 'pdf'
  export_include_headers BOOLEAN DEFAULT true,
  export_date_format TEXT DEFAULT 'DD/MM/YYYY',
  export_currency_format TEXT DEFAULT 'symbol', -- 'symbol' | 'code' | 'both'
  export_logo_url TEXT,
  export_company_info JSONB DEFAULT '{}'::jsonb,
  
  -- Preferencias de Interfaz
  ui_theme TEXT DEFAULT 'system', -- 'light' | 'dark' | 'system'
  ui_sidebar_collapsed BOOLEAN DEFAULT false,
  ui_compact_mode BOOLEAN DEFAULT false,
  ui_show_tooltips BOOLEAN DEFAULT true,
  ui_default_currency_display TEXT DEFAULT 'ARS',
  ui_date_format TEXT DEFAULT 'DD/MM/YYYY',
  ui_time_format TEXT DEFAULT '24h', -- '12h' | '24h'
  ui_language TEXT DEFAULT 'es',
  
  -- Configuración de Backups
  backups_enabled BOOLEAN DEFAULT false,
  backups_frequency TEXT DEFAULT 'weekly', -- 'daily' | 'weekly' | 'monthly'
  backups_retention_days INTEGER DEFAULT 30,
  backups_include_attachments BOOLEAN DEFAULT false,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  UNIQUE(agency_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tools_settings_agency ON tools_settings(agency_id);

-- Comentarios
COMMENT ON TABLE tools_settings IS 'Configuración de herramientas y notificaciones por agencia';
COMMENT ON COLUMN tools_settings.emilia_enabled IS 'Si el AI Copilot está habilitado';
COMMENT ON COLUMN tools_settings.whatsapp_provider IS 'Proveedor de WhatsApp: manual, api, manychat';
COMMENT ON COLUMN tools_settings.notifications_digest_frequency IS 'Frecuencia del resumen de notificaciones por email';

-- RLS (Row Level Security)
ALTER TABLE tools_settings ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view tools settings for their agencies" ON tools_settings;
DROP POLICY IF EXISTS "Only admins can modify tools settings" ON tools_settings;

-- Política: Usuarios pueden ver configuración de sus agencias
CREATE POLICY "Users can view tools settings for their agencies"
  ON tools_settings
  FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- Política: Solo ADMIN y SUPER_ADMIN pueden modificar configuración
CREATE POLICY "Only admins can modify tools settings"
  ON tools_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );
