-- Migración 2026-05-07: trial_reminder_sent_at en organizations
--
-- Cron /api/cron/trial-reminders manda email cuando un trial vence
-- en <= 48h. Para no spamear si el cron corre múltiples veces el
-- mismo día, marcamos el último envío en este timestamp.
--
-- Heurística del cron: solo envía si trial_reminder_sent_at IS NULL
-- O hace > 12h. Esto permite re-enviar si el primer mail no fue visto
-- (envío diario), pero acota a 1 mail cada 12h por org.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_reminder_sent_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN organizations.trial_reminder_sent_at IS
  'Última vez que el cron trial-reminders envió email a este org. NULL = nunca enviado.';

-- Index parcial para que la query del cron use index en vez de seq scan.
-- Solo nos importan rows con NULL o old timestamps (los que SÍ se notifican).
CREATE INDEX IF NOT EXISTS idx_organizations_trial_reminder_pending
  ON organizations (trial_ends_at)
  WHERE subscription_status = 'TRIAL';
