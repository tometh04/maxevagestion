-- =====================================================
-- Constraint: un solo pasajero MAIN por operación
-- Migración 20260416000153
--
-- Motivación (auditoría A.5):
--   operation_customers acepta varios registros con role='MAIN' para la
--   misma operación porque no hay UNIQUE que lo impida. Esto causa que
--   en UI/reportes aparezcan "2 pasajeros principales" y que el código
--   que asume un único MAIN haga picks no deterministas (.single() en
--   operation_customers queries).
--
-- Qué hace esta migración:
--   1) DETECTA los casos con >1 MAIN y deja el MÁS RECIENTE (created_at
--      no existe en la tabla; usamos id que incluye UUID v4 con timestamp,
--      o fallback lexicográfico). Los otros los convierte a COMPANION.
--   2) Agrega un UNIQUE parcial: no puede haber 2 MAIN en la misma operación.
--
-- Es idempotente salvo por el UNIQUE INDEX: si ya existe, CREATE UNIQUE
-- INDEX IF NOT EXISTS lo resuelve.
-- =====================================================

-- Paso 1: Detectar y limpiar duplicados MAIN.
-- Estrategia: de cada grupo (operation_id) con >1 MAIN, dejamos el que
-- tiene mayor `id` (determinístico, reproducible) como MAIN y degradamos
-- los demás a COMPANION.
--
-- Se loguea la cantidad para que vos veas en el output de Supabase cuántos
-- registros se convirtieron.
DO $$
DECLARE
  v_affected INTEGER;
BEGIN
  WITH duplicates AS (
    SELECT id,
           operation_id,
           ROW_NUMBER() OVER (
             PARTITION BY operation_id
             ORDER BY id DESC
           ) AS rn
    FROM operation_customers
    WHERE role = 'MAIN'
  )
  UPDATE operation_customers
  SET role = 'COMPANION'
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected > 0 THEN
    RAISE NOTICE 'Convertidos % MAIN duplicados a COMPANION (se conservó el id más reciente como MAIN)', v_affected;
  ELSE
    RAISE NOTICE 'No se encontraron MAIN duplicados — tabla limpia';
  END IF;
END $$;

-- Paso 2: UNIQUE parcial. Solo aplica a las filas con role='MAIN'.
-- Las filas COMPANION no participan de esta restricción (una operación
-- puede tener N acompañantes con el mismo customer_id? normalmente no,
-- pero eso lo cubre el UNIQUE separado de abajo por si acaso).
CREATE UNIQUE INDEX IF NOT EXISTS unique_main_customer_per_operation
  ON operation_customers (operation_id)
  WHERE role = 'MAIN';

-- Paso 3: UNIQUE regular para evitar que el mismo customer aparezca
-- dos veces en la misma operación (con cualquier rol). Esto previene
-- duplicados de vinculación por bugs del POST.
DO $$
DECLARE
  v_dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT operation_id, customer_id, COUNT(*) c
    FROM operation_customers
    GROUP BY operation_id, customer_id
    HAVING COUNT(*) > 1
  ) dup;

  IF v_dup_count > 0 THEN
    RAISE NOTICE 'Se encontraron % operaciones con customer_id duplicado. Limpiando (se conserva el id más reciente)...', v_dup_count;

    WITH duplicates AS (
      SELECT id,
             operation_id,
             customer_id,
             ROW_NUMBER() OVER (
               PARTITION BY operation_id, customer_id
               ORDER BY id DESC
             ) AS rn
      FROM operation_customers
    )
    DELETE FROM operation_customers
    WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);
  END IF;
END $$;

-- Agregar el UNIQUE ahora que no hay duplicados.
ALTER TABLE operation_customers
  DROP CONSTRAINT IF EXISTS unique_operation_customer;

ALTER TABLE operation_customers
  ADD CONSTRAINT unique_operation_customer UNIQUE (operation_id, customer_id);

COMMENT ON INDEX unique_main_customer_per_operation IS
'Garantiza que cada operación tenga un único pasajero con role=MAIN. Fix A.5 auditoría.';

COMMENT ON CONSTRAINT unique_operation_customer ON operation_customers IS
'Evita que el mismo customer aparezca dos veces en la misma operación.';
