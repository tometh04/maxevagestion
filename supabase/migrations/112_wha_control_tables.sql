-- WHA Control: Tablas para monitoreo de WhatsApp via Baileys
-- Migración 112

-- 1. wa_devices - Números de WhatsApp conectados
CREATE TABLE IF NOT EXISTS wa_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  phone_number text,
  whatsapp_jid text,
  status text NOT NULL DEFAULT 'PENDING_QR'
    CHECK (status IN ('PENDING_QR','PAIRING','CONNECTED','DISCONNECTED','RECONNECTING','LOGGED_OUT','ERROR')),
  qr_value text,
  last_connection_at timestamptz,
  last_seen_event_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. wa_auth_credentials - Credenciales de sesión Baileys (1 por device)
CREATE TABLE IF NOT EXISTS wa_auth_credentials (
  device_id uuid PRIMARY KEY REFERENCES wa_devices(id) ON DELETE CASCADE,
  creds jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. wa_auth_keys - Key store de Baileys
CREATE TABLE IF NOT EXISTS wa_auth_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES wa_devices(id) ON DELETE CASCADE,
  category text NOT NULL,
  key_id text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, category, key_id)
);

-- 4. wa_chats - Conversaciones por device
CREATE TABLE IF NOT EXISTS wa_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES wa_devices(id) ON DELETE CASCADE,
  remote_jid text NOT NULL,
  chat_type text NOT NULL DEFAULT 'individual'
    CHECK (chat_type IN ('individual','group','broadcast')),
  contact_name text,
  contact_phone text,
  push_name text,
  is_group boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_message_preview text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, remote_jid)
);

-- 5. wa_messages - Mensajes
CREATE TABLE IF NOT EXISTS wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES wa_devices(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES wa_chats(id) ON DELETE CASCADE,
  wa_message_id text NOT NULL,
  remote_jid text NOT NULL,
  participant_jid text,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','system')),
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text','image','video','audio','voice','document','sticker','location','contact','reaction','system','unknown')),
  body_text text,
  sent_at timestamptz NOT NULL,
  from_me boolean NOT NULL DEFAULT false,
  media_url text,
  media_mime_type text,
  media_file_name text,
  quoted_message_id text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, wa_message_id)
);

-- 6. wa_daily_metrics - Métricas agregadas diarias
CREATE TABLE IF NOT EXISTS wa_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES wa_devices(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  inbound_count integer NOT NULL DEFAULT 0,
  outbound_count integer NOT NULL DEFAULT 0,
  active_chats_count integer NOT NULL DEFAULT 0,
  new_chats_count integer NOT NULL DEFAULT 0,
  responded_chats_count integer NOT NULL DEFAULT 0,
  unanswered_chats_count integer NOT NULL DEFAULT 0,
  avg_first_response_seconds numeric(12,2),
  median_first_response_seconds numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, metric_date)
);

-- Indexes para performance
CREATE INDEX IF NOT EXISTS idx_wa_messages_chat_sent ON wa_messages(chat_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_device_sent ON wa_messages(device_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_chats_device_last_msg ON wa_chats(device_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_daily_metrics_device_date ON wa_daily_metrics(device_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_wa_auth_keys_device_cat ON wa_auth_keys(device_id, category);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_wa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wa_devices_updated_at BEFORE UPDATE ON wa_devices
  FOR EACH ROW EXECUTE FUNCTION update_wa_updated_at();
CREATE TRIGGER wa_chats_updated_at BEFORE UPDATE ON wa_chats
  FOR EACH ROW EXECUTE FUNCTION update_wa_updated_at();
CREATE TRIGGER wa_daily_metrics_updated_at BEFORE UPDATE ON wa_daily_metrics
  FOR EACH ROW EXECUTE FUNCTION update_wa_updated_at();
CREATE TRIGGER wa_auth_credentials_updated_at BEFORE UPDATE ON wa_auth_credentials
  FOR EACH ROW EXECUTE FUNCTION update_wa_updated_at();

-- RLS con policy permisiva (acceso controlado por service_role y admin client)
ALTER TABLE wa_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_auth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_auth_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_devices_full_access" ON wa_devices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wa_auth_credentials_full_access" ON wa_auth_credentials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wa_auth_keys_full_access" ON wa_auth_keys FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wa_chats_full_access" ON wa_chats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wa_messages_full_access" ON wa_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wa_daily_metrics_full_access" ON wa_daily_metrics FOR ALL USING (true) WITH CHECK (true);
