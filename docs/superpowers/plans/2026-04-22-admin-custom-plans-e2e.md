# Admin Custom Plans — E2E Smoke Checklist

Checklist manual post-implementación del sprint admin custom plans (plan `2026-04-22-admin-custom-plans.md`).

---

## 1. Railway Cron Service setup — `cron-apply-pricing-changes`

En el proyecto Railway del ERP (producción, mismo proyecto que tiene `app.vibook.ai` corriendo):

1. **+ New Service** → **Cron Service**.
2. Name: `cron-apply-pricing-changes`.
3. **Schedule**: `0 9 * * *` (09:00 UTC = 06:00 AR, diario).
4. **Start Command**:
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://app.vibook.ai/api/cron/apply-pricing-changes
   ```
5. **Environment variables**: copiar `CRON_SECRET` desde el servicio principal.
6. **Deploy**.

### Validación del cron

1. En Railway, abrir el servicio recién creado y correrlo manualmente (botón "Trigger").
2. Ver los logs del servicio principal — debería aparecer el POST a `/api/cron/apply-pricing-changes` con status 200.
3. Respuesta esperada: `{ "ok": true, "expired": 0, "notified": 0, "errors": [] }` (si no hay planes custom con descuento aún).

---

## 2. Smoke tests end-to-end (prod o staging)

> **Importante**: necesitás estar logueado como Tomi (platform_admin) para los pasos de admin. Para los pasos de owner necesitás una org de prueba — podés usar una org existente que no sea Lozada, o crear una throwaway.

### 2.1 Crear custom plan MP con descuento

- [ ] Entrar a `https://app.vibook.ai/admin` — debería redirigir a `/admin/orgs`.
- [ ] Click en una org de prueba → `/admin/orgs/<org-id>`.
- [ ] Ver bloque "Crear plan custom" (si ya tiene plan custom, borrarlo primero).
- [ ] Completar:
  - Display name: `E2E Test Plan`
  - Precio base ARS: `100000`
  - Método pago: MP
  - Descuento %: `40` / Duración meses: `1`
  - Features extras: agregar uno — label: `SLA 4h`, key: `misc_sla_4h`, enabled ✓
- [ ] Click "Crear plan + generar checkout".
- [ ] Copiar la **checkout URL** que devuelve.
- [ ] Abrir el link en incognito, loguearse como el owner de la org.
- [ ] Pagar con tarjeta test MP:
  - Número: `5031 7557 3453 0604`
  - CVV: cualquiera de 3 dígitos
  - Expiry: cualquier fecha futura
  - Nombre: `APRO` (fuerza aprobación)
- [ ] Verificar en Railway (logs del servicio principal) que llegó el webhook MP.
- [ ] Volver a `/admin/orgs/<org-id>` → confirmar `subscription_status = ACTIVE`.

### 2.2 Owner ve el plan custom

- [ ] Loguearse como el owner de esa org → navegar a `/settings/subscription`.
- [ ] Debería ver: título **"E2E Test Plan"**, badge "Activo".
- [ ] Precio actual: `$60.000 / mes` (40% off de $100k).
- [ ] Línea "A partir de ahí: $100.000 / mes" + fecha del fin del descuento.
- [ ] Lista de **features heredadas del Enterprise** + **"+ Features adicionales acordadas para tu agencia: SLA 4h"**.
- [ ] Estado: "Cobro automático activo vía MercadoPago".

### 2.3 Extender trial

- [ ] (Usar otra org de test en TRIAL — sin custom plan ni pago confirmado).
- [ ] En `/admin/orgs/<otra-id>` → card "Extender trial".
- [ ] Ver fecha actual de `trial_ends_at`. Meter `7` días → "Extender".
- [ ] Confirmar que la fecha se updateó (mensaje de éxito + refresh mostrando la nueva).

### 2.4 Cron expira descuento manualmente

- [ ] En Supabase SQL Editor, simular que el descuento de E2E Test Plan ya venció:
  ```sql
  UPDATE custom_plans
  SET discount_ends_at = NOW() - INTERVAL '1 hour'
  WHERE display_name = 'E2E Test Plan';
  ```
- [ ] Disparar el cron manualmente:
  ```bash
  curl -X POST \
    -H "Authorization: Bearer $CRON_SECRET" \
    https://app.vibook.ai/api/cron/apply-pricing-changes
  ```
