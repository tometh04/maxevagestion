# Auditoria de arquitectura y AGENTS.md

Fecha de inspeccion: 2026-07-02  
Repo: `maxevagestion` / producto actual observado: Vibook / MAXEVA Gestion / ERP Lozada legacy

## 1. Resumen ejecutivo

`AGENTS.md` describe una foto valida para una etapa anterior del proyecto: un ERP de agencia de viajes centrado en Trello, operaciones, caja, contabilidad y comisiones. El repo actual conserva ese nucleo, pero ya no es solo eso. La arquitectura real evoluciono hacia un SaaS multi-tenant llamado Vibook, con billing/paywall, platform admin, integraciones server-to-server, permisos dinamicos por agencia, roles multiples, feature flags por tenant, AFIP, WhatsApp/WHA Control, Emilia/Eve, soporte, imports masivos y hardening de RLS.

La guia actual sigue siendo util para entender el dominio historico, pero es peligrosa como guia operativa unica porque omite reglas criticas que hoy previenen leaks cross-tenant y errores contables:

- `org_id` es obligatorio en casi todos los flujos user-facing.
- `SUPER_ADMIN` ya no significa "ver todo el mundo"; normalmente significa owner/admin dentro de un tenant. El acceso global real vive en `platform_admins`.
- Los permisos no son solo `lib/permissions.ts`; tambien existen permisos dinamicos por agencia en `lib/permissions-agency.ts`.
- `createAdminClient()` bypass RLS y esta gobernado por allowlist en `scripts/admin-client-allowlist.txt`.
- Trello aparece en docs y columnas legacy, pero el codigo activo favorece Manychat/Callbell/ChateSell/Eve y `org_integrations`.
- Hay billing y paywall por Mercado Pago, con guard en middleware y layout.
- Muchos endpoints hacen side effects contables y no son transaccionales; la guia deberia exigir idempotencia, CAS guards y tests en esos cambios.

Recomendacion principal: reemplazar `AGENTS.md` por una version multi-tenant-first y mover la historia Trello a seccion legacy. No conviene borrar toda la informacion anterior, pero si reordenarla: seguridad, tenancy, permisos, service-role y contabilidad deben ir arriba.

## 2. Hechos observados del repo

### 2.1 Stack y comandos reales

El `package.json` declara:

- Next.js `^15.5.15`, React 18, TypeScript 5.
- Supabase SSR/client, shadcn/Radix, TailwindCSS.
- OpenAI, Mercado Pago propio via `fetch`, AFIP SDK, web-push, XLSX, PDF libs, Playwright y Jest.
- `npm run dev` usa `next dev -p 3067`.
- `npm start` usa `next start -p 3005`.
- `npm run lint` ejecuta `next lint && npm run check:admin-client`.
- `npm run check:admin-client` llama `scripts/check-admin-client.sh`.
- `npm run db:generate` escribe tipos en `lib/supabase/types.ts`.

Desvio contra `AGENTS.md`:

- `AGENTS.md` dice dev server puerto `3044`; el repo usa `3067`.
- `README.md` tambien esta viejo: menciona Next 14, Trello activo y localhost 3000.
- `AGENTS.md` dice Next.js 14+ en una parte y 15+ en otra; el package real es Next 15.

### 2.2 Tamano y superficie

Conteos observados:

- 332 route handlers en `app/api`.
- 284 migraciones SQL en `supabase/migrations`.
- 110 archivos de test detectados.
- 161 usos de `request.json()` en API routes.
- Mas de 4.000 matches de `any` en `app`, `lib` y `components`.
- El repo tiene `admin`, `onboarding`, `paywall`, `cotizacion`, dashboard, APIs publicas y webhooks.

Esto no es un ERP pequeno con algunos modulos: es una aplicacion SaaS con mucha superficie operacional y de seguridad.

## 3. Arquitectura real

### 3.1 Capas principales

La app se organiza en estas capas:

- `app/(auth)`: login, registro, reset password, accept invite.
- `app/(dashboard)`: aplicacion principal protegida del tenant.
- `app/admin`: consola global de plataforma, separada de roles tenant.
- `app/onboarding` y `app/paywall`: onboarding, plan, checkout, retorno de Mercado Pago y bloqueo por suscripcion.
- `app/cotizacion` y `app/api/public`: vistas y endpoints publicos por token.
- `app/api`: superficie grande de negocio, webhooks, crons, imports, billing, admin, AI y public APIs.
- `components`: UI por dominio, con `components/ui` como base shadcn.
- `lib`: servicios de dominio, permisos, Supabase, integraciones, contabilidad, billing, AFIP, AI, imports y seguridad.
- `supabase/migrations`: historia extensa de schema, RLS, SaaS, billing, integraciones y hardening.

### 3.2 Layout y guards

`app/(dashboard)/layout.tsx` aplica una arquitectura de guard por capas:

- `assertSubscriptionActive()` desde `lib/billing/guard.ts` bloquea server-side si la suscripcion no permite acceso.
- `getCurrentUser()` carga usuario y roles.
- `getUserAgencies()` y `getUserAgencyIds()` calculan alcance.
- `resolveUserPermissions()` carga matriz dinamica por agencia.
- `AppSidebar` filtra navegacion por permisos resueltos.
- Se montan managers globales: tareas, push notifications, performance logger, Tawk, onboarding tour y check-in reminder.

`middleware.ts` agrega otra capa:

- Redirect 301 de dominio legacy `maxevagestion.com` a `app.vibook.ai`.
- Excepciones publicas para webhooks/public/cotizacion.
- Rate limit in-memory por user o IP.
- Refresh de Supabase session.
- Onboarding gate si el user no tiene `org_id`.
- Paywall gate por estado de suscripcion.
- Guard anti-flash para `/admin`.

