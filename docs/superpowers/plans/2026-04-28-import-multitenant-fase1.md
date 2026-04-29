# Import Multi-Tenant — Fase 1 (Schema + Backfill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar `agency_id NOT NULL REFERENCES agencies(id)` a las tablas `customers`, `operators`, `payments`, `cash_movements` con backfill seguro y reversible de filas existentes de Rosario, dejando RLS preparada pero NO activada (paso de activación va en sprint posterior tras auditoría de endpoints).

**Architecture:** Migration en pasos chicos cada uno reversible. Backups previos garantizan rollback completo. Cada UPDATE sobre data de Rosario se aprueba explícitamente en chat antes de correr. RLS policies se crean pero `ENABLE ROW LEVEL SECURITY` queda fuera de Fase 1 — eso requiere auditoría de endpoints que ocurre en otro sprint.

**Tech Stack:** PostgreSQL/Supabase, SQL migrations en `supabase/migrations/`, Railway hosting (no Vercel).

**Spec referencia:** [docs/superpowers/specs/2026-04-28-import-multitenant-design.md](../specs/2026-04-28-import-multitenant-design.md)

**Reglas de oro (de memoria del proyecto):**
- Toda migration/SQL se pega en el chat para que Tomi la copie a Supabase SQL Editor.
- Antes de cualquier UPDATE sobre data de Rosario, mostrar el SQL exacto y pedir OK.
- Commits locales libres, push solo con OK explícito.
- Paths absolutos siempre.

---

## Tasks

### Task 1: Pre-flight inspection — contar huérfanas y multi-agencia

**Goal:** Antes de tocar nada, confirmar el estado actual: cuántas filas de `customers`/`operators`/`payments`/`cash_movements` quedarían sin `agency_id` después del backfill, y cuántas están vinculadas a múltiples agencias (caso edge).

**Files:**
- No file changes. Solo queries de inspección que se corren en Supabase SQL Editor.

- [ ] **Step 1: Pegar pre-flight SQL en el chat para Tomi**

```sql
-- Pre-flight 1: cuántos payments quedarían huérfanos
-- (esperado: 0 — operation_id es NOT NULL en payments)
SELECT COUNT(*) AS payments_huerfanos
FROM payments p
LEFT JOIN operations o ON o.id = p.operation_id
WHERE o.id IS NULL;

-- Pre-flight 2: cuántos cash_movements quedarían huérfanos
-- (sin operation_id Y sin user_agencies)
SELECT COUNT(*) AS cash_movements_huerfanos
FROM cash_movements cm
WHERE cm.operation_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_agencies ua WHERE ua.user_id = cm.user_id
  );

-- Pre-flight 3: cuántos customers no están vinculados a ninguna operación
SELECT COUNT(*) AS customers_huerfanos
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM operation_customers oc WHERE oc.customer_id = c.id
);

-- Pre-flight 4: cuántos operators no están vinculados a ninguna operación
SELECT COUNT(*) AS operators_huerfanos
FROM operators op
WHERE NOT EXISTS (
  SELECT 1 FROM operation_operators oo WHERE oo.operator_id = op.id
);

-- Pre-flight 5: customers en múltiples agencias (caso edge)
SELECT
  c.id, c.first_name, c.last_name, c.email,
  COUNT(DISTINCT o.agency_id) AS num_agencias
FROM customers c
JOIN operation_customers oc ON oc.customer_id = c.id
JOIN operations o ON o.id = oc.operation_id
GROUP BY c.id, c.first_name, c.last_name, c.email
HAVING COUNT(DISTINCT o.agency_id) > 1
ORDER BY num_agencias DESC;

-- Pre-flight 6: operators en múltiples agencias (caso edge)
SELECT
  op.id, op.name,
  COUNT(DISTINCT o.agency_id) AS num_agencias
FROM operators op
JOIN operation_operators oo ON oo.operator_id = op.id
JOIN operations o ON o.id = oo.operation_id
GROUP BY op.id, op.name
HAVING COUNT(DISTINCT o.agency_id) > 1
ORDER BY num_agencias DESC;

-- Pre-flight 7: cuántas agencias hay hoy en producción
SELECT id, name, created_at FROM agencies ORDER BY created_at;

-- Pre-flight 8: total de filas por tabla afectada (para dimensionar backups)
SELECT 'customers' AS tabla, COUNT(*) AS filas FROM customers
UNION ALL SELECT 'operators', COUNT(*) FROM operators
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'cash_movements', COUNT(*) FROM cash_movements;
```

- [ ] **Step 2: Tomi corre las queries en Supabase y pega los resultados**

