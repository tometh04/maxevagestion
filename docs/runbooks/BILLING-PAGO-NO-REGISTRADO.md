# Runbook — "El cliente pagó pero no figura la suscripción"

**Contexto**: reclamo típico de billing — una agencia dice que pagó la
suscripción en Mercado Pago, pero del lado nuestro la org quedó como
`PENDING_PAYMENT` (o sin acceso / en paywall). Este runbook explica cómo
diagnosticarlo y recuperarlo.

## Por qué pasa

El flow usa un `preapproval_plan` **compartido** por todos los tenants. El link
entre la org y la suscripción de MP lo cierra normalmente una llamada del lado
del cliente: `/api/billing/sync`, disparada desde
`app/onboarding/billing/return/page.tsx` cuando MP redirige de vuelta.

Si el cliente **no vuelve** (cierra la pestaña), o hay un blip transitorio, la
org puede quedar con `mp_preapproval_id = NULL` y estado `PENDING_PAYMENT` aunque
MP ya haya autorizado/cobrado.

Redes de contención (después del hardening 2026-07-10):

1. **Webhook MP** (`/api/billing/mp-webhook`) — ahora se auto-registra por código
   (`notification_url`) y, ante fallas transitorias o org aún no linkeada,
   responde **5xx** para que MP reintente (antes devolvía 200 y perdía el evento).
2. **Cron `billing-reconcile` (Fase 3)** — 1x/día busca orgs `PENDING_PAYMENT`
   con un `CHECKOUT_INITIATED` reciente y `mp_preapproval_id NULL`, y las
   recupera buscando el preapproval en MP por `billing_email`.
3. **Relink manual** — endpoint/botón admin para forzar la recuperación al toque.

## Diagnóstico

1. Abrir `/admin/orgs/<orgId>` → sección **"MP snapshot + últimos webhooks"**.
   - Si `mp_preapproval_id` está seteado → mirar el preapproval y los últimos
     `billing_events`. Si MP dice `authorized` pero la org no está `ACTIVE`,
     probablemente sea un drift → correr reconcile o relink.
   - Si el snapshot muestra `preapproval: null` → la org **no está linkeada**
     (caso clásico del reclamo).
2. Verificar en `billing_events` (por `org_id`): debería haber un
   `CHECKOUT_INITIATED`. Si **no hay** ningún `MP_WEBHOOK_*` posterior, MP no nos
   está notificando → revisar config del panel (abajo).
3. Confirmar en MP (panel o snapshot) que existe un preapproval `authorized`
   para el `billing_email` de la org.

## Recuperación (relink manual)

En `/admin/orgs/<orgId>` → **"Re-vincular con MP"**:

- Dejar los campos vacíos para buscar por el `billing_email` de la org, **o**
  pasar `payer_email` / `preapproval_id` específicos.
- El endpoint (`POST /api/admin/orgs/[id]/mp-relink`) busca el preapproval,
  aplica la state machine y setea `mp_preapproval_id` + estado. Queda auditado
  como `MANUAL_ADMIN_ADJUSTMENT` en `billing_events` y en `security_audit_log`.
- Respuestas posibles: `ambiguous_candidates` (más de un authorized para el
  email → pasá el `preapproval_id`), `external_reference_mismatch` (el
  preapproval es de otra org), `no_preapproval_in_mp` (MP no tiene nada → el pago
  no existe realmente).

Si querés recuperar en lote, corré el cron `billing-reconcile` manualmente
(`POST /api/cron/billing-reconcile` con `Authorization: Bearer $CRON_SECRET`):
la Fase 3 barre todas las orgs no linkeadas con checkout reciente.

## Checklist de configuración del panel de MP

Aunque el webhook ahora se auto-registra por `notification_url`, verificar el
panel evita sorpresas:

- **Notificaciones/Webhooks** apuntando a `https://<dominio-prod>/api/billing/mp-webhook`.
- `MERCADOPAGO_WEBHOOK_SECRET` en Railway == el secret del panel de MP. Si no
  coincide, TODOS los webhooks se rechazan con 401 (ver
  `security_audit_log` → `mp_webhook_invalid_signature`).
- `MERCADOPAGO_ACCESS_TOKEN` de la cuenta correcta (no sandbox en prod;
  `MP_USE_SANDBOX` debe estar apagado en prod).
- `NEXT_PUBLIC_APP_URL` = dominio prod https (de acá sale el `notification_url`).
- `CRON_SECRET` idéntico en la app y en el Railway Cron Service (si driftea, los
  crons devuelven 401 en silencio y la reconciliación deja de correr — ver
  `lib/cron/auth.ts`).

## Señales / alertas

- `security_audit_log`: `mp_webhook_invalid_signature`,
  `mp_webhook_raw_insert_failed`, `subscription_status_changed_via_mp`,
  `admin_mp_relink`.
- Slack `#payments-vibook` (`notifyBillingSlack`): `PAYMENT_REJECTED`,
  `RECONCILED` (incluye recuperación de orgs no linkeadas), `BILLING_ALERT`
  (pago no atribuible / fallas de insert/update).

## Archivos relevantes

- `app/api/billing/mp-webhook/route.ts` — handler + idempotencia + reintentos.
- `app/api/billing/sync/route.ts` — cierre del loop del lado cliente.
- `app/api/cron/billing-reconcile/route.ts` — reconciliación + Fase 3.
- `app/api/admin/orgs/[id]/mp-relink/route.ts` — recuperación manual.
- `lib/billing/relink-preapproval.ts` — resolver preapproval + aplicar estado.
- `lib/billing/mercadopago.ts` — cliente MP + `notification_url`.
- `lib/billing/state-machine.ts` — fuente de verdad MP → estado.