`app/admin/layout.tsx` valida `isPlatformAdmin()`. Esto es importante: el admin global no depende de `users.role`.

### 3.3 Multi-tenant como eje central

El repo actual esta marcado por un incidente cross-tenant documentado en `docs/runbooks/BUGS-TRIAGE.md`. La regla actual no puede ser "RLS alcanza". El patron real es defense-in-depth:

1. RLS en Supabase.
2. Filtro explicito por `org_id` en endpoints user-facing.
3. Filtro por agencias accesibles cuando aplica.
4. Permisos por rol y por matriz dinamica.
5. Allowlist para service role.
6. Audit/security logs para eventos sensibles.

Archivos clave:

- `lib/auth.ts`
- `lib/supabase/server.ts`
- `lib/supabase/scoped-client.ts`
- `lib/supabase/admin-scope.ts`
- `lib/permissions.ts`
- `lib/permissions-api.ts`
- `lib/permissions-agency.ts`
- `lib/security/audit.ts`
- `scripts/admin-client-allowlist.txt`

## 4. Autenticacion, roles y permisos

### 4.1 `getCurrentUser()`

`lib/auth.ts`:

- Usa `React.cache` por request.
- Devuelve user DB mas `roles`, fusionando `role` y `additional_roles`.
- Tiene bypass local con `DISABLE_AUTH=true` solo en `NODE_ENV=development`.
- Ignora la flag en production y `instrumentation.ts` falla si `DISABLE_AUTH=true` fuera de development.
- El mock dev usa un user real con `org_id` real para no romper FKs y features.

Desvio contra `AGENTS.md`:

- La guia dice que el bypass "TODO: remove before production"; el codigo ya tiene mitigaciones fuertes para production.
- El mock ya no es generico; depende de IDs reales.

### 4.2 Roles reales

`AGENTS.md` lista:

- `SUPER_ADMIN`
- `ADMIN`
- `CONTABLE`
- `SELLER`
- `VIEWER`

El repo real agrega:

- `ORG_OWNER`
- `POST_VENTA`
- `additional_roles`
- fusion multi-rol en `mergeRolePermissions`
- `getEffectiveAgencyScopeRole`
- `shouldShowInSidebarMulti`

`ORG_OWNER` es alias de `SUPER_ADMIN` para tenants SaaS. `POST_VENTA` tiene permisos especificos para seguimiento post-cierre.

### 4.3 Permisos estaticos y dinamicos

`lib/permissions.ts` contiene defaults estaticos por modulo. Pero la capa real para APIs nuevas o criticas es:

- `getUserAgencyIds()`
- `resolveUserPermissions()`
- `canPerformAction(user, module, permission, perms)`
- `checkResolvedPermission()`
- `applyLeadsFilters()`
- `applyOperationsFilters()`
- `applyCustomersFilters()`

La matriz dinamica vive en `agency_role_permissions` y se combina con defaults. Por eso una instruccion de `AGENTS.md` que diga "usar canPerformAction(role, module, permission)" es incompleta: el helper real de APIs recibe `user`, no solo `role`, y puede recibir matriz resuelta.

## 5. Supabase y service role

### 5.1 Clientes

Patron real:

- Browser: `lib/supabase/client.ts`, `createBrowserClient`.
- Server/auth-aware: `createServerClient()` en `lib/supabase/server.ts`.
- Admin/service-role: `createAdminClient()` en `lib/supabase/server.ts`.
- Scope admin por tenant: `createOrgAdminScope(orgId)` en `lib/supabase/admin-scope.ts`.
- Contexto tenant: `getScopedContext()` en `lib/supabase/scoped-client.ts`.

### 5.2 Regla critica de `createAdminClient()`

`createAdminClient()` bypasea RLS. El repo tiene una allowlist explicita:

- `scripts/admin-client-allowlist.txt`
- `npm run check:admin-client`
- `npm run lint` lo ejecuta como parte del lint.

Categorias permitidas:

- `AUTH`
- `BILLING`
- `CRON`
- `PLATFORM_ADMIN`
- `WEBHOOK_S2S`
- `IMPORT`
- `STORAGE`
- `WRITE_VALIDATED`
- `LIB`
- otras categorias documentadas.

La guia actual solo dice "never use service role on client". Eso es cierto pero insuficiente. La regla importante es:

- No usar `createAdminClient()` en user-facing routes salvo justificacion y allowlist.
- Si hay tenant conocido, preferir `createOrgAdminScope(orgId)` o filtros `.eq("org_id", orgId)`.
- Si se usa admin client por webhook/cron/admin, el caller debe inyectar o resolver `org_id` de forma confiable.

## 6. API route patterns reales

### 6.1 Patron user-facing recomendado observado

El patron mas seguro para endpoints de negocio es:

1. `const { user } = await getCurrentUser()`.
2. Rechazar si falta `user.org_id`.
3. `const supabase = await createServerClient()`.
4. Resolver `agencyIds` con `getUserAgencyIds()`.
5. Resolver permisos dinamicos con `resolveUserPermissions()`.
6. Validar accion con `canPerformAction()` o `checkResolvedPermission()`.
7. Aplicar `.eq("org_id", user.org_id)` en queries sobre tablas tenant-scoped.
8. Aplicar `.in("agency_id", agencyIds)` cuando el recurso es multi-agencia.
9. Para writes sensibles, usar rate limit e idempotencia.
10. Para side effects financieros, no silenciar errores criticos sin alerta/audit.

Ejemplos representativos:

- `app/api/leads/route.ts`
- `app/api/operations/route.ts`
- `app/api/payments/route.ts`
- `app/api/payments/mark-paid/route.ts`
- `app/api/cash/movements/route.ts`
- `app/api/accounting/ledger/route.ts`

