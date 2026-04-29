# Paywall + Suscripciones Mercado Pago — Design Spec

**Fecha:** 2026-04-21
**Autor:** Tomi + Claude
**Estado:** Aprobado por el producto, listo para plan de implementación
**Ámbito:** `erplozada` (ERP Vibook, hosting Railway, dominio `app.vibook.ai`)

## 1. Contexto

Hoy el signup deja al usuario dentro del ERP con 7 días de trial sin requerir método de pago. No hay paywall ni cobro al día 8. Existe código parcial de checkout con Mercado Pago (`/api/billing/checkout`, `/api/billing/mp-webhook`), un webhook que solo mapea tres estados, y una página `/settings/subscription` informativa sin acciones.

Este spec describe el rediseño completo: paywall obligatorio post-signup, trial de 7 días requiriendo tarjeta, cobro automático al día 8, autogestión completa (cancelar / reactivar / cambiar tarjeta), manejo robusto de cobros fallidos con la retry policy de MP, y gate de seguridad multi-capa que no se pueda bypassear.

## 2. Objetivos

1. **Paywall obligatorio**: ningún usuario accede al ERP sin haber pasado por el checkout de MP y dejar tarjeta registrada
2. **Trial real de 7 días con tarjeta**: MP no cobra durante esos días, cobra automáticamente el día 8
3. **Manejo de cobros fallidos**: detectar el rechazo del día 8, notificar al usuario, bloquear acceso hasta que actualice el medio de pago
4. **Autogestión completa** desde `/settings/subscription`: ver estado, cambiar tarjeta, cancelar, reactivar
5. **Preservación de datos**: cancelación nunca borra nada; reactivar recupera todo
6. **Seguridad**: el paywall no se puede bypassear (defense-in-depth en 3 capas)
7. **Observabilidad**: historial de eventos auditable vía `billing_events`

## 3. Estados de suscripción y reglas de acceso

### 3.1 Estados

| Estado | Cuándo | Acceso al ERP |
|---|---|---|
| `PENDING_PAYMENT` | Signup completo, aún no eligió plan ni dejó tarjeta | Solo `/onboarding/billing` |
| `TRIALING` | Eligió plan, MP autorizó tarjeta, dentro de los 7 días gratis | Full |
| `ACTIVE` | MP cobró con éxito, suscripción al día | Full |
| `PAST_DUE` | MP rechazó el último cobro, en ventana de retry MP (≤10 días) | Full + banner rojo "actualizá tu tarjeta" |
| `CANCELLED` | Usuario canceló, o MP auto-canceló tras 3 rechazos | Hasta `current_period_ends_at`; después bloqueado |
| `SUSPENDED` | Platform admin (Tomi) suspendió el tenant manualmente | Bloqueado total hasta desuspensión |

### 3.2 Transiciones

```
   signup
     ↓
  PENDING_PAYMENT ──elige plan + MP autoriza──▶ TRIALING
                                                   │
                       ┌───────────────────────────┴───────────┐
                       │ MP cobra día 8                        │
                       ▼ approved                ▼ rejected
                     ACTIVE ◀────cobro recurrente OK──── PAST_DUE
                       │                                      │
                       │ user cancela         3 rechazos MP   │
                       ▼                                      ▼
                   CANCELLED ◀─────────────────────────────────┘
                       │
                       │ click "Reactivar" antes de current_period_ends_at
                       ▼
                     ACTIVE (preapproval reactivado o nuevo si el viejo expiró)
```

### 3.3 Cancelación durante TRIALING

Si el usuario cancela durante los 7 días de trial, conserva acceso hasta `trial_ends_at` (día 8). Razonamiento: le prometimos "7 días gratis" — se cumple aunque cancele el día 3. MP no le cobra.

### 3.4 Data preservation

Nunca se borra data del tenant. Cancelación = solo cambia `subscription_status`. Toda la data (operations, customers, payments, ledger, leads, etc.) queda intacta indefinidamente. Cuando reactiva, recupera todo tal como lo dejó.

