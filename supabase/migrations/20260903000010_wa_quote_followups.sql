-- Seguimiento automático post-cotización en WHA Control (VIB: pedido Lozada).
-- Un vendedor marca un chat como "cotización enviada"; N horas después, si el
-- cliente no respondió (y el vendedor tampoco retomó el contacto), un cron
-- envía UN mensaje de seguimiento por el mismo device vía el connector.
--
-- wa_quote_followups: una fila por marca, con máquina de estados
--   PENDING -> PROCESSING -> SENT | CANCELLED | FAILED
-- wa_followup_settings: config org-level (espera, texto, ventana horaria).

CREATE TABLE wa_quote_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES wa_devices(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES wa_chats(id) ON DELETE CASCADE,
  -- Conversaciones partidas por la migración LID de WhatsApp: ids de TODAS las
  -- filas wa_chats que componen la conversación (el _chatIds del merge del
  -- listado). La detección de respuesta debe mirar todas.
  linked_chat_ids UUID[] NOT NULL,
  -- Snapshot del destino al momento de marcar.
  remote_jid TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'CANCELLED', 'FAILED')),

  marked_by UUID NOT NULL REFERENCES users(id),
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for TIMESTAMPTZ NOT NULL,
  -- Snapshot del texto configurado al momento de marcar (predecible para el
  -- vendedor aunque después cambien la config).
  message_text TEXT NOT NULL,

  sent_at TIMESTAMPTZ,
  sent_wa_message_id TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT
    CHECK (cancelled_reason IS NULL OR cancelled_reason IN
      ('client_replied', 'seller_followed_up', 'manual', 'device_unavailable')),

  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  -- Guard de concurrencia entre corridas del cron (patrón
  -- quotation_conversion_effects).
  lease_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (status <> 'SENT' OR sent_at IS NOT NULL),
  CHECK (status <> 'CANCELLED' OR cancelled_reason IS NOT NULL)
);

-- Un solo seguimiento activo por chat: la doble marca choca con 23505.
CREATE UNIQUE INDEX uq_wa_quote_followups_active
  ON wa_quote_followups (chat_id)
  WHERE status IN ('PENDING', 'PROCESSING');

-- Scan del cron (vencidos + leases caídos).
CREATE INDEX idx_wa_quote_followups_due
  ON wa_quote_followups (scheduled_for)
  WHERE status IN ('PENDING', 'PROCESSING');

CREATE INDEX idx_wa_quote_followups_org ON wa_quote_followups (org_id);
CREATE INDEX idx_wa_quote_followups_chat ON wa_quote_followups (chat_id);

ALTER TABLE wa_quote_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_quote_followups FORCE ROW LEVEL SECURITY;

CREATE POLICY "wa_quote_followups_tenant_isolation" ON wa_quote_followups
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- Config org-level (v1). wa_devices tiene agency_id, pero Lozada opera una
-- sola política de seguimiento; si algún tenant necesita per-agencia después,
-- se agrega agency_id nullable con precedencia agencia > org.
CREATE TABLE wa_followup_settings (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  wait_hours INTEGER NOT NULL DEFAULT 24
    CHECK (wait_hours BETWEEN 1 AND 168),
  message_text TEXT NOT NULL,
  -- Ventana horaria de envío en hora argentina (UTC-3):
  -- se envía si send_window_from <= hora_local < send_window_to.
  send_window_from INTEGER NOT NULL DEFAULT 9
    CHECK (send_window_from BETWEEN 0 AND 23),
  send_window_to INTEGER NOT NULL DEFAULT 21
    CHECK (send_window_to BETWEEN 1 AND 24),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (send_window_from < send_window_to)
);

ALTER TABLE wa_followup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_followup_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY "wa_followup_settings_tenant_isolation" ON wa_followup_settings
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));
