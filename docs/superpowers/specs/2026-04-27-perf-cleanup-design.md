# Perf Cleanup — Design Spec

**Fecha**: 2026-04-27  
**Origen**: usuario reporta que el sistema está extremadamente lento; Maxi y equipo SADA no pueden trabajar fluidamente. La regla clave es **no romper nada en producción** (sistema vendible, agencia operando) y volver a velocidad usable.

**Objetivo realista**: dashboard y pantallas calientes 8–12x más rápidas tras Fase A; endpoints O(n) con N+1 (`/reports/upcoming-due`, `/api/accounting/debts-sales`) 50–100x más rápidos. Navegación general "fluida y vendible".

**No-objetivos**: tocar features visibles, refactor de RLS de fondo, reescritura de componentes grandes, cambios en integraciones (Trello/AFIP/OpenAI/MP/Manychat) ni deshabilitar crons.

---

## 1. Diagnóstico

Lectura directa de `middleware.ts`, `app/(dashboard)/layout.tsx`, `lib/auth.ts`, `lib/supabase/server.ts`, `app/api/reports/upcoming-due/route.ts`, `app/api/cash/movements/route.ts`, `app/api/analytics/sales/route.ts`, `app/api/accounting/debts-sales/route.ts` y `components/dashboard/dashboard-page-client.tsx`. Hallazgos confirmados:

### 1.1 Sobre-fetch en el flujo auth → layout (cada navegación)

Antes de que el dashboard renderice, cada request hace **7 round-trips secuenciales** a Supabase:

| # | Archivo:línea | Query | Redundante con |
|---|---|---|---|
| 1 | `middleware.ts:126` | `auth.getUser()` | — |
| 2 | `middleware.ts:218` | `users.select(org_id, is_active)` | — |
| 3 | `middleware.ts:238` | `organizations.select(subscription_status...)` | — |
| 4 | `app/(dashboard)/layout.tsx:23` (`assertSubscriptionActive`) | re-fetch organizations | #3 |
| 5 | `app/(dashboard)/layout.tsx:25` (`getCurrentUser`) | re-fetch users + auth | #2, parte de #1 |
| 6 | `app/(dashboard)/layout.tsx:26` (`getUserAgencies`) | join user_agencies + agencies | — |
| 7 | `app/(dashboard)/layout.tsx:36` | re-fetch organizations | #3, #4 |

**3 de 7 son redundantes** — middleware, guard y banner pegan separados a `organizations`; mismo con `users`. A 50–300 ms por query, son 0.5–2 s gastados antes de cualquier render útil.

### 1.2 Dashboard cliente con 8 fetches paralelos sin caché

`components/dashboard/dashboard-page-client.tsx:191` dispara 8 fetches con `cache: "no-store"`. Cada fetch a `/api/...` re-ejecuta el middleware (otras 3 queries). **31 round-trips totales** por carga de dashboard (7 layout + 8 × 3 middleware).

### 1.3 N+1 confirmado en endpoints calientes

- `app/api/accounting/debts-sales/route.ts:227`: dentro de `for...of` sobre operations llama `getExchangeRate(supabase, date)` → 1 query a `exchange_rates` por operación. Con 1000 operations = 1000 queries secuenciales. Patrón "buildExchangeRateMap" ya existe en `lib/accounting/exchange-rates.ts` y está usado correctamente en `analytics/sales`.
- `app/api/analytics/sales/route.ts:69-117`: trae `sale_amount_total, margin_amount, operator_cost, currency, created_at, departure_date` de **todas** las operations en rango y suma en JS. Debería ser `SUM()` SQL.
- `app/api/reports/upcoming-due/route.ts:33-58`: queries de `payments` y `operator_payments` PENDING **sin** `.limit()`, **sin** filtro DB-side por agencia/seller; filtra en memoria (líneas 71–79). Crece linealmente con histórico pendiente.

### 1.4 Sin `React.cache()` en getters server

`getCurrentUser` (`lib/auth.ts:7-57`), `getUserAgencies` (`lib/auth.ts:59-99`), `getExchangeRate`, `getLatestExchangeRate` — ninguno wrappeado. Cada call dentro del mismo request re-pega a la DB.

### 1.5 Índices presumiblemente faltantes

