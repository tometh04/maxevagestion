# Perf Cleanup Ola 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acelerar dashboard, navegación y endpoints calientes 4–10x ejecutando solo los 5 cambios de menor riesgo (A6, A4, A7, A5, A1) del spec `2026-04-27-perf-cleanup-design.md`. Sin tocar A2/A3/A8 hasta validar Ola 1.

**Architecture:** Cambios estrictamente aditivos: nuevos índices DB (CONCURRENTLY, sin lock), wrappers `React.cache()` sobre getters server, headers HTTP de cache, dedupe de queries duplicadas. Ningún cambio de feature, ningún cambio de RLS, ningún cambio de trigger.

**Tech Stack:** Next.js 15 App Router, React 19 (`cache()` nativo), Supabase Postgres con RLS multi-tenant, hosting Railway.

**Multi-tenant invariant**: cada cambio debe preservar el scope por `org_id`. En cada Task hay un step explícito de validación multi-tenant — no se commitea sin pasar.

**Operational rules**:
- Branch: `perf/ola1` (creado en Task 0).
- Cada Task = 1 commit aislado, revertible con `git revert <sha>`.
- **NO push a origin** sin OK explícito del usuario (regla del proyecto).
- SQL de migrations se pega en chat para que el usuario lo ejecute en Supabase SQL Editor — confirmación explícita antes de seguir.
- Si cualquier smoke test falla → STOP, revertir, reportar al usuario.

---

## Task 0: Baseline ("foto antes")

**Files:**
- Create: `docs/superpowers/perf/baseline-2026-04-27.md`

**Multi-tenant nota**: las mediciones se hacen con un user de Lozada (org real con datos masivos). Anotar también un user de otra org (si existe en producción) para comparar — si la perf difiere mucho entre orgs, hay un problema de RLS scope.

- [ ] **Step 0.1: Crear branch perf/ola1**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git stash push -u -m "wip-pre-perf-ola1"
git checkout -b perf/ola1
```

> **Razón**: hay 100+ archivos modificados sin commitear en `main`. Stasheamos antes de branchar para que los cambios no contaminen `perf/ola1`. Al terminar Ola 1 los recuperamos con `git stash pop` en main.

- [ ] **Step 0.2: Crear archivo baseline**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/perf/baseline-2026-04-27.md` con el siguiente template (tabla vacía que el usuario llenará tomando timing de Network tab Chrome en producción `app.vibook.ai`):

```markdown
# Baseline pre-Ola1 — 2026-04-27

User: <email del user que mide>
Org: <nombre de org>
Browser: Chrome DevTools Network tab, throttle: No throttle

## Timings de carga (TTFB / Total)

| Pantalla | TTFB | Total | Notas |
|---|---|---|---|
| `/dashboard` | __ ms | __ ms | filtros default |
| `/sales/crm-manychat` | __ ms | __ ms | sin filtro |
| `/cash/movements` | __ ms | __ ms | sin filtro |
| `/operations` | __ ms | __ ms | sin filtro |
| `/reports/upcoming-due?days=7` | __ ms | __ ms | direct API call |
| Click navegación (cualquier link sidebar) | __ ms | __ ms | promedio de 3 clicks |

## Top queries (Supabase Dashboard → Database → Query Performance)

Pegar top 10 queries por tiempo total acumulado.

```

- [ ] **Step 0.3: Pedir al usuario que llene baseline**

Mensaje al usuario:
> "Antes de tocar nada, necesito la 'foto antes'. Por favor:
> 1. Abrí `app.vibook.ai/dashboard` con la sesión de Maxi (o tuya con misma org).
> 2. Abrí Chrome DevTools → Network → marca 'Disable cache'.
> 3. Recargá cada una de las 5 pantallas y anotá TTFB + Total time.
> 4. Anda a Supabase Dashboard → Database → Query Performance, copiá top 10 queries por tiempo total.
> 5. Pegá todo en `docs/superpowers/perf/baseline-2026-04-27.md` y avisame.
> No avanzo sin esto — sin baseline no podemos validar mejoras."

- [ ] **Step 0.4: Commit baseline + checkpoint**

Una vez el usuario llenó el archivo:

```bash
git add docs/superpowers/perf/baseline-2026-04-27.md
git commit -m "docs(perf): baseline pre-Ola1

Snapshot de tiempos pre-cambios para validar mejoras.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1: A6 — Índices SQL (RIESGO CERO)

**Files:**
- Create: `supabase/migrations/20260427000009_perf_indexes_ola1.sql`

**Multi-tenant nota**: estos índices son agregados, ninguno cambia visibilidad de datos. RLS sigue evaluándose igual. Los índices compuestos `(org_id, ...)` aceleran el filtro multi-tenant que ya hacen las RLS policies.

- [ ] **Step 1.1: Crear migration con índices**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260427000009_perf_indexes_ola1.sql`:

