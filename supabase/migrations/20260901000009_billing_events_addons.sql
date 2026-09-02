-- billing_events: tipos de evento de complementos (addons).
--
-- El CHECK de `event_type` es una lista cerrada: un valor faltante hace fallar
-- el INSERT con 23514 y, como varios callers solo contemplan 23505
-- (idempotencia), el evento se pierde en silencio. Por eso agregar un tipo de
-- evento SIEMPRE requiere migración, y se repite la lista completa vigente.
--
-- Lista base tomada de 20260830000001_billing_events_past_due_reminder.sql
-- (verificada contra el constraint vivo en produccion).

BEGIN;

ALTER TABLE public.billing_events
  DROP CONSTRAINT IF EXISTS billing_events_event_type_check;

ALTER TABLE public.billing_events
  ADD CONSTRAINT billing_events_event_type_check
  CHECK (event_type IN (
    'CHECKOUT_INITIATED',
    'MP_WEBHOOK',
    'SUBSCRIPTION_CREATED',
    'SUBSCRIPTION_AUTHORIZED',
    'SUBSCRIPTION_PAUSED',
    'SUBSCRIPTION_CANCELLED',
    'PAYMENT_APPROVED',
    'PAYMENT_REJECTED',
    'MANUAL_ADMIN_ADJUSTMENT',
    'MP_WEBHOOK_PREAPPROVAL',
    'MP_WEBHOOK_PAYMENT',
    'RECONCILED',
    'TRIAL_EXPIRED',
    'SUBSCRIPTION_FINISHED',
    'PAYMENT_REJECTED_TRIAL_ACTIVE',
    'PLAN_CHANGED',
    'PAYMENT_MISSED',
    'PAST_DUE_REMINDER',
    'PAST_DUE_GRACE_EXPIRED',
    -- Complementos facturables (lib/addons).
    -- ADDON_PRICE_APPLIED lleva en `payload` el desglose { base, addons[], total }
    -- del momento en que se empujo el importe a MP. Es la fuente que usa el
    -- webhook para descontar los complementos y mantener agreed_plan_price_ars
    -- como precio del plan base.
    'ADDON_REQUESTED',
    'ADDON_ACTIVATED',
    'ADDON_CANCEL_SCHEDULED',
    'ADDON_CANCELLED',
    'ADDON_PRICE_APPLIED'
  ));

COMMENT ON CONSTRAINT billing_events_event_type_check ON public.billing_events IS
  'Lista cerrada de tipos de evento. Agregar uno nuevo REQUIERE migracion: sin '
  'el valor, el INSERT falla con 23514 y el evento se pierde en silencio.';

COMMIT;