Las 24 migrations de los últimos 7 días agregaron columnas y políticas RLS multi-tenant nuevas. RLS hace JOIN `users → user_agencies → agencies → organizations`. Sin índices cubrientes, cada SELECT paga ese JOIN. Validar en Fase 0 con Query Performance.

---

## 2. Estrategia: Fases con riesgo creciente

| Fase | Duración | Riesgo | Cuando ejecutar |
|---|---|---|---|
| **0 — Medir** | 15 min | cero | Antes de cualquier cambio |
| **A — Triage aditivo** | ~3.5 h | bajo | Inmediato post-baseline |
| **B — Quirúrgico profundo** | ~1 día | medio | Solo si A no alcanza el bar |
| **C — Reservado** | multi-día | medio-alto | Solo si A+B no alcanza |

**Principio rector**: cada cambio es un commit separado, revertible aislado. No mezclamos cambios. No optimizamos prematuramente.

---

## 3. Fase 0 — Medición

### 3.1 Supabase Query Performance

En Supabase Dashboard → Database → Query Performance → ventana últimas 24h. Exportar:
- Top 30 queries por **tiempo total acumulado**.
- Top 30 queries por **mean time**.
- Top 30 tablas por **seq_scan / idx_scan ratio** (sospechosos de falta de índice).

### 3.2 SQL de diagnóstico (correr en Supabase SQL Editor)

```sql
-- 1. Top 30 queries más caras (tiempo total)
SELECT
  substring(query, 1, 100) AS query_preview,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round((100.0 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) AS pct
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat%'
ORDER BY total_exec_time DESC
LIMIT 30;

-- 2. Tablas con seq scans desproporcionados
SELECT
  schemaname,
  relname,
  seq_scan,
  idx_scan,
  CASE WHEN seq_scan + idx_scan = 0 THEN 0
       ELSE round(100.0 * seq_scan / (seq_scan + idx_scan)::numeric, 2)
  END AS seq_pct,
  n_live_tup AS rows
FROM pg_stat_user_tables
WHERE n_live_tup > 100
ORDER BY seq_scan DESC
LIMIT 30;

-- 3. Índices no utilizados (candidatos a borrar — solo info, no borrar en Fase A)
SELECT
  schemaname,
  relname,
  indexrelname,
  idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;
```

### 3.3 Baseline Network tab (5 pantallas)

En producción (`app.vibook.ai`), con sesión real de Maxi (mismo agency, mismos filtros default), capturar **TTFB + total time** de:
- `/dashboard`
- `/sales/crm-manychat`
- `/cash/movements`
- `/operations`
- `/reports/financial`

### 3.4 Output

Archivo `docs/superpowers/perf/baseline-2026-04-27.md` con:
- Top 10 queries del 3.1 y 3.2.
- Tabla TTFB/total de las 5 pantallas.
- Lista de tablas con seq_pct > 50%.

**Sin esto, Fase A optimiza a ciegas.**

---

## 4. Fase A — Triage aditivo (~3.5 h, riesgo bajo)

8 cambios, ordenados por ratio impacto/riesgo. Cada uno = 1 commit.

### A1 — Eliminar las 3 queries redundantes en layout/middleware

**Archivos**:
- `app/(dashboard)/layout.tsx`
- `lib/auth.ts`
- `lib/billing/guard.ts`

**Cambio**:
1. Wrappear `getCurrentUser()`, `getUserAgencies(userId)`, y `assertSubscriptionActive()` con `cache()` de `react`. Esto deduplica DENTRO del mismo request.
2. En `assertSubscriptionActive` y `layout.tsx:36`, reusar el resultado de `getCurrentUser()` en vez de re-fetchear `organizations`. Si el dato no está en el user, agregar un single-fetch helper `getCurrentOrganization()` también con `cache()`.
3. Eliminar la query duplicada de `organizations` en `layout.tsx:36-40` (la del `SubscriptionBanner`) — el guard ya tiene la data; pasarla por prop.

**Test post-cambio**: navegar 5 páginas autenticadas, abrir Network, contar queries a Supabase REST → debe bajar de ~7 a ~3.

**Riesgo**: bajo. La deduplicación es feature nativa de Next 15 / React 19.

**Rollback**: `git revert <commit>`.

### A2 — Fix N+1 en `debts-sales`

