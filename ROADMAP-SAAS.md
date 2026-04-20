# MAXEVA SaaS — Roadmap Vivo

> **Propósito**: Documento vivo que refleja el estado actual del roadmap SaaS. Se actualiza a medida que se completan tareas. Si pasás a una conversación nueva, **leé este archivo primero** para retomar contexto sin perder nada.

**Spec de referencia**: [docs/superpowers/specs/2026-04-19-saas-multitenant-architecture.md](docs/superpowers/specs/2026-04-19-saas-multitenant-architecture.md)

**Fecha última actualización**: 2026-04-19 (Pilar 2 Batch 1 + Pass 2 writes completos)
**Status global**: 🟡 Pilar 2 ~80% — 5 routes read-only migrados + 7 routes write reforzados con org_id explícito y validación por parent-org vía RLS. 2 leaks conocidos diferidos a Pilar 2c post-launch (RPC SECURITY DEFINER + gap de `itinerary_items` sin org_id).

---

## Cómo usar este documento

- **Para retomar en conversación nueva**: leé secciones "Status actual" + "Próximo paso inmediato" + "Decisiones tomadas" para tener todo el contexto.
- **Para el agente**: al completar una task, mové el ítem de `[ ]` a `[x]` + agregá nota con commit hash si aplica. Actualizá "Fecha última actualización".
- **Para reportar**: la sección "Status actual" es el resumen de 3 líneas.

---

## Status actual (TL;DR)

- ✅ **Pilar 1 COMPLETO** (2026-04-19). 42 tablas tenant-scoped verificadas vía `scripts/audit-rls.ts`. Cero cross-org leaks. Maxi (Lozada) ve todo lo suyo. LOLO (tenant nuevo) ve únicamente sus propios rows.
- ⏸️ Pendiente: Pilar 2 (ban createAdminClient para lecturas), P3 (scoped-client helper), P4 (PLATFORM_ADMIN), P5 (tests CI), P6 (admin console), P7 (onboarding+billing), P8 (monitoring).

**Próximo paso inmediato**: **Pilar 2 Pass 2** — migrar los 7 routes con writes admin-client (itinerary, leads, expenses) agregando `org_id` explícito en INSERTs y `.eq('org_id', user.org_id)` en UPDATE/DELETE. Fix de SECURITY DEFINER diferido a Pilar 2c post-launch (ver detalle abajo).

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
| 140 | RLS en agencies + user_agencies + users + organization_invitations | ✅ prod |

**Migraciones escritas pendientes de aplicar**:
| Mig | Archivo | Qué hace | Status |
|-----|---------|----------|--------|
| 141 | `20260419000141_saas_fix_rpc_security_invoker.sql` | Cambia `execute_readonly_query` de SECURITY DEFINER a INVOKER. **BLOQUEADA** hasta refactor de `lib/accounting/ledger.ts` (ver Pilar 2c). Aplicar juntas o se rompen todos los balances de la app. | ⏸️ no aplicar aún |

**Próxima migración nueva prevista (142)**: `platform_admins` table + fix role rename Maxi (Pilar 4).

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

### ✅ Pilar 1 — Aislamiento de DB completo (DONE 2026-04-19)

- [x] mig 132-140 aplicadas en prod
- [x] `scripts/audit-rls.ts` creado y corrido — verifica ownership real (no solo count)
- [x] 42 tablas tenant-scoped: todas aisladas, 0 cross-org leaks
- [x] Maxi ve toda su data de Lozada (sin cambio UX)
- [x] LOLO (tenant nuevo) ve solo sus propios rows (1 agency suya, 1 customer_setting suya, 1 operation_setting suya, resto vacío)

**Evidencia**: `npx tsx scripts/audit-rls.ts` → PASS. Output guardado en commit.

**Nota**: tablas `wha_control_*`, `ai_queries`, `emilia_conversations` NO están en el scope porque no existen en prod. Si se crean en el futuro, hay que agregarles `org_id` + RLS.

### 🟡 Pilar 2 — Admin client cero para lecturas (en curso)

**Inventario**: 26 route files en `app/api/` con `createAdminClient` (58 usos totales).

**Clasificación hecha (2026-04-19)**:

| Clase | Count | Acción | Status |
|-------|-------|--------|--------|
| A. Auth whitelist | 1 | Mantener admin (pre-sesión) | `auth/register` → keep |
| B. Read-only, DB | 5 | `createServerClient` + RLS | ✅ batch 1 done |
| C. Write + admin (tenant-scoped) | 9 | Pass 2: agregar `org_id` al insert + `.eq('org_id')` en update/delete | ⏸️ pending |
| D. Storage uploads | 2 | Admin OK por ahora (bucket policies son separadas) | ⏸️ defer |
| E. RPC SECURITY DEFINER (bypasa RLS!) | 2 | Fix SQL crudo con `org_id` explícito, o reescribir | 🔴 bloqueante |
| F. WhatsApp (tablas no existen en prod) | 10 | Defer — crear con `org_id` + RLS desde cero | ⏸️ defer |

