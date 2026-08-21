-- VIB-134/B3 — Clave de idempotencia explícita para los asientos automáticos
--
-- PROBLEMA
-- --------
-- Los asientos de venta y de costo comparten `source = 'AUTO_CONFIRMATION'`, así
-- que el origen no alcanza para distinguirlos. Para no duplicar el de costo, el
-- código lo buscaba por la DESCRIPCIÓN:
--
--     .eq("source", "AUTO_CONFIRMATION").ilike("description", "Costo%")
--
-- Eso es frágil en dos direcciones: un asiento manual de la misma operación que
-- empiece con "Costo" bloquea al automático para siempre, y cualquier cambio de
-- redacción en la descripción lo deja de encontrar y duplica.
--
-- Hasta ahora el punto era teórico —el motor nunca había producido un asiento de
-- venta, costo ni comisión—, pero desde 80b6bd6a es código vivo.
--
-- SOLUCIÓN
-- --------
-- Una columna explícita `entry_kind` + un índice ÚNICO parcial que hace cumplir
-- la regla en la base: una operación tiene como mucho un asiento de cada clase.
-- La idempotencia deja de depender de una convención de texto y pasa a ser un
-- invariante del esquema.
--
-- Los asientos de pago (`AUTO_PAYMENT`) quedan con `entry_kind` en NULL a
-- propósito: una operación tiene N pagos y por lo tanto N asientos, así que no
-- deben entrar en el índice único. Por eso el índice es parcial.

-- 1. La columna
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS entry_kind text;

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_entry_kind_check;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_entry_kind_check
  CHECK (entry_kind IS NULL OR entry_kind IN ('SALE', 'COST', 'COMMISSION'));

COMMENT ON COLUMN journal_entries.entry_kind IS
  'Clase del asiento automático de una operación (SALE/COST/COMMISSION). Es la clave de idempotencia: ver el índice único parcial journal_entries_operation_kind_unique. NULL en los asientos de pago, que son varios por operación.';

-- 2. Backfill de lo existente.
--    Verificado antes de escribir esto: 1433 SALE, 1307 COST y 647 COMMISSION,
--    con CERO duplicados por (operation_id, clase), así que el índice de abajo
--    se puede crear sin conflictos.
UPDATE journal_entries
SET entry_kind = 'COMMISSION'
WHERE source = 'AUTO_COMMISSION'
  AND operation_id IS NOT NULL
  AND entry_kind IS NULL;

UPDATE journal_entries
SET entry_kind = 'SALE'
WHERE source = 'AUTO_CONFIRMATION'
  AND operation_id IS NOT NULL
  AND entry_kind IS NULL
  AND description ILIKE 'Venta%';

UPDATE journal_entries
SET entry_kind = 'COST'
WHERE source = 'AUTO_CONFIRMATION'
  AND operation_id IS NOT NULL
  AND entry_kind IS NULL
  AND description ILIKE 'Costo%';

-- 3. El invariante: una operación, un asiento por clase.
--    Parcial para no alcanzar a los asientos de pago (entry_kind NULL).
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_operation_kind_unique
  ON journal_entries (operation_id, entry_kind)
  WHERE operation_id IS NOT NULL AND entry_kind IS NOT NULL;

-- 4. Búsqueda por clase sin escanear (la usa el chequeo de idempotencia).
CREATE INDEX IF NOT EXISTS journal_entries_entry_kind_idx
  ON journal_entries (entry_kind)
  WHERE entry_kind IS NOT NULL;