Expected outputs:
- `payments_huerfanos` = 0 (sin esto, Step 5 del backfill falla silenciosamente)
- `cash_movements_huerfanos` ≥ 0 (si > 0, decisión caso por caso en Task 5)
- `customers_huerfanos` ≥ 0 (si > 0, decisión: asignar a Rosario default o flag manual)
- `operators_huerfanos` ≥ 0 (idem)
- Pre-flight 5/6 (multi-agencia) — esperado: 0 filas (solo Rosario en producción)
- Pre-flight 7 — esperado: 1 agencia (Rosario) o pocas
- Pre-flight 8 — para dimensionar tiempo de backup

- [ ] **Step 3: Decidir estrategia para huérfanas según resultado**

Si `cash_movements_huerfanos > 0`: deciden con Tomi si se asignan a la única agencia (Rosario) por default o se revisan manualmente.
Si `customers_huerfanos > 0`: idem.
Si `operators_huerfanos > 0`: idem.
Si Pre-flight 5/6 devuelven filas: documentar lista, plan de duplicación caso por caso.

**No commit.** Esta task es solo inspección.

---

### Task 2: Backups completos de las 4 tablas

**Goal:** Backups que permitan restaurar exactamente el estado actual si algo sale mal en cualquier paso posterior.

**Files:**
- Create migration: `supabase/migrations/113_backup_pre_agency_id_migration.sql`

- [ ] **Step 1: Crear el archivo de migration con backups**

```sql
-- supabase/migrations/113_backup_pre_agency_id_migration.sql
-- =====================================================
-- BACKUPS pre-migración Fase 1 import multi-tenant
-- =====================================================
-- Crea snapshots de las 4 tablas a las que vamos a agregar agency_id.
-- Estos backups permiten restauración completa si el backfill falla.
-- Se pueden borrar después de validar que Fase 1 quedó estable.

CREATE TABLE IF NOT EXISTS customers_backup_2026_04_28 AS
  SELECT * FROM customers;

CREATE TABLE IF NOT EXISTS operators_backup_2026_04_28 AS
  SELECT * FROM operators;

CREATE TABLE IF NOT EXISTS payments_backup_2026_04_28 AS
  SELECT * FROM payments;

CREATE TABLE IF NOT EXISTS cash_movements_backup_2026_04_28 AS
  SELECT * FROM cash_movements;

-- Verificación: count debe coincidir con totales del pre-flight Task 1 step 8
SELECT 'customers_backup' AS tabla, COUNT(*) AS filas FROM customers_backup_2026_04_28
UNION ALL SELECT 'operators_backup', COUNT(*) FROM operators_backup_2026_04_28
UNION ALL SELECT 'payments_backup', COUNT(*) FROM payments_backup_2026_04_28
UNION ALL SELECT 'cash_movements_backup', COUNT(*) FROM cash_movements_backup_2026_04_28;
```

- [ ] **Step 2: Pegar SQL en chat y pedir a Tomi que lo corra en Supabase**

Mensaje: "Acá va la migration 113 (solo crea backups, no toca data). Pegala en Supabase SQL Editor y avisame los counts."

- [ ] **Step 3: Verificar counts**

Tomi pega los counts. Deben coincidir uno a uno con los counts de Task 1 Step 8 Pre-flight 8.

Si coinciden: ✅ continuar.
Si no coinciden: STOP. Investigar discrepancia antes de seguir.

- [ ] **Step 4: Commit local del archivo de migration**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add supabase/migrations/113_backup_pre_agency_id_migration.sql
git commit -m "$(cat <<'EOF'
feat(import-fase1): backup tables before agency_id migration

Migration 113 crea snapshots de customers/operators/payments/cash_movements
antes de agregar agency_id NOT NULL. Permite rollback completo si el
backfill posterior falla.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Rollback (si hace falta volver atrás):**
```sql
DROP TABLE customers_backup_2026_04_28;
DROP TABLE operators_backup_2026_04_28;
DROP TABLE payments_backup_2026_04_28;
DROP TABLE cash_movements_backup_2026_04_28;
```

---

### Task 3: Agregar columna `agency_id` NULLABLE + índices

**Goal:** Agregar la columna nueva sin romper nada. NULLABLE para que el ALTER TABLE no falle por filas existentes. Riesgo cero porque la app no usa la columna todavía.

**Files:**
- Create migration: `supabase/migrations/114_add_agency_id_nullable_to_orphan_tables.sql`

- [ ] **Step 1: Crear el archivo de migration**

