# MAXEVA SaaS — Roadmap Vivo

> **Propósito**: Documento vivo que refleja el estado actual del roadmap SaaS. Se actualiza a medida que se completan tareas. Si pasás a una conversación nueva, **leé este archivo primero** para retomar contexto sin perder nada.

**Spec de referencia**: [docs/superpowers/specs/2026-04-19-saas-multitenant-architecture.md](docs/superpowers/specs/2026-04-19-saas-multitenant-architecture.md)

**Fecha última actualización**: 2026-04-19
**Status global**: 🟡 En ejecución — Pilar 1 en curso

---

## Cómo usar este documento

- **Para retomar en conversación nueva**: leé secciones "Status actual" + "Próximo paso inmediato" + "Decisiones tomadas" para tener todo el contexto.
- **Para el agente**: al completar una task, mové el ítem de `[ ]` a `[x]` + agregá nota con commit hash si aplica. Actualizá "Fecha última actualización".
- **Para reportar**: la sección "Status actual" es el resumen de 3 líneas.

---

## Status actual (TL;DR)

- ✅ Infra DB multi-tenant lista: `org_id` en 40+ tablas, RLS con `SECURITY DEFINER` resolviendo recursion, policies uniformes `tenant_isolation`.
- 🟡 Aislamiento real funciona en 80% de tablas testeadas con usuario LOLO (`agency@agency.com`). Quedan parches menores.
- ⏸️ Pendiente: auditoría final RLS, ban `createAdminClient`, tests de isolation CI, platform admin, onboarding, billing.

**Próximo paso inmediato**: Pilar 1 — cerrar el último 15% de aislamiento DB (tablas que no están en las 39 del loop + validar que TODAS las 5 que leakean estén cerradas).

---

## Decisiones tomadas (no reabrir sin razón)

1. **Modelo de isolation**: per-tenant todo lo operativo. Compartido: catálogos puros (destinations_master, destination_requirements, exchange_rates).
2. **Roles**: `PLATFORM_ADMIN` separado (tabla dedicada), `ORG_OWNER/ADMIN/CONTABLE/SELLER/VIEWER` dentro de cada tenant. Maxi pasa de `SUPER_ADMIN` a `ORG_OWNER`.
3. **User membership**: single-org. PLATFORM_ADMIN puede impersonar (único que cruza orgs).
4. **AFIP**: 1 config por org.
5. **WhatsApp**: por-user (cada user sus devices).
6. **OpenAI**: 1 API key global (owner paga), pero Cerebro scope-filtra data por org.
7. **Defense in depth**: 3 capas — RLS (DB) + scoped-client (código) + tests isolation (CI).

---

## Migraciones aplicadas en prod

| Mig | Qué hace | Status |
|-----|----------|--------|
| 132 | Crea organizations, organization_members, agregar org_id a agencies/users/customers/operators/alerts | ✅ prod |
| 133 | org_id en financial_accounts, pdf_templates, message_templates | ✅ prod |
| 134 | org_id en 34 tablas core (leads, operations, payments, etc) + indexes | ✅ prod |
| 135 | org_id en organization_settings + unique (org_id, key) | ✅ prod |
| 136 | RLS tenant_isolation en 38 tablas | ✅ prod (tuvo recursion bug) |
| 137 | Fix recursion con función `user_org_ids()` SECURITY DEFINER | ✅ prod |
| 138 | Drop policies viejas permisivas (`qual = true`) | ✅ prod |
| 139 | Force RLS + re-create policy en iva_sales/iva_purchases/commission_records/customers/operators | ✅ prod |

**Próxima migración prevista (140)**: `platform_admins` table + fix role rename Maxi.

---

## Los 8 pilares

### ✅ Pilar 0 (pre-spec) — Trabajo previo reactivo

Hecho durante la sesión previa al spec:
- Migraciones 132-139 aplicadas
- Helper `getScopedAgenciesForUser` agregado
- 12+ páginas migradas a usar el helper
- 7 analytics routes con filter org_id
- `/api/settings/organization` con org_id scope
- `/api/settings/agencies` scope por org
- `/api/tasks/users` scope por org

### 🟡 Pilar 1 — Aislamiento de DB completo

- [x] mig 132-139 aplicadas
- [ ] Script `scripts/audit-rls.ts`: lista todas las tablas con `org_id` y verifica que tengan RLS + policy tenant_isolation. Fail = exit 1.
- [ ] Correr script, resolver cualquier tabla huérfana
- [ ] Verificar con LOLO user que las 5 que leakeaban (iva_sales, iva_purchases, commission_records, customers, operators) ahora son 0
- [ ] Tablas aún sin org_id a revisar: `wha_control_*`, `ai_queries` si existe, `lead_comments` (verificar), y user-related tables

**Blocker conocido**: ninguno.

### ⏸️ Pilar 2 — Admin client cero para lecturas

- [ ] Lista los 39 routes con `createAdminClient` (ya la tenemos del audit previo)
- [ ] Por cada uno: clasificar (read-only → migrar, write-critical → mantener + filtrar)
- [ ] Migrar read-only routes a `createServerClient` (protegido por RLS)
- [ ] Para mantenidos: agregar filtro explícito `.eq('org_id', user.org_id)`
- [ ] Lint rule: bloquea PR si `createAdminClient` fuera de `/api/auth/*`, `/api/cron/*`, `/api/webhooks/*`

