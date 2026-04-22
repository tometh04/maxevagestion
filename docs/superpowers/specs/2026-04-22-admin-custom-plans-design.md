# Admin Panel — Planes custom, descuentos temporales y extensión de trial

**Fecha**: 2026-04-22
**Owner**: Tomi (CEO Vibook)
**Contexto**: roadmap Prio 1 (ver `2026-04-22-roadmap-next-session.md`). Post-E2E paywall MP (ver `2026-04-21-paywall-mercadopago-design.md`). Multi-tenant base lista desde `2026-04-19-saas-multitenant-architecture.md`.

---

## 1. Resumen ejecutivo

Hoy el admin panel (`/admin/*`) permite listar orgs y cambiar plan/status via dropdown, pero:

- Los planes son estáticos (`lib/billing/plans.ts`: STARTER, PRO, ENTERPRISE). No hay forma de materializar precios custom negociados por Tomi con Enterprise.
- No hay forma de extender el trial desde admin.
- El admin no ve preapproval MP, pagos, ni health score del tenant.
- Enterprise hoy se cierra por WhatsApp con precio acordado ad-hoc pero el cobro no se puede materializar — queda trabado.

Este spec cubre el **pricing engine + UX admin/owner** necesario para cerrar Enterprise custom: precio base por org, descuento temporal (ej. 40% los primeros 3 meses), features extras acordadas, y método de pago MP por default con escape hatch manual (Factura A / Transferencia). No implementa las features custom reales (callbell, webhook dedicado, manychat bespoke) — esas van por `CRM_INTEGRATION.md` en un sprint posterior. Lo que sí se implementa son los **flags/toggles** que después habilitarán esas features.

### Caso de uso concreto detonante

Tomi cerró un cliente Enterprise a **$719.000 ARS/mes, con 40% off los primeros 3 meses** (= $431.400/mes durante 90 días, luego $719.000). El cliente quiere Bridge Manychat → Callbell dedicado + webhook dedicado + Manychat bespoke. Hoy no hay forma de ingresar ese deal al sistema; este sprint lo resuelve.

### Por qué ahora (lens CEO)

1. **Revenue inmediato**: destraba el cobro del cliente Enterprise de $431k/mes × 3 + $719k desde mes 4.
2. **Pipeline de ventas**: hace 1 mes que Tomi negocia Enterprise por WA sin forma de cerrar → presión operativa.
3. **Extensión de trial**: caso recurrente ("dame 14 días en vez de 7"). Sin admin, hay que hacerlo por SQL directo — error-prone.
4. **Retención Enterprise**: una vez que empezamos a tener Enterprise reales, cualquier cambio de pricing/features sin audit log es bomba de tiempo legal.

---

## 2. Scope

### In scope (este sprint)

- Tabla `custom_plans` (uno por org) con precio base, descuento temporal, features extras (JSONB), método de pago.
- Tabla `manual_payments` para billing_method=MANUAL.
- Endpoints admin: CRUD custom plan, extender trial, registrar pago manual, acciones sobre tenant (suspend/unsuspend/cancel).
- UI admin en `/admin/orgs/[id]` extendida: métricas del tenant, plan custom form, acciones con AlertDialog, audit log inline, ver preapproval MP + últimos webhooks.
- UI owner en `/settings/subscription` con 3 estados: inicial (sin suscripción aún), activo (con o sin descuento), manual.
- Integración MP: `createPreapproval()` extendido para aceptar `customAmount`, update in-place via PUT cuando el delta es ≤ +20%, cancel+recreate si supera threshold.
- Cron diario `/api/cron/apply-pricing-changes`: expira descuentos y actualiza MP; envía notificación preventiva 7 días antes.
- Máquina de estados: nuevo status `PENDING_CUSTOM_PAYMENT`.
- Audit log para todos los eventos admin (creación/edición/borrado de custom plan, extensión trial, pago manual, cancelación).
- Tests unit + integration + isolation.

### Out of scope (defer a Sprint 2+)

