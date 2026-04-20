# SaaS Multi-Tenant Architecture — MAXEVA Gestión

**Fecha**: 2026-04-19
**Status**: Approved → In execution
**Context**: 200+ agencias confirmadas para lanzamiento esta semana. Maxi (Lozada Viajes) en prod 24/7 no puede perder nada.

---

## Objetivo

Convertir MAXEVA de un ERP single-tenant (Lozada) a SaaS multi-tenant donde:

1. **Cada tenant (organización) tiene sus datos completamente aislados**. Cross-org leaks = imposibles.
2. **Maxi conserva su experiencia exacta** durante y después de la transición.
3. **Un nuevo tenant que se registra ve cero data previa** (cuenta limpia).
4. **Escala a cientos/miles de tenants** sin degradación ni riesgo de leaks.

---

## Decisiones arquitectónicas

### Modelo de datos

- **Tenant = Organization**. Una org tiene N agencias, N users, toda su data operativa.
- **Per-tenant**: ops, clientes, operadores, finanzas, contabilidad, impuestos, comisiones, reportes, tasks, mensajes, settings (branding, AFIP, etc).
- **Shared globales**: `destinations_master`, `destination_requirements`, `exchange_rates` (cotización USD/ARS la maneja el sistema), códigos de países/aeropuertos si aplica.
- **`org_id UUID NOT NULL`** en toda tabla per-tenant. Cascada ON DELETE.

### Roles — dos niveles

**PLATFORM_ADMIN** (nivel plataforma — nuevo)
- Tabla dedicada `platform_admins (user_id)`, fuera del sistema de roles por-tenant.
- Ve todas las orgs, crea/suspende tenants, impersona users para soporte.
- NO tiene data operativa propia. Es una cuenta de gestión del SaaS.

**Roles dentro de una org** (nivel tenant — existente, renombrado)
- `ORG_OWNER` (reemplaza a `SUPER_ADMIN` para Maxi). Dueño de la org.
- `ADMIN`, `CONTABLE`, `SELLER`, `VIEWER` — como hoy, pero scoped a su org.

### User membership

- Single-org por default. Un user pertenece a una org.
- Excepción: PLATFORM_ADMIN puede impersonar a cualquier user de cualquier org (sesión temporal auditada).
- No hay switcher de org multi-tenant para usuarios normales.

### Integraciones externas

| Integración | Modelo | Notas |
|-------------|--------|-------|
| AFIP | 1 por org | Cada org con su CUIT y certificado |
| WhatsApp (wha_control) | Por-user | Cada user escanea sus devices |
| OpenAI (Cerebro) | API key global (SaaS owner paga) | Respuestas scoped por org_id |
| Trello/Manychat | Legacy Lozada only | No se expone a orgs nuevas |

### Cerebro (AI Copilot) — scoping crítico

La API key de OpenAI es global, pero el contexto pasado al modelo debe:

1. Incluir SOLO data de `user.org_id`
2. Tools/queries del AI usan `scopedClient` (RLS-protected)
3. System prompt incluye `"Estás respondiendo sobre agencia {org_name}. No menciones otras agencias."`
4. Log cada query con org_id para auditoría

---

## Defense in depth — 3 capas independientes

Para que haya un leak cross-org, las 3 capas tendrían que fallar simultáneamente.

### Capa 1 — DB (Row Level Security)

- RLS habilitado en toda tabla con `org_id`.
- Policy uniforme `tenant_isolation`:
  ```sql
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()))
  ```
- Función `user_org_ids()` es `SECURITY DEFINER` — bypasa RLS internamente (evita recursión infinita).
- Aplica a queries hechas con user JWT (cookies via `createServerClient`).
- `service_role` (`createAdminClient`) BYPASSA RLS.

### Capa 2 — Código (helpers explícitos)

- `lib/supabase/scoped-client.ts` expone `createScopedClient(user)` que:
  - Usa `createServerClient` (user-auth, RLS active)
  - Wrapper que auto-inyecta `.eq('org_id', user.org_id)` como defensa adicional (redundante con RLS pero gratis)