### 6.2 Webhooks y public APIs

Los webhooks no tienen user session. El patron real es:

- Resolver org por token/header/config.
- Verificar firma o secret.
- Usar `createAdminClient()` por ser server-to-server.
- Insertar `webhook_event_log` para idempotencia.
- Delegar a handler de integracion.

Ejemplo moderno:

- `app/api/integrations/manychat/[token]/webhook/route.ts`
- `lib/integrations/hmac.ts`
- `lib/integrations/secrets.ts`

Legacy:

- `app/api/webhooks/manychat/route.ts` usa `X-API-Key`; tiene timing-safe compare, pero no HMAC/replay protection. `docs/runbooks/BUGS-TRIAGE.md` ya lo marca como deuda.

### 6.3 Cron jobs

El patron real esta en `lib/cron/auth.ts`:

- Todos los crons esperan `Authorization: Bearer $CRON_SECRET`.
- El helper loguea diagnostico sin exponer secrets.
- Los crons usan admin client por ser cross-tenant.

`AGENTS.md` menciona 7 endpoints, pero el repo tiene mas:

- `alerts`
- `apply-pricing-changes`
- `apply-scheduled-downgrades`
- `audit-operator-debt-drift`
- `billing-reconcile`
- `callbell-reconcile`
- `classify-quotation-pdfs`
- `exchange-rates`
- `generate-monthly-commissions`
- `notifications`
- `payment-reminders`
- `recurring-payments`
- `task-reminders`
- `trial-reminders`
- `whatsapp`

## 7. Dominio funcional actual

### 7.1 Nucleo ERP

El nucleo que `AGENTS.md` describe sigue existiendo:

- Leads/CRM.
- Operaciones.
- Clientes.
- Operadores.
- Pagos.
- Caja.
- Contabilidad.
- IVA/impuestos.
- Comisiones.
- Documentos y OCR.
- Alertas.
- Reportes.

Pero los detalles cambiaron:

- Operaciones soportan multiples operadores, servicios, itinerarios, codigos de reserva y billing margin.
- Pagos tienen aprobaciones, idempotency key, operator payment links, counterparts, FX y percepciones.
- Contabilidad incluye chart of accounts, journal entries, reversals, withholdings, partner accounts, monthly position y libro IVA digital.
- Clientes tienen settings, segmentos, interacciones y `created_by`.
- CRM Manychat avanzado existe junto a leads legacy.

### 7.2 SaaS / billing

Este subsistema no aparece en `AGENTS.md` con suficiente peso.

Archivos clave:

- `lib/billing/plans.ts`
- `lib/billing/guard.ts`
- `lib/billing/state-machine.ts`
- `lib/billing/limits.ts`
- `app/api/billing/*`
- `app/onboarding/billing/*`
- `app/paywall/page.tsx`
- `app/(dashboard)/settings/subscription/page.tsx`

Patrones:

- Planes `STARTER`, `PRO`, `ENTERPRISE`, con `STARTER` legacy oculto.
- Mercado Pago preapproval.
- `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, `SUSPENDED`, `PENDING_PAYMENT`.
- Grace period para `PAST_DUE`.
- `assertSubscriptionActive()` en layout.
- `checkLimit()` para limites por plan.

### 7.3 Platform admin

`app/admin` es una aplicacion interna separada:

- Organizaciones.
- Metricas.
- Billing.
- Tickets soporte.
- Audit log.
- Acciones destructivas de tenant.

Autorizacion:

- `platform_admins` table.
- `isPlatformAdmin()`.
- No confundir con `SUPER_ADMIN` tenant.

### 7.4 Integraciones activas

El repo actual incluye:

- Manychat advanced/legacy.
- Callbell.
- ChatSell.
- Eve inbound.
- Emilia / Vibook travel search y chat en lead.
- WHA Control.
- WhatsApp messages/templates.
- Mercado Pago.
- AFIP.
- OpenAI.
- Web push.
- Tawk allowlist.

Trello queda como legacy:

- Columnas `trello_url`, `trello_list_id`, `trello_full_data`.
- Tabla `settings_trello`.
- Referencias UI residuales.
- No existe `lib/trello`.
- No existe `app/api/trello` en el estado inspeccionado.
- `docs/runbooks/BUGS-TRIAGE.md` dice que Trello ya no es integracion activa y que Manychat es el canal real.

## 8. Contabilidad y finanzas

### 8.1 Ledger

`lib/accounting/ledger.ts` sigue siendo el corazon contable, pero su contrato real incluye SaaS:

- `createLedgerMovement()` recibe `supabase`.
- No obtiene admin client internamente.
- Deriva `org_id` desde `operation_id`, `lead_id` o `created_by`.
- Falla si no puede resolver `org_id`.
- Invalida cache de balance.
- Puede disparar marcado de comisiones si el tipo es `COMMISSION`.

`AGENTS.md` dice "double-entry bookkeeping via ledger_movements", pero en el codigo real hay una mezcla:

- `ledger_movements` funciona como libro mayor operativo.
- `journal_entries` anota asientos contables.
- `payment-counterparts` crea movimientos contraparte.
- Algunos side effects estan en try/catch no bloqueante.

La guia deberia ser mas precisa: todo cambio financiero debe identificar que tablas toca y que invariantes quedan consistentes si falla un paso.

### 8.2 Pagos

`app/api/payments/route.ts` y `app/api/payments/mark-paid/route.ts` concentran mucha complejidad:

- idempotency key.
- aprobaciones.
- operator payments.
- customer income FX.
- cuentas financieras.
- ledger movement principal.
- counterpart movement.
- journal entry.
- withholdings/percepciones.
- WhatsApp/seller receipt.
- rate limit.
- CAS update en mark-paid.

Riesgo: es una zona de alta criticidad y alta complejidad. `AGENTS.md` deberia exigir tests focalizados y revisar transaccionalidad/idempotencia antes de tocarla.

### 8.3 Multi-currency

El repo ya tiene varias utilidades:

- `lib/accounting/exchange-rates.ts`
- `lib/accounting/fx.ts`
- `lib/payments/customer-income-fx.ts`
- `lib/currency.ts`

Pero hay deuda documentada en reports multi-currency. Cambios en reportes, caja, operadores o monthly position deben revisar moneda de venta, moneda de costo, TC real de pago y `amount_usd`.

## 9. UI, frontend y componentes

### 9.1 shadcn/ui y realidad del repo

`components.json` confirma shadcn/ui con aliases:

- `@/components/ui`
- `@/lib/utils`

`AGENTS.md` dice "ONLY use shadcn/ui components" y "Do NOT create custom UI primitives". En el repo real:

- Hay muchos componentes shadcn en `components/ui`.
- Tambien hay muchos `<button>`, `<input>`, `<select>` y `<textarea>` nativos fuera de `components/ui`.
- Hay UI custom en admin, onboarding, support, tasks, quotation, WHA, etc.

Recomendacion: cambiar la regla a:

- Preferir shadcn/ui para controles comunes.
- No crear primitivas duplicadas si ya existe una en `components/ui`.
- Es aceptable usar elementos nativos cuando el patron local ya lo hace o cuando es una pieza muy especifica.
- Mantener tokens de Tailwind/CSS variables del sistema.

### 9.2 Branding y theme

El sistema de diseno actual incluye:

- Tokens Vibook en `app/globals.css`.
- `dark` theme.
- `.light-force` para admin.
- Variables `accent-teal`, `accent-violet`, `accent-coral`, etc.
- Gradientes de marca.
- Sidebar shadcn.

`AGENTS.md` no describe esta capa. Para futuros cambios UI, hay que respetar tokens y no inventar paletas locales.

### 9.3 Navegacion actual

`components/app-sidebar.tsx` define top-level:

- Resumen.
- CRM Ventas.
- Clientes.
- Operaciones.
- Finanzas.
- Herramientas.
- Agente IA.
- Cerebro.

La visibilidad se decide por permisos dinamicos. Eve ademas tiene gate temporal por email.

## 10. AI / Cerebro

`app/api/ai/route.ts`:

- Usa `gpt-4o`.
- Tiene `DATABASE_SCHEMA` hardcodeado.
- Usa tool `execute_query`.
- Ejecuta RPC `execute_readonly_query`.
- Construye prompt con filtro obligatorio de `org_id`.
- Rechaza si el user no tiene `org_id`.

Esto es mas riesgoso que la descripcion de `AGENTS.md` sobre "function calling con tools". Hay un LLM generando SQL. Aunque hay mitigaciones, el riesgo de prompt injection y schema stale esta documentado en `docs/runbooks/BUGS-TRIAGE.md`.

Recomendacion:

- Para cambios en AI, preferir tools curados de `lib/ai/tools.ts`.
- No ampliar SQL libre sin allowlists.
- Mantener filtro `org_id` no negociable.
- Regenerar o desacoplar schema hardcodeado si se toca ese endpoint.

## 11. Testing y calidad

### 11.1 Tests existentes

Hay tests en:

- `lib/accounting/__tests__`
- `lib/alerts/__tests__`
- `lib/commissions/__tests__`
- `lib/billing/*.test.ts`
- `lib/import/schemas/*.test.ts`
- `lib/__tests__`
- algunos route tests en `app/api/.../__tests__`

`jest.config.js` incluye:

- `lib/**/*`
- `app/api/**/*`
- ignora `.worktrees`, `.next`, `node_modules`.

### 11.2 Brechas

- Muchas APIs parsean body manualmente.
- Zod existe en `lib/validation.ts` y en imports, pero no esta aplicado de forma uniforme.
- Muchos endpoints criticos son largos y dificiles de testear.
- La cobertura esta mejor que lo que dice `AGENTS.md`, pero sigue concentrada en libs y no necesariamente en flujos E2E.

Recomendacion para guia:

- Cambios en contabilidad, pagos, permissions, billing o tenancy requieren tests.
- Cambios en endpoints user-facing deben incluir caso "otro tenant no accede".
- Cambios con `createAdminClient()` deben pasar `npm run check:admin-client`.
- Cambios en migraciones deben considerar `npm run db:generate`.

## 12. Comparacion directa contra AGENTS.md

| Tema | AGENTS.md dice | Repo real | Accion recomendada |
|---|---|---|---|
| Producto | MAXEVA Gestion ERP | Vibook SaaS + ERP legacy | Reescribir overview |
| Dev port | 3044 | 3067 | Corregir comando |
| Next | 14+/15+ mixto | 15.5.15 | Declarar Next 15 |
| Trello | Integracion activa bidireccional | Legacy/residual, Manychat activo | Mover Trello a legacy |
| Roles | 5 roles | 7 roles + multi-rol | Actualizar RBAC |
| SUPER_ADMIN | full access global implicito | tenant admin; platform global separado | Explicar `platform_admins` |
| Permisos | `canPerformAction(role, module, permission)` | permisos dinamicos por agencia | Documentar matrix |
| Tenancy | menciones parciales | `org_id` es regla central | Subir a regla #1 |
| Service role | no usar en cliente | allowlist + categorias | Documentar policy real |
| Cron | 7 endpoints | 15 aprox | Actualizar lista o referir a folder |
| Billing | casi ausente | subscripcion/paywall/MP | Agregar seccion |
| UI | solo shadcn literal | shadcn + custom local | Ajustar regla |
| Type safety | no `any` | miles de `any` por deuda | Mantener aspiracion, no negar realidad |
| Audit logs | TODO | `audit_log` y `security_audit_log` existen | Actualizar |
| Rate limiting | TODO | middleware + helper in-memory | Actualizar y marcar limitacion |

## 13. Riesgos principales

### P0/P1 persistentes por historia del repo

El repo ya paso por incidentes cross-tenant. Cualquier cambio que remueva o saltee filtros `org_id` puede reabrirlos.

Regla: ningun endpoint user-facing debe depender solo de RLS si puede filtrar explicitamente.

### Service role

`createAdminClient()` es necesario para cron, billing, webhooks y platform admin, pero cada uso nuevo debe ser sospechoso por defecto. El allowlist existe porque el riesgo ya fue identificado.

### Endpoints "god files"

Rutas como pagos y operaciones concentran demasiada logica. Cambios pequenos pueden afectar ledger, caja, comisiones, alertas, WhatsApp y reportes.

### Side effects no atomicos

Hay varios try/catch que loguean y continuan. Eso puede estar bien para notificaciones, pero no para invariantes financieras. Antes de tocar esos flujos, definir que fallas son bloqueantes y cuales son warnings.

### AI SQL

El endpoint de AI ejecuta SQL generado por LLM via RPC. Aunque es readonly y filtra por prompt, la superficie es sensible. No ampliar sin hardening.

### Documentacion desactualizada

`AGENTS.md`, `README.md` y docs de Trello/estado mezclan epocas. Para un agente nuevo, esto crea decisiones equivocadas.

## 14. Propuesta para AGENTS.md actualizado

Esta seccion esta escrita como contenido base para reemplazar o rehacer `AGENTS.md`.

```md
# AGENTS.md