```sql
-- supabase/migrations/114_add_agency_id_nullable_to_orphan_tables.sql
-- =====================================================
-- Fase 1: agregar agency_id NULLABLE a las 4 tablas huérfanas
-- =====================================================
-- Las tablas customers, operators, payments, cash_movements no tenían
-- agency_id desde 001_initial_schema.sql. Esta migration agrega la columna
-- como NULLABLE; el backfill (migration 115) y el SET NOT NULL (migration 116)
-- se hacen aparte para mantener cada paso reversible.

-- 1. customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_customers_agency_id ON customers(agency_id);

-- 2. operators
ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_operators_agency_id ON operators(agency_id);

-- 3. payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_payments_agency_id ON payments(agency_id);

-- 4. cash_movements
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cash_movements_agency_id ON cash_movements(agency_id);

-- Verificación: confirmar que la columna existe y está nullable
SELECT
  table_name,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'agency_id'
  AND table_name IN ('customers', 'operators', 'payments', 'cash_movements')
ORDER BY table_name;
```

- [ ] **Step 2: Pegar SQL en chat y pedir a Tomi que lo corra**

Mensaje: "Migration 114 agrega `agency_id` NULLABLE a las 4 tablas. Cero riesgo, columnas vacías nuevas. Pegala en Supabase y pegame el resultado del SELECT de verificación."

- [ ] **Step 3: Verificar resultado**

Tomi pega el resultado. Esperado:
```
customers       | agency_id | YES | uuid
operators       | agency_id | YES | uuid
payments        | agency_id | YES | uuid
cash_movements  | agency_id | YES | uuid
```

Si las 4 filas aparecen con `is_nullable = YES`: ✅ continuar.
Si falta alguna o is_nullable=NO: STOP. Algo raro pasó.

- [ ] **Step 4: Commit local**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add supabase/migrations/114_add_agency_id_nullable_to_orphan_tables.sql
git commit -m "$(cat <<'EOF'
feat(import-fase1): add nullable agency_id to orphan tables

Migration 114 agrega agency_id NULLABLE + indexes a customers,
operators, payments, cash_movements. Sin impacto funcional —
columnas vacías. Backfill viene en migration 115.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Rollback:**
```sql
DROP INDEX IF EXISTS idx_customers_agency_id;
DROP INDEX IF EXISTS idx_operators_agency_id;
DROP INDEX IF EXISTS idx_payments_agency_id;
DROP INDEX IF EXISTS idx_cash_movements_agency_id;
ALTER TABLE customers DROP COLUMN IF EXISTS agency_id;
ALTER TABLE operators DROP COLUMN IF EXISTS agency_id;
ALTER TABLE payments DROP COLUMN IF EXISTS agency_id;
ALTER TABLE cash_movements DROP COLUMN IF EXISTS agency_id;
```

---

### Task 4: Backfill de `payments` (sin riesgo)

**Goal:** Setear `agency_id` en cada fila de `payments` heredándolo de `operations.agency_id` vía `operation_id`. Es el backfill más simple porque `payments.operation_id` es `NOT NULL`.

**Files:**
- Create migration: `supabase/migrations/115_backfill_payments_agency_id.sql`

- [ ] **Step 1: Mostrar SQL a Tomi y pedir aprobación explícita**

Por la regla "JAMÁS modificar data de Rosario sin OK", este UPDATE necesita confirmación explícita aunque sea mecánico.

Mensaje:

> "Migration 115 — backfill de `payments.agency_id`. ESTO ES UN UPDATE SOBRE DATA PRODUCTIVA DE ROSARIO. Es mecánico (no toca montos ni fechas, solo agrega tag de tenant) pero quiero tu OK explícito antes de correrlo. SQL:"

```sql
-- supabase/migrations/115_backfill_payments_agency_id.sql
-- =====================================================
-- Fase 1: backfill agency_id en payments
-- =====================================================
-- Cada payment hereda agency_id de la operation a la que está vinculado.
-- payments.operation_id es NOT NULL, así que sin huérfanos.
-- ⚠️ UPDATE sobre data productiva de Rosario, mecánico.
-- Pre-aprobado caso por caso en chat.

UPDATE payments p
SET agency_id = o.agency_id
FROM operations o
WHERE p.operation_id = o.id
  AND p.agency_id IS NULL;

-- Verificación: cuántas filas quedaron sin agency_id (esperado: 0)
SELECT COUNT(*) AS payments_sin_agency_id
FROM payments WHERE agency_id IS NULL;
```

- [ ] **Step 2: Esperar OK explícito de Tomi**