- Rutas prohibidas de usar `createAdminClient` excepto:
  - `/api/auth/*` (register, invite)
  - `/api/cron/*` (jobs sistema)
  - `/api/webhooks/*` (Manychat, AFIP callbacks, MercadoPago)
- Lint rule en ESLint custom: `createAdminClient` solo en paths permitidos.

### Capa 3 — Tests de isolation (CI bloqueante)

- Setup: seed con 2 tenants sintéticos (`TenantA`, `TenantB`) con data determinística.
- Para cada endpoint CRUD crítico:
  - Auth as user de TenantA
  - Ejecutar GET/POST/PATCH/DELETE
  - Assert: `SELECT count(*) FROM <tabla> WHERE org_id = TenantB` no cambió
- Suite corre en CI. Fail → merge bloqueado.
- ~60-80 tests (uno por endpoint sensible).

---

## Los 8 pilares de implementación

### Pilar 1 — Aislamiento de DB completo

**Status en este doc**: ~85% hecho.

- ✅ Migraciones 132-139 aplicadas en prod (org_id + RLS + SECURITY DEFINER)
- ⏸️ Falta auditoría final: algunas tablas menores (wha_control_*, ai_queries, etc) sin RLS
- ⏸️ Falta policy sobre tablas `users`, `organization_members`, `organization_invitations`, `agencies`, `user_agencies` (están hoy con policies de mig 132 — revisar)

**Entregable**: script `scripts/audit-rls.ts` que confirma TODAS las tablas tenant-scoped tienen RLS + policy, sin excepciones.

### Pilar 2 — Admin client cero para lecturas

- Auditoría de los 39 routes con `createAdminClient`
- Para cada uno: ¿realmente necesita service_role?
  - Si escribe a tabla con trigger admin-only → sí, mantener + filtro explícito
  - Si solo lee → convertir a `createServerClient`
- Lint rule: bloquea PR si `createAdminClient` aparece fuera de paths permitidos
- ~35 routes migrados

### Pilar 3 — Helpers y tipos

- `createScopedClient(user)` en `lib/supabase/scoped-client.ts`
- TypeScript: `User` type con `org_id: string` non-nullable post-register
- Middleware `lib/auth.ts` asegura que `getCurrentUser()` post-auth siempre devuelve user con `org_id` seteado (si no, redirect a `/onboarding`)

### Pilar 4 — PLATFORM_ADMIN separado

- Migration 140: tabla `platform_admins (user_id UUID PK REFERENCES auth.users, created_at)`
- Helper `isPlatformAdmin(user): Promise<boolean>`
- Rutas `/admin/*` requieren `isPlatformAdmin`
- Maxi: `users.role` de `SUPER_ADMIN` → `ORG_OWNER` (SQL update, instant)
- Tomi: inserción manual en `platform_admins`

### Pilar 5 — Suite de tests de isolation

- `__tests__/isolation/seed.ts` — crea 2 tenants
- Tests por endpoint en `__tests__/isolation/<module>.test.ts`
- Run en CI, fail → block
- Cobertura mínima: 100% de endpoints que leen/escriben a tablas con `org_id`

### Pilar 6 — Platform admin console

- `/admin/orgs` list
- `/admin/orgs/[id]` detail + plan management + suspend/reactivate
- `/admin/impersonate/[user_id]` — login-as con auditoría
- `/admin/metrics` — MRR, signups, churn
- Protegido por middleware que requiere `isPlatformAdmin`

### Pilar 7 — Onboarding + billing enforcement

- `/onboarding` wizard 4 pasos post-register (empresa, moneda, invitar equipo, tour)
- Middleware de subscription_status:
  - `TRIAL` → OK + banner "X días"
  - `ACTIVE` → OK
  - `PAST_DUE` → banner rojo, gracia 7d
  - `SUSPENDED` → redirect `/billing/reactivate`