Guia para trabajar en este repo. La fuente de verdad es el codigo actual, no docs legacy.

## Proyecto

Vibook / MAXEVA Gestion es un SaaS multi-tenant para agencias de viajes. Conserva el ERP historico de leads, operaciones, pagos, caja, contabilidad, comisiones y alertas, pero hoy tambien incluye billing/paywall por Mercado Pago, platform admin, integraciones Manychat/Callbell/ChateSell/Eve, Emilia, AFIP, soporte, imports masivos y feature flags por tenant.

## Comandos

- `npm run dev`: Next dev server en puerto 3067.
- `npm start`: production server en puerto 3005.
- `npm run build`: build production.
- `npm run lint`: Next lint + check de allowlist de admin client.
- `npm run check:admin-client`: valida usos de `createAdminClient`.
- `npm run test`: Jest.
- `npm run test:coverage`: coverage.
- `npm run db:generate`: regenera `lib/supabase/types.ts`.
- `npm run db:seed` / `npm run db:seed:mock`: seeds.
- `npm run db:check`: verifica tablas.

## Reglas no negociables

1. Multi-tenant first: todo endpoint user-facing debe exigir `user.org_id` y filtrar por `org_id` explicitamente cuando la tabla lo tenga.
2. No confiar solo en RLS. RLS es una capa, no la unica capa.
3. `SUPER_ADMIN` es admin/owner del tenant, no platform admin global. Acceso global usa `platform_admins` + `isPlatformAdmin`.
4. `createAdminClient()` bypasea RLS. No usarlo en rutas user-facing salvo caso justificado, allowlist y scope explicito.
5. Si hay tenant conocido y se necesita service role, preferir `createOrgAdminScope(orgId)` o writes con `org_id` inyectado.
6. En writes financieros usar idempotencia, CAS guards y tests.
7. En pagos, caja, ledger, operator payments, FX, IVA, comisiones y billing, no silenciar errores que dejan datos inconsistentes.
8. No exponer service role ni secrets en cliente.

## Auth, roles y permisos

Usar `getCurrentUser()` desde `lib/auth.ts`.

Roles actuales:

- `SUPER_ADMIN`
- `ORG_OWNER`
- `ADMIN`
- `CONTABLE`
- `SELLER`
- `VIEWER`
- `POST_VENTA`

El user puede tener `additional_roles`; `getCurrentUser()` expone `user.roles`.

Para APIs:

- `getUserAgencyIds(supabase, user.id, effectiveRole)`
- `resolveUserPermissions(supabase, user.id, user.org_id, user.roles ?? user.role, agencyIds)`
- `canPerformAction(user, module, permission, perms)`
- `checkResolvedPermission(perms, module, permission)`

Para sidebar/UI usar permisos resueltos cuando esten disponibles.

## Supabase

Server:

```ts
import { createServerClient } from "@/lib/supabase/server"
const supabase = await createServerClient()
```

Browser:

```ts
import { supabase } from "@/lib/supabase/client"
```

Admin/service role:

```ts
import { createAdminClient } from "@/lib/supabase/server"
```

Usar admin client solo en categorias legitimas: cron, webhook server-to-server, platform admin, auth/onboarding pre-session, billing, imports validados, storage o libs internas auditadas. Todo uso nuevo debe agregarse a `scripts/admin-client-allowlist.txt` con justificacion.

## Patron de API route user-facing

```ts
export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organizacion asociada" }, { status: 400 })
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

  if (!canPerformAction(user, "operations", "write", perms)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Parsear y validar body. Preferir Zod para endpoints nuevos.
  // Toda query tenant-scoped debe llevar .eq("org_id", user.org_id).
}
```

## Webhooks

Webhooks no tienen session. Resolver org por token/config, verificar firma/secret, usar admin client solo server-side, registrar idempotencia y pasar `org_id` al handler.

Preferir HMAC (`lib/integrations/hmac.ts`) y secrets encriptados (`lib/integrations/secrets.ts`). El endpoint Manychat legacy con `X-API-Key` existe pero no debe ser modelo para integraciones nuevas.

