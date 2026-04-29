-- Migration 157: SaaS billing hardening — paywall + MP robusto.
--
-- Contexto: rediseño completo del flow de suscripciones. Se agregan columnas
-- para trackear período pagado y trial usado, expande el CHECK constraint
-- de subscription_status con los nuevos valores, y migra orgs existentes.
-- También agrega UNIQUE para idempotencia de webhooks MP.
--
-- Spec: docs/superpowers/specs/2026-04-21-paywall-mercadopago-design.md
-- Plan: docs/superpowers/plans/2026-04-21-paywall-mercadopago.md

-- Columnas nuevas
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS current_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mp_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.current_period_ends_at IS
  'Fin del período pagado/trial actual. Durante TRIALING = trial_ends_at. '
  'Durante ACTIVE = next_payment_date del preapproval MP. Se congela al CANCELLED.';
COMMENT ON COLUMN public.organizations.mp_last_synced_at IS
  'preapproval.last_modified del último webhook MP procesado. Usado para detectar '
  'webhooks out-of-order e idempotencia.';
COMMENT ON COLUMN public.organizations.has_used_trial IS
  'True después del primer preapproval creado con free_trial. Previene exploit de '
  're-trialing (cancelar y volver a suscribirse con trial nuevo).';

-- Expandir CHECK de subscription_status. Valores actuales: TRIAL, ACTIVE, PAST_DUE,
-- CANCELLED, SUSPENDED. Nuevos: PENDING_PAYMENT, TRIALING. TRIAL queda como legacy
-- permitido para no romper backfill en transición.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN (
    'PENDING_PAYMENT', 'TRIALING', 'ACTIVE', 'PAST_DUE',
    'CANCELLED', 'SUSPENDED',
    'TRIAL'  -- legacy, backfilleado abajo. No se usa en código nuevo.
  ));

-- Backfill de orgs existentes:
--   TRIAL sin preapproval → PENDING_PAYMENT (nunca eligieron plan)
--   TRIAL con preapproval → TRIALING + has_used_trial=true
UPDATE public.organizations
   SET subscription_status = 'PENDING_PAYMENT'
 WHERE subscription_status = 'TRIAL'
   AND mp_preapproval_id IS NULL;

UPDATE public.organizations
   SET subscription_status = 'TRIALING',
       has_used_trial = true,
       current_period_ends_at = trial_ends_at
 WHERE subscription_status = 'TRIAL'
   AND mp_preapproval_id IS NOT NULL;

-- ACTIVE legacy: has_used_trial=true para no re-ofrecer trial
UPDATE public.organizations
   SET has_used_trial = true
 WHERE subscription_status IN ('ACTIVE', 'PAST_DUE')
   AND mp_preapproval_id IS NOT NULL;

-- Idempotencia de webhooks: unique sobre (external_id, event_type) donde
-- external_id no es null.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_idempotency
  ON public.billing_events (external_id, event_type)
  WHERE external_id IS NOT NULL;

COMMENT ON INDEX idx_billing_events_idempotency IS
  'Previene double-procesamiento de webhooks MP cuando MP retryea. '
  'Combinado con comparación de last_modified, garantiza idempotencia.';
