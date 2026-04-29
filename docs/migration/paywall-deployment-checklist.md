# Paywall MP — Deployment Checklist

Pasos manuales requeridos para activar el paywall MP en producción. Orden estricto.

Spec completo: `docs/superpowers/specs/2026-04-21-paywall-mercadopago-design.md`
Plan de implementación: `docs/superpowers/plans/2026-04-21-paywall-mercadopago.md`

---

## Paso 1 — Correr la migration 157 en Supabase (obligatorio, primero)

La migration 157 agrega columnas (`current_period_ends_at`, `mp_last_synced_at`,
`has_used_trial`), expande el CHECK de `subscription_status`, hace backfill de
orgs existentes, y crea el UNIQUE index para idempotencia de webhooks.

**Sin esta migration corrida, el código en Railway va a crashear en producción**
(queries contra columnas que no existen). Por eso las Fases 2-8 están
commiteadas localmente pero NO pusheadas — te esperan.

1. Abrí Supabase → proyecto Vibook → SQL Editor → New query
2. Pegá este SQL completo:

```sql
-- Migration 157: SaaS billing hardening

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS current_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mp_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.current_period_ends_at IS
  'Fin del período pagado/trial actual. Durante TRIALING = trial_ends_at. Durante ACTIVE = next_payment_date del preapproval MP. Se congela al CANCELLED.';
COMMENT ON COLUMN public.organizations.mp_last_synced_at IS
  'preapproval.last_modified del último webhook MP procesado.';
COMMENT ON COLUMN public.organizations.has_used_trial IS
  'True después del primer preapproval creado con free_trial. Previene exploit de re-trialing.';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN (
    'PENDING_PAYMENT', 'TRIALING', 'ACTIVE', 'PAST_DUE',
    'CANCELLED', 'SUSPENDED',
    'TRIAL'
  ));

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

UPDATE public.organizations
   SET has_used_trial = true
 WHERE subscription_status IN ('ACTIVE', 'PAST_DUE')
   AND mp_preapproval_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_idempotency
  ON public.billing_events (external_id, event_type)
  WHERE external_id IS NOT NULL;

COMMENT ON INDEX idx_billing_events_idempotency IS
  'Previene double-procesamiento de webhooks MP cuando MP retryea.';
```

3. Click **Run**. Verificá que no haya errores.
4. Verificación rápida:
   ```sql
   SELECT subscription_status, has_used_trial, current_period_ends_at
   FROM organizations;
   ```
   Debería mostrar los tenants actuales con el status migrado (TRIALING para
   los que tenían preapproval, PENDING_PAYMENT para los que no, ACTIVE/PAST_DUE
   sin cambios).

---

## Paso 2 — Push del código a Railway

Una vez confirmada la migration:

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git push origin main
```

Esto pushea los 8 commits de las fases 1-8. Railway va a deployar
automáticamente. Tarda ~3-5 min.

---

## Paso 3 — Configurar el webhook MP en el panel de developers

1. Entrá al panel de developers de Mercado Pago → tu aplicación → Webhooks
2. **URL del webhook**: `https://app.vibook.ai/api/billing/mp-webhook`
3. **Eventos a suscribir** (ambos):
   - `subscription_preapproval` — cambios de estado del preapproval
   - `subscription_authorized_payment` — cada intento de cobro
4. **Secret**: dejá el mismo que ya tenés en Railway como `MERCADOPAGO_WEBHOOK_SECRET`.

Si no hay secret configurado en Railway, **en producción el webhook rechaza
todas las notificaciones** (hardening de seguridad).

---

## Paso 4 — Crear Railway cron service para reconciliación

Similar a los otros cron services que ya tenés (ej. `cron-exchange-rates`):

- **Name**: `cron-billing-reconcile`
- **Source**: Docker image `curlimages/curl:latest`
- **Command**:
  ```
  curl -X POST https://app.vibook.ai/api/cron/billing-reconcile \
    -H "Authorization: Bearer $CRON_SECRET"
  ```
