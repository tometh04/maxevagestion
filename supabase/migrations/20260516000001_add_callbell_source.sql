-- =============================================================================
-- Agrega 'Callbell' a leads.source CHECK constraint
-- =============================================================================
-- Motivo: el handler /api/integrations/callbell-in/[token]/webhook ahora puede
-- crear leads nuevos para tenants Callbell-only (ej. VICO) cuando recibe
-- eventos contact_created o message_created de phones desconocidos. El source
-- "Callbell" identifica esa fuente para que las métricas y el CRM diferencien
-- los leads que vinieron por WhatsApp via Callbell vs los de ManyChat, manual,
-- etc.
--
-- Idempotente: dropea y recrea el constraint con la lista extendida.
-- =============================================================================

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
    'Callbell'
  ));