- Implementación real de features custom (Bridge Manychat → Callbell, webhook dedicado, Manychat bespoke, Callbell integration). Se diseñan/buildean siguiendo `CRM_INTEGRATION.md` (patrón de 5 capas, tabla `integration_webhooks`). Este sprint solo guarda los **flags**.
- Dashboard global MRR / Churn / CAC / LTV (Prio 4 del roadmap).
- `/admin/impersonate` (nice-to-have pendiente).
- Multi-admin UX (la tabla `platform_admins` ya soporta múltiples, UI se queda simple hasta que haya un segundo admin real).
- Emails transaccionales de notificación 7 días antes dependen de Resend (Prio 3b). Si Resend no está configurado al shippear, la notificación se loguea en `security_audit_log` para que Tomi chequee manualmente. No bloqueante.
- Refactor de `plans.ts` → DB-driven completo. Este sprint mantiene `plans.ts` como fuente de verdad para planes **públicos** (PRO, Enterprise contact-sales); los custom viven en `custom_plans`. Migrar PRO a DB es otro sprint.

---

## 3. Arquitectura y decisiones clave

### 3.1 Separación entre plan público y plan custom

Los planes públicos (PRO, Enterprise-contact-sales, STARTER-legacy) siguen viviendo en `lib/billing/plans.ts`. Los custom viven en la tabla `custom_plans`. Una org tiene **o** un plan público (via `organizations.plan`) **o** un plan custom (via `organizations.custom_plan_id`), nunca los dos.

Cuando `custom_plan_id` está seteado, el sistema ignora `organizations.plan` para pricing y features pero lo mantiene como `"ENTERPRISE"` para el bucket conceptual (métricas, analytics, comparaciones).

### 3.2 Features base vs extras

- **Base**: toda org con custom plan hereda automáticamente `PLANS.ENTERPRISE.features` de `plans.ts`. No se togglea, siempre ON.
- **Extras**: array JSONB en `custom_plans.features.extras` con objetos `{ key, label, enabled }`. `key` identifica el gatillo de código (whitelist conocida para integraciones; `misc_*` para items operativos). `label` es texto libre editable por admin. `enabled:false` se preserva como histórico.

Esto evita duplicar el catálogo de features entre `plans.ts` y DB, y permite sumar extras ad-hoc sin migration.

### 3.3 Descuento temporal + MP

MP preapproval no soporta descuentos temporales nativos. Implementamos:

1. Al crear el custom plan con descuento, `createPreapproval` usa `effectivePrice = base × (1 - discount/100)`.
2. Cron diario busca `custom_plans.discount_ends_at <= now() AND discount_percent > 0` y dispara `mpUpdatePreapproval(transaction_amount: base)`.
3. Idempotente: reintento si MP falla; segundo run detecta `discount_percent=0` y no hace nada.

### 3.4 Threshold +20% para MP re-auth

MP permite cambios in-place de `transaction_amount` sin re-autorización del usuario hasta cierto margen (varía por país; en AR no está públicamente documentado). Adoptamos **+20% como regla operativa**:

- Delta ≤ +20% → `PUT /preapproval/:id` in-place, zero fricción para el owner.
- Delta > +20% → cancel preapproval viejo + crear nuevo + enviar checkout URL al billing_email. Org queda `PAST_DUE` hasta que re-autorice, con grace de 7 días.

Esto se aplica tanto en expiración de descuento como en edición manual del custom plan por admin. El threshold se ajusta con data real (empezar con 20%, subir/bajar según qué porcentaje de cambios empujan re-auth en MP).

### 3.5 Billing method default MP, escape hatch Manual

Default siempre MP (cobro automático es oro en AR por la inflación). Manual existe para:
- Enterprise con CUIT grande que opera con factura A + transferencia.
- Tomi como backup operacional si el cliente no completa checkout MP.

Con Manual, el admin registra cada pago en `manual_payments`. La fecha `covers_to` del último pago define cuándo vence la suscripción. Paywall usa `covers_to` como `period_end` en vez del próximo cobro MP.

### 3.6 Visibilidad del custom plan

- El owner de la org con `custom_plan_id` ve **solo su custom plan** en `/settings/subscription`. No puede auto-downgradear a PRO desde UI (si quiere cambiar, habla con ventas).
- `/onboarding/billing` nunca muestra custom plans — solo planes públicos.
- RLS en `custom_plans`: org members leen solo el suyo, platform_admin lee todos, service_role escribe.

---

## 4. Modelo de datos

**Numeración:** la última migration aplicada es `20260421000157_saas_billing_hardening.sql`. Las nuevas llevan timestamps `20260422000158`, `159`, `160`.

### 4.1 Migration `20260422000158_custom_plans.sql`