- **Schedule**: `0 6 * * *` (06:00 UTC = 03:00 AR)
- **Env vars**: `CRON_SECRET` (el mismo que ya tenés)

Este cron es **safety net** — si MP tiene un outage de webhooks, al día siguiente
la DB queda resincronizada.

---

## Paso 5 — (Opcional) Sandbox para E2E testing

Si querés probar el flow completo sin cobrar tarjetas reales:

1. En Railway variables:
   - `MERCADOPAGO_ACCESS_TOKEN_SANDBOX=<token sandbox de MP>`
   - `MP_USE_SANDBOX=true`
2. Re-deploy
3. Seguí el checklist E2E abajo
4. Al terminar, `MP_USE_SANDBOX=false` (o borrar la var) para volver a producción real

---

## Checklist E2E (con sandbox activado)

Copiado del spec §9. Marcá cada caso al probarlo:

- [ ] **Happy path signup**: landing → "Comenzar gratis" → register → redirect a `/onboarding/billing` → elegir PRO → MP sandbox → tarjeta `5031 7557 3453 0604` (CVV 123, cualquier fecha) → autorizar → redirect a `/onboarding/billing/return` → polling confirma → `/dashboard` con banner verde "Estás en período de prueba durante 7 días hasta el DD/MM"
- [ ] **Estado en `/settings/subscription`**: badge "En prueba gratis", fecha correcta, plan PRO, método de pago visible, historial con `CHECKOUT_INITIATED` + `SUBSCRIPTION_AUTHORIZED`
- [ ] **Tarjeta rechazada**: signup con titular `OTHE` → preapproval rechazado → user queda en `PENDING_PAYMENT`, ve error en el paywall
- [ ] **Cobro fallido** (PAST_DUE): simular rechazo del cobro día 8 → banner rojo en dashboard, status `PAST_DUE`, CTA "Actualizar tarjeta"
- [ ] **Cambiar tarjeta** (PAST_DUE): click "Cambiar tarjeta" → abre MP panel → actualizar tarjeta → próximo retry MP cobra OK → status vuelve a `ACTIVE`
- [ ] **Cancelar durante TRIALING**: nueva cuenta → `/settings/subscription` → Cancelar suscripción → confirmar dialog → status `CANCELLED` con `current_period_ends_at = trial_ends_at`. Dashboard muestra banner azul.
- [ ] **Reactivar antes de expiración**: desde `CANCELLED` con fecha futura → Reactivar → MP pide tarjeta → nuevo preapproval con `start_date = current_period_ends_at + 1d` → status vuelve a TRIALING/ACTIVE
- [ ] **Reactivar después de expiración**: `UPDATE organizations SET current_period_ends_at = now() - interval '1 day'` → Reactivar → MP cobra inmediato → ACTIVE
- [ ] **Bypass middleware**: request con `x-middleware-subrequest: middleware` a `/dashboard` → middleware bypasseado PERO guard server-side redirige a `/onboarding/billing` (capa B)
- [ ] **Idempotencia webhook**: reenviar mismo webhook 2x → segundo devuelve `{ok: true, duplicate: true}` sin modificar org

---

## Rollback plan

Si algo rompe en producción:

1. Deshacer push: `git revert 86505c1..HEAD && git push` (revierte los 8 commits)
2. La migration 157 es backward-compatible (`TRIAL` sigue siendo valor válido en CHECK) — no hace falta rollback de DB
3. Verificar que el middleware y la subscription page siguen funcionando con valores legacy

---

## Contactos útiles

- Hola@vibook.ai
- Panel MP developers: https://www.mercadopago.com.ar/developers/panel/
- Railway project (el que Francisco/Gerardo manejan)
- Test cards MP: https://www.mercadopago.com.ar/developers/es/docs/checkout-api/integration-test/test-cards
