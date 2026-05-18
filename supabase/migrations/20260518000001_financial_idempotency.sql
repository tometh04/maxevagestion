-- VIB-11: Idempotencia fuerte en operaciones financieras
--
-- Problema: iva_sales, iva_purchases y ledger_movements no tienen constraints
-- de unicidad en DB, dejando la protección anti-duplicados solo en app-code.
-- Bajo concurrencia (doble-click, network retry, reintentos de cron) pueden
-- generarse duplicados que distorsionan la posición IVA y el libro mayor.
--
-- Solución:
--   1. UNIQUE(operation_id) en iva_sales         → una sola posición de venta por op
--   2. UNIQUE(operation_id, operator_id) en iva_purchases (no-null)
--      UNIQUE(operation_id) WHERE operator_id IS NULL
--   3. idempotency_key en ledger_movements        → movimientos opt-in idempotentes
--   4. idempotency_key en payments                → para futura integración de callers

-- ============================================================
-- 1. IVA SALES — UNIQUE(operation_id)
-- ============================================================

-- Limpiar duplicados existentes: conservar el más reciente por operación
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY operation_id ORDER BY created_at DESC) AS rn
  FROM iva_sales
  WHERE operation_id IS NOT NULL
)
DELETE FROM iva_sales
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE iva_sales
  ADD CONSTRAINT iva_sales_operation_id_unique UNIQUE (operation_id);

-- ============================================================
-- 2. IVA PURCHASES — UNIQUE(operation_id, operator_id)
-- ============================================================

-- Limpiar duplicados para pares (operation_id, operator_id) con operator no nulo
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY operation_id, operator_id
           ORDER BY created_at DESC
         ) AS rn
  FROM iva_purchases
  WHERE operator_id IS NOT NULL
)
DELETE FROM iva_purchases
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Limpiar duplicados para operation_id sin operator (legacy / operador único)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY operation_id
           ORDER BY created_at DESC
         ) AS rn
  FROM iva_purchases
  WHERE operator_id IS NULL
)
DELETE FROM iva_purchases
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Índice parcial: un registro de compra por (operación, operador) cuando operador es conocido
CREATE UNIQUE INDEX iva_purchases_operation_operator_unique
  ON iva_purchases(operation_id, operator_id)
  WHERE operator_id IS NOT NULL;

-- Índice parcial: un registro de compra por operación cuando no hay operador asignado
CREATE UNIQUE INDEX iva_purchases_operation_null_operator
  ON iva_purchases(operation_id)
  WHERE operator_id IS NULL;

-- ============================================================
-- 3. LEDGER MOVEMENTS — idempotency_key (opt-in)
-- ============================================================

ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Índice parcial: solo filas con key asignada participan del constraint de unicidad.
-- Los movimientos sin key (legacy, manuales) siguen funcionando sin cambios.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_movements_idempotency_key_unique
  ON ledger_movements(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- 4. PAYMENTS — idempotency_key (columna, para uso futuro de callers)
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_unique
  ON payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
