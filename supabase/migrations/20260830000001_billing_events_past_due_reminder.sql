-- Migration: agregar 'PAST_DUE_REMINDER' y 'PAST_DUE_GRACE_EXPIRED' al CHECK de
-- billing_events.event_type.
--
-- Contexto: el cron past-due-reminders (dunning) usa billing_events como ledger
-- de idempotencia. Antes de mandar cada aviso inserta una fila con
-- external_id = '<org_id>:past_due:<period_end>:<dia_de_gracia>'; el UNIQUE
-- parcial (external_id, event_type) hace que un segundo intento choque con
-- 23505 y no se le mande el mail dos veces al cliente. Sin estos valores en el
-- CHECK el insert falla con 23514 y el cron no puede reclamar el slot.
--
-- Reemplazamos el CHECK por la lista completa vigente (mig 20260724000001) + los
-- valores nuevos. Idempotente.

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
    'PAYMENT_MISSED',
    -- Dunning (cron past-due-reminders): aviso enviado al cliente y escalada
    -- interna cuando se agota la gracia sin pago.
    'PAST_DUE_REMINDER',
    'PAST_DUE_GRACE_EXPIRED'
  ));

COMMENT ON CONSTRAINT billing_events_event_type_check ON public.billing_events IS
  'Lista completa de event_types que inserta el código (webhook, cron, state '
  'machine, admin, dunning). Mantener en sync: un valor faltante hace que el '
  'insert falle con 23514 y, si el caller solo maneja 23505, se pierde en silencio.';