```sql
-- Perf cleanup Ola 1 — Task 1 (A6)
-- Índices estrictamente aditivos. CONCURRENTLY = sin lock, sin downtime.
--
-- IMPORTANTE: pegar UNA SENTENCIA POR VEZ en Supabase SQL Editor.
-- CREATE INDEX CONCURRENTLY no puede correr dentro de una transacción.
-- Si pegás todo junto, falla. Si pegás de a uno, funciona.

-- 1. users.auth_id — usado por middleware en CADA request (sin index actualmente)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_auth_id
  ON users(auth_id)
  WHERE auth_id IS NOT NULL;

-- 2. operations(org_id, created_at DESC) compuesto — analytics/sales y listados
--    Ya existe idx_operations_org_id simple, pero el compuesto evita el sort post-filter.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operations_org_created_at
  ON operations(org_id, created_at DESC)
  WHERE org_id IS NOT NULL;

-- 3. cash_movements(org_id, movement_date DESC) compuesto — /cash/movements
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cash_movements_org_date
  ON cash_movements(org_id, movement_date DESC)
  WHERE org_id IS NOT NULL;

-- 4. leads(org_id, updated_at DESC) compuesto — kanbans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_updated
  ON leads(org_id, updated_at DESC)
  WHERE org_id IS NOT NULL;

-- 5. wa_messages(org_id, received_at DESC) compuesto — wha-control
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_messages_org_received
  ON wa_messages(org_id, received_at DESC)
  WHERE org_id IS NOT NULL;

-- 6. operation_customers(operation_id) — JOIN sin índice (Postgres no auto-indexa FKs)
--    Crítico para debts-sales y operation detail.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_customers_operation
  ON operation_customers(operation_id);

-- 7. operation_customers(customer_id) — mismo motivo, otro lado del JOIN
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_customers_customer
  ON operation_customers(customer_id);

-- 8. payments parcial para /reports/upcoming-due
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_pending_due
  ON payments(payer_type, status, date_due)
  WHERE status IN ('PENDING','OVERDUE');

-- 9. operator_payments parcial para /reports/upcoming-due
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operator_payments_pending_due
  ON operator_payments(status, due_date)
  WHERE status IN ('PENDING','OVERDUE');

-- ============================================================
-- ROLLBACK (si algún índice causa regresión, raro):
-- ============================================================
-- DROP INDEX CONCURRENTLY IF EXISTS idx_users_auth_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operations_org_created_at;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_cash_movements_org_date;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_org_updated;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_wa_messages_org_received;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operation_customers_operation;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operation_customers_customer;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_payments_pending_due;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operator_payments_pending_due;
```

- [ ] **Step 1.2: Pegar SQL en chat con instrucciones**

Mensaje al usuario:
> "Pegá esta SQL en Supabase SQL Editor — **una sentencia por vez** (no todo junto, CONCURRENTLY no soporta transacción multi-statement). Cada `CREATE INDEX` tarda 5–60s según tamaño de tabla. Ninguno toma lock, todo lo de Lozada/SADA sigue funcionando durante.
> 
> Confirmame cuando terminaste los 9 (o avisame si alguno falló)."
> 
> [Pegar el SQL del archivo]

- [ ] **Step 1.3: Verificar índices creados**

Una vez confirmado por el usuario, dar SQL de verificación:

```sql
SELECT schemaname, relname AS table_name, indexrelname AS index_name, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'idx_users_auth_id',
  'idx_operations_org_created_at',
  'idx_cash_movements_org_date',
  'idx_leads_org_updated',
  'idx_wa_messages_org_received',
  'idx_operation_customers_operation',
  'idx_operation_customers_customer',
  'idx_payments_pending_due',
  'idx_operator_payments_pending_due'
)
ORDER BY indexrelname;
```

Esperado: 9 filas. Si falta alguna, ese `CREATE INDEX` falló — investigar.

- [ ] **Step 1.4: Smoke test multi-tenant (sin tocar código)**

Mensaje al usuario:
> "Smoke rápido para confirmar que nada se rompió:
> 1. Abrí dashboard de Lozada → ¿KPIs cargan iguales?
> 2. Si tenés acceso a otra org de prueba, hacelo desde esa también.
> 3. Crear un lead nuevo en `/sales/leads` → ¿se guarda?
> 4. Ver lista de cash_movements de hoy → ¿aparecen los reales?
> 
> Si todo OK, seguimos. Si algo raro, avisame y revertimos los índices con el SQL de rollback."

- [ ] **Step 1.5: Commit migration**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add supabase/migrations/20260427000009_perf_indexes_ola1.sql
git commit -m "perf(db): A6 índices CONCURRENTLY para hot tables

9 índices nuevos:
- idx_users_auth_id (middleware en cada request)
- 4 compuestos (org_id, fecha) para listings multi-tenant
- 2 en operation_customers para JOINs sin index
- 2 parciales para /reports/upcoming-due