Si Tomi dice "OK" / "dale" / "vamos" → continuar.
Si Tomi dice "esperá" / "no" o pregunta algo → resolver antes de seguir.

- [ ] **Step 3: Tomi corre en Supabase**

Verificación esperada: `payments_sin_agency_id = 0`.

- [ ] **Step 4: Si quedaron filas en NULL, STOP**

Si la verificación da > 0:
- Investigar qué filas son: `SELECT * FROM payments WHERE agency_id IS NULL LIMIT 10;`
- Reportar a Tomi y decidir antes de seguir.

- [ ] **Step 5: Commit local**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add supabase/migrations/115_backfill_payments_agency_id.sql
git commit -m "$(cat <<'EOF'
feat(import-fase1): backfill payments.agency_id from operations

Migration 115 — payments hereda agency_id de su operation.
operation_id NOT NULL garantiza cero huérfanos. Aprobado por Tomi
antes de correr.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Rollback:**
```sql
UPDATE payments SET agency_id = NULL;
```

---

### Task 5: Backfill de `cash_movements`

**Goal:** Setear `agency_id` en cash_movements heredándolo de `operation_id` (si existe) o de `user_id → user_agencies` (fallback). Si quedan huérfanas, decidir con Tomi caso por caso.

**Files:**
- Create migration: `supabase/migrations/116_backfill_cash_movements_agency_id.sql`

- [ ] **Step 1: Mostrar SQL a Tomi y pedir aprobación**

Mensaje:

> "Migration 116 — backfill de `cash_movements.agency_id`. UPDATE sobre data de Rosario, mecánico. SQL:"

```sql
-- supabase/migrations/116_backfill_cash_movements_agency_id.sql
-- =====================================================
-- Fase 1: backfill agency_id en cash_movements
-- =====================================================
-- Estrategia:
--  1. Si cash_movement tiene operation_id no nulo → hereda de operations.agency_id
--  2. Si no tiene operation_id → hereda de user_agencies por user_id
--     (toma la primera; si user tiene múltiples agencias, asume la primaria)
-- ⚠️ UPDATE sobre data productiva de Rosario, mecánico.

UPDATE cash_movements cm
SET agency_id = COALESCE(
  (SELECT o.agency_id FROM operations o WHERE o.id = cm.operation_id),
  (SELECT ua.agency_id FROM user_agencies ua WHERE ua.user_id = cm.user_id LIMIT 1)
)
WHERE cm.agency_id IS NULL;

-- Verificación: cuántas filas quedaron sin agency_id
SELECT COUNT(*) AS cash_movements_sin_agency_id
FROM cash_movements WHERE agency_id IS NULL;

-- Si quedan, mostrar las primeras 10 para entender el caso
SELECT id, type, amount, currency, movement_date, user_id, operation_id
FROM cash_movements
WHERE agency_id IS NULL
LIMIT 10;
```

- [ ] **Step 2: Esperar OK explícito de Tomi**

- [ ] **Step 3: Tomi corre en Supabase y reporta resultado**

- [ ] **Step 4: Manejar huérfanas si quedan**

Si `cash_movements_sin_agency_id = 0`: ✅ ir a Step 5.

Si > 0: discutir con Tomi qué hacer con las filas listadas. Probables casos:
- User existió pero ya no está en `user_agencies` → asignar manualmente al agency_id que tenga sentido por contexto.
- Movimiento muy viejo sin operation_id ni user válido → posiblemente bug de data, asignar a Rosario por default.

Para cada caso decidido, generar SQL específico tipo:
```sql
UPDATE cash_movements SET agency_id = '<id-de-rosario>'
WHERE id IN ('<id1>', '<id2>', ...);
```
y agregarlo al final de la migration.

- [ ] **Step 5: Commit local**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add supabase/migrations/116_backfill_cash_movements_agency_id.sql
git commit -m "$(cat <<'EOF'
feat(import-fase1): backfill cash_movements.agency_id

Migration 116 — cash_movements hereda agency_id de operation_id
(si existe) o de user_agencies. Aprobado por Tomi antes de correr.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Rollback:**
```sql
UPDATE cash_movements SET agency_id = NULL;
```

---

### Task 6: Backfill de `customers`

**Goal:** Setear `agency_id` en customers heredando de `operation_customers → operations`. Excluye casos multi-agencia (deben haberse confirmado en Task 1 que hay 0). Customers sin operación quedan en NULL — se manejan en step posterior.

**Files:**
- Create migration: `supabase/migrations/117_backfill_customers_agency_id.sql`

- [ ] **Step 1: Mostrar SQL a Tomi y pedir aprobación**

Mensaje:

> "Migration 117 — backfill de `customers.agency_id` (happy path: customers en una sola agencia). UPDATE sobre data de Rosario, mecánico. SQL:"

```sql
-- supabase/migrations/117_backfill_customers_agency_id.sql
-- =====================================================
-- Fase 1: backfill agency_id en customers (happy path)
-- =====================================================
-- Excluye customers usados por múltiples agencias (caso edge).
-- Si Pre-flight 5 (Task 1) devolvió 0 filas, esta exclusión no afecta nada.
-- Customers sin operación vinculada quedan NULL — se asignan en step
-- posterior según decisión de Tomi.
-- ⚠️ UPDATE sobre data productiva de Rosario, mecánico.

UPDATE customers c
SET agency_id = (
  SELECT o.agency_id
  FROM operation_customers oc
  JOIN operations o ON o.id = oc.operation_id
  WHERE oc.customer_id = c.id
  LIMIT 1
)
WHERE c.agency_id IS NULL
  AND c.id NOT IN (
    -- Excluye customers en múltiples agencias
    SELECT oc.customer_id
    FROM operation_customers oc
    JOIN operations o ON o.id = oc.operation_id
    GROUP BY oc.customer_id
    HAVING COUNT(DISTINCT o.agency_id) > 1
  );

-- Verificación
SELECT
  COUNT(*) FILTER (WHERE agency_id IS NULL) AS sin_agency_id,
  COUNT(*) FILTER (WHERE agency_id IS NOT NULL) AS con_agency_id,
  COUNT(*) AS total
FROM customers;
```

- [ ] **Step 2: Esperar OK explícito de Tomi**

- [ ] **Step 3: Tomi corre y reporta**

- [ ] **Step 4: Decidir qué hacer con las que quedaron NULL**

Casos posibles:
- **Customers sin operación** (Pre-flight 3 de Task 1): cliente cargado al catálogo sin venta. Decisión con Tomi: asignar a Rosario por default (probablemente sí, porque toda data es de Rosario hoy).
- **Customers multi-agencia** (Pre-flight 5): si había alguno, hay que duplicar. SQL caso por caso.

Si Tomi confirma "todo a Rosario por default":

```sql
-- Asignar customers huérfanas a Rosario
UPDATE customers SET agency_id = '<id-de-rosario>'
WHERE agency_id IS NULL;
```

Donde `<id-de-rosario>` se toma del Pre-flight 7 de Task 1.

- [ ] **Step 5: Re-verificar que no queden NULLs**

```sql
SELECT COUNT(*) FROM customers WHERE agency_id IS NULL;
-- Esperado: 0
```

- [ ] **Step 6: Commit local**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add supabase/migrations/117_backfill_customers_agency_id.sql
git commit -m "$(cat <<'EOF'
feat(import-fase1): backfill customers.agency_id

Migration 117 — customers hereda agency_id de operation_customers.
Customers huérfanas se asignan a Rosario por default (decisión Tomi).
Aprobado en chat antes de correr.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Rollback:**
```sql
UPDATE customers SET agency_id = NULL;
```

---

### Task 7: Backfill de `operators`

**Goal:** Igual que customers pero para operators. Mismo patrón.

**Files:**
- Create migration: `supabase/migrations/118_backfill_operators_agency_id.sql`

- [ ] **Step 1: Mostrar SQL y pedir aprobación**

Mensaje:

> "Migration 118 — backfill de `operators.agency_id`. Mismo patrón que customers. SQL:"

```sql
-- supabase/migrations/118_backfill_operators_agency_id.sql
-- =====================================================
-- Fase 1: backfill agency_id en operators (happy path)
-- =====================================================
-- Excluye operators usados por múltiples agencias.
-- Operators sin operation_operators vinculada quedan NULL — se asignan
-- a Rosario por default si Tomi lo aprueba.
-- ⚠️ UPDATE sobre data productiva de Rosario, mecánico.

UPDATE operators op
SET agency_id = (
  SELECT o.agency_id
  FROM operation_operators oo
  JOIN operations o ON o.id = oo.operation_id
  WHERE oo.operator_id = op.id
  LIMIT 1
)
WHERE op.agency_id IS NULL
  AND op.id NOT IN (
    SELECT oo.operator_id
    FROM operation_operators oo
    JOIN operations o ON o.id = oo.operation_id
    GROUP BY oo.operator_id
    HAVING COUNT(DISTINCT o.agency_id) > 1
  );

-- Verificación
SELECT
  COUNT(*) FILTER (WHERE agency_id IS NULL) AS sin_agency_id,
  COUNT(*) FILTER (WHERE agency_id IS NOT NULL) AS con_agency_id,
  COUNT(*) AS total
FROM operators;
```

