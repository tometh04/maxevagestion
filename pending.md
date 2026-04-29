# Pendientes — Sistema de Import Multi-Tenant

> Documento generado al final de sesión maratón 2026-04-28/29. Próxima sesión retoma desde acá.

## Estado del proyecto al cierre

**Goal**: que cualquier agencia nueva pueda subir su data histórica vía CSV y verla en el sistema, aislada por `agency_id`.

**Lo que está vivo en producción** (`app.vibook.ai`):
- ✅ Schema multi-tenant: `agency_id` agregado a `customers/operators/payments/cash_movements` (Fase 1 — migrations 113-123)
- ✅ Motor en `lib/import/` con 6 pipelines: customers, operators, payments-suelto, cash-movements, operations-master, users
- ✅ Endpoints: `POST /api/import/v2/run`, `GET /api/import/v2/templates/[name]`
- ✅ UI en `/settings/import-v2` con dry-run + confirmar
- ✅ 5 plantillas CSV descargables (sin "users" template todavía)

**Branch / commits relevantes en main**:
- `70aa1476` — feat(import): multi-tenant import system (Fase 1+2+3-MVP) — el squash del PR #9
- `9616c888` — fix(import-normalizer): support AR money format + DD/MM/YY dates
- `a052b1d1` — feat(import-fase3-mvp): users pipeline with auth + commission + user_agencies
- `707805a5` — test(import): update integration test to expect 6 pipelines
- `fdecc9c8` — fix(import): pass userId in config; use as user_id (cash_movements) and seller_id fallback (operations)

## Smoke test E2E en producción (Test V7 / Agencia V7)

Login: `mypupybox@gmail.com` / `admin123` → tenant Test V7 → única agency: Agencia V7.

| Pipeline | Estado | Detalle |
|---|---|---|
| customers | ✅ **PASA** | 5/5 filas creadas, visibles en `/customers`, sin errores ni warnings |
| operators | ✅ **PASA** | 4/4 filas creadas, tabla pasó de 15 a 19 filas en `/operators` |
| cash-movements | 🔧 **HOTFIXED, pendiente re-test** | Bug: `user_id NOT NULL` no se seteaba. Fix en `fdecc9c8`. Esperar deploy + re-testear |
| operations-master | 🔧 **HOTFIXED, pendiente re-test** | Bug: `seller_id NOT NULL` no se seteaba cuando no encontraba vendedor por nombre. Fix en `fdecc9c8` (usa `userId` del importador como fallback). Esperar deploy + re-testear |
| users | ⏸️ **NO TESTEADO** | Pipeline pusheado en `a052b1d1` pero NO apareció en el dropdown de la UI durante el test (deploy de Railway pendiente al cierre de sesión) |
| payments-suelto | ⏸️ **NO TESTEADO** | Requiere operations existentes con file_codes para matchear. Después de operations-master |

## Pendientes en orden de prioridad

### 🔴 P0 — Completar smoke test E2E (~30 min)

Esperar que Railway termine de deployar `fdecc9c8` (último commit) y re-testear los 4 pipelines pendientes con browser automation:

1. **Verificar que la opción "Usuarios / Vendedores" aparece** en el dropdown de pipelines en `/settings/import-v2`. Si no aparece después de 5 min, investigar Railway deploy logs.
2. **Re-test cash-movements**: subir `04-cash-movements-3rows.csv` → debería pasar 3/3
3. **Re-test operations-master**: subir `01-operations-master-3rows.csv` → debería pasar 2/3 (1 falla por fecha `19/06/26` que NECESITA el deploy del hotfix `9616c888`. Si está deployado, las 3 pasan.)
4. **Test users**: subir `00-users-testv7-11sellers.csv` → debería crear 11 users con auth + comisión + user_agencies link a Agencia V7
5. **Test payments-suelto**: editar `05-payments-suelto-2rows.csv` con file_codes reales de operations-master, subir, verificar
6. Verificar visualmente en `/customers`, `/operations`, `/operators`, `/cash` que la data llegó correctamente

**Test CSVs ubicados en**: `/Users/tomiisanchezz/Desktop/Repos/test-import-csvs/`

### 🟠 P1 — Atomicidad por fila en operations-master (~1 hora)

**Bug pendiente sin fixear**: cuando una fila del CSV de operations-master falla a mitad (ej: customer creado OK pero operation falla), los registros parciales quedan en BD. No es transaccional.