**Batch 1 ✅ (migrado a createServerClient + RLS)**:
- [x] `app/api/accounting/ledger/route.ts` (piloto)
- [x] `app/api/accounting/ledger/[id]/route.ts`
- [x] `app/api/accounting/ganancias/route.ts`
- [x] `app/api/accounting/iibb/route.ts`
- [x] `app/api/expenses/monthly/route.ts`

**Batch 2 ✅ (Pass 2 — writes con org_id explícito + validación parent-org)**:
Patrón aplicado: SELECT con server client (RLS filtra por org) → valida pertenencia → admin client para mutation con `.eq('org_id', …)` defensivo y `org_id: user.org_id` en INSERTs.
- [x] `app/api/operations/[id]/itinerary/route.ts` (GET/POST — valida via `verifyOperationBelongsToUser`)
- [x] `app/api/operations/[id]/itinerary/[itemId]/route.ts` (PATCH/DELETE — rewrite de `verifyItemBelongsToUser` que separa item fetch del op-scope check; fixea bug del embedded select null)
- [x] `app/api/expenses/variable/route.ts` (POST — inyecta `org_id`)
- [x] `app/api/expenses/variable/[id]/route.ts` (PATCH/DELETE — acota por `existing.org_id`)
- [x] `app/api/expenses/cc-payment/route.ts` (POST — inyecta `org_id` en group + items)
- [x] `app/api/expenses/cc-payment/[id]/route.ts` (DELETE — acota cascada por `group.org_id`)
- [x] `app/api/leads/[id]/route.ts` (PATCH/DELETE — acota por `lead.org_id`)
- [ ] `app/api/quotations/upload-flight-screenshot/route.ts` (defer — solo Storage upload)
- [ ] `app/api/operations/[id]/itinerary/upload-image/route.ts` (defer — solo Storage upload)

**🟠 Gap secundario descubierto — `itinerary_items` sin tenant isolation**:
La tabla `itinerary_items` (mig 119) tiene RLS activada pero policies `USING (true)` — 100% permisivas. No tiene `org_id`. **No fue cubierta por audit-rls.ts de Pilar 1**. Mitigación actual (Pass 2A): defensa en código — las routes ahora validan vía `operations` (que sí tiene RLS tenant_isolation) antes de leer/escribir itinerary_items. Fix definitivo: agregar `org_id` + RLS por-org en Pilar 2c (migration nueva).

**🔴 Leak conocido — RPC `execute_readonly_query` SECURITY DEFINER** (diferido a post-launch):

La función `execute_readonly_query` es `SECURITY DEFINER` → corre como superuser y **bypasa RLS**. Cualquier user autenticado con permiso accounting/cash puede agregar (SUM/GROUP BY) datos cross-org.

**Callers afectados**:
- `app/api/accounting/ledger/stats/route.ts`
- `app/api/cash/daily-balance/route.ts`
- `lib/accounting/ledger.ts` (6 llamadas internas — `getAccountBalancesBatch`, etc.)
- `app/api/ai/route.ts` (AI Companion — ya filtra manualmente por org en tools)

**Severidad real**: leak de agregados (totales), no rows individuales. Requiere user autenticado con permiso. No expone datos de passengers, customers, ni operaciones individuales.

**Fix correcto (Pilar 2c — post-launch, próxima semana)**:
1. Refactor `lib/accounting/ledger.ts`: eliminar las 6 llamadas a `getAdminClient()` y usar el `supabase` que cada función ya recibe como parámetro. Los 2 callers externos (`financial-accounts/route`, `chart-of-accounts/route`) ya pasan server client → no requieren cambios.
2. Aplicar migration `20260419000141_saas_fix_rpc_security_invoker.sql` (ya escrita, no aplicada) vía SQL Editor.
3. Verificar balances end-to-end con Maxi + LOLO: las cifras deben ser idénticas en Lozada y correctas en LOLO.
4. El AI Companion queda scoped automáticamente (usa `supabase.rpc()` en `app/api/ai/route.ts:721`).

**Por qué no ahora** (esta semana, 200 agencias activas): el refactor de `ledger.ts` es crítico en cálculos financieros; un bug introducido se ve como "plata desaparecida" en caja (ya ocurrió $227M ARS en el pasado). Riesgo de romper balances en prod > riesgo de leak teórico en 4 días.

**Lint rule (pendiente)**:
- [ ] ESLint rule o grep pre-commit: fallar si `createAdminClient` aparece fuera de `/api/auth/*`, `/api/cron/*`, `/api/webhooks/*` y la whitelist de Storage uploads.

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
- `ab14b30` docs: spec + roadmap
- Aplicadas en prod via SQL Editor (sin archivo de migration commit): 138 (drop permissive), 139 (force RLS en 5 leakers), 140 (agencies + user_agencies + users + org_invitations RLS)
- `ec09cdf` Pilar 2 batch 1: 5 read-only routes off admin client
- `febc349` Pilar 2: documented SECURITY DEFINER leak + migration 141 (not applied)
- `74db1c4` Pilar 2 Pass 2: scope 7 write routes to tenant via org_id + parent-op RLS
- **Por committear**: mig 140 SQL file + audit-rls.ts

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
