-- Mapeo LID → teléfono para reunificar conversaciones partidas de WhatsApp.
--
-- WhatsApp migró a "LID": el mismo contacto aparece con JID de teléfono
-- (`<numero>@s.whatsapp.net`) y con LID (`<id>@lid`). El connector ya canoniza
-- los mensajes ENTRANTES usando `key.senderPn`, pero los SALIENTES a un LID no
-- traen ese dato, así que quedan en un chat aparte y la conversación se ve
-- partida en dos.
--
-- Hasta ahora el listado del inbox intentaba reunirlas apareando un chat "solo
-- salientes" con uno "solo entrantes" por cercanía de tiempo. Eso mezclaba
-- conversaciones de personas distintas (y hasta metía mensajes privados dentro
-- de grupos), además de costar una consulta pesada en cada refresco.
--
-- Esta tabla guarda el mapeo REAL, que ya viene en el payload crudo de los
-- mensajes entrantes. Es unívoco: al momento del backfill, 2122 LIDs y ningún
-- LID apuntando a dos teléfonos distintos.

CREATE TABLE wa_lid_map (
  device_id UUID NOT NULL REFERENCES wa_devices(id) ON DELETE CASCADE,
  lid_jid TEXT NOT NULL,
  phone_jid TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, lid_jid)
);

CREATE INDEX idx_wa_lid_map_org ON wa_lid_map (org_id);
CREATE INDEX idx_wa_lid_map_phone ON wa_lid_map (device_id, phone_jid);

ALTER TABLE wa_lid_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_lid_map FORCE ROW LEVEL SECURITY;

CREATE POLICY "wa_lid_map_tenant_isolation" ON wa_lid_map
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- Backfill desde lo que ya está guardado en raw_payload.
INSERT INTO wa_lid_map (device_id, lid_jid, phone_jid, org_id)
SELECT DISTINCT ON (m.device_id, m.raw_payload->'key'->>'remoteJid')
       m.device_id,
       m.raw_payload->'key'->>'remoteJid',
       m.raw_payload->'key'->>'senderPn',
       m.org_id
FROM wa_messages m
WHERE m.raw_payload->'key'->>'senderPn' IS NOT NULL
  AND m.raw_payload->'key'->>'remoteJid' LIKE '%@lid'
  AND m.raw_payload->'key'->>'senderPn' LIKE '%@s.whatsapp.net'
  AND m.org_id IS NOT NULL
ORDER BY m.device_id,
         m.raw_payload->'key'->>'remoteJid',
         m.sent_at DESC
ON CONFLICT (device_id, lid_jid) DO NOTHING;