### 3.5 Returning users

Si `current_period_ends_at` ya pasó, el botón "Reactivar" envía a `/onboarding/billing` para crear un preapproval nuevo. **No se les da un nuevo trial de 7 días** (trial es one-shot per tenant, controlado por `has_used_trial`). Arrancan directo en `ACTIVE` con cobro inmediato.

## 4. UX flow y pantallas

### 4.1 Flow completo

```
[Landing vibook.ai] ──"Comenzar gratis"──▶ /register?plan=pro
                                                │
                                       [Crear cuenta]
                                                │
                                                ▼
                               /onboarding/billing  (status=PENDING_PAYMENT)
                                                │
                         ┌──────────────────────┴──────────────────┐
                         │                                         │
                    Elige PRO                               Elige Enterprise
                         │                                         │
                         ▼                                         ▼
                  POST /api/billing/checkout                 WhatsApp ventas
                         │
                         ▼
                  MP init_point (ingresa tarjeta)
                         │
                         ▼
                  MP back_url → /onboarding/billing/return
                         │
                 (polling a /api/billing/status cada 2s hasta TRIALING)
                         │
                         ▼
                  /dashboard (banner: "Estás en período de prueba durante 7 días hasta el DD/MM")
```

### 4.2 Pantallas

**`/onboarding/billing` (nueva)** — Full-screen, sin sidebar del dashboard. Logo Vibook, saludo al usuario, dos cards (PRO + Enterprise). Footer: "7 días gratis · no se te cobra hasta el día 8 · cancelás cuando quieras". Botón discreto "Cerrar sesión". Sin opción de "Continuar sin pagar".

**`/onboarding/billing/return` (nueva)** — Landing post-MP. Muestra "Procesando tu suscripción…" con polling a `/api/billing/status` cada 2s. Cuando `status ∈ {TRIALING, ACTIVE}` → redirect a `/dashboard`. Tras 30s sin confirmación → "Tardó más de lo esperado" + botón "Ir al dashboard" (el cron de reconciliación lo arregla de noche). Esta ruta responde 200 incluso sin autenticación para que la validación de `back_url` de MP no falle.

**`/settings/subscription` (refactor mayor)** — Panel de autogestión con:
- **Estado actual**: badge grande (TRIALING / ACTIVE / PAST_DUE / CANCELLED), fecha relevante, precio.
- **Banner contextual**:
  - `PAST_DUE`: rojo, "No pudimos cobrar tu última cuota. Actualizá tu medio de pago antes del DD/MM o perdés acceso." + CTA.
  - `CANCELLED` con fecha futura: azul, "Tu suscripción está cancelada. Acceso hasta DD/MM. ¿Reactivar?" + CTA.
  - `CANCELLED` expirado: "Tu suscripción venció. Volvé a elegir un plan." + CTA.
- **Método de pago**: card con últimos 4 dígitos, titular, vencimiento. Botón "Cambiar tarjeta". Disclaimer sobre cifrado PCI en MP.
- **Plan actual**: nombre, precio, features.
- **Historial de pagos**: tabla últimos movimientos de `billing_events` tipo `SUBSCRIPTION_AUTHORIZED_PAYMENT`.
- **Zona peligrosa**: botón "Cancelar suscripción".

**Dialog de cancelación**:
> ⚠️ ¿Seguro que querés cancelar tu suscripción?
> - Mantenés acceso hasta el DD/MM/YYYY
> - Después de esa fecha perderás acceso a: operaciones, clientes, CRM, reportes, contabilidad, WhatsApp
> - Tu información NO se borra. Si volvés a suscribirte, recuperás todo.
> [Mantener suscripción] [Sí, cancelar]

**Banner global en `/dashboard`** (`<SubscriptionBanner />` en el dashboard layout):
- `PAST_DUE` → rojo persistente + CTA "Actualizar tarjeta"
- `CANCELLED` con fecha futura → azul "Acceso hasta DD/MM" + CTA "Reactivar"
- `TRIALING` con ≤2 días restantes → amarillo "Primer cobro el DD/MM"
- `TRIALING` con >2 días → verde "Estás en período de prueba durante 7 días hasta el DD/MM"