```sql
CREATE TABLE custom_plans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  display_name     TEXT NOT NULL,
  base_price_ars   NUMERIC(12,2) NOT NULL CHECK (base_price_ars > 0),
  discount_percent SMALLINT NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  discount_ends_at TIMESTAMPTZ,
  features         JSONB NOT NULL DEFAULT '{"extras": []}'::jsonb,
  limits           JSONB NOT NULL DEFAULT '{}'::jsonb,
  billing_method   TEXT NOT NULL DEFAULT 'MP' CHECK (billing_method IN ('MP', 'MANUAL')),
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX custom_plans_discount_ends_idx
  ON custom_plans (discount_ends_at)
  WHERE discount_percent > 0;

ALTER TABLE custom_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY custom_plans_tenant_read ON custom_plans
  FOR SELECT
  USING (org_id IN (SELECT user_org_ids()));

CREATE POLICY custom_plans_admin_all ON custom_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      WHERE pa.auth_id = auth.uid()
    )
  );

-- updated_at auto-trigger
CREATE TRIGGER custom_plans_updated_at
  BEFORE UPDATE ON custom_plans
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();
```

### 4.2 Migration `20260422000159_manual_payments.sql`

```sql
CREATE TABLE manual_payments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount_ars     NUMERIC(12,2) NOT NULL CHECK (amount_ars > 0),
  paid_at        TIMESTAMPTZ NOT NULL,
  covers_from    DATE NOT NULL,
  covers_to      DATE NOT NULL CHECK (covers_to >= covers_from),
  payment_method TEXT,
  receipt_ref    TEXT,
  registered_by  UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX manual_payments_org_covers_to_idx
  ON manual_payments (org_id, covers_to DESC);

ALTER TABLE manual_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY manual_payments_tenant_read ON manual_payments
  FOR SELECT
  USING (org_id IN (SELECT user_org_ids()));

CREATE POLICY manual_payments_admin_all ON manual_payments
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.auth_id = auth.uid())
  );
```

### 4.3 Migration `20260422000160_organizations_custom_plan_id.sql`

```sql
ALTER TABLE organizations
  ADD COLUMN custom_plan_id UUID REFERENCES custom_plans(id) ON DELETE SET NULL;

CREATE INDEX organizations_custom_plan_id_idx
  ON organizations (custom_plan_id)
  WHERE custom_plan_id IS NOT NULL;
```

### 4.4 Tipos de eventos de audit

Agregar a `security_audit_log.event_type` (columna libre TEXT, no CHECK — los eventos nuevos van directo):

- `CUSTOM_PLAN_CREATED`
- `CUSTOM_PLAN_UPDATED`
- `CUSTOM_PLAN_DELETED`
- `CUSTOM_PLAN_DISCOUNT_EXPIRED`
- `CUSTOM_PLAN_MP_REAUTH_REQUIRED`
- `TRIAL_EXTENDED`
- `MANUAL_PAYMENT_REGISTERED`
- `TENANT_SUSPENDED` / `TENANT_UNSUSPENDED`
- `SUBSCRIPTION_CANCELLED_BY_ADMIN`

---

## 5. Flow de MP

### 5.1 Creación del custom plan con checkout MP

```
[Admin] /admin/orgs/[id] → Crear plan custom
  ↓
POST /api/admin/orgs/[id]/custom-plan
  body: { display_name, base_price_ars, discount_percent, discount_duration_months,
          features, limits, billing_method, notes }
  ↓
Server:
  1. effective = base × (1 - discount/100)
  2. discount_ends_at = NOW() + interval 'N months' (si discount > 0)
  3. INSERT custom_plans
  4. UPDATE organizations SET custom_plan_id = :id.
     Status NO se toca al crear — queda lo que estaba (TRIAL/ACTIVE/etc).
     Detección "custom plan sin pago" = custom_plan_id NOT NULL AND status IN ('TRIAL','PENDING_PAYMENT').
  5. Si billing_method = 'MP':
       createPreapproval({ plan: 'CUSTOM', customAmount: effective, ... })
       → guardar mp_preapproval_id en organizations
     Si billing_method = 'MANUAL':
       no crea preapproval; status se mueve a ACTIVE solo cuando Tomi registre el primer manual_payment.
  6. logSecurityEvent(CUSTOM_PLAN_CREATED, { before, after })
  7. return { init_point_url (si MP) } → admin lo copia y lo manda al cliente
```

### 5.2 Update in-place vs cancel+recreate

