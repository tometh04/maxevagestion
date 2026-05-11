# Vibook — Handover para dev nuevo

**Audiencia**: el dev que toma el desarrollo el 2026-05-08.
**Autor**: Tomi (handoff). Última actualización: 2026-05-08.
**Status**: producto en producción, 1 cliente piloto pago (Lozada Rosario), modelo SaaS multi-tenant.

> Este doc está pensado para que en **1 día** estés operativo y entiendas qué es brittle vs sólido. No reemplaza leer código — te da el mapa.

---

## Tabla de contenidos

1. [Setup local en 15 min](#1-setup-local-en-15-min)
2. [Qué es Vibook (en criollo)](#2-qué-es-vibook-en-criollo)
3. [Arquitectura en 1 página](#3-arquitectura-en-1-página)
4. [Las 7 reglas de oro al tocar código](#4-las-7-reglas-de-oro-al-tocar-código)
5. [Módulos críticos — cómo funcionan y dónde mirar](#5-módulos-críticos--cómo-funcionan-y-dónde-mirar)
6. [Bugs típicos — recetas de fix](#6-bugs-típicos--recetas-de-fix)
7. [Operativa: deploy, rollback, soporte](#7-operativa-deploy-rollback-soporte)
8. [Decisiones tomadas y por qué (decision log)](#8-decisiones-tomadas-y-por-qué-decision-log)
9. [Lo que está sólido vs lo que es brittle](#9-lo-que-está-sólido-vs-lo-que-es-brittle)
10. [Roadmap real pendiente](#10-roadmap-real-pendiente)
11. [Mapa de toda la documentación](#11-mapa-de-toda-la-documentación)

---

## 1. Setup local en 15 min

```bash
git clone <repo>
cd erplozada
npm install
cp .env.example .env.local       # pedirle las claves a Tomi
npm run dev                      # arranca en :3044
```

**Variables críticas** (`.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — la base
- `OPENAI_API_KEY` — OCR + AI Copilot (opcional para dev)
- `EMILIA_API_KEY` — buscador de viajes (opcional)
- `CRON_SECRET` — los crons en Railway (no tocar local)
- `DISABLE_AUTH=true` — en dev te logea como SUPER_ADMIN automáticamente

**Stack**: Next 15 (App Router) + TS + Supabase (Postgres+Auth) + shadcn/ui + Railway hosting.

**Ojo**: NO usar Vercel. Migramos a Railway en abril 2026 — `app.vibook.ai`. Cualquier guía/skill que diga "deployalo a Vercel", ignorala.

Test que todo está OK:
```bash
npm run lint
npm run test
npm run build
```

---

## 2. Qué es Vibook (en criollo)

Vibook es un **ERP SaaS multi-tenant para agencias de viajes argentinas**.

- Cada **tenant** = una empresa cliente (ej. Lozada).
- Un tenant puede tener **N agencias** (sucursales). Lozada hoy tiene Rosario y Madero.
- Cada agencia tiene **users** con roles (SUPER_ADMIN, ADMIN, CONTABLE, SELLER, VIEWER).
- El producto cubre todo el flujo: **lead (Manychat) → operación → pagos → contabilidad → comisiones → AFIP**.

**Domain model en una frase**: "Una agencia vende un viaje (operation) a un cliente (customer), le compra el viaje a un operador mayorista (operator), cobra al cliente (payment EXPENSE), paga al operador (operator_payment), genera comisión al vendedor, y emite factura AFIP."

Cada movimiento de plata se registra en doble partida en `ledger_movements`. Eso es el corazón de la contabilidad.

**Actores externos**:
- **Manychat**: lead capture desde Instagram/WhatsApp via webhook
- **AFIP**: emisión de factura electrónica via afipsdk.com
- **Mercado Pago**: cobro de la subscription del tenant + cobros de clientes finales (preapproval)
- **OpenAI**: OCR de DNIs/pasaportes + AI Copilot
- **Resend**: emails transaccionales (welcome, trial reminder)
- **WhatsApp**: recordatorios automatizados a clientes

---

## 3. Arquitectura en 1 página

```
┌────────────────────────────────────────────────────────────┐
│                       Railway                              │
│  ┌────────────────────────┐    ┌─────────────────────┐    │
│  │  maxevagestion (web)   │◄───┤ 7 Cron Services     │    │
│  │  Next 15 App Router    │    │ (curl POST con      │    │
│  │  app.vibook.ai         │    │  Bearer CRON_SECRET)│    │
│  └────────────┬───────────┘    └─────────────────────┘    │
└───────────────┼────────────────────────────────────────────┘
                │
                ▼
        ┌───────────────┐    ┌─────────────────┐    ┌─────────┐
        │  Supabase     │    │  AFIP SDK       │    │ OpenAI  │
        │  Postgres     │    │  Mercado Pago   │    │ Manychat│
        │  Auth + RLS   │    │  Resend         │    │ WhatsApp│
        │  Storage      │    │                 │    │         │
        └───────────────┘    └─────────────────┘    └─────────┘
```

**Multi-tenancy**:
- Toda tabla "de negocio" tiene `org_id` (el tenant) y casi todas también `agency_id` (la sucursal).
- **RLS de Supabase** filtra automáticamente por org del usuario logeado.
- **Endpoints API** además filtran explícitamente por `agency_id` cuando aplica.

**Cron Services en Railway** (`/api/cron/*`):
- `recurring-payments` — genera payments de gastos fijos
- `alerts` — alertas de operación
- `payment-reminders` — recordatorios a clientes
- `notifications` — push genérico
- `whatsapp` — polling de respuestas Manychat
- `task-reminders` — alertas de tareas
- `exchange-rates` — TC oficial BCRA + dólar

Todos son **POST con `Authorization: Bearer $CRON_SECRET`**. Si curl da 401 → secret desincronizado.

---

## 4. Las 7 reglas de oro al tocar código

### Regla 1 — RLS no es opcional
Toda tabla nueva DEBE tener RLS habilitado y policies por `org_id`. Si una migración crea tabla sin RLS, está rota. Patrón: ver migraciones `20260429*` o cualquier `*_rls.sql` en `supabase/migrations/`.

### Regla 2 — `agency_id` siempre explícito
RLS te scopea por `org_id`, pero un mismo tenant tiene N agencias. Cualquier query que muestre data al user (lista, KPI, reporte) DEBE filtrar también por `agency_id`. Olvidarse causa que Lozada Madero vea data de Lozada Rosario.

### Regla 3 — Movimientos de plata van en transacción única
Cuando algo cambia un saldo (mark-paid, cash movement, ledger), TODOS los side effects (`ledger_movements` + `cash_movements` + `payment_counterparts` + IVA + percepciones + commission settlement) tienen que crearse en la misma transacción. Si falla uno, rollback de todos.

Ya pasó: endpoint `approve` flippeaba `status='PAID'` sin disparar `mark-paid` → payments huérfanos sin ledger. Buscá `app/api/payments/orphans/route.ts` para ver cómo se detecta. **Nunca cambies `status` directamente**.

### Regla 4 — Multi-currency: `amount` ≠ `amount_usd`
Cada row financiero tiene `amount` (en su currency) y `amount_usd` (calculado con TC del día). Confundirlos te da KPIs de millones cuando en realidad eran $100.

CHECK constraint nuevo: `paid_amount <= amount * 1.01`. Si saltó este check, el bug está en el endpoint que escribió.

Ver `lib/accounting/fx.ts` y `lib/accounting/bcra-exchange-rates.ts`.

### Regla 5 — Pensar SaaS, no Lozada-only
Lozada es 1 de N tenants futuros. NUNCA hardcodear `agency_id = 'xxx-lozada'`. Si necesitás un comportamiento custom para Lozada hoy, consultá con Tomi — probablemente debe ser flag/setting, no código.

### Regla 6 — Cache `no-store` en reportes/KPIs
Los reportes que muestran números deben ser dinámicos. Ya nos quemó 2 veces: arreglás un bug, deployás, refrescás y seguía mostrando dato viejo cacheado. En cada `route.ts` de reporte:
```ts
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
```
Y en cliente, `fetch(..., { cache: 'no-store' })`.

### Regla 7 — Nunca tocar data productiva sin script versionado
Si necesitás un fix masivo en data de Lozada (backfill, settlement, cleanup), **siempre script SQL versionado en `scripts/`** + commitearlo + tirarlo en Supabase SQL Editor con dry-run primero. Ejemplo: `scripts/legacy-settlement-lozada-rosario.sql`.

---

## 5. Módulos críticos — cómo funcionan y dónde mirar

### 5.1 Operations (`/operations`)
- Tabla principal: `operations`. FK a `customers` (M2M via `operation_customers`), `operators`, `agencies`, `users` (sellers).
- Estados: `PRE_RESERVED → RESERVED → CONFIRMED → TRAVELED → CLOSED`.
- Comisiones se calculan al pasar a `CONFIRMED` o `CLOSED` — ver `lib/commissions/calculate.ts`.
- Código central: `app/(dashboard)/operations/`, `components/operations/`.

### 5.2 Payments (`/payments`, `/cash`)
**Conceptual**: hay 2 tipos de "pagos" en distintas tablas:
- `payments` — cobros a clientes (INCOME) y pagos genéricos (EXPENSE).
- `operator_payments` — deuda pendiente al operador, "lo que les debemos a Eurovips/Delfos/etc".

**Flujo crítico**: marcar pagado.
- UI llama a `/api/payments/[id]/mark-paid` o `/api/accounting/operator-payments/[id]/mark-paid`.
- El endpoint llama a `lib/accounting/ledger.ts:createLedgerMovementForPayment` que escribe en `ledger_movements` + `cash_movements` + counterparts. **Atómico**.
- Si flippeás `status='PAID'` sin pasar por mark-paid → payment huérfano.

**Endpoint forense**: `app/api/payments/orphans/route.ts` lista huérfanos y los puede revertir a PENDING.

**Flags importantes**:
- `payments.is_legacy_import = true` — pago histórico cargado al import. NO tiene ledger.
- `operator_payments.is_legacy_settled = true` — deuda settleada retroactivamente (pagada fuera del sistema). NO tiene ledger.
- Estos flags se usan para EXCLUIR esos rows de queries de auditoría/orphans.

### 5.3 Accounting (`/accounting`)
- **Ledger doble partida**: cada movimiento de plata = 2 rows en `ledger_movements` (debit + credit).
- **Saldos** se calculan SUMANDO ledger_movements, NO cash_movements. Si el saldo está mal → mirar ledger primero.
- **FX gain/loss** automático: si pagás un pasivo USD con ARS al TC de hoy distinto al TC del momento de la deuda, se crea ledger_movement de FX gain/loss.
- **IVA** (libro IVA digital RG 4597 AFIP): ver `lib/accounting/libro-iva-digital/`.

### 5.4 Commissions (`/my/commissions`, `/accounting/commissions`)
- Reglas en `commission_rules` (por seller, operator, destino, tipo).
- Cálculo: `margin = sale_amount_total - operator_cost`; `commission = margin * pct`.
- Genera rows en `commission_records` que se pagan via `mark-commission-paid` (mismo patrón ledger).
- **Bug histórico TZ**: comisiones del 1° del mes caían al mes anterior por UTC-3. Ya fixeado, pero ojo si tocás logica de fecha.

### 5.5 Imports (`/settings/import-v2`)
- Motor en `lib/import/`. 5 pipelines (operations, customers, operators, payments, recurring).
- Diseñado en abril 2026, mergeado en `main` con PR #9.
- Cada import respeta `agency_id` del wizard. Si el CSV no trae agency, lo asigna por defecto.
- **Brittle**: el matching de operadores/clientes existentes es por nombre (case-insensitive). Si el CSV tiene typos, crea duplicados.

### 5.6 AFIP — facturación electrónica
- Setup vía `/operations/billing/setup` (gate forzado en onboarding).
- SDK: afipsdk.com (clave en env `AFIP_SDK_API_KEY`).
- Endpoint emisor: `/api/operations/[id]/billing/emit`.
- Códigos de error AFIP traducidos a mensajes accionables en `lib/afip/types.ts`.
- **Bug típico**: error 10000 = certificado no autorizado para emitir IVA en AFIP. Fix: el tenant tiene que ir a su panel AFIP y autorizarlo.

### 5.7 SaaS / Billing del tenant (`/admin`)
- Plan + subscription en `organizations.subscription_status`, `current_period_ends_at`, `trial_ends_at`, `custom_plan_id`.
- Cobro vía Mercado Pago Preapproval (recurring).
- Trial: 14 días default. Cron `trial-reminder` manda email 48h antes de vencer.
- Admin UI: `/admin/orgs`, `/admin/orgs/[id]`, `/admin/metrics` (MRR/ARR/churn), `/admin/billing`.

---

## 6. Bugs típicos — recetas de fix

### Bug A — KPI muestra menos de lo real
**Síntoma**: la deuda total muestra US$ 100k pero deberían ser US$ 900k.
**Causa probable**: filas con `org_id` o `agency_id` NULL no entran al filtro.
**Diagnóstico**:
```sql
SELECT COUNT(*) FROM payments WHERE org_id IS NULL;
SELECT COUNT(*) FROM operator_payments WHERE org_id IS NULL;
```
**Fix**: backfill por inferencia (operation → org_id, o creator email → owner of org). Ejemplo: ver `scripts/legacy-settlement-lozada-rosario.sql` para el patrón.
**Prevención**: tests Pilar 5 en `__tests__/isolation/tenant-segregation.test.ts` los detectan. Conectarlos a CI bloqueante.

### Bug B — Payment marcado PAID sin tocar el saldo
**Síntoma**: en operación dice "Pagado", pero el saldo de la cuenta bancaria no se movió.
**Diagnóstico**:
```sql
SELECT * FROM payments WHERE status='PAID' AND ledger_movement_id IS NULL AND is_legacy_import=false;
```
**Fix**: revertir a PENDING via `POST /api/payments/orphans` con el `paymentIds`. Después marcar pagado de nuevo eligiendo cuenta financiera.
**Prevención**: ya solo `mark-paid` flippea status. Cualquier endpoint que aparezca tocando `status` directamente es bug.

### Bug C — `paid_amount > amount` (deuda negativa)
**Síntoma**: la deuda al operador da NEGATIVA en el reporte.
**Causa**: TC mixto — pagaron en ARS pero guardaron como si fuera USD sin conversión.
**Fix**: el CHECK constraint nuevo lo previene (`paid_amount <= amount * 1.01`). Si tenés rows viejos malos:
```sql
UPDATE operator_payments SET paid_amount = amount WHERE paid_amount > amount;
```

### Bug D — Reporte muestra dato viejo después de fix
**Síntoma**: arreglaste un bug, deployaste, refrescás, sigue mal.
**Causa**: cache HTTP/Next.
**Fix**: `dynamic = "force-dynamic"` + `fetchCache = "force-no-store"` en el route, y `cache: 'no-store'` en el cliente.

### Bug E — Comisiones del día 1° van al mes anterior
**Causa**: TZ Argentina UTC-3, momento de medianoche local cae a 03:00 UTC.
**Fix**: usar `date-fns-tz` con `America/Argentina/Buenos_Aires` consistentemente. NO `new Date()` directo en queries de fecha.

### Bug F — Manychat lead capture rompe
**Síntoma**: leads de Instagram/WhatsApp no aparecen, o se duplican.
**Diagnóstico**: Railway logs filtrar `manychat`. Verificar que la action external request en Manychat tenga la URL `/api/webhooks/manychat` correcta y el header `X-API-Key` con el valor de `MANYCHAT_API_KEY`.
**Fix**: re-configurar la action en Manychat dashboard.

### Bug G — Cron Service da 401
**Causa**: `CRON_SECRET` desincronizado entre `maxevagestion` y los cron services.
**Fix**: ver `docs/runbook-incidents.md` sección 4.

### Bug H — User productivo de Lozada deja de ver sus payments / data
**Síntoma**: un seller/admin se loguea y `/payments` (o cualquier vista filtrada por RLS) está vacía.
**Causa probable**: el user no está en `organization_members` (o `organization_members.user_id` mal seteado — debe ser `users.auth_id`, no `users.id`).
**Diagnóstico**:
```sql
SELECT u.email, u.role,
  CASE WHEN om.user_id IS NOT NULL THEN '✓ en org_members' ELSE '✗ FALTA' END AS membership
FROM users u
LEFT JOIN organization_members om ON om.user_id = u.auth_id AND om.status = 'ACTIVE'
WHERE u.email = '<email-del-user>';
```
**Fix**: insertar manualmente:
```sql
INSERT INTO organization_members (user_id, organization_id, role, status)
VALUES (
  (SELECT auth_id FROM users WHERE email = '<email-del-user>'),
  '<org-id-de-su-tenant>',
  'OWNER',  -- o ADMIN/SELLER/CONTABLE/VIEWER según corresponda
  'ACTIVE'
);
```

### Bug I — User en `public.users` con auth_id huérfano (no existe en `auth.users`)
**Síntoma**: backfill de `organization_members` lo saltea, no puede loguear.
**Causa**: alguien creó al user en `public.users` (manual o legacy) pero nunca completó el alta en Supabase Auth. O fue borrado del panel Auth → Users.
**Fix**:
1. Supabase Dashboard → Authentication → Users → Invite User con el email
2. Supabase manda email de invitación, user setea password
3. Una vez creado en `auth.users`, actualizar el link:
   ```sql
   UPDATE public.users
   SET auth_id = '<new-auth-uuid>'
   WHERE email = '<email>';
   ```
4. Insertar en `organization_members` con el nuevo `auth_id`
**Caso real**: `naza@agencialozada.com` (SELLER de Lozada) — pendiente activar manualmente cuando la necesiten.

---

## 7. Operativa: deploy, rollback, soporte

**Deploy**: push a `main` → Railway auto-deploy en ~3 min.
**Branches**: ramas tipo `fix/...`, `feat/...`, `saas/...`. Mergear via PR (squash).
**Hotfix**: revert commit (`git revert <sha>`) → push → Railway lo deploya.

**Rollback rápido (sin tocar git)**:
- Railway → maxevagestion → Deployments → último deploy bueno → `...` → **Redeploy**.

**Soporte tenant**:
- `/admin/orgs/[id]` tiene una **card de Diagnóstico** que resume estado de subscription, AFIP, integraciones, errores recientes.
- Para queries crudas, Supabase SQL Editor (ver runbook).

**Runbook completo**: `docs/runbook-incidents.md`.

---

## 8. Decisiones tomadas y por qué (decision log)

| # | Decisión | Por qué |
|---|---|---|
| 1 | Migración Vercel → Railway (abril 2026) | Cron jobs con auth Bearer + observability mejor + costo |
| 2 | Multi-tenancy via `org_id` agregado a posteriori | Producto arrancó single-tenant (Lozada). Migración 113-128 introdujo `org_id`/`agency_id` en todas las tablas críticas |
| 3 | Doble partida en `ledger_movements` (no en cash_movements) | Saldos se calculan del ledger; cash_movements es vista para usuario. Permite tener pagos legacy sin cash y FX gain/loss puros |
| 4 | Flags `is_legacy_import` / `is_legacy_settled` | Para Lozada: el saldo bancario inicial cargado YA descuenta pagos hechos fuera del sistema. Marcamos esos pagos como PAID sin ledger |
| 5 | AFIP via afipsdk.com (no SDK propio) | Manejar certificados WSAA es un proyecto en sí; outsourceamos |
| 6 | Mercado Pago para subscription | Único PSP con preapproval recurring sólido en AR |
| 7 | Sin cron de integridad — preferimos gates en write-time | "No deberían existir inconsistencias" > "alertarme cuando aparezcan" |
| 8 | `DISABLE_AUTH=true` en dev | Simplifica testing local. **REMOVER pre-prod siempre** |
| 9 | Tests de aislamiento (`Pilar 5`) | Detectan rows con org_id NULL. Pendiente: meterlos en CI bloqueante |

---

## 9. Lo que está sólido vs lo que es brittle

### Sólido (no tocar sin necesidad)
- Doble partida del ledger
- RLS de Supabase (probada en producción)
- Auth + roles
- Manychat lead capture (estable en producción)
- AFIP emit (códigos de error mapeados, retry logic)

### Brittle (cuidado al tocar — testear bien)
- **Multi-currency**: cualquier query que mezcle `amount` y `amount_usd` es candidata a bug
- **Mark-paid de operator_payments**: tiene side effects en commission settlement, FX, percepciones, IVA. Si rompés mark-paid, rompés todo
- **Imports V2**: matching por nombre, sensible a typos en CSV
- **Cache de Next**: cualquier reporte sin `force-dynamic` va a mostrar dato viejo
- **`org_id` NULL en tablas viejas**: 331 payments con NULL (policy híbrida los mantiene visibles vía `user_agencies`) + 1209 alerts NULL (mig 5 pendiente). Backfill en `scripts/p0-backfill-orphan-payments-org-id.sql`
- **Policy HÍBRIDA de `payments`** (post-deploy 2026-05-10): acepta `organization_members` (SaaS nuevo) Y `user_agencies` (legacy). Zero-downtime durante transición. Cuando todos los users estén en `organization_members`, simplificar quitando la rama legacy. Es deuda técnica conocida
- **Función `user_org_ids()`**: fue reescrita 2026-05-10 — la original tenía mismatch entre `auth.uid()` y FK target de `organization_members`. Si la tocás, el JOIN correcto es `auth.uid() → users.auth_id → users.id → organization_members.user_id`

### Black boxes (todavía no auditadas)
- Some recurring_payments con `agency_id` NULL — backfill parcial hecho, pero hay rows que persisten
- AI Copilot context: armado a mano, puede dar respuestas malas si el schema cambia
- Alertas: muchas reglas, baja cobertura de tests

---

## 10. Roadmap real pendiente

Lo que todavía hace falta (priorizado):

### P0 — Bloquea entrega/escala
- [ ] Backfill `org_id` NULL en `payments` (331 rows) y `alerts` (1209 rows)
- [ ] Tests Pilar 5 en CI bloqueante (workflow GitHub Actions)
- [ ] Cache `no-store` audit en TODOS los endpoints `/api/reports/*`, `/api/accounting/*`
- [ ] Smoke E2E mínimo del flujo crítico (lead → operation → mark-paid → AFIP) automatizado

### P1 — Importante para el dev nuevo
- [ ] Endpoint `/api/admin/integrity-check` (manual, no cron) que liste todas las inconsistencias
- [ ] Documentar invariantes en `docs/INVARIANTS.md` (lista exhaustiva de CHECK constraints + reglas)
- [ ] Refactor de `lib/accounting/ledger.ts` — el archivo se hizo grande, partir por concern

### P2 — Mejora de DX
- [ ] Eliminar el huevero de docs en `/docs/` (>50 archivos legacy, muchos obsoletos). Curar.
- [ ] Storybook para componentes críticos del dashboard
- [ ] Migrar a App Router donde quedan mixed Pages/App

### Parked (post-MVP, no bloqueantes)
- Operation timeline view
- Persistent AI Copilot history
- Dark mode
- Balance Sheet / P&L formales

---

## 11. Mapa de toda la documentación

> Todos los paths son **relativos al root del repo**. Una vez que clonás, los abrís desde tu editor.

### Onboarding y referencia (LEER PRIMERO)
- **Este doc** — `docs/HANDOVER.md`
- `CLAUDE.md` — guía para AI agents, también buena referencia humana de arquitectura
- `README.md` — descripción del producto + setup

### Operativa
- `docs/runbook-incidents.md` — backups, rollback, crons, soporte tenant
- `docs/testing-railway-migration.md` — checklist QA post-Railway, env vars matrix
- `CONFIGURACION_SUPABASE.md` — setup Supabase desde cero

### Roadmap y estado
- `ROADMAP.md` — tareas pendientes globales
- `ROADMAP-SAAS.md` — roadmap específico de la conversión SaaS

### Testing
- `GUIA_TESTING.md` — testing manual end-to-end
- `__tests__/` — tests unit/integration (jest)
- `__tests__/isolation/tenant-segregation.test.ts` — Pilar 5

### Integraciones
- `docs/TRELLO_INTEGRATION.md`
- `docs/GUIA_AFIP_SDK.md`
- `docs/manychat-integration-setup.md`

### Migraciones y data
- `supabase/migrations/` — 234 migraciones, ordenadas por timestamp
- `scripts/` — scripts ad-hoc de backfill y settlement
- `docs/GUIA_MIGRACION_DATOS.md` — proceso de import desde sistemas viejos

### Referencias técnicas profundas
- `docs/TECHNICAL_DOCUMENTATION.md`
- `docs/AUDITORIA_SISTEMA_FINANZAS_CONTABILIDAD.md`
- `docs/CAJA_INGRESOS_EGRESOS.md`
- `docs/TIPO_CAMBIO_GESTION.md`

> **Heads up**: la carpeta `/docs/` tiene muchos archivos legacy (planes viejos, análisis ya implementados). Si encontrás un doc que dice "PLAN_X" o "PROPUESTA_Y", probablemente ya está hecho — chequeá `git log --all --oneline -- docs/<archivo>.md` para ver si fue cerrado.

---

## Apéndice — comandos útiles del día a día

```bash
# Dev
npm run dev                     # :3044
npm run lint
npm run test                    # jest (excluye .worktrees)
npm run test -- --testPathPattern='isolation'   # solo Pilar 5

# DB
npm run db:generate             # regenerar types desde Supabase
npm run db:check                # verificar tablas

# Railway (CLI)
railway logs --service maxevagestion
railway logs --service cron-recurring-payments

# Supabase queries útiles
# (correr en SQL Editor)
SELECT * FROM organizations WHERE name ILIKE '%lozada%';
SELECT id, name, agency_id FROM operators WHERE LOWER(name) IN ('eurovips','lozada','delfos');
SELECT COUNT(*) FROM payments WHERE org_id IS NULL;
```

---

## Contacto

**Tomi** — diseño, decisiones de producto, contexto histórico.
**Yami / Santi** — usuarios power de Lozada Rosario, fuente principal de feedback de bugs (WhatsApp).
**Maxi** — owner del cliente Lozada (no técnico, hablar producto en criollo).

Cualquier duda, antes de leer 8 archivos: **preguntá a Tomi**. Casi todo el contexto histórico del producto está en su cabeza, no en los docs.
