-- VIB-178 — La fecha de un movimiento es una fecha, no un instante
--
-- EL SÍNTOMA
-- ----------
-- Yamil filtró Movimientos del 27/08 al 27/08 para conciliar y el Excel le
-- trajo del 27 y del 28. Medido en producción, es peor que eso: devolvía 22
-- movimientos de los cuales 19 eran del 28 y sólo 3 del 27, y se perdía 26 de
-- los 29 que sí eran del 27. El filtro de un día devolvía, sobre todo, el día
-- siguiente.
--
-- LA CAUSA
-- --------
-- `movement_date` es TIMESTAMPTZ pero la mayoría de las filas guarda una FECHA
-- SIN HORA, o sea medianoche UTC: 85,7% en `cash_movements` y 55,1% en
-- `ledger_movements`.
--
-- Los filtros arman la ventana del día en hora argentina (`startOfDayAR` /
-- `endOfDayAR`): para el 27/08 va de `27/08 03:00Z` a `28/08 02:59Z`. Una fila
-- con fecha 28/08 guardada como `2026-08-28T00:00:00Z` cae DENTRO de esa
-- ventana, y una del 27/08 guardada como `2026-08-27T00:00:00Z` queda ANTES del
-- arranque. De ahí el corrimiento de un día entero.
--
-- El helper no está mal: se agregó para arreglar el bug opuesto —un movimiento
-- cargado a las 23 h AR se guardaba en el día siguiente UTC y desaparecía del
-- filtro—. El problema real es que la columna mezcla DOS SEMÁNTICAS: fechas de
-- negocio sin hora e instantes reales. Ninguna ventana sirve para las dos.
--
-- POR QUÉ IMPORTA MÁS QUE UN EXCEL
-- --------------------------------
-- El mismo filtro alimenta Libro Mayor, Libro IVA, IIBB, Ganancias, posición
-- mensual, gastos y resultado financiero. Agosto 2026 sobre `ledger_movements`
-- traía 5.613 movimientos: 5.500 de agosto, 117 del 1 de septiembre colados y
-- 4 del 1 de agosto faltando. Todo cierre mensual arrastraba el primer día del
-- mes siguiente. Para un contador eso es un mes que no cierra.
--
-- LA DECISIÓN
-- -----------
-- `movement_date` es una FECHA DE NEGOCIO: nadie concilia por hora. En vez de
-- seguir infiriéndola con ventanas, se guarda explícita en `movement_day`, y
-- los filtros comparan fecha contra fecha. Sin zona horaria, sin ventanas, sin
-- ambigüedad. Es el mismo criterio de `accrual_date` en comisiones y de
-- `lib/utils/date-only.ts`.
--
-- `movement_date` NO se toca: sigue siendo el instante y lo usan el orden de
-- los listados y el saldo acumulado.

BEGIN;

-- ============================================================
-- 1. La columna
-- ============================================================
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS movement_day DATE;
ALTER TABLE ledger_movements ADD COLUMN IF NOT EXISTS movement_day DATE;

COMMENT ON COLUMN cash_movements.movement_day IS
  'Fecha de negocio del movimiento (VIB-178). Es la que se filtra y con la que se concilia. `movement_date` sigue siendo el instante, y se usa para ordenar y para el saldo acumulado.';

COMMENT ON COLUMN ledger_movements.movement_day IS
  'Fecha de negocio del movimiento (VIB-178). Es la que se filtra y con la que se concilia. `movement_date` sigue siendo el instante, y se usa para ordenar y para el saldo acumulado.';

-- ============================================================
-- 2. Cómo se deriva
-- ============================================================
-- Una fila a medianoche UTC exacta es una fecha que alguien eligió en un
-- calendario: su día es el que dice, tal cual. Convertirla a hora argentina la
-- correría al día anterior, que es justamente el bug.
--
-- Una fila con hora real es un instante: su día es el que era en Argentina
-- cuando ocurrió.
--
-- El caso ambiguo —un movimiento registrado exactamente a las 21:00:00.000 AR—
-- se lee como fecha de negocio del día siguiente. Es una ventana de un
-- milisegundo por día y la alternativa (adivinar por el origen de la fila) sería
-- peor: acá el criterio se puede leer y verificar.
CREATE OR REPLACE FUNCTION movement_business_day(p_movement_date TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql
-- STABLE y no IMMUTABLE: convertir un timestamptz a una zona depende de la base
-- de datos de zonas horarias. Declararla inmutable dejaría que Postgres la
-- pliegue como constante y devuelva un día viejo. No se usa en índices.
STABLE
AS $$
  SELECT CASE
    WHEN p_movement_date IS NULL THEN NULL
    WHEN (p_movement_date AT TIME ZONE 'UTC')::time = '00:00:00'
      THEN (p_movement_date AT TIME ZONE 'UTC')::date
    ELSE (p_movement_date AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
  END
$$;

COMMENT ON FUNCTION movement_business_day IS
  'Fecha de negocio de un movimiento (VIB-178). Medianoche UTC exacta = fecha elegida en un calendario, se toma tal cual. Con hora real = instante, se convierte a hora argentina.';

-- ============================================================
-- 3. Backfill
-- ============================================================
UPDATE cash_movements
   SET movement_day = movement_business_day(movement_date)
 WHERE movement_day IS NULL AND movement_date IS NOT NULL;

UPDATE ledger_movements
   SET movement_day = movement_business_day(movement_date)
 WHERE movement_day IS NULL AND movement_date IS NOT NULL;

-- ============================================================
-- 4. La red: que nunca quede vacía
-- ============================================================
-- Se llena en la base y no en cada ruta a propósito. Los movimientos se
-- escriben desde muchos lugares —cobros, pagos, gastos, transferencias,
-- ajustes, imports, crons— y basta que UNO se olvide para que esa fila
-- desaparezca de todos los filtros por fecha, en silencio. Es exactamente la
-- clase de agujero que ya nos pasó con `org_id` en `documents`.
CREATE OR REPLACE FUNCTION set_movement_day()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si el caller la trae explícita y coherente, se respeta: permite corregir a
  -- mano una fecha mal imputada sin pelearse con el trigger.
  IF NEW.movement_day IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.movement_date IS DISTINCT FROM OLD.movement_date
         AND NEW.movement_day IS NOT DISTINCT FROM OLD.movement_day) THEN
    NEW.movement_day := movement_business_day(NEW.movement_date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_movements_movement_day ON cash_movements;
CREATE TRIGGER trg_cash_movements_movement_day
  BEFORE INSERT OR UPDATE ON cash_movements
  FOR EACH ROW EXECUTE FUNCTION set_movement_day();

DROP TRIGGER IF EXISTS trg_ledger_movements_movement_day ON ledger_movements;
CREATE TRIGGER trg_ledger_movements_movement_day
  BEFORE INSERT OR UPDATE ON ledger_movements
  FOR EACH ROW EXECUTE FUNCTION set_movement_day();

-- ============================================================
-- 5. Índices
-- ============================================================
-- Los filtros por fecha casi siempre vienen acompañados del tenant, y muchos
-- listados ordenan por el instante dentro del día.
CREATE INDEX IF NOT EXISTS idx_cash_movements_org_day
  ON cash_movements (org_id, movement_day);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_org_day
  ON ledger_movements (org_id, movement_day);

COMMIT;
