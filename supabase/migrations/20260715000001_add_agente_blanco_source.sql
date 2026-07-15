-- Agregar "Agente Blanco" como valor válido para source en leads.
-- Agente Blanco es un CRM de Instagram DM que ingesta leads via el webhook
-- legacy /api/webhooks/manychat mandando source: "agenteblanco" en el payload.
-- El webhook normaliza ese alias al valor canónico "Agente Blanco".

ALTER TABLE leads
DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE leads
ADD CONSTRAINT leads_source_check
  CHECK (source IN ('Instagram', 'WhatsApp', 'Meta Ads', 'Other', 'Trello', 'Manychat', 'Referido', 'Cliente', 'Agente Blanco'));

COMMENT ON COLUMN leads.source IS 'Origen del lead: Instagram, WhatsApp, Meta Ads, Other, Trello, Manychat, Referido, Cliente, o Agente Blanco';