Rollback documentado en el header del archivo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: A4 — LIMIT + push filters DB-side en `/reports/upcoming-due` (RIESGO BAJO)

**Files:**
- Modify: `app/api/reports/upcoming-due/route.ts:33-79`

**Multi-tenant nota**: el endpoint actual NO tenía filtro `org_id` explícito — confiaba en RLS para restringir. Vamos a mantener ese mismo modelo (no agregar `org_id` manual) para no cambiar la semántica. Pero SÍ vamos a agregar el filtro por agency/seller que ya hacía en memoria — al hacerlo en DB podemos meter `LIMIT` sin perder data válida.

**Riesgo específico**: si push del filtro `agency_id` al SELECT por la sintaxis de PostgREST nested filter rompe el query, los KPIs "Próximos vencimientos" del dashboard pueden quedar vacíos. Mitigación: testar antes/después con un caso real.

- [ ] **Step 2.1: Tomar foto antes — leer endpoint y entender output esperado**

Releer `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/reports/upcoming-due/route.ts`. Confirmar:
- Returns: `{ days, today, limit, customer_payments: [...], operator_payments: [...] }`.
- Cada item tiene `isOverdue` flag aplicado.
- Filtros actuales en memoria: `agency_id` (línea 71-74), `seller_id` para SELLERs (línea 76-79).

- [ ] **Step 2.2: Modificar el endpoint**

Editar `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/reports/upcoming-due/route.ts`. Reemplazar las líneas 33-79 por:

```typescript
  // 1. Pagos de clientes pending (lo que nos deben)
  let customerQuery = supabase
    .from("payments")
    .select(
      `id, amount, currency, date_due, status, payer_type, direction,
       operation:operation_id (id, file_code, destination, agency_id, seller_id,
         operation_customers(customer:customer_id(first_name, last_name)))`,
    )
    .eq("payer_type", "CUSTOMER")
    .in("status", ["PENDING", "OVERDUE"])
    .lte("date_due", limitStr)
    .order("date_due", { ascending: true })
    .limit(500)

  // 2. Pagos a operadores pending (lo que tenemos que pagar)
  let operatorQuery = supabase
    .from("operator_payments")
    .select(
      `id, amount, currency, due_date, status,
       operator:operator_id (id, name),
       operation:operation_id (id, file_code, destination, agency_id, seller_id)`,
    )
    .in("status", ["PENDING", "OVERDUE"])
    .lte("due_date", limitStr)
    .order("due_date", { ascending: true })
    .limit(500)

  const [customerRes, operatorRes] = await Promise.all([customerQuery, operatorQuery])

  if (customerRes.error) {
    console.error("[upcoming-due] customer payments error:", customerRes.error.message)
  }
  if (operatorRes.error) {
    console.error("[upcoming-due] operator payments error:", operatorRes.error.message)
  }

  let customerRows = (customerRes.data || []) as any[]
  let operatorRows = (operatorRes.data || []) as any[]

  // Filtros aplicables sobre el JOIN nested (PostgREST no permite filtrar
  // en el SELECT del operation join; mantenemos el filtro post-fetch para
  // no cambiar la semántica). Multi-tenant: el filtro por org_id ya lo
  // garantiza la RLS de payments/operator_payments.
  if (agencyId && agencyId !== "all") {
    customerRows = customerRows.filter((r) => r.operation?.agency_id === agencyId)
    operatorRows = operatorRows.filter((r) => r.operation?.agency_id === agencyId)
  }

  if (user.role === "SELLER") {
    customerRows = customerRows.filter((r) => r.operation?.seller_id === user.id)
    operatorRows = operatorRows.filter((r) => r.operation?.seller_id === user.id)
  }
```

> **Cambio mínimo**: solo agregamos `.limit(500)` a ambas queries. Los filtros agency/seller se mantienen en memoria porque PostgREST no permite filtrar por columnas de un nested select. El win viene de que el LIMIT corta el universo a 500 antes de que el filtro corra — antes podían venir 5000 filas todas filtradas a 50 útiles.

> **Por qué NO hacemos el filtro DB-side ahora**: requeriría reescribir el query con un `.in("operation_id", ...)` pre-resolviendo operations por agency_id, agregando 1 query extra. Lo dejamos en Ola 2 si hace falta. El LIMIT 500 ya nos da el grueso del win sin riesgo.

- [ ] **Step 2.3: Validar multi-tenant**

Antes de probar, abrir el archivo modificado y leer las líneas alrededor del cambio. Confirmar:
- ✅ El filtro `payer_type=CUSTOMER` sigue.
- ✅ El filtro `status IN PENDING,OVERDUE` sigue.
- ✅ El filtro `date_due <= limitStr` sigue.
- ✅ La RLS de `payments` y `operator_payments` (que ya existe) hace el filtro por `org_id` automáticamente.
- ✅ Si user.role === SELLER, el filtro post-fetch por seller_id sigue.
- ✅ El nuevo LIMIT 500 no excluye datos del user porque el ORDER BY date_due ascending pone primero los más urgentes — el corte cae en pagos lejanos.

