# AGENTS.md

Guia para agentes y desarrolladores que trabajan en este repositorio.

La fuente de verdad es el codigo actual. Algunos documentos historicos del repo
siguen mencionando MAXEVA, Lozada o Trello como arquitectura principal; tratar
esas referencias como contexto legacy salvo que el codigo actual lo confirme.

## Proyecto

Vibook / MAXEVA Gestion es un SaaS multi-tenant para agencias de viajes. Conserva
el nucleo ERP historico de ventas, operaciones, pagos, caja, contabilidad,
comisiones, documentos y alertas, pero hoy tambien incluye:

- Billing, paywall y onboarding por Mercado Pago.
- Platform admin global separado de los roles de tenant.
- Permisos dinamicos por agencia y soporte multi-rol.
- Integraciones Manychat, Callbell, ChatSell, Eve, Emilia, WhatsApp/WHA Control,
  AFIP, OpenAI, web push y Tawk.
- Imports masivos, soporte, knowledge base, feature flags por tenant y crons en
  Railway.

La regla mental correcta para trabajar aca es: primero multi-tenant, permisos,
service role e invariantes financieras; despues el modulo funcional.

## Comandos

```bash
# Desarrollo
npm run dev              # Next dev server en puerto 3067
npm start                # Next production server en puerto 3005

# Build y lint
npm run build            # Build production
npm run lint             # next lint + check de createAdminClient allowlist
npm run check:admin-client

# Testing
npm run test
npm run test:watch
npm run test:coverage
npm run test:isolation

# Database / scripts
npm run db:generate      # Regenera lib/supabase/types.ts
npm run db:seed
npm run db:seed:mock
npm run db:check
```

`npm run lint` ejecuta `scripts/check-admin-client.sh`. Si agregas un uso legitimo
de `createAdminClient()`, tambien tenes que actualizar
`scripts/admin-client-allowlist.txt` con una justificacion concreta.

## Stack

- Next.js 15 App Router, React 18, TypeScript.
- Supabase Postgres/Auth/Storage con RLS.
- `@supabase/ssr` para server/browser clients.
- TailwindCSS + shadcn/ui/Radix + tokens Vibook en `app/globals.css`.
- Jest para unit/route tests; Playwright esta instalado para pruebas browser.
- OpenAI para OCR, AI/Cerebro y algunos clasificadores.
- Mercado Pago para suscripciones.
- AFIP SDK para facturacion electronica.

## Estructura de alto nivel

```text
app/
  (auth)/                 Auth, reset password, invites
  (dashboard)/            Aplicacion principal protegida del tenant
  admin/                  Platform admin global
  onboarding/             Alta de tenant y billing
  paywall/                Bloqueo/regularizacion de suscripcion
  cotizacion/             Vistas publicas por token
  api/                    APIs, webhooks, crons, billing, AI, imports
components/
  ui/                     Base shadcn/ui
  <dominio>/              Componentes por modulo de producto
lib/
  supabase/               Clients, admin scope, tipos
  auth*, permissions*     Auth, roles, permisos dinamicos
  accounting/             Ledger, FX, IVA, journal, operator payments
  billing/                Planes, guard, state machine MP, limites
  integrations/           Manychat, Callbell, ChatSell, Eve, HMAC/secrets
  ai/, emilia/, invoices/, afip/, payments/, operations/, ...
supabase/migrations/      Schema, RLS, SaaS, billing, hardening
scripts/                  Seeds, checks, imports, fixes, QA
```

## Reglas no negociables

1. **Multi-tenant first**: todo endpoint user-facing debe exigir `user.org_id` y
   filtrar explicitamente por `org_id` cuando la tabla lo tenga.
2. **No confiar solo en RLS**: RLS es defensa en profundidad, no la unica capa.
3. **`SUPER_ADMIN` no es global**: normalmente es owner/admin dentro de un tenant.
   El acceso global real vive en `platform_admins` y se valida con
   `isPlatformAdmin()`.
4. **`createAdminClient()` bypasea RLS**: usarlo solo en casos justificados y
   listados en `scripts/admin-client-allowlist.txt`.