**Registro** — `components/register-form.tsx` elimina el call directo a `/api/billing/checkout`. Después del signup hace `router.push("/onboarding/billing")`.

### 4.3 Cambio de tarjeta

Botón "Cambiar tarjeta" abre en nueva pestaña la URL de MP donde el usuario gestiona su suscripción. Investigar durante implementación cuál es la URL correcta para update-card:
- `https://www.mercadopago.com.ar/subscriptions` (lista general)
- El `init_point` del preapproval existente (posiblemente permite editar)
- `GET /api/billing/update-card-link` devuelve la URL resuelta

**Fallback plan B** si ninguna URL funciona sin cancelar: el botón cancela silenciosamente el preapproval vigente y redirige a `/onboarding/billing` para crear uno nuevo. Downside: hay un instante sin tarjeta asociada. Si se activa plan B, confirmar con el producto.

**Regla**: no hay botón "Eliminar tarjeta". La única forma de quedar sin tarjeta es cancelar la suscripción completa.

## 5. Arquitectura backend

### 5.1 Defense-in-depth: 3 capas de gate

**Capa A — Middleware (UX, redirect)**

`middleware.ts`: si el usuario está autenticado y `org.subscription_status ∈ {PENDING_PAYMENT, CANCELLED+expired, SUSPENDED}`, redirige a `/onboarding/billing`. Excepciones: `/login`, `/logout`, `/register`, `/onboarding/*`, `/api/auth/*`, `/api/billing/*`, `/api/webhooks/*`, `/legal/*`, `/admin/*` (platform admin).

Nota de seguridad: el middleware es solo la capa UX. CVE-2025-29927 permite bypass vía header `x-middleware-subrequest`. La seguridad real está en las capas B y C.

**Capa B — Server-side guard**

Helper `lib/billing/guard.ts`:
```ts
export function isAccessAllowed(org: OrgRow): boolean {
  if (org.subscription_status === "SUSPENDED") return false
  if (org.subscription_status === "PENDING_PAYMENT") return false
  if (org.subscription_status === "CANCELLED") {
    return !!(org.current_period_ends_at && new Date(org.current_period_ends_at) > new Date())
  }
  return true // TRIALING, ACTIVE, PAST_DUE
}

export async function assertSubscriptionActive(): Promise<void> {
  const { user } = await getCurrentUser()
  const org = await loadOrg(user.org_id)
  if (!isAccessAllowed(org)) throw redirect("/onboarding/billing")
}
```

Se invoca una vez en `app/(dashboard)/layout.tsx` (cubre todas las pages del dashboard) y en API routes de negocio (operations, customers, payments, leads…).

**Capa C — RLS de Supabase**

Sin cambios: ya existe filtrado por `org_id` vía `user_org_ids()`. Un atacante que bypasee A y B igualmente no puede ver datos de otra org.

### 5.2 Webhook state machine (idempotente)

`POST /api/billing/mp-webhook` refactorizado:

```
Recibe webhook → verifica firma → inserta billing_events raw SIEMPRE (audit log, 200 OK asegurado)
              → si type ∈ {subscription_preapproval, subscription_authorized_payment}:
                   → fetchPreapproval(data.id)   (consulta estado fresco de MP)
                   → applyStateTransition(org, preapproval, paymentEvent)
              → return 200
```

Tabla de transición:

| `preapproval.status` | payment event | `org.subscription_status` | `current_period_ends_at` |
|---|---|---|---|
| `pending` | — | `PENDING_PAYMENT` | null |
| `authorized` (con `free_trial` activo) | — | `TRIALING` | `free_trial.end` (= trial_ends_at) |
| `authorized` (post-trial, con pago aprobado) | `approved` | `ACTIVE` | `next_payment_date` |
| `authorized` | `rejected` | `PAST_DUE` | (no cambia) |
| `paused` | — | `PAST_DUE` | (no cambia) |
| `cancelled` | — | `CANCELLED` | se congela en el valor actual |