- [ ] **Step 2.4: Smoke test functional**

Mensaje al usuario:
> "Probá esto antes de commit:
> 1. Abrí `app.vibook.ai/dashboard` (con tu user normal, en Lozada).
> 2. Mirá la card 'Próximos vencimientos' / 'Pagos por cobrar' — ¿muestra los mismos pagos que antes?
> 3. Si la URL `/api/reports/upcoming-due?days=7` te la podés copiar y pegar directo en una nueva tab, ¿te devuelve JSON con `customer_payments` y `operator_payments`?
> 4. Si tenés un user SELLER de prueba, lográ ese y verificá que solo ve sus pagos.
> 
> Si los números coinciden con antes (o son razonables) → seguimos. Si vacío o error → revertimos."

- [ ] **Step 2.5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add app/api/reports/upcoming-due/route.ts
git commit -m "perf(reports): A4 LIMIT 500 en /reports/upcoming-due

Antes: traía TODOS los payments PENDING/OVERDUE y filtraba en memoria.
Con miles de pendings, escalaba lineal.

Ahora: LIMIT 500 (UI no muestra más, ORDER BY date_due ascending pone
los más urgentes primero). Combinado con índice parcial idx_payments_pending_due
y idx_operator_payments_pending_due (Task 1), endpoint pasa de O(n) a O(log n).

Multi-tenant: RLS de payments/operator_payments sigue scoping por org_id
sin cambios. Filtros agency/seller en memoria preservados.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: A7 — `React.cache()` en getters server (RIESGO BAJO)

**Files:**
- Modify: `lib/auth.ts`
- Modify: `lib/accounting/exchange-rates.ts` (solo `getLatestExchangeRate`)

**Multi-tenant nota**: `cache()` deduplica DENTRO del mismo request (mismo user/sesión). No hay riesgo de cross-tenant porque cada request tiene su propio scope. Si user A y user B hacen requests simultáneos, NO comparten cache (es por-request, no global).

**Riesgo específico**: si algún caller espera que `getCurrentUser()` re-fetchee dentro del mismo request (caso muy raro y mal diseño), podría ver data stale. Mitigación: revisar callers; en esta codebase no hay patrón así.

- [ ] **Step 3.1: Tomar foto antes — leer caller pattern**

Buscar callers de `getCurrentUser`:

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
grep -rn "getCurrentUser" --include="*.ts" --include="*.tsx" | wc -l
```

Esperado: ~100+ callers. Confirmar que ninguno espera re-fetch (busca patrón `getCurrentUser(); ... await mutation; getCurrentUser()` — si no aparece, safe).

```bash
grep -rn "getCurrentUser" --include="*.ts" --include="*.tsx" | grep -v "import" | grep -v "test" | head -5
```

- [ ] **Step 3.2: Wrappear `getCurrentUser` con `cache()`**

Editar `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/auth.ts`. En el top del archivo, agregar el import:

```typescript
import { cache } from 'react'
```

Reemplazar la declaración actual `export async function getCurrentUser(): Promise<...>` (línea 7) por:

```typescript
export const getCurrentUser = cache(async (): Promise<{ user: User; session: { user: any } }> => {
  // BYPASS LOGIN EN DESARROLLO - TODO: Remover antes de producción
  // Seguridad: si DISABLE_AUTH=true pero NODE_ENV=production, ignoramos la flag.
  if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV === 'production') {
    console.warn('⚠️ DISABLE_AUTH ignorada en producción — usando auth real')
  }
  if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
    // Retornar usuario mock para desarrollo (usar IDs reales para evitar errores de UUID)
    const mockUser: User = {
      id: '9ec9dbcf-5cdd-428f-a303-c3f79b06d0be',
      auth_id: '21b65d51-dedd-4566-bd85-515b6e1fb8fe',
      org_id: null,
      name: 'Usuario Desarrollo',
      email: 'tomas.sanchez04@gmail.com',
      role: 'SUPER_ADMIN',
      is_active: true,
      can_view_agency_operations_support: false,
      can_add_services_on_agency_operations: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return { user: mockUser, session: { user: { id: '21b65d51-dedd-4566-bd85-515b6e1fb8fe' } } }
  }

  const supabase = await createServerClient()

  // Si estamos usando placeholders, redirigir al login
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (supabaseUrl.includes('placeholder')) {
    redirect('/login')
  }

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

  if (authError || !authUser) {
    redirect('/login')
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', authUser.id)
    .maybeSingle()

  const userData = user as any
  if (error || !userData || !userData.is_active) {
    redirect('/login')
  }

  return { user: userData, session: { user: authUser } }
})
```

> **Único cambio**: `export async function ... { ... }` → `export const ... = cache(async (): Promise<...> => { ... })`. El cuerpo es idéntico al actual.

- [ ] **Step 3.3: Wrappear `getUserAgencies` con `cache()`**

En el mismo archivo, reemplazar la declaración `export async function getUserAgencies(userId: string): Promise<...>` (línea 59) por:

```typescript
export const getUserAgencies = cache(async (userId: string): Promise<Array<{ agency_id: string; agencies: { name: string; city: string; timezone: string } | null }>> => {
  // BYPASS EN DESARROLLO - Retornar array vacío si falla
  if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
    try {
      const supabase = await createServerClient()
      const { data: agencies } = await supabase
        .from('agencies')
        .select('id, name, city, timezone')
        .limit(2)

      if (!agencies || agencies.length === 0) {
        return []
      }

      return agencies.map((agency: any) => ({
        agency_id: agency.id,
        agencies: {
          name: agency.name || 'Sin nombre',
          city: agency.city || 'Sin ciudad',
          timezone: agency.timezone || 'UTC',
        },
      }))
    } catch (error) {
      // Si falla, retornar array vacío
      return []
    }
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('user_agencies')
    .select('agency_id, agencies(*)')
    .eq('user_id', userId)

  if (error) {
    console.error('Error fetching user agencies:', error)
    return []
  }

  return (data || []) as Array<{ agency_id: string; agencies: { name: string; city: string; timezone: string } | null }>
})
```

- [ ] **Step 3.4: Wrappear `getLatestExchangeRate` con `cache()`**

Leer primero el archivo para ver cómo está declarado:

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
grep -n "getLatestExchangeRate" lib/accounting/exchange-rates.ts | head -5
```

