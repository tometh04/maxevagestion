# Plan: SaaS rollout sin romper operación de Maxi

**Fecha**: 2026-04-18
**Estado**: activo
**Autor**: Tomi + Claude (brainstorming)

## Contexto

MAXEVA Gestión está en prod usado diariamente por Maxi (Lozada Viajes). Toda la data es del negocio real. Necesitamos:

1. **No romper nada** — cero interrupción operativa para Maxi
2. **Arreglar bugs vivos** antes de montar la capa SaaS (no arrastrar basura)
3. **Desplegar SaaS** (signup, login, paywall, customización, multi-tenancy)

No hay staging. Todo se pushea directo a prod.

## Estado actual (al 2026-04-18)

### Prod
- Fase 1 SaaS DB ya aplicada: tablas `organizations`, `organization_members`, `organization_invitations` creadas; `org_id` en `agencies`, `users`, `customers`, `operators`, `alerts`; org default "Lozada Viajes" creada; toda la data backfilled a esa org.
- Código prod corre en commit `014b488` (tests), **sin** ningún cambio de SaaS en el app layer todavía.
- Bug vivo: **42 FAs duplicadas** de "Costo de Operadores" (chart_account_id 4.2.01, CASH_ARS, ARS), acumulándose desde 2026-03-30 por un bug en `app/api/accounting/operator-payments/bulk/route.ts` introducido en commit `015273f` (Ene 26). Visible desde 2026-04-15 (Plan de Cuentas con saldos por cuenta agregó la UI que expone el problema).
- Saldos reportados como raros (Santi, 2026-04-17):
  - USD account: -$400k
  - Cuentas x Cobrar: -$50k
  - Caja ARS: -$500k

### Local (no pusheado)
- `main`: commit `993a6f0` — SaaS Fase 2 (signup, trial banner, subscription page, org-scoped invitations) + primera pasada de Fase 4 data isolation (getUserAgencyIds org-scoped, applyLeadsFilters/OperationsFilters ya no bypassean SUPER_ADMIN, customers filtra por org_id). 18 archivos, +1215/-97.
- Branch `fix/costos-operadores-duplicates`: commit `2e642b6` — fix del bug de duplicados, 1 archivo +16/-5.

## Principio rector

Todo cambio a prod debe ser:
- **Aislado**: un cambio por deploy
- **Reversible**: git revert o SQL undo en <5 min
- **Observado**: validar que nada se rompió antes del siguiente paso

## Secuencia de fases

### Fase 0 — Baseline (usuario, 5 min)

Antes de tocar nada:
1. Backup manual en Supabase Dashboard → Database → Backups
2. Screenshots del estado actual:
   - Plan de Cuentas con saldos (para comparar después)
   - Contador de operations abiertas
   - Saldo USD account, Caja ARS, CpC, CpP
3. Confirmar backup disponible para restore si hace falta

### Fase 1 — Bug fix a prod (10 min)

Deploy del fix aislado del bug de duplicados.

**Cambio**: `app/api/accounting/operator-payments/bulk/route.ts` (branch `fix/costos-operadores-duplicates`, commit `2e642b6`).

**Lo que cambia**: lookup de FA "Costo de Operadores" ahora usa `.order("created_at").limit(1)` en vez de `.maybeSingle()` con filtro de currency. Resultado: siempre resuelve a la FA canónica (más antigua), nunca crea duplicados nuevos.

**Pasos**:
1. `git push -u origin fix/costos-operadores-duplicates`
2. Abrir PR en GitHub
3. Merge a main
4. Vercel despliega
5. Observar logs y UI 10 min

**Validación**: Maxi no percibe cambio. Próximo bulk payment reutiliza la FA canónica existente (no crea duplicado 43).

**Rollback**: `git revert` del merge commit.

**Riesgo**: BAJO. 1 archivo, cambio quirúrgico, sin tocar data.

### Fase 2 — Investigación (read only, 30 min)

Entender los saldos raros antes de tocarlos.

**Diagnósticos SQL**:
1. USD -$400k: buscar `ledger_movements` con `currency='USD'` y `amount_original > 100000` (valores que parecen ARS metidos como USD — síntoma del bug `4c8c14e` del 16/4 05:36 que solo parchó 4 UUIDs específicos).
2. CpC -$50k: listar movements en la FA de Cuentas por Cobrar agrupados por fuente, comparar con facturas/pagos esperados.
3. Caja -$500k: idem, ver si se debe a split de "Costos de operadores" en 42 cuentas.

**Auditoría código**: grep de patrones "get-or-create" en el codebase que puedan tener el mismo bug (`financial_accounts.*insert` después de `maybeSingle`).

**Riesgo**: CERO. Solo SELECTs.

### Fase 3 — Remediación de data (30 min, con backup activo)

**Precondición**: Fase 1 deployada (para que mientras consolidamos no se sigan creando duplicados).

**Pasos SQL** (en orden):

1. Mover todos los `ledger_movements` de los 41 duplicados al canónico `d96cb7a6-947b-4df7-b87f-491b8b24a6c5`.
2. Soft-delete (is_active=false) de los 41 duplicados.
3. Fixes de USD / CpC según Fase 2.
4. UNIQUE INDEX parcial: `(chart_account_id, currency) WHERE is_active AND chart_account_id IS NOT NULL`. Previene este tipo de bug a nivel DB.

**Validación**: Plan de Cuentas muestra saldos consolidados. Santi confirma visual.

**Rollback**: restore del backup de Fase 0.

**Riesgo**: MEDIO — data migration, mitigado por backup.

### Fase 4 — Rollout SaaS a prod

Se parte el commit `993a6f0` en 3 sub-releases desplegables por separado, cada uno con su propio commit y observación.

#### 4a — Types + mock user (0 impacto usuarios)