- [ ] **Step 2: Esperar OK explícito**

- [ ] **Step 3: Tomi corre y reporta**

- [ ] **Step 4: Manejar huérfanas (mismo patrón que Task 6)**

```sql
-- Si Tomi aprueba "todo a Rosario por default":
UPDATE operators SET agency_id = '<id-de-rosario>'
WHERE agency_id IS NULL;
```

- [ ] **Step 5: Re-verificar 0 NULLs**

```sql
SELECT COUNT(*) FROM operators WHERE agency_id IS NULL;
-- Esperado: 0
```

- [ ] **Step 6: Commit local**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add supabase/migrations/118_backfill_operators_agency_id.sql
git commit -m "$(cat <<'EOF'
feat(import-fase1): backfill operators.agency_id

Migration 118 — operators hereda agency_id de operation_operators.
Operators huérfanas se asignan a Rosario por default (decisión Tomi).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Rollback:**
```sql
UPDATE operators SET agency_id = NULL;
```

---

### Task 8: Verificar que las 4 tablas tengan 0 NULLs

**Goal:** Confirmar antes de aplicar `NOT NULL` que ninguna fila quedó sin `agency_id`. Si alguna falla, abortar y volver al paso del backfill correspondiente.

**Files:**
- No file changes. Solo verificación SQL.

- [ ] **Step 1: Pegar SQL de verificación en chat**

```sql
-- Verificación final pre-NOT-NULL
SELECT 'customers' AS tabla, COUNT(*) AS sin_agency_id
  FROM customers WHERE agency_id IS NULL
UNION ALL SELECT 'operators', COUNT(*)
  FROM operators WHERE agency_id IS NULL
UNION ALL SELECT 'payments', COUNT(*)
  FROM payments WHERE agency_id IS NULL
UNION ALL SELECT 'cash_movements', COUNT(*)
  FROM cash_movements WHERE agency_id IS NULL;
```

- [ ] **Step 2: Tomi corre y reporta**

Esperado: las 4 filas con `sin_agency_id = 0`.

- [ ] **Step 3: Si alguna no es 0, STOP**

Reportar a Tomi qué tabla quedó pendiente, volver al backfill correspondiente.

Si todas son 0: ✅ continuar a Task 9.

**No commit.** Solo verificación.

---

### Task 9: Aplicar `NOT NULL` a `agency_id` en las 4 tablas

**Goal:** Lockear el invariante de que toda fila tiene `agency_id`. Esto es lo que garantiza que ningún INSERT futuro pueda crear filas huérfanas.

**Files:**
- Create migration: `supabase/migrations/119_set_agency_id_not_null.sql`

- [ ] **Step 1: Crear el archivo de migration**

```sql
-- supabase/migrations/119_set_agency_id_not_null.sql
-- =====================================================
-- Fase 1: lockear agency_id como NOT NULL en las 4 tablas
-- =====================================================
-- Pre-requisito: Task 8 confirmó que NO quedan filas con agency_id NULL.
-- Una vez aplicado esto, ningún INSERT puede crear filas sin tenant tag.

ALTER TABLE customers ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE operators ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE payments ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE cash_movements ALTER COLUMN agency_id SET NOT NULL;

-- Verificación
SELECT
  table_name,
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'agency_id'
  AND table_name IN ('customers', 'operators', 'payments', 'cash_movements')
ORDER BY table_name;
```

- [ ] **Step 2: Pegar SQL en chat y pedir a Tomi que lo corra**

- [ ] **Step 3: Verificar resultado**

Esperado: las 4 filas con `is_nullable = NO`.

Si alguna queda en YES: investigar (probablemente Task 8 falsa alarma).

- [ ] **Step 4: Smoke test — la app sigue andando**

Tomi entra a la app productiva (Maxi/Lozada/Rosario) y verifica que:
- Lista de clientes carga
- Lista de operadores carga
- Una operación abre OK
- Caja muestra movimientos

Si alguna pantalla rompe → STOP, rollback a Task 8 y revisar.

- [ ] **Step 5: Commit local**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add supabase/migrations/119_set_agency_id_not_null.sql
git commit -m "$(cat <<'EOF'
feat(import-fase1): set agency_id NOT NULL on 4 tables

Migration 119 — bloquea creación de filas huérfanas (sin tenant tag)
en customers, operators, payments, cash_movements. Smoke test
confirmado por Tomi.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Rollback:**
```sql
ALTER TABLE customers ALTER COLUMN agency_id DROP NOT NULL;
ALTER TABLE operators ALTER COLUMN agency_id DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN agency_id DROP NOT NULL;
ALTER TABLE cash_movements ALTER COLUMN agency_id DROP NOT NULL;
```