Opciones:
- Usar Postgres TX explícita con `BEGIN; ... COMMIT; ROLLBACK;`
- Crear una RPC `bulk_import_operations_master` que haga todo en una sola call (la otra sesión tiene un `bulk_import_operations` parcial en `supabase/migrations/20260423000161_bulk_import_rpcs.sql` que se puede usar como base)
- Implementar rollback manual: si falla operation después de crear customer, hacer DELETE del customer recién creado

### 🟡 P2 — Limpiar test data de Agencia V7

Datos creados durante el smoke test que quedaron en producción de Test V7:

**Customers (8 — los 5 OK + 3 huérfanos del intento fallido de operations-master):**
- Test Uno, Test Dos, Maria García, Pedro Lopez, Carlos Rodriguez (5 que querías)
- Piñeiro Maria, Rotela, Dogliani (3 huérfanos del operations-master parcial)

**Operators (4):**
- Lozada, Delfos, Eurovips, Universal

**Cash-movements (0):** ninguno se creó (fallaron todos)

**Operations (0):** ninguna se creó (fallaron todas)

**Users (0):** todavía no se importaron (pipeline pendiente deploy)

Cómo limpiar:
- Supabase SQL Editor → DELETE FROM customers WHERE agency_id = '<agencia-v7-uuid>' AND created_at > '2026-04-29 14:00:00'
- O: borrar la agencia entera (Agencia V7) con CASCADE
- O: dejarlo (es agencia de testing, no daña nada)

### 🟡 P2 — Plantilla `users` descargable

El motor tiene 6 pipelines pero `lib/import/templates/` solo tiene 5 plantillas CSV. Falta:
- Crear `lib/import/templates/users.csv` con header: `Nombre,Email,Rol,Comision,Password`
- Una fila de ejemplo: `Juan Vendedor,vendedor@example.com,SELLER,15,changeme123`

### 🟡 P2 — Test CSVs versión Madero real

Los CSVs actuales son para Test V7 (con emails @testv7.com). Cuando todo el smoke pase en V7, generar versión Madero:
- `/Users/tomiisanchezz/Desktop/Repos/test-import-csvs/00-users-madero-11sellers.csv` ya existe (con @madero.com) — sirve
- Generar también versión completa de operations con todas las filas de `/Users/tomiisanchezz/Downloads/Import Sistema Madero - Madero USD.csv` (234 filas) — pero filtrar Ana y Selene (no están en lista de sellers)

### 🟢 P3 — Mejoras UX (después de validación funcional)

1. **Link en sidebar a `/settings/import-v2`** — actualmente hay que ir por URL directa
2. **Plantilla users en UI**: el botón "Descargar plantilla" no funciona para users hasta que exista el CSV
3. **Mensajes de error más claros**: "Falló insert operation (DB)" no le dice al usuario qué pasó. Capturar el detalle del error de Postgres y mostrarlo
4. **Rollback button**: la ImportResult tiene `rollbackLog` pero la UI no lo expone. Agregar botón "Deshacer última importación"
5. **Progress streaming**: para CSVs grandes (>100 filas), reportar progreso en tiempo real
6. **Tabla de import_jobs** (Fase 3 completa): persistir cada job con su status para historial y retry

### 🟢 P3 — RLS activation (deuda técnica de Fase 1)

Las RLS policies `*_tenant_isolation` están creadas pero `ENABLE ROW LEVEL SECURITY` no se aplicó (porque varios endpoints legacy usan `createAdminClient` y necesitan auditoría). Ver `project_import_fase1_done.md` en memoria.

Pendiente: auditar todos los endpoints en `app/api/customers`, `app/api/operations`, `app/api/payments`, `app/api/cash_movements` para confirmar que pasan `agency_id` explícito. Después: re-aplicar `SET NOT NULL` (migration 121 fue rolleada en migration 122 por endpoints sin `agency_id`).

### 🟢 P3 — Limpiar trabajo de la otra sesión Claude

En el merge de PR #9 quedaron archivos de la otra sesión Claude:
- `lib/import/csv-parser-zod.ts` (papaparse + Zod) — alternativa al parser actual, no se usa
- `lib/import/csv-parser-zod.test.ts` — test del archivo anterior, posiblemente roto
- `lib/import/fk-resolver.ts` — utility de resolución de FK, no se usa
- `lib/import/chunked-upload.ts` — upload chunked, no se usa
- `lib/import/schemas/` — Zod schemas por entidad, parcialmente útiles

Decisión a tomar:
- a) Borrar todo lo no usado
- b) Integrar al sistema actual (re-escribir pipelines para usar Zod schemas)
- c) Dejar como referencia para futuro