```ts
// lib/billing/mercadopago.ts (nuevo)
export async function applyPriceChange(orgId, newAmount) {
  const org = await getOrg(orgId)
  if (!org.mp_preapproval_id) return { action: 'NO_PREAPPROVAL' }
  const mp = await fetchPreapproval(org.mp_preapproval_id)
  const currentAmount = mp.auto_recurring.transaction_amount
  const deltaPct = ((newAmount - currentAmount) / currentAmount) * 100
  if (deltaPct <= 20) {
    await mpPutPreapproval(org.mp_preapproval_id, { transaction_amount: newAmount })
    return { action: 'UPDATED_IN_PLACE' }
  }
  // Delta demasiado grande → MP puede pedir re-auth
  await cancelPreapproval(org.mp_preapproval_id)
  const fresh = await createPreapproval({ ...params, customAmount: newAmount })
  await updateOrg(orgId, { mp_preapproval_id: fresh.id, subscription_status: 'PAST_DUE' })
  logSecurityEvent('CUSTOM_PLAN_MP_REAUTH_REQUIRED', { orgId, delta: deltaPct })
  // Enviar email al billing_email con fresh.init_point
  return { action: 'REAUTH_REQUIRED', checkout_url: fresh.init_point }
}
```

### 5.3 Cron `/api/cron/apply-pricing-changes`

Schedule: Railway Cron Service, diario 06:00 AR (09:00 UTC). Bearer auth con `CRON_SECRET` existente.

```
1. Buscar custom_plans.discount_ends_at <= now() AND discount_percent > 0.
2. Para cada uno:
   a. newAmount = base_price_ars
   b. applyPriceChange(org_id, newAmount)
   c. UPDATE custom_plans SET discount_percent=0, discount_ends_at=NULL
   d. logSecurityEvent(CUSTOM_PLAN_DISCOUNT_EXPIRED, ...)
3. Buscar custom_plans.discount_ends_at BETWEEN now() AND now()+7d.
   Para cada uno NO notificado aún:
   a. enviar email a billing_email (si Resend está configurado)
      "Tu descuento vence el DD/MM/AAAA, a partir de esa fecha cobramos $X"
   b. marcar en security_audit_log `CUSTOM_PLAN_DISCOUNT_EXPIRY_NOTICE_SENT`
      (el chequeo de "ya notifiqué" busca este evento para la org en los últimos 14 días)
```

---

## 6. API endpoints

Todos los endpoints admin exigen `isPlatformAdmin(supabase, user.id)` antes de cualquier side-effect.

| Método | Path | Body | Efecto |
|---|---|---|---|
| POST | `/api/admin/orgs/[id]/custom-plan` | `{ display_name, base_price_ars, discount_percent, discount_duration_months, features, limits, billing_method, notes }` | Crea custom plan + preapproval MP si MP. Retorna `init_point` URL. |
| PATCH | `/api/admin/orgs/[id]/custom-plan` | cualquier subset de los campos | Updatea custom plan. Si cambia precio o descuento, dispara `applyPriceChange()`. |
| DELETE | `/api/admin/orgs/[id]/custom-plan` | — | Cancela preapproval MP + borra custom plan + vuelve org.plan a ENTERPRISE (o valor previo guardado en audit). |
| POST | `/api/admin/orgs/[id]/extend-trial` | `{ days }` | `trial_ends_at += days`. Si hay preapproval MP con start_date futuro, updatea start_date. |
| POST | `/api/admin/orgs/[id]/manual-payment` | `{ amount_ars, paid_at, covers_from, covers_to, payment_method, receipt_ref }` | INSERT manual_payments. Si status != ACTIVE, lo cambia a ACTIVE. |
| POST | `/api/admin/orgs/[id]/suspend` | `{ reason }` | status = SUSPENDED. Guarda reason en audit. |
| POST | `/api/admin/orgs/[id]/unsuspend` | — | status vuelve al previo (guardado en audit al suspender). |
| POST | `/api/admin/orgs/[id]/cancel-subscription` | `{ reason }` | Cancela preapproval MP + status = CANCELLED + grace 7d. |
| GET | `/api/admin/orgs/[id]/mp-snapshot` | — | Retorna fetch en vivo del preapproval MP + últimos 5 billing_events. |

El endpoint existente `PATCH /api/admin/orgs/[id]` (el del dropdown actual) **se elimina** — queda código muerto. Los dropdowns del `AdminOrgActions` actual se borran del UI.

---

## 7. UI admin — `/admin/orgs/[id]`

Layout en orden vertical:

1. **Header**: nombre org, slug, id (existente, sin cambios).
2. **Métricas del tenant** (grid 6 cards): miembros, agencias, ops mes / total, MRR contributed, último login, health score.
3. **Billing info read-only** (existente, sin cambios): plan base, status, trial/grace ends, billing_email, CUIT.
4. **Plan custom** (bloque nuevo): estado A (crear) o B (editar con botón borrar).
5. **Extensión de trial** (bloque nuevo): input días + botón.
6. **Acciones críticas** (bloque nuevo): botones separados con AlertDialog — Suspender (requiere typear nombre org para confirmar), Desuspender, Cancelar suscripción.
7. **MP snapshot** (colapsable): JSON preapproval + últimos 5 webhooks.
8. **Pagos manuales** (solo si billing_method=MANUAL): lista + botón "Registrar pago".
9. **Audit log inline**: últimos 10 eventos de `security_audit_log` filtrados por esta org.

Eliminar: el `AdminOrgActions` client component con dropdowns de plan+status.

### 7.1 Form crear/editar custom plan

Campos:

- Display name (TEXT, required)
- Precio base ARS/mes (numeric, required, > 0)
- Descuento: percent (0-100, default 0) × duración meses (1-24, default 0)
- Método pago: MP | Manual (default MP)
- Features extras: repeater de `{ label, key }` con sugerencias dropdown + free text
- Límites override (opcional): max_users, max_agencies (vacío = hereda de Enterprise)
- Notas internas (TEXTAREA, opcional)

Validación client + server. Submit muestra loading → success muestra `init_point` URL copiable (si MP) o mensaje "registrá el primer pago para activar" (si Manual).

---

## 8. UI owner — `/settings/subscription`

### 8.1 Estado PENDING_CUSTOM_PAYMENT

Prominent CTA "Suscribirme y pagar con MercadoPago". Lista de features heredadas de Enterprise base + extras del custom plan, con precios (actual vs futuro si hay descuento).

### 8.2 Estado ACTIVE con custom plan

Mismo layout, pero reemplaza CTA por info "Cobro automático activo · Próximo cobro: ...". Botón secundario para cambiar tarjeta (redirect a MP).

### 8.3 Estado MANUAL

Sin CTA MP. Muestra "Método: Factura A / Transferencia · Próximo vencimiento: DD/MM/AAAA". Texto de contacto "Dudas de facturación: ventas@vibook.ai".

### 8.4 Lista de features

Dos bloques:
1. **"Todo lo del plan Enterprise"** — itera sobre `PLANS.ENTERPRISE.features` de plans.ts.
2. **"+ Features adicionales acordadas para tu agencia"** — itera sobre `custom_plan.features.extras` filtrando `enabled:true`.

---

## 9. Paywall / máquina de estados

Reusamos el set existente de `subscription_status` (`TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED`, `PENDING_PAYMENT`). No agregamos status nuevos — el middleware ya los entiende. La detección de "custom plan sin pago aún" se deriva de `custom_plan_id IS NOT NULL AND subscription_status IN ('TRIAL','PENDING_PAYMENT')`.

Transiciones relevantes al sprint:

```
TRIAL (con custom_plan_id) ──(webhook MP authorized)──→ ACTIVE
TRIAL (con custom_plan_id) ──(manual_payment registrado)──→ ACTIVE
TRIAL (con custom_plan_id) ──(trial_ends_at vencido, no pagó)──→ PENDING_PAYMENT (blocked)
ACTIVE ──(MP falla cobro)──→ PAST_DUE ──(grace 7d)──→ SUSPENDED
ACTIVE (manual) ──(manual_payment.covers_to vencido + 7d grace)──→ PAST_DUE → SUSPENDED
ACTIVE ──(admin cancela)──→ CANCELLED
SUSPENDED ──(admin unsuspend)──→ <previo>
CANCELLED → terminal
```

Middleware `/paywall` tratamiento por status (ya implementado, sin cambios):
- `TRIAL` (si `trial_ends_at > now`) → acceso OK.
- `ACTIVE` → acceso OK.
- `PAST_DUE` → banner warning + acceso OK hasta grace.
- `SUSPENDED`, `CANCELLED`, `PENDING_PAYMENT` → redirect `/onboarding/billing`.

**Cambio para custom plans:** cuando la org tenga `custom_plan_id`, el redirect a `/onboarding/billing` debe en su lugar ir a `/settings/subscription` (donde el owner ve su plan custom con CTA de pago). Modificación localizada en middleware.ts.

---

## 10. Testing plan

### 10.1 Unit tests

`lib/billing/custom-plans.test.ts`:
- `calculateEffectivePrice(base, discount)` → casos borde (0%, 100%, valores no enteros).
- `shouldRequireMpReauth(currentAmount, newAmount)` → threshold +20%.
- `featuresForOrg(org)` → merge de base Enterprise + extras enabled.

