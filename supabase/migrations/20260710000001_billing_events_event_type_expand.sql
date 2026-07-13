-- Migration: expandir CHECK de billing_events.event_type.
--
-- Contexto: el constraint original (migración 149) solo permitía 9 valores,
-- pero el código fue agregando event_types nuevos que NO estaban en la lista:
--   - MP_WEBHOOK_PREAPPROVAL, MP_WEBHOOK_PAYMENT  (app/api/billing/mp-webhook)
--   - RECONCILED, TRIAL_EXPIRED                    (app/api/cron/billing-reconcile)
--   - SUBSCRIPTION_FINISHED, PAYMENT_REJECTED_TRIAL_ACTIVE  (lib/billing/state-machine)
--
-- Como el insert del raw webhook event es lo PRIMERO que hace el handler y solo
-- se manejaba el error 23505 (duplicado), un 23514 (check_violation) se tragaba
-- en silencio: perdíamos la traza de que el webhook llegó y se rompía la
-- idempotencia-por-insert. Este es un factor directo del síntoma
-- "el cliente pagó pero no quedó registrado / no vemos el webhook".
--
-- Fix: reemplazar el CHECK por la lista completa de valores que el código
-- realmente inserta. Idempotente (DROP IF EXISTS + ADD).

ALTER TABLE public.billing_events
  DROP CONSTRAINT IF EXISTS billing_events_event_type_check;

ALTER TABLE public.billing_events
  ADD CONSTRAINT billing_events_event_type_check
  CHECK (event_type IN (
    -- Originales (migración 149)
    'CHECKOUT_INITIATED',
    'MP_WEBHOOK',
    'SUBSCRIPTION_CREATED',
    'SUBSCRIPTION_AUTHORIZED',
    'SUBSCRIPTION_PAUSED',
    'SUBSCRIPTION_CANCELLED',
    'PAYMENT_APPROVED',
    'PAYMENT_REJECTED',
    'MANUAL_ADMIN_ADJUSTMENT',
    -- Webhook raw event log (typeToEventType en mp-webhook/route.ts)
    'MP_WEBHOOK_PREAPPROVAL',
    'MP_WEBHOOK_PAYMENT',
    -- Reconciliación (billing-reconcile/route.ts)
    'RECONCILED',
    'TRIAL_EXPIRED',
    -- State machine (state-machine.ts)
    'SUBSCRIPTION_FINISHED',
    'PAYMENT_REJECTED_TRIAL_ACTIVE'
  ));

COMMENT ON CONSTRAINT billing_events_event_type_check ON public.billing_events IS
  'Lista completa de event_types que inserta el código (webhook, cron, state '
  'machine, admin). Mantener en sync: un valor faltante hace que el insert '
  'falle con 23514 y, si el caller solo maneja 23505, se pierde en silencio.';