### ⏸️ Pilar 3 — Helpers y tipos

- [ ] `lib/supabase/scoped-client.ts` — `createScopedClient(user)`
- [ ] Migrar ~10 routes críticas a usar scoped-client
- [ ] Tipos: `User` con `org_id: string` non-nullable (post-register)
- [ ] Middleware: `getCurrentUser()` redirige a `/onboarding` si `org_id` null

### ⏸️ Pilar 4 — PLATFORM_ADMIN separado

- [ ] Migration 140: table `platform_admins`
- [ ] Helper `lib/auth/platform.ts` — `isPlatformAdmin(user)`
- [ ] Rename `users.role`: Maxi `SUPER_ADMIN` → `ORG_OWNER`
- [ ] Tomi insertado en `platform_admins`
- [ ] Ruta guard para `/admin/*` — redirect si no es platform admin

### ⏸️ Pilar 5 — Tests de isolation (CI bloqueante)

- [ ] `__tests__/isolation/setup.ts` — crea 2 tenants sintéticos con data seed
- [ ] `__tests__/isolation/<module>.test.ts` — 1 archivo por área (customers, operations, payments, accounting, cash, reports, etc)
- [ ] Cada test: auth as userA, hace operación, verifica 0 cambios en tenantB
- [ ] Script `test:isolation` en package.json
- [ ] CI workflow que corre `test:isolation`, fail → block merge
- [ ] Cobertura objetivo: 100% de endpoints en `/api/` que tocan tablas tenant-scoped

### ⏸️ Pilar 6 — Platform admin console

- [ ] `/admin/layout.tsx` con guard `isPlatformAdmin`
- [ ] `/admin/orgs` — lista
- [ ] `/admin/orgs/[id]` — detalle + manage plan + suspend/reactivate
- [ ] `/admin/impersonate` — login-as con audit log
- [ ] `/admin/metrics` — MRR, signups, churn

### ⏸️ Pilar 7 — Onboarding + billing enforcement

- [ ] `/onboarding` wizard 4 pasos
- [ ] Middleware subscription_status (TRIAL/ACTIVE/PAST_DUE/SUSPENDED) con banners
- [ ] Limits enforcement en POST: max_users, max_operations_per_month
- [ ] Maxi: plan=ENTERPRISE, status=ACTIVE, todos los max_* a 999

### ⏸️ Pilar 8 — Monitoring y rollback

- [ ] Table `security_audit_log`
- [ ] Middleware que detecta cross-org query results (result.org_id !== user.org_id) y loguea
- [ ] Sentry tags con org_id
- [ ] Env var `MULTI_TENANT_STRICT` con kill switch

---

## Riesgos conocidos

| Riesgo | Mitigación | Status |
|--------|------------|--------|
| Maxi pierde acceso durante refactor | Roles y policies instant-rollback; RLS testeado antes de ban admin-client | 🟢 bajo |
| Tests rompen CI y atrasa deploy | Tests corren en PR no en main; fallback MULTI_TENANT_STRICT=false | 🟢 bajo |
| Onboarding bug = agencias sin data | Register transaction con rollback; logs estructurados | 🟡 medio |
| AFIP break en alguna agencia | Mantener AFIP integration scoped por org (mig 134 ya hizo) | 🟢 bajo |
| Query slowness con 200 tenants | Índices en org_id creados; plan: load test con 500 tenants sintéticos | 🟡 medio |

---

## Scripts útiles

- `scripts/audit-rls.ts` (pendiente) — verifica que todas las tablas org_id tienen RLS
- `scripts/verify-rls-final.ts` (deleted, re-crear) — testa isolation con 2 users reales
- Migration 140 (pendiente) — `platform_admins` + Maxi role rename

---

## Historia de commits del refactor SaaS

- `fc8c6a1` migration 134 (org_id en 34 tablas core)
- `f23f05b` helper getScopedAgenciesForUser + 12 páginas + 7 analytics + migration 135
- `72385f0` migration 136 (RLS tenant_isolation en 38 tablas)
- `ea9d0dc` migration 137 (fix recursion con SECURITY DEFINER)
- Aplicadas en prod via SQL Editor: 138 (drop permissive), 139 (force RLS en 5 leakers)

---

## Notas para retomar en otra conversación

Si llegaste acá desde una sesión nueva:

1. **Lee el spec** en `docs/superpowers/specs/2026-04-19-saas-multitenant-architecture.md` para entender la arquitectura.
2. **Mirá "Status actual"** arriba para saber dónde estamos.
3. **"Próximo paso inmediato"** te dice qué hacer a continuación.
4. **NO** rehagas ninguna decisión de "Decisiones tomadas" sin consultar.
5. Si el status dice algo está "✅ prod" significa que ya está aplicado en producción y NO hay que re-ejecutar.
6. Si hace falta una nueva migración SQL, la escribo y la paso al user para que la corra en SQL Editor (no usamos `supabase db push` — el remote tracking está desincronizado).

**Emails de testing**:
- Maxi (Lozada Viajes, OWNER): `maxi@erplozada.com`
- LOLO user (agency nueva de prueba): `agency@agency.com`

**URL prod**: `https://www.maxevagestion.com`
**Supabase project**: `pmqvplyyxiobkllapgjp`