Y el `app/api/import/users/route.ts` (otra sesión) sigue activo como endpoint legacy alternativo — podría conflictuar con mi pipeline `users` si alguien lo llama. Decidir: dejarlo, redirigir a v2, o borrar.

Y el `stash@{0}` en git tiene WIP no-commiteado de la otra sesión (~100 archivos modificados en app/ y components/). Si nadie lo necesita en una semana: `git stash drop stash@{0}`.

## Cómo retomar

1. Leer este archivo
2. Leer las memorias relevantes:
   - `project_import_fase1_done.md` — Fase 1 schema multi-tenant
   - `project_import_fase2_done.md` — Fase 2 motor
   - `project_import_merged.md` — PR #9 mergeado
   - `feedback_no_modificar_lozada_rosario.md` — regla
   - `feedback_aislamiento_estricto_tenant.md` — regla
   - `feedback_tenant_multi_agencia.md` — regla
3. Confirmar deploy de Railway: `git log origin/main --oneline -10` debería mostrar al tope `fdecc9c8 fix(import): pass userId...`
4. Login a `app.vibook.ai` con `mypupybox@gmail.com` / `admin123`
5. Ir a `/settings/import-v2` y verificar que aparecen las 6 opciones en el dropdown (incluyendo "Usuarios / Vendedores")
6. Si está, retomar smoke test desde **P0** de arriba
7. Una vez todos los pipelines validados en Test V7 → planificar import real a Madero

## Archivos relevantes

**Test CSVs**: `/Users/tomiisanchezz/Desktop/Repos/test-import-csvs/`
- `00-users-testv7-11sellers.csv` — para Test V7
- `00-users-madero-11sellers.csv` — para Madero real (no usar todavía)
- `01-operations-master-3rows.csv` — 3 filas de Madero CSV con sellers válidos (Julian, Rama, Ana Silva)
- `02-customers-5rows.csv` — 5 customers de prueba
- `03-operators-4rows.csv` — Lozada, Delfos, Eurovips, Universal
- `04-cash-movements-3rows.csv` — 3 movimientos sintéticos
- `05-payments-suelto-2rows.csv` — 2 payments (necesita editar file_codes antes)
- `README.md` — instrucciones

**CSV original de Madero**: `/Users/tomiisanchezz/Downloads/Import Sistema Madero - Madero USD.csv` (234 filas, formato mezclado US+AR)

**CSV original de Rosario**: `/Users/tomiisanchezz/Desktop/Repos/Import Sistema - Rosario USD.csv` (889 filas, USD)

**Spec y plans**:
- `docs/superpowers/specs/2026-04-28-import-multitenant-design.md`
- `docs/superpowers/plans/2026-04-28-import-multitenant-fase1.md`
- `docs/superpowers/plans/2026-04-28-import-multitenant-fase2.md`

**Tutoriales user-facing** (creados pero potencialmente sobrarían):
- `docs/tutoriales-import/` — 7 archivos markdown

## Bugs conocidos

| # | Bug | Archivo | Estado |
|---|---|---|---|
| 1 | `cash-movements` no setea `user_id` | `lib/import/pipelines/cash-movements.ts` | 🔧 Fixed `fdecc9c8` |
| 2 | `operations-master` no setea `seller_id` cuando seller no matchea | `lib/import/pipelines/operations-master.ts` | 🔧 Fixed `fdecc9c8` (usa userId fallback) |
| 3 | `operations-master` no es atómico por fila (parcial creates) | `lib/import/pipelines/operations-master.ts` | 🟠 Pendiente — P1 |
| 4 | Endpoints legacy `/api/import/*` sin agency_id explícito | varios | 🟢 Pendiente — P3 (deuda Fase 1) |
| 5 | Hotfix parser DD/MM/YY puede no estar deployado | `lib/import/normalizer.ts` | 🟡 Pendiente verificar |
| 6 | Pipeline `users` puede no estar en deploy | UI dropdown | 🟡 Pendiente verificar |

## Comandos útiles

```bash
# Verificar deploy actual de Railway
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git log origin/main --oneline -5

# Re-correr todos los tests del import
npx jest lib/import/ --no-coverage --testPathIgnorePatterns="csv-parser-zod"

# Ver logs de Railway
# (no hay CLI configurada localmente, ir al dashboard)

# Smoke test en browser via gstack
export PATH="$HOME/.bun/bin:$PATH"
B="/Users/tomiisanchezz/.claude/skills/gstack/browse/dist/browse"
$B goto https://app.vibook.ai/login
# ...
```