Idempotencia:
- `billing_events` con UNIQUE constraint `(external_id, event_type)` — 2do webhook con mismos params es no-op
- Antes de update, compara `preapproval.last_modified` con `org.mp_last_synced_at` — solo aplica si es más reciente
- Para out-of-order: siempre se consulta el preapproval fresh con `fetchPreapproval`, nunca se confía en el payload del webhook para decisión

### 5.3 API endpoints

| Endpoint | Método | Auth | Propósito |
|---|---|---|---|
| `/api/billing/checkout` | POST | User | Crea preapproval MP. Agrega `free_trial` si `has_used_trial=false`. Setea `has_used_trial=true` post-create. Tira 409 si ya hay preapproval activo. |
| `/api/billing/cancel` | POST | OWNER/SUPER_ADMIN | PUT MP `status=cancelled`. Actualiza DB a `CANCELLED`, congela `current_period_ends_at`. Inserta `SUBSCRIPTION_CANCELLED_BY_USER`. |
| `/api/billing/reactivate` | POST | OWNER/SUPER_ADMIN | Ver sección 5.5 — MP no permite revivir un preapproval cancelado; el endpoint crea uno nuevo con `start_date` calculado para no cobrar doble. |
| `/api/billing/status` | GET | User | Devuelve `{status, current_period_ends_at, trial_ends_at, next_payment_date}` de la org del user. Usado por polling. |
| `/api/billing/update-card-link` | GET | OWNER/SUPER_ADMIN | Devuelve URL de MP para gestionar tarjeta. Impl TBD durante build. |
| `/api/billing/mp-webhook` | POST | Firma MP | Webhook público. Verifica firma + persiste + aplica transición. |
| `/api/cron/billing-reconcile` | POST | Bearer CRON_SECRET | Reconciliación diaria. |

### 5.5 Detalle de reactivación (MP no revive preapprovals cancelados)

MP's API no ofrece "un-cancel" de un preapproval. Una vez cancelado, ese preapproval queda permanentemente cerrado. Implicancia: reactivar SIEMPRE requiere crear un preapproval nuevo.

Para respetar "cancelar ahora = acceso hasta fin de período pagado + reactivar sin doble cobro":

```
POST /api/billing/reactivate
  ├─ Verifica org.subscription_status = CANCELLED
  ├─ Determina start_date del nuevo preapproval:
  │    - Si current_period_ends_at > now → start_date = current_period_ends_at + 1 día
  │      (MP no cobra hasta que termine el período ya pagado)
  │    - Si current_period_ends_at <= now → start_date = omit (MP cobra inmediato)
  ├─ Crea preapproval nuevo SIN `free_trial` (has_used_trial=true)
  ├─ Guarda el nuevo preapproval_id en org.mp_preapproval_id
  └─ Retorna init_point (user debe re-ingresar tarjeta)
```

Consecuencias UX:
- El user necesita volver a pasar por MP para ingresar tarjeta (MP no guarda la tarjeta del preapproval cancelado para el nuevo)
- Si reactiva antes del `current_period_ends_at`, no se le cobra hasta esa fecha
- Si reactiva después, cobro inmediato

Alternativa simplificada (si el rework anterior es costoso): el endpoint siempre responde 409 con `{redirect_to: "/onboarding/billing"}` y deja que la misma página del paywall maneje la reactivación como "elegí plan otra vez". En ese caso la lógica de `start_date` va dentro de `/api/billing/checkout` cuando detecta `has_used_trial=true`.

Decisión a tomar durante implementación: simplicidad vs UX. Ambas son correctas.

### 5.6 Cron de reconciliación

Railway cron service nuevo `cron-billing-reconcile` — `curl -X POST app.vibook.ai/api/cron/billing-reconcile -H "Authorization: Bearer $CRON_SECRET"` diario a las 03:00 AR.

