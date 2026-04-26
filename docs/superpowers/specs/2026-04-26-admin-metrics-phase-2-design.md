# Admin Metrics Phase 2 — MRR override + pipeline + churn movement

**Fecha**: 2026-04-26
**Autor**: Tomi (CEO mode delegado a Claude)
**Estado**: spec — pendiente de plan de ejecución

## Contexto

Phase B del roadmap admin (commits `f8bdaf0`, `519c29a`) trajo MRR/ARR/churn al `/admin/metrics`, pero hay 2 gaps grandes en el cálculo + algunas mejoras SaaS-básicas pendientes:

1. **Lozada Enterprise no figura en MRR**: `PLANS.ENTERPRISE.priceArsMonthly = null` (contact-sales) y Lozada no tiene `custom_plan_id`. El cálculo devuelve 0 — pero el cliente paga $719k/mes por transferencia. La data no está registrada en ninguna tabla.
2. **Trials no proyectan**: solo ACTIVE/PAST_DUE cuentan. Las orgs `TRIALING` (con plan elegido + en período de prueba) ni siquiera figuran como pipeline.
3. **No hay desglose de movimiento MRR**: no se ve cuánto vino de orgs nuevas vs cuánto se perdió por churn en los últimos 30d.
4. **Visibilidad de "casos rotos"**: no hay alert para orgs Enterprise sin precio configurado, PENDING_PAYMENT count separado, etc.

## Scope

### Incluye

- Migration 166: agregar `organizations.manual_mrr_override_ars NUMERIC(12,2) NULL`.
- Helpers nuevos en `lib/admin/metrics.ts`:
  - Actualizar `computeMrrArs` para honrar el override.
  - `computeTrialPipelineMrrArs(org, customPlan)` — proyecta MRR si status es TRIALING.
  - `computePotentialMrrArs(org, customPlan)` — calcula "lo que pagaba" ignorando status filter (para Churn MRR).
- Refactor `app/admin/metrics/page.tsx`:
  - Cards nuevas: Pipeline MRR, New MRR 30d, Churn MRR 30d, PENDING_PAYMENT count, TRIALING count separado.
  - Alert card cuando hay Enterprise sin precio.
  - Update breakdown table para incluir bucket "ENTERPRISE sin precio" si aplica.
- Componente `<MrrOverrideCard orgId currentOverride>` en `/admin/orgs/[id]`.
- Endpoint nuevo `PATCH /api/admin/orgs/[id]/mrr-override` con audit log `MRR_OVERRIDE_UPDATED_BY_ADMIN`.
- Update `components/admin/tenant-metrics.tsx` para que la card MRR use el override.
- Tests unitarios: 4-6 nuevos casos para los 3 helpers (override, trial pipeline, potential).

### NO incluye (out of scope, siguiente sprint si crecemos)

- Cohort retention, Quick Ratio, MRR movement con expansion/contraction.
- Time series MRR/ARR (necesita tabla `mrr_snapshots` + cron diario).
- Trial conversion rate (necesita event tracking trial → ACTIVE histórico).
- LTV / CAC.

## Decisiones técnicas

### 1. Por qué override en vez de obligar custom_plan

`custom_plans` tiene baggage MP-céntrico: `billing_method`, integración con preapproval, `discount_percent`/`discount_ends_at`, etc. Para deals como Lozada (paga por transferencia, fuera de MP), forzar a crear custom_plan es overkill.

`manual_mrr_override_ars` es **una columna simple, nullable**, con prioridad sobre todo. Sirve también de escape hatch para casos one-off futuros (descuentos manuales, deals especiales sin MP).

### 2. Precedencia en `computeMrrArs`

```
1. status NOT IN (ACTIVE, PAST_DUE)        → 0
2. manual_mrr_override_ars > 0             → override
3. custom_plan_id + custom_plan disponible → custom plan price (con discount logic)
4. PLANS[plan].priceArsMonthly             → plan default
5. fallback                                → 0
```

### 3. Trial Pipeline calculation

```ts
computeTrialPipelineMrrArs(org, customPlan):
  if (org.subscription_status !== 'TRIALING') return 0
  // Misma lógica que MRR pero ignorando el filtro de status:
  if (override) return override
  if (custom_plan) return custom_plan_effective_price
  return PLANS[plan]?.priceArsMonthly ?? 0
```

### 4. Churn MRR calculation