5. **Si hay tenant conocido, scopear**: preferir `createOrgAdminScope(orgId)` o
   queries con `.eq("org_id", orgId)`.
6. **Writes financieros requieren idempotencia**: usar idempotency keys, CAS
   guards, validacion de saldo y tests cuando corresponda.
7. **No silenciar fallas contables criticas**: notificaciones pueden fallar sin
   romper el flujo; ledger, caja, counterparts, FX, percepciones, operator
   payments y billing no deben quedar inconsistentes sin alerta/audit.
8. **No exponer secrets al browser**: nunca usar service role ni secrets privados
   en componentes cliente.

## Contrato de arquitectura y system design

Este archivo es el contrato de trabajo del repo. Las reglas de arquitectura no
son sugerencias: si una tarea pide una solucion que las rompe, primero explicitar
el conflicto y proponer el cambio de diseno minimo.

### Capas permitidas

Flujo normal para funcionalidades user-facing:

```txt
UI / Client Component
  -> Server Component, Server Action o API route
  -> lib/<bounded-context>/ servicio de dominio
  -> Supabase client scoped al request
  -> PostgreSQL / RLS / constraints / triggers
```

Reglas:

- La UI no debe contener reglas de negocio criticas, calculos financieros,
  autorizacion ni acceso directo con service role.
- La API route o Server Action posee transporte, auth, parsing, validacion y
  mapeo de errores.
- `lib/<dominio>/` posee reglas de negocio, invariantes, idempotencia y
  transformaciones testeables.
- La base de datos posee constraints, RLS, indices y triggers cuando protegen
  integridad compartida entre flujos.
- No crear "god routes" ni helpers genericos que mezclen tenant, permisos,
  finanzas e integraciones.

### Bounded contexts

Respetar los limites naturales del sistema:

- `auth`, `permissions`, `billing` y `platform-admin` definen acceso.
- `organizations`, `agencies`, `users` y membership definen tenancy.
- `operations`, `customers`, `operators` y `sales` definen negocio operativo.
- `payments`, `cash`, `accounting`, `invoices`, `afip`, `commissions` y
  `operator-payments` definen plata, impuestos y ledger.
- `integrations`, `webhooks`, `notifications`, `manychat`, `callbell`,
  `chatsell`, `emilia` y `trello` definen bordes externos.
- `ai` y `cerebro` consumen herramientas controladas; no deben saltear permisos
  ni inventar acceso directo a tablas sensibles.

Si una modificacion cruza contextos, definir primero el ownership de datos y el
contrato entre modulos. No duplicar reglas de un contexto en otro para "salir
rapido".

### Reglas de decision

- Nuevo flujo de dinero: disenar idempotencia, atomicidad, auditoria y pruebas
  antes de escribir UI.
- Nueva tabla o columna sensible: agregar migracion, RLS/policies, indices,
  tipos regenerados y documentar impacto multi-tenant.
- Nueva integracion externa: validar firma/token, registrar evento entrante,
  hacer procesamiento idempotente y evitar logs con secrets.
- Nuevo permiso o rol: actualizar `lib/permissions.ts`,
  `lib/permissions-agency.ts` si aplica, UI sidebar/actions y tests.
- Nuevo dashboard o pantalla operacional: usar componentes existentes,
  server-side data loading cuando sea posible y acciones que refresquen estado
  sin exigir F5.
- Nueva abstraccion: crearla solo si reduce duplicacion real o encapsula una
  regla de dominio estable. Evitar wrappers sin comportamiento.
- Cambio cross-cutting: agregar o actualizar una nota tecnica en `docs/` antes
  de dejar reglas implicitas en el codigo.

### Anti-patrones a evitar

- Query user-facing sin `org_id` cuando la tabla es tenant-scoped.
- `createAdminClient()` en endpoints de usuario sin allowlist y justificacion.
- "Arreglar" permisos ocultando botones pero dejando la API abierta.
- Calculos de ledger, saldo, comision, IVA, AFIP o billing dentro de componentes.
- Payloads `req.json()` sin validacion para writes.
- Casts `as any` para tapar tipos stale despues de migraciones.
- Refactors grandes mezclados con cambios de comportamiento.
- Copiar patrones legacy de Trello si el flujo actual usa integraciones modernas.