**Archivos**: `lib/supabase/types.ts`, `lib/auth.ts`.

**Qué**: los types incluyen tablas organizations/members/invitations y columnas org_id. El mock user (DISABLE_AUTH dev) tiene org_id=null declarado.

**Validación**: build pasa, prod funciona igual. Ningún endpoint cambia de comportamiento.

**Riesgo**: BAJO.

#### 4b — Signup + trial banner + subscription page

**Archivos**: `app/api/auth/register/route.ts`, `app/(auth)/register/page.tsx`, `components/register-form.tsx`, `components/login-form.tsx` (link), `components/trial-banner.tsx`, `app/(dashboard)/layout.tsx` (inclusión del banner), `app/(dashboard)/settings/subscription/page.tsx` (rewrite), `app/api/settings/users/invite/route.ts` (org-scoping), `app/api/settings/users/route.ts` (org filter), `components/settings/users-settings.tsx` (ocultar SUPER_ADMIN del role select).

**Qué**: nueva feature de signup (crea org nueva para usuarios nuevos). Trial banner y subscription page. Invitations org-scoped (no afecta a Maxi que ya tiene su equipo creado).

**Validación**:
- Hacer 1 signup de prueba con email throwaway. Verificar que crea org + agency + user + member correctamente.
- Loguear como Maxi → nada cambió en su UX, salvo que aparece link "Crear cuenta gratis" en el login (ok).
- El trial banner solo aparece si subscription_status='TRIAL'. Maxi tiene 'ACTIVE' → no ve el banner.
- Settings → Suscripción ahora muestra info real en lugar del placeholder.
- `/api/settings/users` filtra por org → Maxi solo ve su equipo. Como todos los users existentes están en Lozada, no cambia la lista visible.

**Limpieza post-test**: borrar la org de prueba en Supabase con un SQL idempotente.

**Riesgo**: BAJO-MEDIO. Features nuevas, pero no altera queries existentes salvo el filter de `/api/settings/users` (cuyo efecto real es cero porque toda data es de Lozada).

#### 4c — Data isolation (Maxi-touching, deploy deliberado)

**Archivos**: `lib/permissions-api.ts`, `lib/organizations.ts`, `app/api/operators/route.ts`, `app/api/customers/route.ts`, `app/api/agencies/route.ts`.

**Qué**:
- `getUserAgencyIds` acota a agencias de la org del usuario (antes SUPER_ADMIN veía todas globalmente).
- `applyLeadsFilters` / `applyOperationsFilters` ya no bypassean SUPER_ADMIN — siempre filtran por agencyIds.
- `applyCustomersFilters` agrega `.eq('org_id', user.org_id)`.
- operators/customers POST setean org_id al insertar.
- agencies GET filtra por org_id (antes devolvía todas globalmente).

**Para Maxi**: la org Lozada tiene TODAS las agencias del sistema. Las agencias que `getUserAgencyIds` devuelve ahora para él son las mismas que antes (todas). Por lo tanto, funcionalmente equivalente. Pero es prod — hay que verificarlo en vivo.

**Ventana de deploy**: noche o fin de semana, con Maxi conectado o disponible para rollback rápido.

**Validación en vivo con Maxi**:
- Dashboard: ve las mismas métricas.
- Leads: lista completa igual que antes.
- Operations: lista completa igual que antes.
- Customers: lista completa igual que antes.
- Operators: lista completa igual que antes.
- Crear customer: funciona (ahora setea org_id).
- Crear operator: funciona (ahora setea org_id).

**Riesgo**: MEDIO. Si hubiera un caso edge que no consideré, Maxi podría ver menos data. Mitigación: deploy observable, Maxi valida en vivo, rollback listo.

**Rollback**: `git revert` del deploy de 4c.

### Fase 5+ (semanas siguientes)

No es parte de este spec. A planificarse después:
- Paywall MercadoPago (Fase 3 original del plan SaaS)
- Onboarding wizard
- Completar data isolation en endpoints restantes (alerts, payments, cash, quotations, invoices, reports, etc.)
- Customización por org: branding, logo, colores, subdominio/dominio custom

## Checkpoints con intervención humana

| Después de | Acción requerida |
|---|---|
| Fase 0 | Usuario confirma backup disponible y screenshots tomados |
| Fase 1 | Usuario loguea como Maxi, confirma operatividad normal |
| Fase 2 | Review conjunto de findings, decidir alcance de Fase 3 |
| Fase 3 | OK explícito antes de UPDATE SQL |
| Fase 3 post | Santi/Gabi validan saldos consolidados en UI |
| Fase 4a | Confirmar build y prod operativa |
| Fase 4b | Smoke test del signup con email throwaway |
| Fase 4c | OK explícito + Maxi conectado para validación inmediata |

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Bug fix tiene efecto secundario no previsto | Bajo | Medio | Revert git en 1 min |
| Consolidación SQL deja data inconsistente | Bajo | Alto | Backup previo; SQL testeado con SELECT equivalente antes del UPDATE |
| Fase 4c rompe queries de Maxi | Bajo-Medio | Alto | Deploy deliberado; Maxi valida en vivo; revert listo |
| Aparecen más bugs de balance no detectados | Medio | Medio | Fase 2 los saca a la luz antes de tocar |
| Otros patrones "get-or-create" buggy escondidos | Medio | Medio | Auditoría grep en Fase 2 |

## No-goals (explícitos)

- **No cubrimos**: paywall, onboarding wizard, branding/customización. Esos van a Fase 5+.
- **No tocamos**: endpoints que ya filtran bien por `agency_id` vía `getUserAgencyIds`. El cambio en esa función cascadea automáticamente.
- **No migramos datos más allá de lo necesario**: el backfill ya fue hecho en la Fase 1 SaaS.