- Limits enforcement (max_users, max_operations_per_month) en middleware de POST a tablas relevantes
- Maxi: plan ENTERPRISE, subscription_status ACTIVE vitalicio (no ve banners)

### Pilar 8 — Monitoring y rollback

- Audit log: table `security_audit_log (user_id, org_id, route, query_org_ids_seen)` — si un user toca una org distinta a la suya, se loguea
- Sentry tags con `org_id`
- Kill switch env var `MULTI_TENANT_STRICT`: true → RLS hard. false → soft (log warnings). Para emergency rollback.

---

## Migración de Maxi — garantías

1. Maxi sigue siendo OWNER activo de Lozada. Role rename a `ORG_OWNER` es un SQL update atómico.
2. Todos sus datos tienen `org_id = Lozada` (ya verificado: 100% backfill correcto en mig 132-139).
3. RLS con `user_org_ids()` — Maxi es miembro ACTIVE de Lozada → policy pasa → ve TODO lo de Lozada.
4. Su plan es ENTERPRISE con `subscription_status = ACTIVE`, `max_users = 999`, `max_agencies = 999` → no ve banners ni bloqueos.
5. Rollback plan: disable RLS en tabla afectada (`ALTER TABLE x DISABLE ROW LEVEL SECURITY`) — revierte al estado pre-SaaS en 1 comando.

---

## Escala a 200+ tenants

### Performance

- RLS con `SECURITY DEFINER` function: la función se ejecuta una vez por query (no por row). Postgres la cachea.
- Índices en `org_id` en todas las tablas grandes (ya creados en mig 132-139).
- Query típica: `SELECT * FROM operations WHERE org_id = X LIMIT 100` — index range scan, <10ms.

### Onboarding de los 200

- Cada agencia se registra por `/register`. Crea org, agency, user, membership.
- Trial 7 días ENTERPRISE features.
- Al día 7 → `PAST_DUE`, 7 días gracia, luego `SUSPENDED`.
- Batch registration (si querés pre-onboardear): script server-side que crea N orgs vía API `/api/auth/register`.

### Soporte

- Tomi via `/admin/orgs` puede ver estado de cada org.
- Impersonation para soporte tick.
- Audit log de impersonations (quién, cuándo, qué tocó).

---

## Lo que NO entra en primera release (fase 2)

- MercadoPago integration completa (webhook, cobro recurrente). Inicial: MP manual / Stripe Payment Link.
- Landing page pública + pricing público. Inicial: onboarding privado con invite-link.
- Custom emails transaccionales. Inicial: Supabase Auth magic link.
- Multi-region / CDN edge. Inicial: single region.

---

## Timeline — 5 días

| Día | Pilar | Entregable |
|-----|-------|------------|
| 1-2 | P1 + P2 + P3 | Aislamiento DB final + admin client audit + scoped helpers |
| 3 | P5 | Suite de tests de isolation (CI block) |
| 3-4 | P4 + P6 | Platform admin + console |
| 4-5 | P7 | Onboarding + billing enforcement |
| 5 | P8 | Monitoring + audit log |

## Rollback

Cada pilar es revertible:
- RLS: `ALTER TABLE x DISABLE ROW LEVEL SECURITY`
- Código: git revert
- Tests: no afectan prod, ignorar
- Admin console: route feature-flag
- Billing: `MULTI_TENANT_STRICT=false`

---

## Criterios de aceptación

1. **Test de isolation**: LOLO user no puede leer ni 1 byte de Lozada. Maxi ve 100% de Lozada.
2. **Suite completa**: 100% endpoints críticos tienen test de isolation. Todos pasan.
3. **Performance**: queries típicas <200ms p95 con 100 tenants simulados.
4. **Maxi acceptance**: 24h sin quejas ni pérdida de data ni UX break.
5. **Audit log**: cero entries de cross-org durante 48h de operación normal.
6. **Rollback drill**: ejecutar rollback completo en <5 min.

Cuando los 6 criterios están verdes, se considera listo para ventas.