Hace `fetchPreapproval` para toda org con `subscription_status ∈ {TRIALING, ACTIVE, PAST_DUE}` y `mp_preapproval_id != null`, compara con DB, aplica transición si diverge, loggea `billing_events` tipo `RECONCILED`.

Safety net para outages de webhooks MP.

## 6. Schema de base de datos

Migración `20260421000157_saas_billing_hardening.sql`:

```sql
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS current_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mp_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN NOT NULL DEFAULT false;

-- Expandir CHECK constraint con los nuevos valores
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN (
    'PENDING_PAYMENT', 'TRIALING', 'ACTIVE', 'PAST_DUE',
    'CANCELLED', 'SUSPENDED',
    'TRIAL'   -- legacy, a migrar
  ));

-- Backfill: orgs existentes
UPDATE organizations SET subscription_status = 'PENDING_PAYMENT'
  WHERE subscription_status = 'TRIAL' AND mp_preapproval_id IS NULL;
UPDATE organizations SET subscription_status = 'TRIALING', has_used_trial = true
  WHERE subscription_status = 'TRIAL' AND mp_preapproval_id IS NOT NULL;

-- Idempotencia de webhooks
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_idempotency
  ON billing_events (external_id, event_type)
  WHERE external_id IS NOT NULL;
```

## 7. Integración con Mercado Pago

### 7.1 Request de creación de preapproval

```json
POST https://api.mercadopago.com/preapproval
{
  "reason": "Vibook — plan PRO",
  "external_reference": "<org_id>",
  "payer_email": "<billing_email>",
  "back_url": "https://app.vibook.ai/onboarding/billing/return",
  "status": "pending",
  "auto_recurring": {
    "frequency": 1,
    "frequency_type": "months",
    "transaction_amount": 119000,
    "currency_id": "ARS",
    "free_trial": { "frequency": 7, "frequency_type": "days" }
  }
}
```

`free_trial` condicional: solo si `org.has_used_trial = false`. Tras create exitoso, `has_used_trial = true` aunque el user no complete el checkout (evita exploit de re-trialing).

### 7.2 back_url

Apunta a `/onboarding/billing/return` que está whitelisteada en middleware y responde 200 siempre (autenticado o no). MP valida que la `back_url` devuelva 200 desde IP pública — rutas con redirect 307 a `/login` la rompen.

### 7.3 Webhook en panel MP

Configurar una vez en el panel de developers MP:
- URL: `https://app.vibook.ai/api/billing/mp-webhook`
- Eventos: `subscription_preapproval` + `subscription_authorized_payment`
- Secret: `MERCADOPAGO_WEBHOOK_SECRET` (ya en Railway)

### 7.4 Firma webhook (hardening)

En producción `MERCADOPAGO_WEBHOOK_SECRET` es requerido. Sin secret → rechaza todos los webhooks. En dev acepta con warning (actual comportamiento).

### 7.5 Sandbox vs producción

Para E2E testing sin cobrar tarjetas reales: env var nueva `MERCADOPAGO_ACCESS_TOKEN_SANDBOX` + flag `MP_USE_SANDBOX=true`. Cuando está activo, la lib de MP usa el token sandbox en vez del prod.

Tarjetas de prueba: https://www.mercadopago.com.ar/developers/es/docs/checkout-api/integration-test/test-cards

### 7.6 Retry policy

MP reintenta webhooks si no recibe 2xx en 22s (hasta 7 retries). Nuestro handler:
1. Inserta `billing_events` raw (audit)
2. Responde 200 OK aunque el procesamiento posterior falle
3. Procesa estado con `fetchPreapproval` + transición idempotente

MP reintenta cobros fallidos hasta 4 veces en 10 días. Tras 3 rechazos MP auto-cancela la preapproval. Nuestro webhook recibe `status=cancelled` → DB `CANCELLED`.

## 8. Plan de fases (orden de commits)