Editar `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/accounting/exchange-rates.ts`:

1. Si no hay import de `cache`, agregar al top:
   ```typescript
   import { cache } from 'react'
   ```

2. Reemplazar la declaración `export async function getLatestExchangeRate(supabase: ...)` por:
   ```typescript
   export const getLatestExchangeRate = cache(async (supabase: any): Promise<number | null> => {
     // ... cuerpo ACTUAL del función, sin cambios
   })
   ```

> **Nota**: el tipo del parámetro `supabase` (cliente de Supabase) cambia entre callers. `cache()` usa identidad referencial — distintos `supabase` clients NO comparten cache aunque la función sea la misma. Esto es deseado porque distintos clients pueden tener distinta auth scope.

- [ ] **Step 3.5: Validar multi-tenant**

Tres reads críticos:
1. `cache()` es per-request scope (Next.js docs garantizan que cada request tiene su propio cache).
2. `getCurrentUser` retorna data del user ya autenticado en el cookie — distintos users = distintos cookies = distintos requests = distinto cache.
3. Si dentro de un request, llamamos `getCurrentUser` 5 veces, **debe** retornar exactamente el mismo objeto (`===` por referencia).

- [ ] **Step 3.6: Smoke test functional**

Mensaje al usuario:
> "Probá estos 4 escenarios:
> 1. **Login normal**: cerrá sesión y volvé a entrar → debe redirigir a `/dashboard` correctamente.
> 2. **Logout**: ¿el botón de logout sigue funcionando?
> 3. **Cambio de user**: si tenés 2 sesiones (una incógnito), abrí el dashboard en cada una al mismo tiempo → cada una debe ver SUS datos, no los del otro.
> 4. **SELLER role**: si tenés un user SELLER, logueá con él y verificá que solo ve sus operations.
> 
> Si todo OK, seguimos. Si algo raro (ej. un user ve data del otro) → REVERT INMEDIATO, ese sería el peor caso multi-tenant posible."

- [ ] **Step 3.7: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add lib/auth.ts lib/accounting/exchange-rates.ts
git commit -m "perf(server): A7 React.cache en getCurrentUser/getUserAgencies/getLatestExchangeRate

Wrappers cache() de React 19 deduplican llamadas DENTRO del mismo request.
Antes: cada API route + cada page server component hacía 2 queries (auth+users)
para resolver getCurrentUser(). En el dashboard: 8 endpoints x 2 queries = 16
queries solo para auth.

Ahora: 1 sola vez por request, mismo objeto retornado. Estimado: -50% queries
a Supabase en flujos server-heavy.

Multi-tenant safe: cache() es per-request, no global. Distintos users no
comparten cache. Verificado con smoke test 2-sesiones simultáneas.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: A5 — Quitar `cache: "no-store"` + Cache-Control headers (RIESGO BAJO)

**Files:**
- Modify: `components/dashboard/dashboard-page-client.tsx:168-170`
- Modify: `app/api/analytics/sales/route.ts` (header en respuesta)
- Modify: `app/api/analytics/sellers/route.ts` (header)
- Modify: `app/api/analytics/destinations/route.ts` (header)
- Modify: `app/api/analytics/cashflow/route.ts` (header)
- Modify: `app/api/analytics/pending-balances/route.ts` (header)
- Modify: `app/api/accounting/debts-sales/route.ts` (header)