```ts
computePotentialMrrArs(org, customPlan):
  // Sin filtro de status — devuelve "lo que pagaría/pagaba" si fuera ACTIVE
  if (override) return override
  if (custom_plan) return custom_plan_effective_price
  return PLANS[plan]?.priceArsMonthly ?? 0

// En la page:
churnMrr30d = sum(computePotentialMrrArs(o, cp))
              for o in orgs where status IN (CANCELLED, SUSPENDED)
                              and updated_at >= 30d ago
```

Aproximación: usa `updated_at` como proxy de "cuándo se canceló". Imperfecto (cualquier UPDATE refresca el timestamp), pero suficiente hasta que tengamos audit log churn-events o snapshots.

### 5. New MRR calculation

```
newMrr30d = sum(computeMrrArs(o, cp))
            for o in orgs where status IN (ACTIVE, PAST_DUE)
                            and created_at >= 30d ago
```

Honra override → Lozada signup-in-30d con override $719k contaría correcto.

### 6. Alert card "Enterprise sin precio"

Trigger:
```sql
WHERE plan = 'ENTERPRISE'
  AND subscription_status IN ('ACTIVE', 'PAST_DUE', 'TRIALING')
  AND custom_plan_id IS NULL
  AND (manual_mrr_override_ars IS NULL OR manual_mrr_override_ars = 0)
```

Renderea cuando count > 0. Muestra hasta 5 names linkeadas a `/admin/orgs/[id]`.

### 7. Endpoint MRR override

`PATCH /api/admin/orgs/[id]/mrr-override`:
- Body: `{ amount: number | null }` (null borra el override).
- Auth: `isPlatformAdmin()`.
- Validación: si amount no es null, debe ser >= 0.
- Update: `organizations.manual_mrr_override_ars`.
- Audit: `MRR_OVERRIDE_UPDATED_BY_ADMIN` con before/after.

### 8. UI placement del MrrOverrideCard

En `/admin/orgs/[id]`, después de la card "Billing" y antes de "Perfil de la agencia". Card pequeña con:
- Input numérico ARS.
- Botón "Guardar".
- Botón "Borrar override" si hay valor seteado.
- Warning si la org tiene `custom_plan_id`: "⚠️ Esta org tiene un custom plan registrado. El override tiene prioridad sobre el custom plan en el cálculo del MRR. Usar solo si necesitás saltear el custom plan deliberadamente."

## Componentes UI

| Archivo | Propósito |
|---|---|
| `components/admin/mrr-override-card.tsx` | Client card con form para setear/borrar el override en `/admin/orgs/[id]` |
| `components/admin/enterprise-without-price-alert.tsx` | Server card amarilla con lista de orgs problema en `/admin/metrics` |

## Endpoints

| Path | Método | Auth | Propósito |
|---|---|---|---|
| `/api/admin/orgs/[id]/mrr-override` | PATCH | platform_admin | Setear/borrar manual_mrr_override_ars |

## Tests

- **Unit (`__tests__/lib/admin/metrics.test.ts`)**: extender los 8 tests existentes con casos de override (precedencia sobre custom_plan + PLANS), trial pipeline (TRIALING returns price, ACTIVE returns 0), potential (ignores status).
- **Unit (`__tests__/api/admin/orgs/mrr-override.test.ts`)**: 403 sin admin, 400 si amount es negativo, success path con audit log.
- **Smoke E2E manual**: Tomi setea override de Lozada en $719000 → metrics page muestra ese MRR + Lozada figura en breakdown.

## Audit log

Nuevo `event_type`: `MRR_OVERRIDE_UPDATED_BY_ADMIN`. Severity `INFO`. Details:

```json
{ "before": { "amount": null }, "after": { "amount": 719000 } }
```

## Plan de despliegue

1. Migration 166 — SQL al chat, Tomi pega en Supabase.
2. Regen types.
3. Helpers + tests.
4. Endpoint + tests.
5. MrrOverrideCard + wire.
6. EnterpriseWithoutPriceAlert.
7. Refactor /admin/metrics page con cards nuevas.
8. Update tenant-metrics card para usar override.
9. Smoke manual.
10. Push.

Commits locales hasta tener flujo completo, push con OK explícito.

## Referencias cruzadas

- Memory `project_admin_phases_bcd_done.md` — Phase B base sobre la que extendemos.
- `lib/admin/metrics.ts` — helpers existentes.
- `lib/billing/plans.ts` — PLANS constant (no se toca).
- `supabase/migrations/20260422000158_custom_plans.sql` — schema custom_plans.
- Memory `feedback_supabase_migrations.md` — SQL al chat.
- Memory `feedback_no_push_until_told.md` — push solo con OK.
