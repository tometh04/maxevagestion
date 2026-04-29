# Paywall E2E Testing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar end-to-end test del paywall (signup → pagar → dashboard → cancelar → reactivar → simular día 8), diagnosticando y arreglando bugs en el camino.

**Architecture:** Diagnóstico-primero con curl directo a MP API para aislar qué acepta MP, antes de tocar código. Después E2E UI-level via Claude-in-Chrome con la cuenta test ya creada.

**Tech Stack:** Next.js 15 (Railway), MercadoPago REST API, Supabase PostgreSQL, curl para debug directo.

**Estado actual confirmado (verificado vía logs Railway + curl):**
- ✅ Signup → org con `subscription_status=PENDING_PAYMENT` (commit cc55cbd)
- ✅ Middleware redirige a `/onboarding/billing` (paywall render OK, logo transparent OK)
- ✅ NEXT_PUBLIC_APP_URL trim fix corrige el "URL absoluta" error (commit cc55cbd + Railway env fix)
- ❌ **BLOCKER**: MP `/preapproval` devuelve 500 con email `mailinator.com`, o 400 "Cannot operate between different countries" con email gmail + back_url `app.vibook.ai`
- ✅ MP acepta gmail + back_url `www.google.com` (test confirmado)

**Cuenta E2E existente en DB:**
- org_id: `5f26d2a1-af61-4ab6-805f-5f55b7029e35`
- name: "E2E Test Agency"
- billing_email: `e2e-paywall-test@mailinator.com`
- subscription_status: `PENDING_PAYMENT`

---

## Phase 1: Diagnosticar por qué MP rechaza el preapproval

### Task 1.1: Matriz de tests con curl

**Files:** No code changes — solo diagnóstico.

- [ ] **Step 1: Probar 4 combinaciones de email × back_url con el TOKEN de producción**

```bash
TOKEN="APP_USR-3454575128482507-011109-643ac413bf8f233732d77de2f15d862c-34941995"

for email in "test1@gmail.com" "test2@hotmail.com" "buyer@testuser.com"; do
  for backurl in "https://app.vibook.ai/onboarding/billing/return" "https://www.google.com" "https://vibook.ai"; do
    echo "=== email=$email  back_url=$backurl ==="
    curl -sS -X POST https://api.mercadopago.com/preapproval \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"reason\": \"diag test\",
        \"external_reference\": \"diag-$(date +%s%N)\",
        \"payer_email\": \"$email\",
        \"back_url\": \"$backurl\",
        \"auto_recurring\": {\"frequency\": 1, \"frequency_type\": \"months\", \"transaction_amount\": 119000, \"currency_id\": \"ARS\"},
        \"status\": \"pending\"
      }" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','ERR'), '|', d.get('message', ''), '|', d.get('status', ''))"
    echo ""
  done
done
```

Expected output: una matriz 3x3 indicando qué combinación pasa (devuelve `id` de preapproval) y cuál falla con qué mensaje.

- [ ] **Step 2: Decidir estrategia según resultado**

Decisiones por resultado:
- **Si ningún gmail/hotmail funciona con vibook.ai**: el problema es el TLD `.ai` o el dominio específico. Workaround: usar un test user oficial MP (creado en panel web) que MP acepta sin validación de país.
- **Si todos los emails funcionan con www.google.com pero ninguno con vibook.ai**: MP tiene un issue al validar app.vibook.ai específicamente. Workaround temporal: cambiar `back_url` a vibook.ai (landing, también .ai — probablemente falla igual) o a un dominio controlado sin .ai TLD.
- **Si algún email random funciona con vibook.ai**: usar ese email en la E2E y listo.

### Task 1.2: Si el .ai TLD es el problema — crear test user oficial MP

**Files:** No code changes.

- [ ] **Step 1: Ir al panel MP → Cuentas de prueba**

Navegar a `https://www.mercadopago.com.ar/developers/panel/app/3454575128482507/accounts/test` (o link "Cuentas de prueba" en sidebar — el user tiene la tab abierta).

- [ ] **Step 2: Crear test buyer**

Click "Crear cuenta de prueba" → rol "Comprador" → site `MLA` (Argentina) → copiar email generado (tipo `TESTUSERXYZ@testuser.com`) y password.

- [ ] **Step 3: Verificar con curl que MP acepta ese email**