## Flujo de trabajo para agentes y humanos

Antes de editar:

1. Leer este `AGENTS.md`, el archivo tocado, sus tests cercanos, migraciones
   relevantes y docs del contexto.
2. Identificar el bounded context, la capa donde corresponde el cambio y los
   invariantes que no pueden romperse.
3. Si la tarea es ambigua en negocio, dinero, seguridad o datos multi-tenant,
   frenar y pedir aclaracion concreta.

Durante la implementacion:

- Preferir cambios verticales chicos: contrato/API, dominio, UI y test focalizado.
- Mantener la convencion local del modulo antes de introducir una nueva.
- No ampliar permisos, service role, scopes de datos ni dependencias externas por
  conveniencia.
- Si se toca una regla compartida, buscar consumidores con `rg` y revisar el
  impacto real.

Antes de cerrar:

- Ejecutar el check mas especifico disponible y reportar si no se pudo correr.
- Revisar el diff buscando fuga de tenant, fuga de permisos, stale UI, errores
  silenciosos e inconsistencias financieras.
- Para UI, validar estados de loading, empty, error, disabled y responsive cuando
  el cambio sea visible para usuarios.

## Skills, reglas y enforcement del proyecto

Si se usan agentes, este repo debe combinar tres capas:

- **`AGENTS.md`**: contrato durable del repo. Debe mantenerse practico y cerca de
  reglas que se repiten. Si un subdirectorio necesita reglas especiales, agregar
  un `AGENTS.md` o `AGENTS.override.md` mas cercano a ese codigo.
- **`.agents/skills`**: workflows reutilizables. Ya existe `impeccable` para UI.
  Se pueden agregar skills de arquitectura, debugging o TDD al proyecto si el
  equipo los usa repetidamente.
- **`CLAUDE.md`**: adaptador para Claude Code. Debe importar este archivo con
  `@AGENTS.md` y dejar reglas largas o path-specific en `.claude/rules/`.
- **Checks ejecutables**: lint, tests, scripts, hooks o CI. Todo invariant que
  deba ser obligatorio debe estar respaldado por codigo, no solo por texto.

El enfoque de repos como `mattpocock/skills` aplica bien como workflow
project-level: skills chicas, composables y enfocadas en diagnostico,
arquitectura, TDD, review o modelado de dominio. No deben reemplazar las reglas
locales de este archivo. Si se adopta una skill externa, adaptarla al vocabulario
del repo y no permitir que contradiga multi-tenancy, permisos o finanzas.

Usar skills cuando el trabajo sea repetible y tenga pasos claros. Usar
`AGENTS.md` para reglas de arquitectura y comandos. Usar scripts/tests para
enforcement.

## Auth, tenants y permisos

### Usuario actual

Usar siempre:

```ts
import { getCurrentUser } from "@/lib/auth"

const { user } = await getCurrentUser()
```

`getCurrentUser()` devuelve el row de `users` y agrega `user.roles`, fusionando
`role` + `additional_roles`. Usa `React.cache()` para deduplicar dentro del
mismo request.

El bypass `DISABLE_AUTH=true` solo es valido en `NODE_ENV=development`. Fuera de
development, `instrumentation.ts`, `middleware.ts` y `lib/auth.ts` lo bloquean o
lo ignoran defensivamente.

### Roles actuales

Roles definidos en `lib/permissions.ts`:

- `SUPER_ADMIN`
- `ORG_OWNER`
- `ADMIN`
- `CONTABLE`
- `SELLER`
- `VIEWER`
- `POST_VENTA`

`ORG_OWNER` es alias SaaS de owner de tenant. `POST_VENTA` gestiona seguimiento
post-cierre. Los usuarios pueden tener roles adicionales.

### Permisos

Hay dos capas:

- Defaults estaticos en `lib/permissions.ts`.
- Overrides dinamicos por agencia en `lib/permissions-agency.ts`, tabla
  `agency_role_permissions`.

Patron recomendado en APIs:

```ts
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"

const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
const perms = await resolveUserPermissions(
  supabase as any,
  user.id,
  user.org_id,
  (user as any).roles ?? [user.role],
  agencyIds
)

if (!canPerformAction(user, "operations", "write", perms)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
```

Para listados, usar helpers existentes cuando apliquen:

- `applyLeadsFilters`
- `applyOperationsFilters`
- `applyCustomersFilters`
- `getScopedAgenciesForUser`

## Supabase clients

### Server/auth-aware

```ts
import { createServerClient } from "@/lib/supabase/server"

const supabase = await createServerClient()
```

### Browser

```ts
import { supabase } from "@/lib/supabase/client"
```

### Admin/service role

```ts
import { createAdminClient } from "@/lib/supabase/server"
```

`createAdminClient()` bypasea RLS. Casos legitimos:

- Crons cross-tenant.
- Webhooks server-to-server donde la org se resuelve por token/firma.
- Platform admin protegido por `isPlatformAdmin()`.
- Auth/onboarding pre-session.
- Billing escrito por webhooks o flujos anti-forge.
- Imports validados que inyectan `org_id`.
- Storage o write-validated flows documentados.
- Audit/security logs fire-and-forget.

Todo uso nuevo debe estar en `scripts/admin-client-allowlist.txt`.

Para operaciones admin dentro de un tenant conocido:

```ts
import { createOrgAdminScope } from "@/lib/supabase/admin-scope"

const scope = createOrgAdminScope(user.org_id)
await scope.insert("cash_movements", data)
```

## Patron canonico de API user-facing

```ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json(
      { error: "Usuario sin organizacion asociada" },
      { status: 400 }
    )
  }

  const supabase = await createServerClient()
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
  const perms = await resolveUserPermissions(
    supabase as any,
    user.id,
    user.org_id,
    (user as any).roles ?? [user.role],
    agencyIds
  )

  if (!canPerformAction(user, "module", "write", perms)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  // Preferir Zod en endpoints nuevos o cuando se toque validacion.

  const { data, error } = await (supabase.from("table_name") as any)
    .select("*")
    .eq("org_id", user.org_id)

  if (error) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }

  return NextResponse.json({ data })
}
```

No usar patrones antiguos que permitan "SUPER_ADMIN ve todo" sin `org_id`. En
SaaS, un `SUPER_ADMIN` normalmente ve todo su tenant, no todos los tenants.

## Webhooks e integraciones

Webhooks no tienen session de usuario. El patron seguro es:

1. Resolver org por token/config (`org_integrations`, URL token o external ref).
2. Verificar HMAC/secret cuando exista.
3. Leer body crudo si la firma lo requiere.
4. Registrar idempotencia en `webhook_event_log` o equivalente.
5. Usar admin client server-side.
6. Inyectar `org_id` en todo write.

Archivos relevantes:

- `lib/integrations/hmac.ts`
- `lib/integrations/secrets.ts`
- `app/api/integrations/manychat/[token]/webhook/route.ts`
- `app/api/integrations/callbell-in/[token]/webhook/route.ts`
- `app/api/integrations/chatsell/[token]/webhook/route.ts`
- `app/api/integrations/eve-in/[token]/webhook/route.ts`

`app/api/webhooks/manychat/route.ts` es legacy con `X-API-Key`. No usarlo como
modelo para integraciones nuevas; preferir HMAC + token por tenant.

## Crons

Todos los endpoints bajo `/api/cron/*` deben validar:

```ts
import { checkCronAuth } from "@/lib/cron/auth"

const auth = checkCronAuth(request, "cron-name")
if (!auth.authorized) {
  return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 })
}
```

Los crons corren en Railway Cron Services y llaman con:

```text
Authorization: Bearer $CRON_SECRET
```

Son cross-tenant por diseno; pueden usar admin client, pero todo write debe
preservar `org_id`.