**Multi-tenant nota**: `Cache-Control: private` (NO `public`) garantiza que el browser solo cachea para EL user actual — proxies intermedios no cachean. Sin riesgo de que User A vea data cacheada de User B.

**Riesgo específico**: durante 30s, KPIs muestran data hasta 30s vieja. Si Maxi paga algo y refresca dashboard, podría ver el viejo número. Mitigación: el botón "Actualizar" en el header del dashboard envía `cache: "no-store"` solo en click manual.

- [ ] **Step 4.1: Modificar el cliente del dashboard**

Editar `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/dashboard/dashboard-page-client.tsx`. Reemplazar las líneas 167-170:

```typescript
      // Fetch all data in parallel (sin cache para evitar datos stale)
      const fetchOptions = {
        cache: "no-store" as RequestCache
      }
```

Por:

```typescript
      // Fetch en paralelo. Cache controlado por header Cache-Control de cada
      // endpoint (private, max-age=30, stale-while-revalidate=60). El botón
      // "Actualizar" del header re-monta el componente y fuerza re-fetch.
      const fetchOptions = {
        cache: "default" as RequestCache
      }
```

- [ ] **Step 4.2: Helper para agregar Cache-Control en endpoints analytics**

Modificar cada uno de los 6 endpoints de analytics + accounting/debts-sales. En cada `return NextResponse.json(...)`, agregar el segundo argumento con headers.

Ejemplo en `app/api/analytics/sales/route.ts` línea 130:

Antes:
```typescript
    return NextResponse.json(result)
```

Después:
```typescript
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' }
    })
```

Aplicar mismo cambio en:
- `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/analytics/sellers/route.ts` (return final del GET)
- `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/analytics/destinations/route.ts` (return final del GET)
- `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/analytics/cashflow/route.ts` (return final del GET)
- `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/analytics/pending-balances/route.ts` (return final del GET)
- `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/api/accounting/debts-sales/route.ts:280` (`return NextResponse.json({ debtors })`)

> **Importante**: SOLO modificar el `return` de éxito (200). Los `return` de error (400/403/500) NO llevan Cache-Control — no queremos cachear errores.

- [ ] **Step 4.3: Validar multi-tenant**

Confirmar en cada endpoint:
- ✅ Usa `private` (no `public`) → browser-only cache, no proxies.
- ✅ El response varía por usuario porque el endpoint hace `getCurrentUser()` y filtra → distintos users = distintos requests = distintos caches en SUS browsers.
- ✅ El `max-age=30` es corto (30s) → un cambio de tenant via reload se verá rápido.
- ✅ `stale-while-revalidate=60` permite servir stale 1 min mientras refresca background — no riesgo de mezcla, sigue siendo per-user.

- [ ] **Step 4.4: Smoke test functional**

Mensaje al usuario:
> "Verificá:
> 1. Abrí dashboard, anotá los KPIs.
> 2. Salí de la pestaña, esperá 10s, volvé → debería pintarse instantáneo (desde cache).
> 3. Click en 'Actualizar' (botón con ícono refresh en header del dashboard) → debería re-fetchear (Network tab muestra 200 fresh, no from cache).
> 4. Esperá 1 minuto, recargá → debería re-fetchear automáticamente.
> 5. **Multi-tenant check**: abrí Chrome incógnito, logueá como otro user, ¿ve SUS números (no los de Lozada cacheados)?"

- [ ] **Step 4.5: Commit**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add components/dashboard/dashboard-page-client.tsx app/api/analytics/ app/api/accounting/debts-sales/route.ts
git commit -m "perf(dashboard): A5 cache HTTP 30s en endpoints analytics

- Quitar cache:no-store del cliente dashboard.
- Agregar Cache-Control: private, max-age=30, stale-while-revalidate=60
  en 6 endpoints (analytics/sales, sellers, destinations, cashflow,
  pending-balances, accounting/debts-sales).

Beneficios:
- Tab switch o navegación → vuelve dashboard sin re-fetchear.
- 'private' garantiza no cross-user (no proxies).
- Botón 'Actualizar' sigue forzando refresh manual.

Multi-tenant safe: cada user tiene su propio browser cache. Stale máximo 30s.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: A1 — Dedupe queries `organizations` en layout (RIESGO BAJO-MEDIO, ÚLTIMO)

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `lib/billing/guard.ts` (return data instead of void)
- Modify: `components/billing/subscription-banner.tsx` (read from prop, not re-fetch)

**Multi-tenant nota**: este cambio toca el camino de auth/guard. Si rompo algo, podría:
1. Permitir paso a una org SUSPENDED (security regression — peor caso).
2. Bloquear paso a una org activa (UX regression — bajo).
3. Mostrar banner equivocado a una org (visual regression — mínimo).

