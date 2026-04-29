ALTER TABLE whatsapp_messages
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'WHATSAPP'
    CHECK (channel IN ('WHATSAPP', 'INTERNAL')),
  ADD COLUMN IF NOT EXISTS message_kind TEXT NOT NULL DEFAULT 'STANDARD'
    CHECK (message_kind IN ('STANDARD', 'SELLER_RECEIPT')),
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recipient_name TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_recipient_user
  ON whatsapp_messages(recipient_user_id)
  WHERE recipient_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_internal_receipt_unique
  ON whatsapp_messages(payment_id, recipient_user_id, message_kind)
  WHERE channel = 'INTERNAL'
    AND message_kind = 'SELLER_RECEIPT'
    AND payment_id IS NOT NULL
    AND recipient_user_id IS NOT NULL;

COMMENT ON COLUMN whatsapp_messages.channel IS 'Canal lógico del mensaje: WhatsApp al cliente o notificación interna.';
COMMENT ON COLUMN whatsapp_messages.message_kind IS 'Tipo funcional del mensaje. SELLER_RECEIPT identifica recibos internos para vendedores.';
COMMENT ON COLUMN whatsapp_messages.recipient_user_id IS 'Usuario destinatario cuando el mensaje es interno.';
COMMENT ON COLUMN whatsapp_messages.recipient_name IS 'Nombre cacheado del destinatario interno para renderizado rápido.';
