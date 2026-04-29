# Sistema de Importación Multi-Tenant — Design Spec

**Fecha:** 2026-04-28
**Estado:** Diseño aprobado, pendiente plan de implementación
**Autor:** Tomi + Claude (sesión brainstorm)

---

## Problema

Una agencia nueva paga la suscripción de Vibook y necesita cargar su data histórica (clientes, operadores, operaciones, pagos, movimientos de caja) sin que ningún tenant pueda ver data de otro. Hoy esto no funciona:

1. Las tablas `customers`, `operators`, `payments`, `cash_movements` **no tienen columna `agency_id`** (verificado en `supabase/migrations/001_initial_schema.sql`). Hay aislamiento parcial vía `operations.agency_id` pero los catálogos son de facto globales.
2. Los endpoints en `app/api/import/*/route.ts` no setean `agency_id` y los matchings (cliente por email, operador por nombre) son **cross-tenant** — un import de Tenant B puede pisar data de Tenant A.
3. La plantilla del importador de operaciones cubre **<40%** de las columnas reales de la tabla `operations`. Falta `operation_date` (rompe reportes históricos), `type`/`product_type` (hardcodeados a PACKAGE/PAQUETE), múltiples operadores, montos cobrados/pendientes que generan payments, y más.
4. El script CLI `scripts/import-masivo-operaciones.ts` (1345 líneas) sí tiene la lógica completa de "import inteligente" (14 pasos por fila: cliente + N operadores + payments + ledger + IVA + operator_payments) pero está **hardcodeado a `AGENCY_NAME='rosario'`** y no se puede usar desde la UI.
5. No hay sistema de jobs async, ni audit log, ni rollback, ni dry-run real, ni límite de archivo, ni progress.

## Objetivo

Que cualquier agencia recién suscripta pueda subir su data histórica desde la UI con la garantía de que:
- **Nadie más ve esa data** (aislamiento estricto por `agency_id` + RLS).
- El importador es **inteligente**: una fila del CSV master genera la operación completa con todas sus relaciones (cliente, operadores, payments cobrados/pendientes, operator_payments). El "Pendiente de Cobrar" del CSV se materializa como un `payment` PENDING vinculado a la operación, sin que el usuario tenga que importar dos veces.
- **`file_code` es el pegamento** entre CSVs: si la deuda viene en un CSV separado de payments, matchea por `operation_file_code → operations.file_code`.
- Procesamiento **async con dry-run + preview + commit explícito**, errors descargables, rollback disponible.

## Alcance

**Incluido:**
- Schema multi-tenant: agregar `agency_id NOT NULL` a las 4 tablas huérfanas + RLS.
- Backfill seguro de filas existentes de Rosario (con backup + reversibilidad).
- Motor de import en `lib/import/` reutilizable, scopeado por `agency_id`.
- 5 pipelines: `operations-master` (canónico), `customers`, `operators`, `payments-suelto`, `cash-movements`.
- Plantilla CSV master con todas las columnas relevantes de `operations` + columnas que generan payments/operator_payments.
- Tabla `import_jobs` con status/progress/errors/rollback.
- UI de importación rediseñada en `/settings/import` con preview, progress y descarga de errores.
- Conversión USD↔ARS configurable por job: `monthly_exchange_rates` o tipo de cambio manual.
- Wizard de onboarding que aparece a agencias nuevas con estado `subscription_status='active'` y sin operaciones.

**Fuera de alcance:**
- Importación de Excel (XLSX). Solo CSV en esta versión.
- Importación de archivos > 10 MB. Si se necesita, se splitea manualmente.
- Importación de leads (ya existe via Trello/ManyChat integraciones).
- Importación de reservas en tiempo real desde GDS.
- Re-importación parcial (re-run de filas que fallaron). Si fallan filas, el usuario corrige y re-sube CSV nuevo.

## Arquitectura por fases