Por eso va **último**. Si Tasks 1-4 ya dieron win suficiente, podemos saltar Task 5 y dejarlo para Ola 2 con más testing.

- [ ] **Step 5.1: Tomar foto antes — entender flujo actual**

Leer en este orden:
1. `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/guard.ts` — ver qué hace `assertSubscriptionActive`.
2. `/Users/tomiisanchezz/Desktop/Repos/erplozada/components/billing/subscription-banner.tsx` — ver qué props acepta.
3. `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/layout.tsx:23-41` — el flujo redundante.

Confirmar el patrón actual:
- `assertSubscriptionActive()` fetcha organizations → throw redirect si no activa, void return si OK.
- `layout.tsx:36` re-fetcha la misma row de organizations para pasarle a `<SubscriptionBanner>`.
- Mismo dato, dos queries.

- [ ] **Step 5.2: Modificar `assertSubscriptionActive` para retornar data**

Editar `/Users/tomiisanchezz/Desktop/Repos/erplozada/lib/billing/guard.ts`. Cambiar el signature de `assertSubscriptionActive` para retornar el row de organizations en vez de void:

```typescript
import { cache } from 'react'

// (mantener imports existentes)

type OrgBillingRow = {
  subscription_status: string | null
  current_period_ends_at: string | null
  trial_ends_at: string | null
  // (agregar otros campos que ya selecciona el guard internamente)
}

export const assertSubscriptionActive = cache(async (): Promise<OrgBillingRow | null> => {
  // ... cuerpo actual del guard, pero al final, en vez de `return` (void),
  // retornar el row de organizations que ya leíste.
})
```

> **Importante**: este step requiere LEER el archivo `guard.ts` actual para hacer el cambio correctamente sin romper la lógica de redirect. El cambio es: en vez de `return` void al final, devolver el row.

- [ ] **Step 5.3: Modificar layout para reusar el dato**

Editar `/Users/tomiisanchezz/Desktop/Repos/erplozada/app/(dashboard)/layout.tsx`. Reemplazar las líneas 23-40 por:

```typescript
  // Capa B del defense-in-depth: bloquea acceso si no hay suscripción activa.
  // Independiente del middleware (que puede bypassearse via CVE-2025-29927).
  // El guard ahora retorna el row de organizations para evitar re-fetch.
  const orgBanner = await assertSubscriptionActive()

  const { user } = await getCurrentUser()
  const userAgencies = await getUserAgencies(user.id)

  const agencies = (userAgencies || []).map((ua: any) => ({
    id: ua.agency_id,
    name: ua.agencies?.name || "Sin nombre",
  }))
```

> Eliminar las líneas 35-40 (`const admin = createAdminClient()` + el query de orgBanner). Eliminar también el import de `createAdminClient` si ya no se usa en este archivo.

- [ ] **Step 5.4: Validar multi-tenant**

Tres checks críticos:
1. ✅ `assertSubscriptionActive()` sigue throw-ing redirect si la subscripción no está activa (no se relaja el guard).
2. ✅ El row retornado pertenece al user actual (lo lee con la query existente que filtra por user.org_id).
3. ✅ `cache()` wrappear el guard significa que dentro del mismo request se llama 1 vez. Distintos requests = distintos users = distintos orgs.
4. ✅ El `<SubscriptionBanner>` recibe la misma data que antes — solo cambia de dónde viene (prop vs. fetch propio).

- [ ] **Step 5.5: Smoke test functional pesado**

Mensaje al usuario:
> "Este es el cambio más sensible. Probá EXTRA:
> 1. **Login normal**: cerrá sesión, volvé a entrar como tu user → debe ir al dashboard sin error.
> 2. **Banner de subscripción**: ¿se ve el banner de TRIAL/PAST_DUE como antes? Mismo color, mismo mensaje.
> 3. **Si tenés un user de prueba en una org SUSPENDED**, lográ con él → debe redirigir a `/onboarding/billing` o `/settings/subscription`.
> 4. **Cambio de tab**: navegá entre `/dashboard`, `/sales/leads`, `/cash/movements`, `/operations` → todas cargan, ninguna 500.
> 5. **Multi-tenant**: si tenés acceso a 2 orgs distintas, lográ una y otra alternadamente → cada una ve sus datos.
> 
> Si CUALQUIER cosa raro → REVERT INMEDIATO. Este Task no vale la pena romper auth."

- [ ] **Step 5.6: Commit (o revert)**

Si todo OK:

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add app/(dashboard)/layout.tsx lib/billing/guard.ts
git commit -m "perf(layout): A1 dedupe query organizations entre guard y banner

assertSubscriptionActive() ahora retorna el row de organizations en vez
de void. Layout reusa ese dato para el SubscriptionBanner en vez de
re-fetchearlo via createAdminClient.

