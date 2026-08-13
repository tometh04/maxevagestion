-- Migration: agregar 'PAYMENT_MISSED' al CHECK de billing_events.event_type.
--
-- Contexto: el reconcile (app/api/cron/billing-reconcile) ahora baja a PAST_DUE de
-- forma proactiva cuando MP dice "authorized" pero el ciclo vigente no se cobró
-- (fix del "mes gratis"). Ese evento se loguea con event_type='PAYMENT_MISSED'.
-- Sin el valor en el CHECK, el INSERT falla con 23514. Reemplazamos el CHECK por
-- la lista completa vigente (mig 20260723000002) + el valor nuevo. Idempotente.

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
    'PAYMENT_REJECTED_TRIAL_ACTIVE',
    -- Cambio de plan manual desde platform-admin (change-plan/route.ts)
    'PLAN_CHANGED',
    -- Corte proactivo por cobro no ejecutado (reconcile fix "mes gratis")
    'PAYMENT_MISSED'
  ));

COMMENT ON CONSTRAINT billing_events_event_type_check ON public.billing_events IS
  'Lista completa de event_types que inserta el código (webhook, cron, state '
  'machine, admin). Mantener en sync: un valor faltante hace que el insert '
  'falle con 23514 y, si el caller solo maneja 23505, se pierde en silencio.';