```bash
TOKEN="APP_USR-3454575128482507-011109-643ac413bf8f233732d77de2f15d862c-34941995"
TEST_EMAIL="<email generado en step 2>"

curl -sS -X POST https://api.mercadopago.com/preapproval \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"reason\": \"E2E test\",
    \"external_reference\": \"e2e-test-user-$(date +%s)\",
    \"payer_email\": \"$TEST_EMAIL\",
    \"back_url\": \"https://app.vibook.ai/onboarding/billing/return\",
    \"auto_recurring\": {\"frequency\": 1, \"frequency_type\": \"months\", \"transaction_amount\": 119000, \"currency_id\": \"ARS\", \"free_trial\": {\"frequency\": 7, \"frequency_type\": \"days\"}},
    \"status\": \"pending\"
  }" | python3 -m json.tool
```

Expected: response con `id`, `init_point`, `status: "pending"`.

---

## Phase 2: Preparar cuenta E2E con email que MP acepta

### Task 2.1: Update billing_email de la org en Supabase

**Files:**
- Modify: `organizations.billing_email` para org id `5f26d2a1-af61-4ab6-805f-5f55b7029e35`
- Modify: `users.email` (opcional, para match con auth)

- [ ] **Step 1: SQL update en Supabase**

```sql
-- Sustituir <EMAIL_MP_TEST> con el email del test buyer creado en Task 1.2
UPDATE public.organizations
   SET billing_email = '<EMAIL_MP_TEST>'
 WHERE id = '5f26d2a1-af61-4ab6-805f-5f55b7029e35';

-- Verificar
SELECT id, name, subscription_status, billing_email
  FROM public.organizations
 WHERE id = '5f26d2a1-af61-4ab6-805f-5f55b7029e35';
```

Expected: 1 row updated, `billing_email` = email test.

---

## Phase 3: Ejecutar E2E completo via Chrome

### Task 3.1: Pagar con checkout MP

- [ ] **Step 1: Ir al paywall (cuenta ya logueada)**

Navegar en tabId 1374275917 a `https://app.vibook.ai/onboarding/billing`.

- [ ] **Step 2: Click "Elegir este plan" PRO**

Click en el botón del card PRO (coordinates aprox `[446, 724]`).

- [ ] **Step 3: Verificar redirect a MP init_point**

Expected: URL cambia a `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=...`

- [ ] **Step 4: Completar checkout en MP con tarjeta de prueba**

Login con el email test buyer + password. Ingresar tarjeta:
- Número: `5031 7557 3453 0604`
- CVV: `123`
- Vencimiento: cualquier fecha futura (ej. `11/30`)
- Titular: `APRO` (forzar aprobado)
- DNI: `12345678`

Click "Pagar" / "Suscribirme".

- [ ] **Step 5: Verificar redirect a /onboarding/billing/return + polling + /dashboard**

Expected: redirect a `/onboarding/billing/return`, ver spinner "Procesando tu suscripción…", después redirect automático a `/dashboard` con banner verde "Estás en período de prueba durante 7 días hasta el DD/MM".

### Task 3.2: Verificar estado correcto en DB post-pago

- [ ] **Step 1: Query a Supabase para ver estado**

```sql
SELECT id, name, subscription_status, has_used_trial, trial_ends_at,
       current_period_ends_at, mp_preapproval_id, mp_last_synced_at
  FROM public.organizations
 WHERE id = '5f26d2a1-af61-4ab6-805f-5f55b7029e35';

SELECT event_type, status, created_at, external_id
  FROM public.billing_events
 WHERE org_id = '5f26d2a1-af61-4ab6-805f-5f55b7029e35'
 ORDER BY created_at DESC
 LIMIT 10;
```

Expected:
- `subscription_status = 'TRIALING'`
- `has_used_trial = true`
- `mp_preapproval_id` no null
- `current_period_ends_at` ~ 7 días en el futuro
- `billing_events` con: `CHECKOUT_INITIATED`, `SUBSCRIPTION_AUTHORIZED` (o similar del state machine)

### Task 3.3: Verificar settings/subscription muestra estado correcto

- [ ] **Step 1: Navegar a /settings/subscription**

Expected: ver badge "En prueba gratis", fecha correcta, plan PRO, método de pago con botón "Cambiar tarjeta", historial con eventos, botón "Cancelar suscripción" visible.

### Task 3.4: Cancelar suscripción

- [ ] **Step 1: Click "Cancelar suscripción"**

Expected: abre AlertDialog con warning sobre qué se pierde + promesa de data preservada.

- [ ] **Step 2: Confirmar cancelación**

Click "Sí, cancelar".

Expected: dialog se cierra, page refresh muestra status `CANCELLED`, banner azul "Tu suscripción está cancelada. Acceso hasta DD/MM", botón "Reactivar suscripción" aparece.

- [ ] **Step 3: Verificar estado en DB**

```sql
SELECT subscription_status, current_period_ends_at
  FROM public.organizations
 WHERE id = '5f26d2a1-af61-4ab6-805f-5f55b7029e35';

SELECT event_type, created_at
  FROM public.billing_events
 WHERE org_id = '5f26d2a1-af61-4ab6-805f-5f55b7029e35'
 ORDER BY created_at DESC
 LIMIT 5;
```

