-- ============================================================
-- Support Tickets — Triage (bot categorization) + Linear sync
-- Agrega categoría/severidad clasificadas por IA y el link al
-- issue de Linear donde el desarrollador ataca bugs/mejoras.
-- ============================================================

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS category text
    CHECK (category IN ('bug', 'improvement', 'question')),
  ADD COLUMN IF NOT EXISTS severity text
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS ai_rationale text,
  ADD COLUMN IF NOT EXISTS ai_classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS linear_issue_id text,
  ADD COLUMN IF NOT EXISTS linear_issue_url text,
  ADD COLUMN IF NOT EXISTS linear_identifier text;

CREATE INDEX IF NOT EXISTS idx_support_tickets_category
  ON support_tickets(category);

-- Índice para el webhook de Linear (busca el ticket por issue id)
CREATE INDEX IF NOT EXISTS idx_support_tickets_linear
  ON support_tickets(linear_issue_id);