```
Fase 1: Schema + Backfill          → 0.5–1 día
Fase 2: Motor de import            → 2–3 días
Fase 3: Jobs async + UI            → 2–3 días
Fase 4: Wizard onboarding          → 0.5–1 día
                                    Total: 5–8 días
```

Las fases son **secuenciales**: cada una desbloquea la siguiente. Si la Fase 1 no se cierra, ninguna otra sirve.

---

## Fase 1 — Schema multi-tenant

### Cambios de schema

Migration `129_add_agency_id_to_orphan_tables.sql` (numero exacto a confirmar al armar el plan, después de las 128 actuales).

Agrega `agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE` a:
- `customers`
- `operators`
- `payments`
- `cash_movements`

Más índices `idx_<tabla>_agency_id` por performance.

### Estrategia de backfill (7 pasos seguros y reversibles)

Para respetar la regla "JAMÁS modificar data de Lozada/Rosario", el backfill se hace en pasos chicos. Cada paso es individualmente reversible. Cada SQL se pasa al usuario por chat antes de correr.

| # | SQL | Riesgo | Rollback |
|---|---|---|---|
| 0 | `CREATE TABLE customers_backup_2026_04_28 AS SELECT * FROM customers;` (y para operators/payments/cash_movements) | Cero | Backups quedan en BD; restauración trivial |
| 1 | `ALTER TABLE ... ADD COLUMN agency_id UUID REFERENCES agencies(id);` (NULLABLE) | Cero | `DROP COLUMN agency_id` |
| 2 | Pre-flight `SELECT` que cuenta filas huérfanas (sin operación relacionada). **Si > 0**: decidir caso por caso (asignar a Rosario default o revisar manualmente). | Cero | No es UPDATE |
| 3 | UPDATE de backfill con queries documentadas abajo | Medio | `UPDATE ... SET agency_id = NULL` y volver al paso 1 |
| 4 | `SELECT COUNT(*) FROM <tabla> WHERE agency_id IS NULL` debe dar 0 | Cero | — |
| 5 | `ALTER COLUMN agency_id SET NOT NULL` | Bajo (si paso 4 dio 0, no falla) | `ALTER COLUMN agency_id DROP NOT NULL` |
| 6 | `CREATE POLICY ...` por cada tabla, **sin** `ENABLE ROW LEVEL SECURITY` aún | Cero (policies inactivas) | `DROP POLICY` |
| 7 | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` **una tabla a la vez**, testeando entre cada activación | Medio | `DISABLE ROW LEVEL SECURITY` (instantáneo) |

**Pasos 0–5 se hacen en una sesión de horario de baja actividad. Pasos 6–7 se hacen en otra sesión, después de auditar que cada endpoint pase `agency_id` correctamente.**

### Queries de backfill por tabla

```sql
-- payments: vía operation_id (NOT NULL)
UPDATE payments p
SET agency_id = o.agency_id
FROM operations o
WHERE p.operation_id = o.id;

-- cash_movements: vía operation_id (nullable) o user_id
UPDATE cash_movements cm
SET agency_id = COALESCE(
  (SELECT o.agency_id FROM operations o WHERE o.id = cm.operation_id),
  (SELECT ua.agency_id FROM user_agencies ua WHERE ua.user_id = cm.user_id LIMIT 1)
);

-- customers: vía operation_customers (happy path: customer en una sola agencia)
UPDATE customers c
SET agency_id = (
  SELECT o.agency_id
  FROM operation_customers oc
  JOIN operations o ON o.id = oc.operation_id
  WHERE oc.customer_id = c.id
  LIMIT 1
)
WHERE c.id NOT IN (
  -- Excluye customers que están en múltiples agencias (caso edge)
  SELECT oc.customer_id
  FROM operation_customers oc
  JOIN operations o ON o.id = oc.operation_id
  GROUP BY oc.customer_id
  HAVING COUNT(DISTINCT o.agency_id) > 1
);