**Archivo**: `app/api/accounting/debts-sales/route.ts`

**Cambio**:
1. Antes del loop principal (línea ~165), recopilar todas las fechas únicas de operations.
2. Llamar `buildExchangeRateMap(supabase, allDates)` una sola vez (helper ya existe en `lib/accounting/exchange-rates.ts`, usado en `analytics/sales`).
3. Reemplazar `await getExchangeRate(supabase, date)` dentro del loop por lookup en el map.

**Test post-cambio**: comparar response JSON de la endpoint antes/después con un dataset de prueba. Debe ser **idéntico** (mismos `totalDebt` por customer, mismo orden, mismos `debtUsd` por operación).

**Riesgo**: cero. Misma función matemática, distinta forma de pedir los datos.

**Rollback**: `git revert <commit>`.

### A3 — `/api/analytics/sales` → SUM SQL via RPC

**Archivos**:
- Nueva migration: `supabase/migrations/20260427150000_analytics_sales_rpc.sql`
- `app/api/analytics/sales/route.ts`

**Cambio**:

```sql
CREATE OR REPLACE FUNCTION analytics_sales_summary(
  p_user_id UUID,
  p_org_id UUID,
  p_role TEXT,
  p_agency_ids UUID[],
  p_date_from DATE,
  p_date_to DATE,
  p_agency_id UUID DEFAULT NULL,
  p_seller_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_sales_usd NUMERIC,
  total_margin_usd NUMERIC,
  total_cost_usd NUMERIC,
  operations_count BIGINT,
  avg_margin_percent NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ops AS (
    SELECT
      o.sale_amount_total,
      o.margin_amount,
      o.operator_cost,
      COALESCE(o.sale_currency, o.currency, 'USD') AS curr,
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date
    FROM operations o
    WHERE o.org_id = p_org_id
      AND (p_role = 'SUPER_ADMIN'
           OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
           OR (p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
               AND (cardinality(p_agency_ids) = 0 OR o.agency_id = ANY(p_agency_ids))))
      AND (p_agency_id IS NULL OR o.agency_id = p_agency_id)
      AND (p_seller_id IS NULL OR o.seller_id = p_seller_id)
      AND (p_date_from IS NULL OR o.created_at >= p_date_from)
      AND (p_date_to IS NULL OR o.created_at < (p_date_to + INTERVAL '1 day'))
  ),
  ops_with_rate AS (
    SELECT
      ops.*,
      CASE
        WHEN ops.curr = 'USD' THEN 1::numeric
        ELSE COALESCE(
          (SELECT er.usd_ars FROM exchange_rates er WHERE er.rate_date <= ops.rate_date ORDER BY er.rate_date DESC LIMIT 1),
          (SELECT er.usd_ars FROM exchange_rates er ORDER BY er.rate_date DESC LIMIT 1),
          1000::numeric
        )
      END AS fx
    FROM ops
  )
  SELECT
    COALESCE(SUM(CASE WHEN curr='ARS' THEN sale_amount_total/fx ELSE sale_amount_total END), 0)::numeric AS total_sales_usd,
    COALESCE(SUM(CASE WHEN curr='ARS' THEN margin_amount/fx ELSE margin_amount END), 0)::numeric AS total_margin_usd,
    COALESCE(SUM(CASE WHEN curr='ARS' THEN operator_cost/fx ELSE operator_cost END), 0)::numeric AS total_cost_usd,
    COUNT(*)::bigint AS operations_count,
    CASE WHEN COALESCE(SUM(CASE WHEN curr='ARS' THEN sale_amount_total/fx ELSE sale_amount_total END), 0) > 0
      THEN (COALESCE(SUM(CASE WHEN curr='ARS' THEN margin_amount/fx ELSE margin_amount END), 0)
            / COALESCE(SUM(CASE WHEN curr='ARS' THEN sale_amount_total/fx ELSE sale_amount_total END), 1) * 100)::numeric
      ELSE 0::numeric
    END AS avg_margin_percent
  FROM ops_with_rate;
$$;
```

> **Nota**: el nombre de la columna en `exchange_rates` (acá `usd_ars`) hay que confirmarlo en Fase 0 leyendo el schema. Si la tabla usa otro nombre, ajustar la RPC antes de aplicarla.

