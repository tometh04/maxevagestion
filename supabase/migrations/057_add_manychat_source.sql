-- Agregar "Manychat" como valor válido para source en leads
-- Esto permite que los leads de Manychat se guarden con source = 'Manychat'

ALTER TABLE leads
DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE leads
ADD CONSTRAINT leads_source_check 
CHECK (source IN ('Instagram', 'WhatsApp', 'Meta Ads', 'Other', 'Trello', 'Manychat'));

-- Comentario para documentación
COMMENT ON COLUMN leads.source IS 'Origen del lead: Instagram, WhatsApp, Meta Ads, Other, Trello, o Manychat';