### 10.2 Integration tests

`__tests__/admin/custom-plans.integration.test.ts`:
- Admin crea custom plan MP → mock MP createPreapproval → verifica init_point retornado.
- Admin crea custom plan MANUAL → verifica no MP call → registra manual_payment → org.status = ACTIVE.
- Admin cambia precio +10% → verifica `PUT preapproval` called (mock MP).
- Admin cambia precio +50% → verifica `cancel + create` + audit log `MP_REAUTH_REQUIRED`.

### 10.3 Cron tests

`__tests__/cron/apply-pricing-changes.test.ts`:
- Seed custom_plan con discount_ends_at = ayer → cron corre → verifica `PUT` MP + discount_percent=0.
- Seed custom_plan con discount_ends_at = hoy+5d → cron corre → verifica email preventivo (o log si no hay Resend).
- Idempotencia: correr cron 2 veces, segundo run no hace nada.

### 10.4 Isolation tests (agregar a `__tests__/isolation/`)

- Owner de org A no puede leer `custom_plans` de org B (RLS).
- Owner de org A no puede leer `manual_payments` de org B.
- User sin `platform_admins` NO puede llamar endpoints `/api/admin/orgs/*`.

### 10.5 UI smoke

Manual en staging:
- Crear custom plan desde admin → copiar checkout URL → abrir en incognito → pagar con tarjeta test MP → verificar webhook → verificar status ACTIVE.
- Extender trial 7 días → verificar `trial_ends_at` updated.
- Registrar manual payment → verificar status ACTIVE.

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| MP rechaza `PUT transaction_amount` por exceder threshold no documentado | El flow de re-auth ya cubre esto. Logs detallados en `billing_events` para ajustar el 20% con datos reales. |
| Cron falla y el descuento no expira → cliente sigue pagando descontado | Cron es idempotente y reintenta diariamente. Alerta en `security_audit_log` si el cron no registra ejecución por 48h. |
| Admin borra custom plan sin cancelar MP → doble cobro | DELETE endpoint siempre cancela preapproval MP antes de borrar row. Testeable. |
| Owner re-entra a `/settings/subscription` durante PENDING y ve CTA viejo aunque ya pagó | Webhook MP es fast (segundos). Si hay race, el owner al recargar ve ACTIVE. Botón "Suscribirme" ya existente es idempotente en MP (same preapproval). |
| Registro manual con `covers_to` mal ingresado bloquea al cliente | UI muestra preview "próximo vencimiento: DD/MM/AAAA" antes de confirm. Admin puede editar manual_payments (endpoint PATCH opcional, defer si no hace falta). |
| Features extras con `key` inválido (typo) → cuando Sprint 2+ implemente el feature no matchea | Validación: whitelist de keys conocidas + prefijo `misc_*` libre. UI muestra warning si la key no está en la whitelist. |

---

## 12. Orden de implementación sugerido

Para el plan que escribirá `writing-plans` a continuación, este es el orden natural:

1. Migrations 150-153 + verificación RLS.
2. Types generados (`npm run db:generate`).
3. `lib/billing/custom-plans.ts` + tests unit.
4. `lib/billing/mercadopago.ts` extensión `applyPriceChange`, `updatePreapproval`.
5. API endpoints admin (custom-plan CRUD, extend-trial, manual-payment, suspend/unsuspend/cancel, mp-snapshot).
6. Integration tests de endpoints.
7. UI admin `/admin/orgs/[id]` rediseñada.
8. UI owner `/settings/subscription` con 3 estados.
9. Middleware paywall: handling de `PENDING_CUSTOM_PAYMENT`.
10. Cron `/api/cron/apply-pricing-changes` + tests.
11. Railway Cron Service configurado para el endpoint nuevo.
12. Smoke end-to-end en staging.

---

## 13. Referencias

- Admin console actual: `app/admin/orgs/[id]/page.tsx`, `components/admin/org-actions.tsx`, `app/api/admin/orgs/[id]/route.ts`.
- Plans estáticos: `lib/billing/plans.ts`.
- MP client: `lib/billing/mercadopago.ts`.
- Paywall middleware: ver spec `2026-04-21-paywall-mercadopago-design.md`.
- Integraciones custom futuras: `CRM_INTEGRATION.md`.
- Seed platform_admins: migration 142.
- Audit log: `lib/security/audit.ts` + tabla `security_audit_log` (migration 145).