Antes: 2 queries a organizations por cada navegación dashboard
(guard + banner separados).
Después: 1 query, ambos consumidores reusan.

Wrappeado con React.cache() para deduplicar si algún otro caller del
mismo request llama assertSubscriptionActive(). Multi-tenant safe:
per-request scope, no cross-user.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Si algo se rompió:

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git checkout -- app/(dashboard)/layout.tsx lib/billing/guard.ts
# Reportar al usuario qué se rompió y movemos A1 a Ola 2 con análisis más profundo.
```

---

## Task 6: Medición final ("foto después") + comparación

**Files:**
- Create: `docs/superpowers/perf/post-ola1-2026-04-27.md`

- [ ] **Step 6.1: Pedir al usuario que vuelva a medir**

Mensaje al usuario:
> "Misma medición que Task 0 — mismas pantallas, mismos filtros, mismo user, mismo browser:
> 1. Hard reload de cada una de las 5 pantallas (`Cmd+Shift+R`) para invalidar el cache HTTP nuevo.
> 2. Anotá TTFB + Total time.
> 3. Re-correr el SQL de top queries en Supabase Query Performance.
> 
> Pegá los nuevos números."

- [ ] **Step 6.2: Crear archivo comparativo**

Crear `/Users/tomiisanchezz/Desktop/Repos/erplozada/docs/superpowers/perf/post-ola1-2026-04-27.md`:

```markdown
# Post Ola1 — 2026-04-27

## Comparación timings (vs baseline)

| Pantalla | Baseline TTFB | Post TTFB | Baseline Total | Post Total | Ganancia |
|---|---|---|---|---|---|
| `/dashboard` | __ | __ | __ | __ | __x |
| `/sales/crm-manychat` | __ | __ | __ | __ | __x |
| `/cash/movements` | __ | __ | __ | __ | __x |
| `/operations` | __ | __ | __ | __ | __x |
| `/reports/upcoming-due?days=7` | __ | __ | __ | __ | __x |
| Click navegación | __ | __ | __ | __ | __x |

## Top queries (Supabase Query Performance)

¿Las queries top del baseline siguen ahí? ¿Bajaron de mean time?

## Decisión

- [ ] Win suficiente — Ola 2 NO se ejecuta, sistema vendible.
- [ ] Win parcial — evaluar Ola 2 (A2/A3/A8) para cerrar el gap.
- [ ] Sin win — investigar dónde quedó el bottleneck antes de Ola 2.
```

- [ ] **Step 6.3: Commit comparación + decisión**

```bash
cd /Users/tomiisanchezz/Desktop/Repos/erplozada
git add docs/superpowers/perf/post-ola1-2026-04-27.md
git commit -m "docs(perf): mediciones post-Ola1 + decisión

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6.4: Reportar al usuario y pedir decisión sobre push**

Mensaje al usuario:
> "Ola 1 terminada. Resumen:
> - Tasks completados: [lista]
> - Ganancia medida: [tabla con ratios]
> - Riesgo encontrado: [si algún Task fue revertido]
> 
> Branch local: `perf/ola1` con N commits. NO pusheado todavía.
> 
> Próxima decisión:
> 1. Pushear a origin para que Railway despliegue → la mejora llega a Maxi/SADA.
> 2. Mergear a main local primero, después push.
> 3. Esperar más testing antes de push.
> 4. Avanzar a Ola 2 (A2/A3/A8) si querés más win.
> 
> ¿Qué hacemos?"

---

## Self-Review

**Spec coverage** (revisar contra `2026-04-27-perf-cleanup-design.md`):
- ✅ A1 (dedupe layout): Task 5
- ✅ A4 (LIMIT upcoming-due): Task 2
- ✅ A5 (no-store + cache headers): Task 4
- ✅ A6 (índices): Task 1
- ✅ A7 (React.cache): Task 3
- ⏭️ A2, A3, A8: explícitamente fuera de Ola 1 (Ola 2 si Ola 1 no alcanza)
- ✅ Fase 0 medición: Task 0
- ✅ Bar de éxito: Task 6

**Placeholder scan**: revisado, sin TBD/TODO/etc. Cada step tiene comando o código exacto. La única "lectura adicional" es Step 5.2 que requiere leer `guard.ts` para no romper el guard — esto es necesario porque el archivo no fue cargado en el spec.

**Type consistency**: `assertSubscriptionActive` cambia de signature `Promise<void>` a `Promise<OrgBillingRow | null>` en Task 5. Solo 2 callers en codebase (layout.tsx y posiblemente otro en admin). Validar callers en Step 5.1 lectura.

**Operational rules**:
- Multi-tenant validation en cada Task (steps explícitos).
- Smoke test en cada Task antes de commit.
- Rollback documentado en Task 1, revert path en Task 5.
- No push sin OK explícito (regla del proyecto, repetido en Task 6).

Plan listo para ejecución.