- [ ] Respuesta esperada: `{ "ok": true, "expired": 1, "notified": 0, "errors": [] }`.
- [ ] Verificar en DB:
  ```sql
  SELECT discount_percent, discount_ends_at FROM custom_plans WHERE display_name = 'E2E Test Plan';
  ```
  Ambos deberían ser `0` y `NULL`.
- [ ] Verificar en el panel MP que el preapproval tiene ahora `transaction_amount = 100000` (o bien que se canceló + creó uno nuevo si el delta superó el threshold +20%).
- [ ] En `security_audit_log`: evento `CUSTOM_PLAN_DISCOUNT_EXPIRED` con `target_org_id` correcto.

### 2.5 Manual payment path

- [ ] Crear otro custom plan en una org de test con **billing_method = MANUAL**, precio $50.000, sin descuento.
- [ ] En `/admin/orgs/<id>` ver sección "Pagos manuales" aparece.
- [ ] Click "Registrar pago":
  - Monto: `50000`
  - Fecha de pago: hoy
  - Cubre desde: hoy
  - Cubre hasta: hoy + 30 días
  - Método: `Transferencia BBVA`
  - Nro comprobante: `TEST-001`
- [ ] Confirmar que la tabla de pagos muestra la entrada.
- [ ] Verificar en DB: `subscription_status = 'ACTIVE'`, `current_period_ends_at` = covers_to.

### 2.6 Suspend / Unsuspend

- [ ] Click "Suspender acceso" en una org de test → prompt pide escribir el nombre de la org.
- [ ] Escribir el nombre exacto → confirmar.
- [ ] Loguearse como owner de esa org → debería redirigir a `/settings/subscription` (si tiene custom_plan_id) o `/onboarding/billing` (si no).
- [ ] Volver como admin → click "Desuspender" → org recupera el status previo.
- [ ] Owner puede volver a usar la app.

### 2.7 /admin root

- [ ] Abrir `https://app.vibook.ai/admin` → debería redirigir automáticamente a `/admin/orgs`.

### 2.8 MP snapshot

- [ ] En `/admin/orgs/<id>` (una que tenga preapproval MP) → click "▸ MP snapshot + últimos webhooks".
- [ ] Debería mostrar:
  - JSON del preapproval actual (fetch en vivo desde MP).
  - Últimos 5 eventos de `billing_events` para esa org.

---

## 3. Plan de rollback (si algo explota)

Si hay que revertir el sprint en prod:

### 3a. Revertir UI (visual, no destructivo)

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git revert 12b0030  # redesign /admin/orgs/[id]
git revert 2391b0b  # UI owner /settings/subscription custom view
git revert 98e37b5  # admin UI action components
git revert d2d1004  # custom-plan form + display
git revert c984006  # tenant-metrics + audit-log-inline
```

Esto restaura el dropdown viejo y el render de plan público.

### 3b. Revertir endpoints admin

```bash
git revert 91433c7 ad611d4 e8d815f 75196e2 1a96111 fa3bcb0
```

### 3c. Revertir lib billing

```bash
git revert d28522d 000928a f69c61b bcd36d2 70d0c45
```

### 3d. Revertir tablas DB (SQL en Supabase Editor)

```sql
-- IMPORTANTE: correr en este orden. Borrar data primero evita FK violations.
UPDATE organizations SET custom_plan_id = NULL, mp_preapproval_id = NULL
  WHERE custom_plan_id IS NOT NULL;

DROP TABLE IF EXISTS manual_payments;
DROP TABLE IF EXISTS custom_plans;
ALTER TABLE organizations DROP COLUMN IF EXISTS custom_plan_id;
```

### 3e. Revertir migration files + types

```bash
git revert 375a7a4 f3d9b51 cfad6e8 a7c8693
```

**El paywall público (PRO/Enterprise via `plans.ts`) y el resto del admin siguen funcionando sin tocar** — todos los cambios son aditivos.

---

## 4. Monitoreo post-deploy

Durante las primeras 2 semanas, chequear diario:

1. **Railway logs del cron**: el cron diario debería correr sin errores 6 de cada 7 días al menos (tolerancia a fallas de red MP esporádicas).
2. **Supabase `security_audit_log`**: buscar entries `CUSTOM_PLAN_MP_REAUTH_REQUIRED`. Cada uno = un cliente que debe re-autorizar MP; hay que avisar manualmente por WA.
3. **Mercado Pago dashboard**: preapprovals huérfanos (sin org asociada). Si aparecen, limpieza manual.
4. **Org del cliente de $719k**: que el `mp_preapproval_id` siga authorized y los cobros mensuales lleguen OK.