## Cron

Todos los crons bajo `/api/cron/*` deben usar `checkCronAuth(request, name)` con `Authorization: Bearer $CRON_SECRET`. Crons son cross-tenant por diseno y pueden usar admin client, pero cada insert/update debe preservar `org_id`.

## Billing y paywall

El acceso al dashboard esta protegido por:

- middleware
- `assertSubscriptionActive()` en layout
- RLS/tenant isolation

Plan y estado se manejan en `lib/billing/*`. Cambios de billing deben cubrir tests de state machine y casos Mercado Pago.

## Contabilidad y pagos

`lib/accounting/ledger.ts` es la entrada principal para ledger movements. El caller debe pasar el cliente Supabase correcto y asegurar que `org_id` pueda resolverse.

Antes de cambiar pagos o caja, revisar:

- `app/api/payments/route.ts`
- `app/api/payments/mark-paid/route.ts`
- `lib/accounting/payment-counterparts.ts`
- `lib/accounting/operator-payment-settlement.ts`
- `lib/accounting/journal-entries.ts`
- `lib/accounting/fx.ts`
- `lib/accounting/withholding-rules.ts`

Cambios en estos flujos requieren tests y revision de idempotencia.

## Integraciones

Activas/relevantes:

- Manychat / CRM advanced.
- Callbell.
- ChatSell.
- Eve.
- Emilia.
- WHA Control.
- WhatsApp.
- Mercado Pago.
- AFIP.
- OpenAI.

Trello es legacy/residual: quedan columnas y docs, pero no tomarlo como arquitectura activa salvo que el codigo actual lo demuestre.

## UI

Preferir componentes de `components/ui` y tokens de `app/globals.css` / `tailwind.config.js`. No duplicar primitivas que ya existen. Es aceptable usar elementos nativos cuando el patron local lo hace o la interaccion lo justifica.

Respetar branding Vibook, dark mode y `.light-force` para admin.

## Validacion y tests

Preferir Zod para endpoints nuevos o modificados. Si el endpoint actual parsea manualmente, no ampliar deuda sin razon.

Ejecutar tests focalizados:

- permisos/tenancy: `lib/__tests__/permissions*.test.ts`
- contabilidad: `lib/accounting/__tests__`
- billing: `lib/billing/*.test.ts`
- imports: `lib/import/schemas/*.test.ts`
- route tests existentes si se toca su ruta

