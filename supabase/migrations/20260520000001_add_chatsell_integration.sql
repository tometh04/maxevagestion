-- ============================================================================
-- MIGRATION — Agregar 'chatsell' como integración soportada
-- Fecha: 2026-05-20
-- Contexto:
--   Chatsell es un agente IA de ventas que va a derivar leads pre-calificados
--   a Vibook vía webhook. Cada agencia que use Chatsell tiene su propio
--   webhook_token (single-tenant per integration).
--
--   Patrón idéntico al de Callbell/Manychat (ver
--   supabase/migrations/20260508000002_org_integrations.sql).
--
-- Cambios:
--   1. Agregar 'chatsell' al CHECK constraint de org_integrations.integration
--   2. Agregar columna leads.chatsell_full_data (JSONB) para guardar el
--      payload original del webhook (auditoría + debugging).
-- ============================================================================

-- 1. Expandir el CHECK constraint para incluir 'chatsell'
ALTER TABLE org_integrations
  DROP CONSTRAINT IF EXISTS org_integrations_integration_check;

ALTER TABLE org_integrations
  ADD CONSTRAINT org_integrations_integration_check
  CHECK (integration IN (
    'manychat',
    'callbell-in',
    'callbell-out',
    'chatsell'
  ));

-- 2. Columna para guardar el payload original del webhook de Chatsell
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS chatsell_full_data JSONB;

CREATE INDEX IF NOT EXISTS idx_leads_chatsell_full_data
  ON leads USING GIN (chatsell_full_data);

COMMENT ON COLUMN leads.chatsell_full_data IS
  'Payload completo recibido vía webhook de Chatsell. Incluye event_id, nombre, telefono, destino, calidad, conversation_url y metadata custom. Útil para auditoría y debugging.';
