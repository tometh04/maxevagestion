-- WHA Control: identidad propia en grupos + no leídos reales.
--
-- 1) `wa_devices.whatsapp_lid`
-- En grupos, Baileys reporta los mensajes propios con `fromMe: false` cuando el
-- participante viene como LID (`<id>@lid`) en vez del teléfono. Sin saber cuál
-- es el LID del propio dispositivo, esos mensajes se guardaban como entrantes y
-- en el inbox aparecían del lado del interlocutor.
--
-- 2) `wa_chats.last_read_at` + `wa_unread_counts`
-- El contador `unread_count` viene de WhatsApp (`chat.unreadCount`) y refleja lo
-- que el dueño del teléfono leyó en su celular, no lo que se leyó en vibook: al
-- momento de esta migración había 1813 chats clavados en 1 y 1786 en 0, o sea
-- ruido. Los no leídos ahora se calculan contra la última vez que la
-- conversación se abrió EN VIBOOK.

ALTER TABLE wa_devices ADD COLUMN IF NOT EXISTS whatsapp_lid TEXT;

ALTER TABLE wa_chats ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

-- Arrancamos con todo leído: contar el histórico como pendiente llenaría el
-- inbox de badges que nadie va a atender.
UPDATE wa_chats SET last_read_at = now() WHERE last_read_at IS NULL;

-- Mensajes entrantes posteriores a la última apertura, por chat.
CREATE OR REPLACE FUNCTION wa_unread_counts(p_org_id UUID, p_chat_ids UUID[])
RETURNS TABLE (chat_id UUID, unread BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT m.chat_id, count(*)
  FROM wa_messages m
  JOIN wa_chats c ON c.id = m.chat_id
  WHERE c.org_id = p_org_id
    AND m.chat_id = ANY (p_chat_ids)
    AND m.direction = 'inbound'
    AND (c.last_read_at IS NULL OR m.sent_at > c.last_read_at)
  GROUP BY m.chat_id;
$$;

REVOKE ALL ON FUNCTION wa_unread_counts(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wa_unread_counts(UUID, UUID[]) TO authenticated, service_role;