---

### Task 10: Crear RLS Policies (sin activar RLS aún)

**Goal:** Definir las policies de aislamiento por tenant pero NO activarlas. Las policies existen pero no se aplican hasta `ENABLE ROW LEVEL SECURITY` (que va en sprint posterior tras auditoría de endpoints).

**Files:**
- Create migration: `supabase/migrations/120_create_rls_policies_for_orphan_tables.sql`

- [ ] **Step 1: Crear el archivo de migration**

```sql
-- supabase/migrations/120_create_rls_policies_for_orphan_tables.sql
-- =====================================================
-- Fase 1: crear RLS policies para las 4 tablas (sin activar RLS)
-- =====================================================
-- IMPORTANTE: este script crea las policies pero NO ejecuta ENABLE ROW
-- LEVEL SECURITY. La activación se hace en otra sesión, tabla por tabla,
-- después de auditar que cada endpoint pase agency_id correctamente.
-- Mientras RLS no está habilitada, las policies no tienen efecto.

-- Helper: dropear policy si existe (idempotente)
DO $$
BEGIN
  -- customers
  DROP POLICY IF EXISTS customers_tenant_isolation ON customers;
  CREATE POLICY customers_tenant_isolation ON customers
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );

  -- operators
  DROP POLICY IF EXISTS operators_tenant_isolation ON operators;
  CREATE POLICY operators_tenant_isolation ON operators
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );

  -- payments
  DROP POLICY IF EXISTS payments_tenant_isolation ON payments;
  CREATE POLICY payments_tenant_isolation ON payments
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );

  -- cash_movements
  DROP POLICY IF EXISTS cash_movements_tenant_isolation ON cash_movements;
  CREATE POLICY cash_movements_tenant_isolation ON cash_movements
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );
END $$;

-- Verificación: las 4 policies deben existir
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('customers', 'operators', 'payments', 'cash_movements')
  AND policyname LIKE '%tenant_isolation%'
ORDER BY tablename;

-- Verificación: RLS debe estar DESACTIVADA (rowsecurity = false) en las 4
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('customers', 'operators', 'payments', 'cash_movements')
  AND schemaname = 'public'
ORDER BY tablename;
```

- [ ] **Step 2: Pegar SQL en chat y pedir a Tomi que lo corra**

Mensaje: "Migration 120 — crea las policies de RLS pero NO las activa. Cero impacto en la app actual. Pegala y pegame el resultado de las dos verificaciones."

- [ ] **Step 3: Verificar resultados**

Verificación 1: 4 filas, una por tabla, con `cmd = ALL`.
Verificación 2: 4 filas con `rowsecurity = false`.

Si alguna no cumple: STOP, investigar.

- [ ] **Step 4: Commit local**

```bash
cd "/Users/tomiisanchezz/Desktop/Vibook Services/maxeva-saas"
git add supabase/migrations/120_create_rls_policies_for_orphan_tables.sql
git commit -m "$(cat <<'EOF'
feat(import-fase1): create RLS policies for tenant isolation (not enabled)

Migration 120 — crea policies de aislamiento por agency_id en las 4
tablas. RLS NO se activa todavía; eso requiere auditoría de endpoints
en sprint posterior.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Rollback:**
```sql
DROP POLICY IF EXISTS customers_tenant_isolation ON customers;
DROP POLICY IF EXISTS operators_tenant_isolation ON operators;
DROP POLICY IF EXISTS payments_tenant_isolation ON payments;
DROP POLICY IF EXISTS cash_movements_tenant_isolation ON cash_movements;
```

---

### Task 11: Resumen de cierre Fase 1 + checkpoint

**Goal:** Confirmar que Fase 1 quedó estable, dejar claro qué falta (RLS activation + Fase 2-4) y guardar memoria del estado.

**Files:**
- Modify: `/Users/tomiisanchezz/.claude/projects/-Users-tomiisanchezz-Desktop-Repos/memory/MEMORY.md`
- Create: `/Users/tomiisanchezz/.claude/projects/-Users-tomiisanchezz-Desktop-Repos/memory/project_import_fase1_done.md`

- [ ] **Step 1: Smoke test final extendido**

Tomi verifica en la app productiva:
- Login normal de Maxi
- Lista clientes carga, paginado funciona
- Buscar cliente por nombre funciona
- Lista operadores carga
- Lista operaciones carga
- Abrir una operación muestra cliente, operadores, payments
- Caja muestra movimientos
- Crear una operación nueva (test mínimo) funciona
- Crear un payment nuevo funciona

Cualquier rotura → STOP, rollback al estado pre-Task 9.

- [ ] **Step 2: Crear memoria del proyecto**

```markdown
---
name: Import Multi-Tenant Fase 1 DONE
description: Schema migrations 113-120 aplicadas. customers/operators/payments/cash_movements ahora tienen agency_id NOT NULL + RLS policies definidas pero RLS NO activada (pendiente para sprint posterior tras audit de endpoints).
type: project
---