En `route.ts` reemplazar todo el bloque de fetch + suma por una llamada `supabase.rpc('analytics_sales_summary', { ... })`.

**Test post-cambio**: comparar respuesta antes/después en 5 rangos de fecha distintos (último mes, últimos 7 días, año, custom con ARS, custom con USD only). Tolerancia: ±0.01 USD por rounding.

**Riesgo**: medio-bajo. La RPC tiene que dar exactamente el mismo resultado. Test obligatorio antes de mergear.

**Rollback**: revert del commit del route.ts (la migration RPC puede quedar — no rompe nada).

### A4 — `LIMIT` y filtros DB-side en `upcoming-due`

**Archivos**:
- `app/api/reports/upcoming-due/route.ts`
- Nueva migration: `supabase/migrations/20260427160000_upcoming_due_indexes.sql`

**Cambio**:
1. En el query de `payments`, agregar:
   - `.eq("operation.agency_id", agencyId)` cuando `agencyId !== "all"` (filtro DB, no en memoria).
   - `.eq("operation.seller_id", user.id)` cuando role = SELLER.
   - `.limit(500)`.
2. Mismo cambio en query de `operator_payments`.
3. Eliminar los filtros en memoria (líneas 71–79).
4. Migration con índices:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_pending_due
  ON payments(payer_type, status, date_due)
  WHERE status IN ('PENDING','OVERDUE');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operator_payments_pending_due
  ON operator_payments(status, due_date)
  WHERE status IN ('PENDING','OVERDUE');