Expected:
- `subscription_status = 'CANCELLED'`
- `current_period_ends_at` = mismo valor que antes (freezado)
- `billing_events` con `SUBSCRIPTION_CANCELLED_BY_USER` reciente

### Task 3.5: Reactivar suscripción

- [ ] **Step 1: Click "Reactivar suscripción" en /settings/subscription**

Expected: redirect a MP init_point para crear nuevo preapproval con `start_date = current_period_ends_at + 1d` (según spec).

- [ ] **Step 2: Completar pago con tarjeta test**

Re-usar tarjeta `5031 7557 3453 0604` / `APRO`.

- [ ] **Step 3: Verificar TRIALING de nuevo (o ACTIVE si MP autorizó) + historial**

Expected: status vuelve a `TRIALING` (o `ACTIVE` según MP state machine). `billing_events` con nuevo `CHECKOUT_INITIATED` + `SUBSCRIPTION_AUTHORIZED` de la reactivación.

### Task 3.6: Simular día 8 — trial expirado

**Files:**
- Modify: row en `organizations` via Supabase SQL

- [ ] **Step 1: UPDATE trial_ends_at a pasado**

```sql
UPDATE public.organizations
   SET trial_ends_at = NOW() - INTERVAL '1 day',
       current_period_ends_at = NOW() - INTERVAL '1 day'
 WHERE id = '5f26d2a1-af61-4ab6-805f-5f55b7029e35';
```

- [ ] **Step 2: Verificar middleware/guard**

Refresh `/dashboard`. Esperado: si `subscription_status = TRIALING` + `trial_ends_at` pasado, isAccessAllowed debería seguir permitiendo (TRIALING no depende de trial_ends_at en la lógica). Para triggear bloqueo, cambiar a CANCELLED con period pasado:

```sql
UPDATE public.organizations
   SET subscription_status = 'CANCELLED',
       current_period_ends_at = NOW() - INTERVAL '1 day'
 WHERE id = '5f26d2a1-af61-4ab6-805f-5f55b7029e35';
```

- [ ] **Step 3: Verificar bloqueo**

Refresh `/dashboard`. Expected: middleware redirect a `/onboarding/billing`, página muestra "Tu suscripción venció. Para volver a acceder, elegí un plan." y card del plan.

- [ ] **Step 4: Simular cobro exitoso post-trial (opcional)**

Para simular el happy path de MP cobrando el día 8:

```sql
UPDATE public.organizations
   SET subscription_status = 'ACTIVE',
       current_period_ends_at = NOW() + INTERVAL '30 days',
       trial_ends_at = NULL
 WHERE id = '5f26d2a1-af61-4ab6-805f-5f55b7029e35';
```

Expected en `/dashboard`: banner desaparece (estado ACTIVE no muestra banner). En `/settings/subscription`: badge "Activo", "Próximo cobro: DD/MM/YYYY".

---

## Phase 4: Cleanup post-E2E

### Task 4.1: Remove debug log

- [ ] **Step 1: Revert el console.log agregado en commit 1e8d6d3**

En `lib/billing/mercadopago.ts`, quitar las dos líneas `console.log("[mp] createPreapproval body...")` y `console.error("[mp] createPreapproval FAILED...")`. Dejar solo el throw original.

- [ ] **Step 2: Commit**

```bash
git add lib/billing/mercadopago.ts
git commit -m "debug: remove verbose MP preapproval logging"
git push origin main
```

### Task 4.2: Cleanup cuenta E2E (opcional)

- [ ] **Step 1: Decidir si dejar o borrar**

Si queremos mantener la cuenta E2E como fixture permanente, no tocar. Si queremos limpiar, usar script existente `scripts/cleanup-orphan-victoria.ts` adaptado o hacer SQL manual.

---

## Criterios de éxito

- [ ] Phase 1: Identificamos qué email funciona con MP para app.vibook.ai
- [ ] Phase 2: Cuenta E2E tiene billing_email aceptado por MP
- [ ] Phase 3.1: Click "Elegir este plan" redirige a MP init_point (no error)
- [ ] Phase 3.1 step 4-5: Pago completa OK → dashboard con banner TRIALING
- [ ] Phase 3.3: /settings/subscription muestra plan + método de pago + historial
- [ ] Phase 3.4: Cancelar funciona, dialog ok, estado freezeado
- [ ] Phase 3.5: Reactivar funciona, MP acepta nuevo preapproval
- [ ] Phase 3.6: Simulación día 8 / expiración bloquea correctamente
- [ ] Phase 4: No debug logs en producción final