## Billing, paywall y platform admin

### Billing

Archivos clave:

- `lib/billing/plans.ts`
- `lib/billing/guard.ts`
- `lib/billing/state-machine.ts`
- `lib/billing/limits.ts`
- `app/api/billing/*`
- `app/onboarding/billing/*`
- `app/(dashboard)/settings/subscription/page.tsx`

El acceso al dashboard se protege por:

- `middleware.ts`
- `assertSubscriptionActive()` en `app/(dashboard)/layout.tsx`
- RLS/tenant isolation

Cambios en billing deben probar state machine, grace periods, reactivacion,
regularizacion y webhooks de Mercado Pago.

### Platform admin

`app/admin` es global. No usar `users.role` para autorizarlo. Usar:

```ts
import { isPlatformAdmin } from "@/lib/auth/platform"
```

Los platform admins viven en tabla `platform_admins`.

## Contabilidad, caja y pagos

El modulo financiero es de alta criticidad. Antes de tocarlo, revisar los
invariantes y tests existentes.

Archivos clave:

- `lib/accounting/ledger.ts`
- `lib/accounting/payment-counterparts.ts`
- `lib/accounting/operator-payment-settlement.ts`
- `lib/accounting/journal-entries.ts`
- `lib/accounting/fx.ts`
- `lib/accounting/iva.ts`
- `lib/accounting/withholding-rules.ts`
- `app/api/payments/route.ts`
- `app/api/payments/mark-paid/route.ts`
- `app/api/cash/movements/route.ts`
- `app/api/accounting/operator-payments/*`

Reglas:

- `createLedgerMovement()` recibe el client Supabase del caller y debe resolver
  `org_id`; si no puede, falla.
- Para pagos y mark-paid, preservar idempotency key, CAS guards y validacion de
  saldo.
- Para egresos, validar saldo suficiente.
- Para pagos a operadores, mantener sincronizados `payments`, `operator_payments`,
  `ledger_movements`, `cash_movements` y journal entries.
- Para multi-currency, no mezclar ARS/USD sin TC real; revisar `amount_usd`,
  `exchange_rate`, `sale_currency` y `operator_cost_currency`.
- Si un side effect no bloqueante falla, loguear y generar alerta si puede dejar
  una revision manual pendiente.

## AI, Cerebro y OpenAI

`app/api/ai/route.ts` usa OpenAI y puede ejecutar SQL readonly via RPC
`execute_readonly_query`. Es una superficie sensible.

Reglas:

- Mantener filtro obligatorio por `org_id`.
- No ampliar SQL libre sin allowlist fuerte.
- Preferir tools curados en `lib/ai/tools.ts` para nuevas capacidades.
- No confiar en contenido de leads/clientes como instrucciones del sistema.
- Si se toca schema/prompt hardcodeado, verificar contra `lib/supabase/types.ts`
  o migraciones recientes.

OCR/documentos y clasificadores tambien usan OpenAI; manejar falta de API key de
forma degradada y nunca exponerla al cliente.

## UI y frontend

### Sistema visual

- `components/ui` contiene la base shadcn/ui.
- `app/globals.css` define tokens Vibook, dark mode, gradientes, sidebar y
  `.light-force`.
- `tailwind.config.js` expone colores semanticos y tokens de marca.
- `components/app-sidebar.tsx` define navegacion principal y filtra con permisos
  resueltos.

### Regla practica

Preferir componentes de `components/ui` para controles comunes. No crear una
primitiva nueva si ya existe una equivalente. Aun asi, el repo actual tiene
componentes de dominio con `<button>`, `<input>` y markup nativo; no hacer
refactors cosmeticos masivos salvo que el cambio lo requiera.

Para UI nueva:

- Usar tokens semanticos (`background`, `card`, `muted`, `primary`, `border`,
  `accent-*`) en lugar de colores hardcodeados.
- Mantener compatibilidad con dark mode salvo pantallas que usen explicitamente
  `.light-force` como admin.