1. **Schema hardening** — Migración 157. Backfill orgs existentes. SQL pasa por chat para que Tomi lo corra en Supabase SQL Editor.
2. **Guard + middleware** — `lib/billing/guard.ts`, `assertSubscriptionActive` en dashboard layout, middleware actualizado para nuevos estados. Redirect fallback temporal a `/settings/subscription` hasta Fase 3.
3. **Paywall + checkout refactor** — `/onboarding/billing`, `/onboarding/billing/return`, `GET /api/billing/status`, ajustes de `/api/billing/checkout` (free_trial, has_used_trial, 409), `register-form.tsx` redirect al paywall. Middleware apunta al paywall real.
4. **Webhook hardening + state machine** — refactor de `mp-webhook`, firma estricta en prod, handler de `subscription_authorized_payment`.
5. **Cancel / Reactivate / Update card** — endpoints nuevos, freeze de `current_period_ends_at`, resolución de URL update-card.
6. **Subscription page refactor** — nueva `/settings/subscription`, dialogs de confirmación, banner global, componente `<SubscriptionBanner />`.
7. **Cron de reconciliación** — endpoint + Railway cron service.
8. **E2E testing sandbox** — token sandbox, flag `MP_USE_SANDBOX`, checklist de escenarios.

Cada fase es un commit independiente que deja producción funcionando.

## 9. Checklist de E2E testing (Fase 8)

- [ ] Happy path: signup → paywall → elige PRO → MP sandbox → tarjeta aprobada → dashboard con banner TRIALING
- [ ] Día 8 approved: simular tiempo (o esperar) → cobro OK → status ACTIVE, banner desaparece
- [ ] Día 8 rejected: tarjeta con titular "OTHE" → rechazo → status PAST_DUE, banner rojo
- [ ] PAST_DUE resuelto: user cambia tarjeta → MP reintenta → cobro OK → status ACTIVE
- [ ] Cancelación durante TRIALING: mantiene acceso hasta trial_ends_at, después bloqueado
- [ ] Cancelación durante ACTIVE: mantiene acceso hasta current_period_ends_at, después bloqueado
- [ ] Reactivación durante CANCELLED + fecha futura: click reactivar → status ACTIVE sin pagar de nuevo
- [ ] Reactivación durante CANCELLED expirado: click reactivar → redirect a `/onboarding/billing` → nuevo preapproval sin trial
- [ ] Bypass attempt 1: editar cookie de sesión → middleware bloquea
- [ ] Bypass attempt 2: header `x-middleware-subrequest` → middleware bypasseado PERO guard server-side bloquea
- [ ] Idempotencia: reenviar webhook 2x con mismo external_id → segundo es no-op
- [ ] Webhook out-of-order: recibir `cancelled` antes de `authorized` → fetchPreapproval consulta estado fresco → estado correcto

## 10. Tareas fuera de scope (para otro sprint)

- Notificaciones por email (requiere Resend API key, pendiente de config) — se agregan en un sprint aparte vinculado a la tarea de "Resend API key + Legal entity + AFIP e2e + Sprint 3"
- Panel de admin multi-tenant para Tomi (ver todas las orgs, estado billing agregado, métricas)
- Dunning emails automatizados antes del día 8 ("tu cobro es el DD/MM")
- Proration en upgrades/downgrades de plan (hoy solo hay 1 plan pago)
- Dashboard de métricas MRR/churn

## 11. Riesgos conocidos

1. **MP API cambia**: docs no enumeran todos los status — si aparece alguno nuevo en producción, el webhook lo persiste raw pero no transiciona. El cron de reconciliación permite aplicar fix manual.
2. **Update-card link TBD**: si MP no tiene URL nativa para update-card sin cancelar, activamos plan B (cancel+recreate). Confirmar durante Fase 5.
3. **`back_url` en producción**: tests del día actual mostraron que el mismo token + body funciona en curl pero rebota desde el ERP. Si persiste tras deploy, agregar logging profundo (ya agregado en commit `200c237`).
4. **Webhook overlap con cron**: si MP envía webhook al mismo tiempo que corre el cron, ambos consultan `fetchPreapproval`. La UNIQUE constraint de `billing_events` previene doble-insert, y la comparación `last_modified` previene doble-transición.
