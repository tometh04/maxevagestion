-- Activa la beta del chat de Emilia desde el lead para Oficial Testing Vibook.
-- Idempotente: si ya existe, lo deja en true.
--
-- Para activar en más orgs en el futuro, hacer otro INSERT similar con
-- el org_id correspondiente. Para desactivar puntualmente:
--   DELETE FROM organization_settings
--   WHERE org_id = '<org>' AND key = 'features.lead_emilia_chat';

INSERT INTO organization_settings (org_id, key, value)
VALUES (
  '410ada50-d8ae-4d18-8c90-36a9223b378b',  -- Oficial Testing Vibook
  'features.lead_emilia_chat',
  'true'
)
ON CONFLICT (org_id, key) DO UPDATE SET value = EXCLUDED.value;