- Seguir patrones de sidebar/header/layout existentes.
- No agregar texto explicativo innecesario dentro de la app.
- Para dashboards/operaciones, priorizar densidad, lectura rapida, tablas y
  acciones claras sobre layouts de marketing.

## Integraciones activas y legacy

Activas/relevantes:

- Manychat / CRM advanced.
- Callbell.
- ChatSell.
- Eve.
- Emilia.
- WHA Control / WhatsApp.
- Mercado Pago.
- AFIP.
- OpenAI.
- Web push.
- Tawk allowlist.

Trello es legacy/residual. Quedan columnas como `trello_url`,
`trello_list_id`, `trello_full_data` y tabla `settings_trello`, pero no asumir
que Trello es la integracion activa. Ver codigo actual antes de tocarlo.

## Validacion

Zod existe en `lib/validation.ts` y en schemas de import. Para endpoints nuevos
o cambios de payload, preferir `safeParse`/`parse` y respuestas 400 claras.

El repo todavia tiene muchos `request.json()` manuales y muchos `any`; no ampliar
esa deuda sin motivo.

## Testing

Tests relevantes:

- Permisos/tenancy: `lib/__tests__/permissions*.test.ts`,
  `lib/permissions/__tests__`.
- Contabilidad: `lib/accounting/__tests__`.
- Billing: `lib/billing/*.test.ts`.
- Imports: `lib/import/schemas/*.test.ts`.
- Alertas: `lib/alerts/__tests__`.
- Comisiones: `lib/commissions/__tests__`.
- Route tests en subcarpetas `app/api/**/__tests__` cuando existan.

Reglas:

- Cambios en permisos, tenancy, billing, pagos, caja, contabilidad, comisiones,
  AFIP o imports requieren tests focalizados.
- Si se toca `createAdminClient()`, correr `npm run check:admin-client`.
- Si se agregan migraciones o columnas, correr/regenerar tipos con
  `npm run db:generate` cuando aplique.
- Para cambios solo Markdown no hace falta correr test suite.

## Variables de entorno

Ver `.env.example` como fuente base. Variables criticas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `CRON_SECRET`
- `OPENAI_API_KEY`
- `WEBHOOK_SECRET_ENCRYPTION_KEY`
- Mercado Pago envs
- AFIP envs/config por tenant
- VAPID/web push
- Manychat/Callbell/Emilia segun integracion

`DISABLE_AUTH=true` es solo desarrollo local.

## Documentacion y estado

Documentos utiles:

- `docs/README.md`
- `docs/architecture/AUDITORIA_ARQUITECTURA_AGENTS.md`
- `docs/runbooks/BUGS-TRIAGE.md`
- `docs/runbooks/HANDOVER.md`
- `docs/testing/testing-railway-migration.md`
- `docs/testing/GUIA_TESTING.md`
- `docs/setup/CONFIGURACION_SUPABASE.md`

`README.md` y algunas guias Trello pueden estar desactualizadas. Verificar contra
codigo antes de usarlas como fuente.

No crear Markdown suelto en la raiz salvo `README.md`, `AGENTS.md`, `CLAUDE.md`
u otro archivo requerido por una herramienta. Para nuevos documentos, seguir el
scaffold de `docs/README.md`.

## Debugging rapido

- 403: revisar `user.org_id`, role, `additional_roles`, matriz dinamica,
  `agency_role_permissions`, `getUserAgencyIds` y filtros por agencia.
- Datos de otro tenant: buscar queries sin `.eq("org_id", user.org_id)` o uso
  indebido de `createAdminClient()`.
- Billing/paywall: revisar `organizations.subscription_status`,
  `current_period_ends_at`, `trial_ends_at`, middleware y `lib/billing/guard.ts`.
- Cron 401: revisar `CRON_SECRET` en app principal y Railway Cron Service;
  `checkCronAuth` loguea diagnostico seguro.
- Ledger/caja inconsistente: revisar `payments`, `ledger_movements`,
  `cash_movements`, `operator_payments`, counterparts y journal entries.
- AFIP: revisar `lib/afip/check-org-health.ts`, settings de org/agencia y logs de
  invoices.
