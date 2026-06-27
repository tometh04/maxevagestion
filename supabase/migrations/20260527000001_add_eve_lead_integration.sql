-- 20260527000001: Integración con el agente conversacional Eve (Vibu).
-- Los leads que Eve captura por WhatsApp/Instagram/Messenger se empujan al CRM
-- vía /api/integrations/eve-in/[token]/webhook y se guardan en `leads`.
-- Extiende el estado de 20260520000001_add_chatsell_integration (última migración
-- que tocó leads_source_check); incluye la unión completa + 'Eve'.

-- 1) Permitir source = 'Eve' (lista autoritativa = chatsell + Eve).
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source IN (
    'Instagram',
    'WhatsApp',
    'Meta Ads',
    'Other',
    'Trello',
    'Manychat',
    'Referido',
    'Cliente',
    'Callbell',
    'Chatsell',
    'Eve'
  ));

-- 2) Idempotencia por conversación de Eve: un lead por (org, session_id de Eve).
--    El sync-handler hace upsert sobre este par; eve_full_data guarda el payload crudo.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS eve_session_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS eve_full_data JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS leads_org_eve_session_unique
  ON leads (org_id, eve_session_id)
  WHERE eve_session_id IS NOT NULL;