Fase 1 del proyecto Import Multi-Tenant cerrada 2026-04-28 (o fecha real al cerrar).

**Migrations aplicadas:**
- 113: backups de las 4 tablas
- 114: agregar agency_id NULLABLE
- 115: backfill payments
- 116: backfill cash_movements
- 117: backfill customers
- 118: backfill operators
- 119: SET NOT NULL
- 120: crear RLS policies (sin activar RLS)

**Estado:**
- ✅ Toda fila de customers/operators/payments/cash_movements tiene agency_id
- ✅ Constraint NOT NULL impide crear filas huérfanas
- ✅ RLS policies definidas
- ❌ RLS NO está activada (rowsecurity = false en las 4 tablas)
- ✅ Backups disponibles en *_backup_2026_04_28 por si hace falta rollback

**Pendientes inmediatos:**
1. Audit de endpoints — encontrar TODA query/insert/update sobre las 4 tablas y confirmar que pase agency_id explícito
2. Activar RLS tabla por tabla con smoke testing entre cada activación
3. Limpiar tablas *_backup_2026_04_28 después de validar estabilidad (>1 semana)

**Próximo sprint:** plan de Fase 2 (motor de import en lib/import/) — escribir spec/plan cuando Fase 1 esté validada.

**Spec referencia:** docs/superpowers/specs/2026-04-28-import-multitenant-design.md
**Plan referencia:** docs/superpowers/plans/2026-04-28-import-multitenant-fase1.md
```

- [ ] **Step 3: Agregar entrada a MEMORY.md**

Agregar al final del archivo (NO duplicar si ya existe):

```markdown
- [Import Fase 1 DONE](project_import_fase1_done.md) — schema multi-tenant + backfill cerrado. RLS pendiente de activar tras audit de endpoints
```

- [ ] **Step 4: Reportar a Tomi**

Mensaje final:

> "Fase 1 cerrada. 8 migrations aplicadas (113-120), las 4 tablas con `agency_id NOT NULL`, smoke test OK. RLS está definida pero NO activada — eso lo hacemos en sprint aparte después de auditar endpoints. Listo para arrancar el plan de Fase 2 (motor de import) cuando me digas."

**No commit en este step** porque las memorias están en el folder global de Claude, no en el repo.

---

## Out of Scope (sprints posteriores)

Lo siguiente NO está en este plan; se hace en sprints separados:

- **Audit de endpoints**: encontrar todos los queries/inserts/updates sobre las 4 tablas en `app/`, `lib/` y confirmar que pasen `agency_id`. Trabajo de varias horas a un día. Necesario antes de activar RLS.
- **Activación de RLS**: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` una tabla a la vez con smoke testing. Tras audit.
- **Cleanup de backups**: dropear las 4 tablas `*_backup_2026_04_28` después de validar estabilidad por al menos una semana.
- **Fase 2** del proyecto: motor de import en `lib/import/`. Plan separado.
- **Fase 3-4**: jobs async + UI + wizard onboarding. Planes separados.

---

## Self-Review (checklist ya corrida por el autor)

**Spec coverage:**
- ✅ Sección "Estrategia de backfill (7 pasos)" → cubierta por Tasks 2-10
- ✅ "Queries de backfill por tabla" → Tasks 4-7
- ✅ "Edge case multi-agencia" → mencionado en Tasks 6-7 con SQL de exclusión
- ✅ "RLS Policies" → Task 10 (definición sin activación)
- ❌ "Activar RLS tabla por tabla" → marcado explícitamente como Out of Scope (decisión consciente: requiere audit previo)
- ✅ Reglas de oro de memoria → bake-in en cada task con UPDATE

**Placeholder scan:** sin TBD/TODO/placeholder en el plan. Cada SQL es completo y ejecutable.

**Type/naming consistency:** todas las migrations usan numeración secuencial 113-120. Todas las policies usan sufijo `_tenant_isolation`. Todos los backups usan sufijo `_backup_2026_04_28`. Consistente.