-- operators: vía operation_operators (mismo patrón happy path)
UPDATE operators op
SET agency_id = (
  SELECT o.agency_id
  FROM operation_operators oo
  JOIN operations o ON o.id = oo.operation_id
  WHERE oo.operator_id = op.id
  LIMIT 1
)
WHERE op.id NOT IN (
  SELECT oo.operator_id
  FROM operation_operators oo
  JOIN operations o ON o.id = oo.operation_id
  GROUP BY oo.operator_id
  HAVING COUNT(DISTINCT o.agency_id) > 1
);
```

**Edge case — customer/operator usado por múltiples agencias:** las queries de backfill **excluyen** esos casos del UPDATE bulk. El pre-flight (paso 2) los detecta y los lista. Estrategia: por cada fila multi-agencia, **duplicar** — la fila original queda asignada a la agencia con más operaciones, y se crean copias adicionales para las otras agencias con sus respectivos `operation_customers` / `operation_operators` re-vinculados. Improbable hoy (solo Rosario en producción), se aprueba caso por caso si aparece.

### RLS Policies (paso 6)

```sql
CREATE POLICY <tabla>_tenant_isolation ON <tabla>
  USING (agency_id IN (
    SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
  ));
```

Aplica a las 4 tablas. SUPER_ADMIN bypass se hace por endpoint usando `createAdminClient()` (memoria: `feedback_crons_admin_client.md`), no por policy.

---

## Fase 2 — Motor de import

### Estructura

```
lib/import/
  ├── parser.ts          → CSV → filas tipadas. Headers flexibles (acentos, mayúsculas, sinónimos). Maneja $ y , en montos. Fechas DD/MM/YYYY y YYYY-MM-DD.
  ├── resolver.ts        → Matching scopeado a agency_id: cliente por DNI > email > fuzzy nombre; operador por nombre normalizado; vendedor por email > nombre.
  ├── normalizer.ts      → Convierte montos USD→ARS según config del job. Normaliza estados antiguos (PRE_RESERVATION→RESERVED, etc.).
  ├── validator.ts       → Validación pre-commit: campos requeridos, formatos, rangos. Devuelve errores por fila.
  ├── executor.ts        → Inserta con transacción por fila. Loguea IDs creados a `import_jobs.rollback_log`.
  └── pipelines/
      ├── operations-master.ts   → Pipeline canónico (14 pasos como el script CLI legacy).
      ├── customers.ts           → Solo catálogo.
      ├── operators.ts           → Solo catálogo.
      ├── payments-suelto.ts     → Matchea por file_code → operations.file_code.
      └── cash-movements.ts      → Movimientos sueltos.