Siempre correr `npm run check:admin-client` si se toca `createAdminClient`.
```

## 15. Recomendaciones de mantenimiento

### Corto plazo

- Reemplazar `AGENTS.md` con la propuesta anterior, ajustando tono y longitud.
- Actualizar `README.md` o marcarlo como legacy.
- Agregar una nota fuerte: Trello legacy, Manychat activo.
- Corregir puerto de dev.
- Agregar seccion "Platform admin != tenant SUPER_ADMIN".

### Mediano plazo

- Crear helper comun `withApiHandler` o `withScopedApi` para reducir repeticion de auth, org, agencyIds, permisos, rate limit y error shape.
- Consolidar validacion Zod en endpoints nuevos.
- Extraer `createOperation` y `settlePayment` fuera de route handlers largos.
- Reemplazar SQL libre de AI por tools curados o allowlist fuerte.
- Documentar invariantes contables en una pagina especifica.

### Largo plazo

- Redis-backed rate limiting si Railway escala multiples instancias.
- Transacciones/RPC atomicas para pagos + ledger + counterpart + FX + withholdings.
- Deprecacion formal de Trello residual.
- Manifest central de tablas tenant-scoped con `org_id`, `agency_id`, `seller_id` para automatizar filtros.

## 16. Como trabaja tecnicamente la arquitectura

### 16.1 Ciclo de request en dashboard

El flujo normal de una navegacion autenticada pasa por varias capas:

1. `middleware.ts` corre primero:
   - redirige dominio legacy,
   - excluye rutas publicas/webhooks,
   - refresca sesion Supabase,
   - aplica rate limit in-memory,
   - evalua onboarding/paywall,
   - bloquea `/admin` para no platform admins.
2. El layout de `app/(dashboard)` ejecuta guard server-side:
   - `assertSubscriptionActive()` revalida acceso por suscripcion,
   - `getCurrentUser()` obtiene usuario y roles,
   - `getUserAgencies()` / `getUserAgencyIds()` resuelven alcance,
   - `resolveUserPermissions()` arma la matriz de permisos,
   - `AppSidebar` recibe permisos ya resueltos.
3. La pagina server component carga datos iniciales o delega a un client component.
4. Los client components llaman endpoints bajo `app/api`.
5. Cada endpoint debe repetir las validaciones criticas: auth, `org_id`, permisos,
   filtros tenant/agency y validacion de payload.

Este doble chequeo no es redundante accidental: es defense-in-depth. El
middleware puede fallar o ser bypasseado por bugs de framework; por eso el layout
y las APIs no deben confiar en que el request ya fue "limpiado".

### 16.2 Ciclo de request en `/admin`

`app/admin/layout.tsx` no usa roles tenant. Valida:

- `getCurrentUser()`.
- `createServerClient()`.
- `isPlatformAdmin(supabase, user.id)`.

Luego renderiza una app administrativa global con theme forzado claro
(`.light-force`). Cualquier accion admin que opere sobre un tenant debe recibir
un `orgId` explicito y usar admin client con scope/intencion clara. El riesgo en
admin no es "seller ve lo propio", sino cross-org por diseno: cada endpoint debe
proteger que solo platform admins accedan.

### 16.3 Ciclo de webhook

Los webhooks modernos no pasan por `getCurrentUser()`:

- La org se resuelve por token en URL o external reference.
- El body crudo se usa para HMAC cuando aplica.
- Secrets se almacenan cifrados con AES-256-GCM.
- Se registra idempotencia en `webhook_event_log`.
- Se usa `createAdminClient()` porque no hay JWT de usuario.
- El handler debe escribir con `org_id` resuelto, nunca desde el body sin validar.

El endpoint legacy `app/api/webhooks/manychat/route.ts` usa API key estatica y
timing-safe compare. Esta mejor que un string compare comun, pero no tiene el
mismo nivel que HMAC + token per-tenant + replay/idempotency moderno.

### 16.4 Ciclo de cron

Los crons son POST con Bearer auth. El helper central es `checkCronAuth()`.
Despues de autenticar:

- el cron usa admin client,
- procesa uno o varios tenants,
- debe preservar `org_id` en cada insert/update,
- debe loguear diagnostico suficiente sin exponer secrets.

El patron correcto es "cross-tenant intencional", no "sin tenant".

## 17. Auditoria frontend y UI

### 17.1 Composicion del frontend

El frontend combina Server Components y Client Components:

- Server Components en pages/layouts para auth, guards, queries iniciales y
  redirects.
- Client Components para dialogs, formularios, tablas interactivas, kanban,
  builders de cotizacion, chats, tareas y dashboards vivos.
- Componentes por dominio bajo `components/<modulo>`.
- Primitivas UI bajo `components/ui`.

La navegacion principal vive en `components/app-sidebar.tsx`. No es una lista
estatica simple: filtra por permisos resueltos, oculta herramientas segun rol y
usa un gate temporal por email para Eve.

### 17.2 Sistema visual

El sistema visual real ya no es "shadcn default":

- `app/globals.css` define tokens de marca Vibook.
- `tailwind.config.js` expone colores semanticos y gradientes.
- Hay dark mode con clase `.dark`.
- Hay `.light-force` para forzar admin claro.
- El layout dashboard usa `SidebarProvider`, `SidebarInset`, `SiteHeader`,
  banners de suscripcion/trial y managers globales.

Regla tecnica para cambios UI: usar tokens semanticos y patrones existentes. No
meter colores directos ni crear una mini design system por modulo.

### 17.3 shadcn/ui vs realidad del repo

`AGENTS.md` viejo decia "ONLY use shadcn/ui". En la practica:

- `components/ui` es la base recomendada.
- Muchos componentes de dominio usan elementos nativos (`button`, `input`,
  `select`) por historia o necesidad.
- Admin y onboarding tienen bastante UI custom.

La regla correcta no deberia ser literalista. Debe decir:

- preferir shadcn/ui para controles comunes,
- no duplicar primitivas existentes,
- respetar patrones locales,
- aceptar markup nativo cuando sea especifico y consistente.

### 17.4 Riesgos frontend

- God components grandes como builders/dialogs son dificiles de testear.
- Algunos estados financieros se calculan tanto en client como server.
- El sidebar depende de permisos resueltos; cambios de modulo deben actualizar
  tipos, permisos y navegacion juntos.
- Branding cacheado en localStorage debe estar scopeado por `org_id`; el repo ya
  tuvo comentarios/fixes para evitar leakage visual entre tenants.

## 18. Auditoria backend y API

### 18.1 Forma actual del backend

El backend es mayormente Next Route Handlers en `app/api`. No hay una capa unica
de controller/service para todos los modulos. Hay rutas muy delgadas y rutas muy
largas con mucha orquestacion.

Patrones positivos:

- Auth central con `getCurrentUser()`.
- Helpers de permisos y agency scope.
- Helpers de billing, cron auth, service-role allowlist.
- Servicios de dominio en `lib/accounting`, `lib/billing`, `lib/payments`,
  `lib/integrations`, etc.
- Tests unitarios en areas criticas.

Patrones debiles:

- Muchos endpoints parsean `request.json()` manualmente.
- Zod existe, pero no se aplica consistentemente.
- Algunas rutas mezclan validacion, permisos, queries, calculos, writes,
  notificaciones y auditoria en el mismo archivo.
- La transaccionalidad financiera depende de secuencias de writes y try/catch.

### 18.2 API user-facing

La API user-facing debe cumplir cuatro scopes a la vez:

- tenant (`org_id`),
- agencia (`agency_id`) cuando el modulo lo requiere,
- rol/permisos,
- propiedad del recurso para sellers u otros roles restringidos.

El patron viejo "si SELLER filtrar por seller_id, si admin ve todo" ya no es
seguro. En SaaS, "todo" significa "todo dentro de su tenant", y muchas veces
"todo dentro de sus agencias".

### 18.3 API financiera

Pagos, caja y contabilidad tienen side effects encadenados. Ejemplo de
`mark-paid`:

- valida modulo cash,
- rate limit,
- valida cuenta financiera,
- fetch de payment scopeado por `org_id`,
- CAS `PENDING -> PAID`,
- crea cash movement,
- crea ledger movement,
- liquida operator payment,
- crea counterpart,
- anota journal entry,
- calcula FX,
- crea percepciones,
- genera mensajes/recibos.

Esa arquitectura funciona, pero aumenta el riesgo de estados parciales. Los
refactors mas valiosos son extraer orquestadores testeables y mover operaciones
atomicas a RPC/transacciones cuando el costo lo justifique.

### 18.4 API publica

La API publica por token (`app/api/public`, `app/cotizacion`) debe resolver el
tenant desde el recurso/token. No debe usar user session ni aceptar `org_id` del
cliente. El patron esperado es "token -> recurso -> org".

## 19. Auditoria de datos, RLS y migraciones

### 19.1 Modelo de datos

La base ya no es el schema inicial. Las migraciones agregaron:

- SaaS organizations/org_id.
- RLS hardening.
- billing y plans.
- org integrations.
- agency role permissions.
- monthly commissions.
- support system.
- operation services/itinerary.
- AFIP/invoices/credit notes.
- WHA/control y mensajes.
- feature flags/settings por org.

Por eso `lib/supabase/types.ts` y migraciones recientes son mas confiables que
docs antiguas.

### 19.2 RLS

El repo documenta un incidente cross-tenant real. La leccion tecnica aplicada es
correcta:

- RLS debe existir.
- Codigo debe filtrar explicitamente.
- Service-role debe estar allowlisted.
- Helpers compartidos deben fallar fuerte si falta `org_id`.

No se debe reintroducir policies `USING true` en tablas tenant-scoped ni escribir
endpoints que dependan de "Supabase lo filtra solo".

### 19.3 Tipos

El proyecto usa `strict: true`, pero `allowJs: true` y deuda amplia de `any`.
Los tipos DB se generan en `lib/supabase/types.ts`. Si una migracion agrega
columnas y el codigo usa casts `as any`, eso puede ser una senal de types stale.

Recomendacion: para nuevas tablas/campos, regenerar tipos y preferir tipos
derivados de `Database` antes de introducir nuevos `any`.

## 20. Auditoria de integraciones

### 20.1 Integraciones modernas

Las integraciones modernas tienden a usar:

- tabla de integraciones por org,
- token en URL,
- secret cifrado,
- HMAC,
- event log,
- handler de dominio.

Ese patron aparece en Manychat advanced, Callbell, ChatSell y Eve. Es el patron a
replicar.

### 20.2 Trello

Trello es la mayor fuente de confusion documental. Hay columnas y referencias UI
legacy, pero no debe documentarse como flujo activo principal. Si se decide
reintroducirlo o limpiarlo, debe hacerse como iniciativa explicita.

### 20.3 AFIP y billing

AFIP y Mercado Pago son integraciones de plata/legalidad. Cambios ahi requieren:

- degradacion clara de errores,
- logs utiles sin secrets,
- tests de state machine/calculo,
- idempotencia,
- cuidado con fechas y timezones.

## 21. Checklist tecnico para futuras PRs

Antes de mergear cambios de negocio:

- ¿El endpoint exige `user.org_id` si es user-facing?
- ¿Todas las queries tenant-scoped filtran `.eq("org_id", user.org_id)`?
- ¿El scope por agencia aplica si el modulo es multi-agencia?
- ¿Los permisos usan matriz dinamica cuando corresponde?
- ¿Se agrego `createAdminClient()`? Si si, ¿esta allowlisted y justificado?
- ¿El write financiero es idempotente?
- ¿Hay CAS guard para cambios de estado sensibles?
- ¿Se validan payloads con Zod o validacion equivalente?
- ¿Los errores criticos no se silencian?
- ¿Se agregaron tests focalizados?
- ¿La UI usa tokens y patrones existentes?
- ¿La documentacion no reintroduce Trello como activo si no corresponde?

## 22. Aplicacion a nivel de proyecto: AGENTS.md, skills y enforcement

La documentacion oficial de Codex recomienda usar `AGENTS.md` como guia durable
del repo, skills para workflows repetibles y checks automatizados para reglas que
deben ser obligatorias. Eso calza bien con este proyecto, pero conviene separar
responsabilidades:

- `AGENTS.md` debe contener el contrato de arquitectura: tenancy, permisos,
  service role, capas, bounded contexts, invariantes financieras, comandos y
  criterios de validacion.
- `.agents/skills` debe contener workflows reutilizables, no politicas globales.
  El repo ya tiene `impeccable` para UI; se podrian sumar skills especificas de
  arquitectura, debugging o TDD si el equipo las usa con frecuencia.
- Los invariantes criticos deben vivir tambien en codigo: tests, lint, scripts,
  hooks o CI. Un agente puede leer una regla, pero solo un check ejecutable la
  vuelve dificil de romper accidentalmente.

El enfoque de `mattpocock/skills` es aplicable como capa de proceso: skills
chicas, composables, enfocadas en alinear contexto, modelar dominio, diagnosticar
bugs, hacer TDD, revisar codigo o mejorar arquitectura. Para este repo, no
conviene importar ese criterio como reemplazo de `AGENTS.md`; conviene usarlo
como inspiracion para skills propias o adaptadas que respeten el vocabulario
MAXEVA/Vibook y las reglas duras de multi-tenant, billing y finanzas.

Recomendacion practica:

- Mantener `AGENTS.md` por debajo del limite util de contexto y mover playbooks
  extensos a docs o skills.
- Crear `docs/adr/` o una convencion similar si aparecen decisiones
  cross-cutting de arquitectura.
- Convertir reglas repetidas de review en scripts. Ejemplo: extender
  `scripts/check-admin-client.sh` con checks de tenant scope o payload validation
  cuando esos errores empiecen a repetirse.
- Agregar skills solo cuando haya un workflow estable de 2-3 casos de uso claros.

Fuentes revisadas:

- `https://developers.openai.com/codex/guides/agents-md`
- `https://developers.openai.com/codex/skills`
- `https://developers.openai.com/codex/learn/best-practices`
- `https://github.com/mattpocock/skills`

## 23. Conclusion

La arquitectura real es mas madura y mas riesgosa que la que describe `AGENTS.md`. El sistema ya incorporo lecciones importantes de seguridad multi-tenant, pero esas reglas viven dispersas en codigo, comentarios, allowlists y docs de incidentes. La guia de agentes deberia convertirse en el punto de entrada a esas reglas, no en una descripcion historica del ERP.

La actualizacion mas importante no es cosmetica: es cambiar el orden mental. Primero tenant, permisos, service role e invariantes financieras. Despues modulos de negocio.