```

**Test post-cambio**: comparar count y orden de la respuesta antes/después.

**Riesgo**: cero (lógica equivalente, distinto plano de ejecución).

**Rollback**: `git revert` + `DROP INDEX CONCURRENTLY IF EXISTS idx_payments_pending_due, idx_operator_payments_pending_due;`

### A5 — Quitar `cache: "no-store"` del dashboard

**Archivos**:
- `components/dashboard/dashboard-page-client.tsx:168-170`
- Endpoints `/api/analytics/*`, `/api/accounting/debts-sales` (agregar header `Cache-Control: private, max-age=30`)

**Cambio**:
1. Eliminar `cache: "no-store"` (volver al default).
2. En cada `NextResponse.json(...)` de los analytics endpoints, agregar:
   ```ts
   { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } }
   ```

**Test post-cambio**: navegar al dashboard, salir, volver dentro de 30 s → no debe re-fetchear (Network tab muestra 200 from disk cache). Click "Actualizar" sigue forzando refresh.

**Riesgo**: bajo. Si el user quiere data fresca, el botón "Actualizar" sigue funcionando (envía no-cache vía `RefreshCw`).

**Rollback**: `git revert`.

### A6 — Índices

**Archivo**: nueva migration `supabase/migrations/20260427170000_perf_indexes.sql`

**Cambio**:

```sql
-- Multi-tenant: org_id es el filtro más usado en cada SELECT.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operations_org_created_at
  ON operations(org_id, created_at DESC) WHERE org_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cash_movements_org_date
  ON cash_movements(org_id, movement_date DESC) WHERE org_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_updated
  ON leads(org_id, updated_at DESC) WHERE org_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_messages_org_received
  ON wa_messages(org_id, received_at DESC) WHERE org_id IS NOT NULL;

-- Auth: middleware busca users por auth_id en cada request
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_auth_id
  ON users(auth_id) WHERE auth_id IS NOT NULL;

-- Joins frecuentes en debts-sales y customers
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_customers_op
  ON operation_customers(operation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_customers_cust
  ON operation_customers(customer_id);

-- Operation status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operations_org_status_dep
  ON operations(org_id, status, departure_date) WHERE org_id IS NOT NULL;
```

**Validación previa** (Fase 0): confirmar que estos índices NO existen ya bajo otro nombre. Si alguno ya existe equivalente, omitir.

**Test post-cambio**: re-correr el SQL de pg_stat_user_tables; las tablas calientes deben tener seq_pct más bajo.

**Riesgo**: cero. `CONCURRENTLY` no toma lock. Si Postgres elige plan peor (raro), el índice sigue ahí pero no se usa — no rompe nada.

**Rollback**: `DROP INDEX CONCURRENTLY IF EXISTS idx_<nombre>;` por cada uno. SQL de rollback va junto a la migration.

### A7 — `React.cache()` en getters server

**Archivos**:
- `lib/auth.ts`
- `lib/accounting/exchange-rates.ts`

**Cambio**:

```ts
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  // ... cuerpo actual
})

export const getUserAgencies = cache(async (userId: string) => {
  // ... cuerpo actual
})

export const getLatestExchangeRate = cache(async (supabase: SupabaseClient) => {
  // ... cuerpo actual
})
```

`getExchangeRate(supabase, date)`: para cachear correctamente con date variable, usar la versión que ya existe `buildExchangeRateMap` cuando se necesitan múltiples; para single-call no aporta wrappear con cache.

**Test post-cambio**: en una API route que use `getCurrentUser()` 3 veces (ej. via permisos + filtros + response), la query a Supabase debe verse 1 vez en logs.

**Riesgo**: bajo. `cache()` deduplica solo dentro del mismo request lifecycle.

**Rollback**: `git revert`.

### A8 — SSR del dashboard con datos pre-fetchados

**Archivos**:
- `app/(dashboard)/dashboard/page.tsx` (server component)
- `components/dashboard/dashboard-page-client.tsx` (recibe data inicial)

**Cambio**:
1. En `page.tsx`, hacer los 8 fetches **server-side** con `Promise.all` usando `createServerClient()` directo (no fetch HTTP self).
2. Pasar los 8 resultados como props iniciales al client component.
3. En el client, mantener el `useEffect` con `fetchDashboardData` para cuando cambian filtros, pero **no** dispararlo en mount inicial si los filtros están en default.

**Beneficios**:
- 8 fetches HTTP → 1 SSR (los 8 fetches se hacen como queries directas, no via API self-call).
- No espera el JS bundle del cliente.
- Streaming SSR muestra KPIs antes que charts.

**Test post-cambio**: lighthouse score TTI antes/después; manualmente comparar tiempo de "primera KPI visible" en dashboard.

**Riesgo**: medio-bajo. Hay que asegurar que el flujo de cambio de filtros sigue intacto (`useTransition` para no bloquear UI).

**Rollback**: `git revert`.

### Resumen Fase A

| # | Cambio | Tiempo | Riesgo | Impacto esperado |
|---|---|---|---|---|
| A1 | Dedupe layout/middleware | 30 min | bajo | TTFB global -40% |
| A2 | Fix N+1 debts-sales | 30 min | cero | endpoint -95% |
| A3 | SUM SQL en analytics/sales | 30 min | medio-bajo | endpoint -80% |
| A4 | LIMIT + index upcoming-due | 20 min | cero | endpoint 50–100x |
| A5 | Quitar no-store | 10 min | bajo | UX percibida +30% |
| A6 | Índices generales | 20 min | cero | queries calientes -50% |
| A7 | React.cache getters | 30 min | bajo | -50% queries por request |
| A8 | SSR dashboard | 45 min | medio-bajo | dashboard 12s → 1.5s |
| **Total** | | **~3.5 h** | **bajo** | **dashboard 8–12x** |

---

## 5. Fase B — Quirúrgico profundo (~1 día, riesgo medio)

Solo si Fase A no cumple los criterios de éxito (Sección 7). Sin escribir aún:

- **B1** — React Query / SWR para fetches del dashboard. Stale-while-revalidate, deduplicación cross-tab. **2 h**.
- **B2** — Auditoría RLS de las 5 tablas calientes (`operations`, `leads`, `payments`, `cash_movements`, `wa_messages`). `EXPLAIN ANALYZE` con un user de Lozada y otro de Maxeva. Si una policy hace JOIN sin índice cubriente, agregar índice o reescribir policy. **2 h**.
- **B3** — Materialized view `mv_dashboard_kpis_daily` (sales, margin, ops_count por org/agency/date). Refresh por trigger en INSERT/UPDATE a `operations` y `payments`. Dashboard lee de mv. **3 h**.
- **B4** — Paginación cursor-based en kanbans/listas (`leads-kanban-manychat`, `cash/movements`, `operations`). Offset escala mal. **2 h**.
- **B5** — Particionar `wa_messages` por mes si la tabla pasa 100k rows. **1 h**.

---

## 6. Fase C — Reservado (multi-día, riesgo medio-alto)

No ejecutamos por defecto. Documentado para que esté en el radar:

- Split del bundle JS por ruta.
- Suspense boundaries finos en pantallas grandes.
- Edge runtime para reads simples (si Railway lo permite).
- Reescritura de componentes grandes (`leads-kanban`, `operations-table`).

---

## 7. Criterios de éxito

### 7.1 Bar mínimo aceptable post-A

Network tab Chrome DevTools, mismo user de Maxi en `app.vibook.ai`, mismos filtros default:

| Pantalla | Antes (estimado) | Target post-A | Target post-A+B |
|---|---|---|---|
| `/dashboard` | 8–12 s | <2 s | <800 ms |
| `/sales/crm-manychat` | 5–8 s | <1.5 s | <500 ms |
| `/cash/movements` | 4–7 s | <1 s | <400 ms |
| `/operations` | 3–5 s | <1 s | <400 ms |
| `/reports/upcoming-due` | 5–15 s | <500 ms | <300 ms |
| Navegación entre páginas | 1–3 s | <500 ms | <200 ms |

### 7.2 Reality check sobre el "50x"

- En `/reports/upcoming-due` y endpoints con N+1 (debts-sales): 50–100x es realista.
- En navegación general: target honesto 6–10x.
- "El sistema entero 50x" no es físico, pero "el sistema entero se siente fluido y vendible" sí lo es. Ese es el bar real.

### 7.3 Métricas DB

Post Fase A, en pg_stat_statements:
- Top 5 queries más caras → mean time bajado al menos 5x.
- Tablas calientes (`operations`, `payments`, `cash_movements`, `leads`, `wa_messages`) → seq_pct bajo 20%.

---

## 8. Rollback y seguridad

Reglas hard:
1. **Cada A1–A8 es un commit aislado**. Branch: `perf/phase-a`. Mergeable de a uno con cherry-pick.
2. **Zero-touch en producción** durante el cambio: índices CONCURRENTLY, RPC additive, no cambios a RLS, no cambios a triggers, no cambios a integraciones.
3. **Migrations tienen rollback inverso documentado** — el SQL de `DROP INDEX IF EXISTS` y `DROP FUNCTION IF EXISTS` va en el cuerpo del PR (no en archivo separado, para que se ejecute manual si hace falta).
4. **No se pushea sin OK explícito** del owner. Toda Fase A queda local hasta que se diga lo contrario (regla de proyecto).
5. **Smoke manual obligatorio** post-merge en preview: dashboard, leads, cash/movements, ABM operación nueva. Si algo se rompe → revert inmediato.

---

## 9. Prerequisitos para ejecutar

- [ ] Acceso a Supabase Dashboard → Query Performance.
- [ ] Acceso a Supabase SQL Editor para correr migrations + diagnostic SQL.
- [ ] Sesión de Maxi en producción para baseline + medición post (puede ser otro user con misma agencia).
- [ ] Confirmar nombre exacto de columnas en `exchange_rates` (necesario para A3).
- [ ] Branch limpio desde `main` antes de empezar (working tree con cambios pending pasa primero).

---

## 10. Checklist de smoke post-Fase A

Antes de mergear a main:

- [ ] Dashboard carga con filtros default y muestra KPIs.
- [ ] Cambiar filtro de fechas en dashboard re-fetchea correctamente.
- [ ] `/sales/crm-manychat` muestra leads en kanban.
- [ ] `/cash/movements` muestra paginado, filtros funcionan.
- [ ] Crear movement nuevo → aparece en lista, ledger se crea.
- [ ] `/operations` lista y filtros OK.
- [ ] Login de un user SELLER → ve solo sus operations.
- [ ] Login de un user de otra org → no ve data de Lozada (RLS intacto).
- [ ] `/reports/upcoming-due` carga rápido y muestra mismos números.
- [ ] No errores 500 en logs de Railway durante 1h post-merge.

---

## 11. Próximos pasos

1. User aprueba este spec.
2. Invocar `superpowers writing-plans` para generar plan paso a paso ejecutable.
3. Ejecutar Fase 0 (medición).
4. Ejecutar Fase A en branch `perf/phase-a`, commit por cambio.
5. Merge a main solo con OK explícito.
6. Medir post-A. Si hit el bar → done. Si no → ejecutar Fase B.