```

### Pipeline `operations-master` (canónico)

Una fila del CSV genera, en orden:

1. **Cliente** — busca/crea por matching scopeado a `agency_id`. Si es nuevo, se crea con `agency_id` del job.
2. **Operadores 1, 2, 3** — busca/crea cada uno scopeado a `agency_id`. Manejo de typos opcional (out of scope para v1; el matching exacto es suficiente).
3. **Operación** — INSERT con todos los campos de la plantilla. Calcula `margin_amount = sale_amount - sum(costo_operadores)` y `margin_percentage`. Si `file_code` ya existe en la agencia, UPDATE en vez de INSERT.
4. **`operation_customers`** — vincula cliente como `MAIN`.
5. **`operation_operators`** — vincula cada operador con su `cost`.
6. **Ledger movements** — INCOME (cuentas por cobrar) y EXPENSE (cuentas por pagar) según la lógica contable existente. Reutiliza `lib/accounting/` actual.
7. **IVA Venta** (21% sobre margen) y **IVA Compra** (sobre cada costo de operador) — solo si la agencia es responsable inscripto. La condición se evalúa por `agencies.tax_status` (campo a confirmar al armar el plan; si no existe, v1 omite generación de IVA y se agrega como follow-up).
8. **`operator_payments`** — uno por cada operador, con `amount_due`.
9. **Payments INCOME PAID** — si `Monto Cobrado > 0`, genera un payment `PAID` vinculado a la operación.
10. **Payments INCOME PENDING** — si `Pendiente de Cobrar > 0`, genera un payment `PENDING` con `date_due = fecha_salida` (default).
11. **Payments EXPENSE PAID** — si `Pagado a Operador > 0`, uno por operador con su porción.
12. **Payments EXPENSE PENDING** — si `Pendiente a Operador > 0`, uno por operador.

**Cada fila es una transacción**. Si falla cualquier paso, se hace ROLLBACK de la fila (no de todo el job). Los IDs creados se loguean a `import_jobs.rollback_log` para permitir undo.

### Plantilla CSV master

```
Código (file_code, opcional, auto-genera si vacío)
Fecha Operación * (operation_date, OBLIGATORIO)
Nombre Cliente * | Email Cliente | DNI Cliente | Teléfono Cliente
Destino * | Origen
Fecha Salida * | Fecha Regreso
Adultos | Niños | Bebés
Tipo (PACKAGE/FLIGHT/HOTEL/CRUISE/TRANSFER/MIXED/ASSISTANCE)
Monto Venta * | Monto Cobrado | Pendiente Cobrar
Operador 1 | Costo Operador 1 | Pagado a Operador 1 | Pendiente Operador 1
Operador 2 | Costo Operador 2 | Pagado a Operador 2 | Pendiente Operador 2
Operador 3 | Costo Operador 3 | Pagado a Operador 3 | Pendiente Operador 3
Moneda * (ARS/USD)
Estado (RESERVED/CONFIRMED/CANCELLED/TRAVELLING/TRAVELLED, default CONFIRMED)
Vendedor (nombre o email)
Código Reserva Aéreo | Código Reserva Hotel
Notas
```

\* = obligatorio.

### Plantillas CSV secundarias

- **clientes** (catálogo solo): first_name, last_name, phone, email, document_type, document_number, date_of_birth, nationality
- **operadores**: name, contact_name, contact_email, contact_phone, credit_limit, tax_id
- **payments-suelto**: operation_file_code, amount, currency, date_due, date_paid, direction, payer_type, method, reference
- **cash-movements**: date, type, amount, currency, account_name, category, notes, operation_file_code (opcional)

### Conversión USD ↔ ARS

Config del job (`import_jobs.config.exchange_rate`):

- `mode: 'monthly_rates'` — busca en `monthly_exchange_rates` por mes/año de cada operación. Si falta el rate de algún mes, el job falla con error claro.
- `mode: 'manual_fixed'` — la agencia define un único rate al subir. Aplica a TODAS las filas del job.
- `mode: 'monthly_with_fallback'` — usa monthly; si falta para algún mes, cae a `manual_fixed`.

Default: `monthly_with_fallback` con manual obligatorio. La UI presenta un input para el manual y un check "Usar tipos de cambio mensuales registrados, este es el fallback".

---

## Fase 3 — Jobs async + UI

### Tabla `import_jobs`

```sql
CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  pipeline TEXT NOT NULL CHECK (pipeline IN (
    'operations-master', 'customers', 'operators', 'payments-suelto', 'cash-movements'
  )),
  source_file_url TEXT NOT NULL,    -- Supabase Storage path
  source_file_name TEXT NOT NULL,
  source_file_size INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
    'QUEUED', 'PARSING', 'DRY_RUN_DONE', 'AWAITING_CONFIRM',
    'RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK', 'CANCELLED'
  )),
  total_rows INT,
  processed_rows INT DEFAULT 0,
  success_rows INT DEFAULT 0,
  error_rows INT DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',          -- exchange_rate, default_status, etc.
  preview_summary JSONB,                       -- "se van a crear X clientes, Y operaciones"
  errors JSONB DEFAULT '[]',                   -- [{row, field, message}]
  rollback_log JSONB DEFAULT '[]',             -- [{table, id}] para undo
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_jobs_agency ON import_jobs(agency_id, created_at DESC);
CREATE INDEX idx_import_jobs_status ON import_jobs(status) WHERE status IN ('QUEUED', 'RUNNING');
```

RLS: `agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())`.

### Worker

Archivo `app/api/cron/import-jobs/route.ts`. Cron Railway cada 30s. Usa `createAdminClient()` (memoria: `feedback_crons_admin_client.md`). En cada tick:

1. Toma 1 job en estado `QUEUED` con `FOR UPDATE SKIP LOCKED`.
2. Lo pasa a `PARSING`.
3. Descarga CSV de Storage, parsea.
4. Corre dry-run completo (validador + resolver, sin inserts).
5. Guarda `preview_summary` y errores en el job. Status → `DRY_RUN_DONE`.
6. Espera confirmación del usuario (status manual a `RUNNING` desde la UI).
7. Cuando está `RUNNING`: procesa en chunks de 50 filas. Cada chunk es una transacción con savepoint. Loguea progreso cada chunk.
8. Al terminar: status `COMPLETED` o `FAILED`.

### UI

**`/settings/import`** rediseñado:

- Tab `Operaciones (master)` con upload, config tipo de cambio, descargar plantilla, ver historial.
- Tabs adicionales: `Clientes`, `Operadores`, `Pagos sueltos`, `Movimientos caja`.
- Sub-componente `JobStatusCard` que polea `/api/import/jobs/[id]` cada 2s mientras RUNNING.
- Botón "Confirmar y ejecutar" cuando status = `DRY_RUN_DONE`.
- Botón "Cancelar" disponible mientras `QUEUED`/`PARSING`/`DRY_RUN_DONE`.
- Botón "Rollback" disponible mientras `COMPLETED` (deshace todos los IDs en `rollback_log`).
- Tabla "Mis importaciones" con últimos 20 jobs, status, totales, descarga de errors como CSV.

### Endpoints

- `POST /api/import/jobs` — crea job, sube archivo a Storage, encola.
- `GET /api/import/jobs/[id]` — status para polling.
- `POST /api/import/jobs/[id]/confirm` — pasa de `DRY_RUN_DONE` a `RUNNING`.
- `POST /api/import/jobs/[id]/cancel` — cancela.
- `POST /api/import/jobs/[id]/rollback` — deshace IDs de `rollback_log`.
- `GET /api/import/jobs/[id]/errors.csv` — descarga errores.

Todos validan `agency_id === user.agency_id` o role SUPER_ADMIN. Defensa en profundidad además de RLS.

---

## Fase 4 — Wizard de onboarding

Cuando una agencia tiene `subscription_status = 'active'` y `(SELECT COUNT(*) FROM operations WHERE agency_id = X) = 0`, mostrar banner en el dashboard del admin:

> "🚀 ¿Querés cargar tu data histórica? Te guiamos paso a paso."

El banner abre un modal/route con flow guiado:
1. Configurar vendedores (los users ya existen como auth users; este paso solo asocia/renombra).
2. (Opcional) Subir catálogo de operadores.
3. (Opcional) Subir catálogo de clientes.
4. Subir CSV master de operaciones (incluye automáticamente cliente y operadores nuevos que aparecen).
5. (Opcional) Pagos sueltos / movimientos caja extra.

El wizard es UI wrapper del motor de Fase 2/3 — no agrega lógica nueva.

---

## Garantías de aislamiento multi-tenant

Defensa en profundidad — 3 capas:

1. **Schema**: `agency_id NOT NULL` en todas las tablas operativas. Un INSERT sin `agency_id` falla a nivel de constraint.
2. **RLS**: policy en cada tabla que filtra por `agency_id IN user_agencies(auth.uid())`. Un SELECT cross-tenant devuelve 0 filas.
3. **Application**: cada endpoint y cada matching de import scopea queries por `user.agency_id` explícitamente. Nunca confiar solo en RLS (memoria: `feedback_aislamiento_estricto_tenant.md`).

Workers / crons usan `createAdminClient()` que bypassa RLS, pero **siempre filtran explícitamente** por `agency_id` del job.

---

## Estimación

| Fase | Días | Bloqueante para |
|---|---|---|
| 1 — Schema + Backfill | 0.5–1 | Todo lo demás |
| 2 — Motor + plantillas | 2–3 | Fase 3 |
| 3 — Jobs async + UI | 2–3 | Fase 4 |
| 4 — Wizard onboarding | 0.5–1 | — |
| **Total** | **5–8 días** | |

Hoy puede cerrarse Fase 1 completa (pasos 0–5 del backfill, sin RLS aún). Fase 2 puede empezarse hoy en paralelo porque no depende del backfill terminado.

---

## Riesgos identificados

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | Backfill rompe data productiva de Rosario | Backups pre-migration de las 4 tablas; pasos chicos reversibles; SQL al chat antes de correr |
| 2 | Activar RLS rompe queries que no pasan agency_id | Auditoría endpoint-por-endpoint antes de activar; activar tabla por tabla, no todas juntas |
| 3 | Filas huérfanas (sin operación relacionada) | Pre-flight SELECT cuenta huérfanas. Si > 0, decisión caso por caso antes de seguir |
| 4 | Customer/operator usado por múltiples agencias en backfill | Improbable hoy (solo Rosario). Si aparece: duplicar fila por agencia. Documentado |
| 5 | CSV master muy ancho (30+ columnas) confunde al usuario | Plantilla descargable con ejemplo + columnas opcionales claramente marcadas |
| 6 | Job se cuelga / worker muere a mitad | Status `RUNNING` con `started_at` viejo (>30min) marca como `FAILED`. Cron de cleanup |
| 7 | Tenant sube CSV de 100 MB | Límite 10 MB hard en endpoint de upload |
| 8 | Race entre dos jobs del mismo tenant | El cron toma 1 job a la vez con `FOR UPDATE SKIP LOCKED`. Tenant ve que el segundo queda `QUEUED` hasta que el primero termina |

---

## Docs legacy a deprecar

Estos docs son del approach single-tenant Lozada (enero 2025) y quedan obsoletos al mergear este sistema:

- `docs/GUIA_MIGRACION_DATOS.md`
- `docs/PLAN_LIMPIEZA_MASIVA_PRE_IMPORTACION.md`
- `docs/csv-ejemplos/` (las plantillas se reemplazan por las nuevas en la UI)
- `scripts/import-masivo-operaciones.ts` (queda como referencia histórica de la lógica de los 14 pasos; no se borra hasta que el motor nuevo esté validado contra el CSV de Rosario)

---

## Decisiones cerradas durante el brainstorm

1. **Operadores per-tenant**, no globales. Cada agencia con su catálogo, matching scopeado.
2. **CSV master único** como camino canónico (estilo Rosario CSV). Plantillas secundarias para casos de data fragmentada.
3. **`operation_date` obligatorio** en plantilla master.
4. **Tipo de cambio**: monthly_exchange_rates con override manual por job.

## Decisiones diferidas (al plan de implementación)

- Número exacto de migration (siguiente disponible después de las actuales en `supabase/migrations/`).
- Dimensiones exactas del audit endpoint-por-endpoint que precede a activar RLS.
- Si rollback debe deshacer también ledger movements / accounting, o solo records primarios.
- Ubicación de subida del archivo en Supabase Storage: `import-jobs/<agency_id>/<job_id>/source.csv`.
- Confirmar existencia de `agencies.tax_status` o equivalente para condicionar generación de IVA en pipeline master.
