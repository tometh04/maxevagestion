-- Agregar "Agente Blanco" como valor válido para source en leads.
-- Agente Blanco es un CRM de Instagram DM que ingesta leads via el webhook
-- legacy /api/webhooks/manychat mandando source: "agenteblanco" en el payload.
-- El webhook normaliza ese alias al valor canónico "Agente Blanco".
--
-- La lista incluye TODOS los sources que la app escribe hoy, entre ellos los de
-- las integraciones Callbell / Chatsell / Eve (lib/integrations/*/sync-handler.ts),
-- que no figuraban en el CHECK anterior y por eso rompían el re-alta del constraint.
--
-- Se agrega como NOT VALID: el constraint queda enforced para INSERT/UPDATE
-- nuevos, pero NO valida las filas existentes (puede haber legacy con source
-- vacío o valores viejos). Si más adelante se quiere validar el histórico,
-- normalizar esas filas y luego correr:
--   ALTER TABLE leads VALIDATE CONSTRAINT leads_source_check;

ALTER TABLE leads
DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE leads
ADD CONSTRAINT leads_source_check
  CHECK (source IN (
    'Instagram', 'WhatsApp', 'Meta Ads', 'Other', 'Trello',
    'Manychat', 'Referido', 'Cliente',
    'Callbell', 'Chatsell', 'Eve',
    'Agente Blanco'
  ))
  NOT VALID;

COMMENT ON COLUMN leads.source IS 'Origen del lead: Instagram, WhatsApp, Meta Ads, Other, Trello, Manychat, Referido, Cliente, Callbell, Chatsell, Eve, o Agente Blanco';
