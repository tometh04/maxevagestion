-- Cierre de ejercicio anual
--
-- POR QUÉ HACE FALTA
-- ------------------
-- `3.1.04 Resultado del Ejercicio` existe en el plan de las 22 organizaciones y
-- no la mueve nadie, igual que estaban las cuentas de anticipos y de diferencia
-- de cambio hasta hace unos días.
--
-- Sin refundición anual las cuentas de resultado nunca vuelven a cero: el
-- Estado de Resultados de 2027 mostraría acumulado también todo 2026, y el
-- Balance se desviaría un poco más cada año. Es un problema que se manifiesta
-- solo y en silencio, y cuanto más tarde se arregle más historia hay que
-- rehacer.
--
-- EL MES DE CIERRE ES DE CADA AGENCIA
-- -----------------------------------
-- El ejercicio fiscal no siempre coincide con el año calendario: una sociedad
-- puede cerrar en junio, y entonces su ejercicio va de julio a junio. Se guarda
-- por agencia y no como constante, siguiendo la misma regla que el resto de la
-- configuración contable: si mañana una agencia cierra en otro mes, lo cambia
-- desde la pantalla y nadie tiene que tocar código.
--
-- Diciembre por defecto porque es lo más común en Argentina para sociedades
-- chicas y unipersonales.
--
-- POR QUÉ NO ROMPE NADA
-- ---------------------
-- La columna es aditiva y con default, así que las filas existentes quedan en
-- diciembre y se comportan igual que antes. Y el cierre anual no corre solo:
-- lo dispara el contador desde la pantalla, nunca un cron.

ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS fiscal_year_end_month smallint NOT NULL DEFAULT 12;

ALTER TABLE financial_settings
  DROP CONSTRAINT IF EXISTS financial_settings_fiscal_year_end_month_check;
ALTER TABLE financial_settings
  ADD CONSTRAINT financial_settings_fiscal_year_end_month_check
  CHECK (fiscal_year_end_month BETWEEN 1 AND 12);

COMMENT ON COLUMN financial_settings.fiscal_year_end_month IS
  'Mes en el que cierra el ejercicio fiscal de la agencia (1-12). El ejercicio se identifica por el año en que TERMINA: con cierre en junio, el ejercicio 2026 va del 1/7/2025 al 30/6/2026.';

-- ============================================================
-- Los dos asientos del cierre de ejercicio
-- ============================================================
-- REFUNDICION cancela las cuentas de resultado contra 3.1.04.
-- TRASLADO_RESULTADO lleva ese saldo a 3.1.03 Resultados Acumulados.
--
-- Son dos y no uno a propósito: separa "cuánto dio el año" de "dónde queda".
-- Con un solo asiento el resultado del ejercicio nunca llega a verse, porque
-- queda absorbido en el mismo movimiento que lo calcula.
--
-- Van con `close_period` en NULL, igual que APERTURA. El índice único
-- `journal_entries_close_unique` es parcial sobre `close_period IS NOT NULL`, y
-- como cada tipo genera un asiento por moneda —las cuentas de resultado tienen
-- saldo en pesos y en dólares— dos asientos del mismo tipo chocarían contra él.
-- Además es correcto de fondo: el cierre anual no pertenece a un mes.
--
-- La idempotencia la resuelve el proceso, borrando por (org, agencia, tipo,
-- fecha del asiento) antes de recrear. Es el mismo patrón que usa la apertura.

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_close_kind_check;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_close_kind_check
  CHECK (close_kind IS NULL OR close_kind = ANY (ARRAY[
    'ANTICIPO_CLIENTE', 'ANTICIPO_PROVEEDOR',
    'VENTA_SIN_FACTURAR', 'FACTURA_A_RECIBIR',
    'REVALUACION',
    'APERTURA',
    'REFUNDICION', 'TRASLADO_RESULTADO'
  ]));

COMMENT ON COLUMN journal_entries.close_kind IS
  'Tipo de asiento generado por el sistema: los cuatro ajustes de cierre mensual, la revaluación, la APERTURA, y los dos del cierre de ejercicio (REFUNDICION y TRASLADO_RESULTADO). Los tres últimos van con close_period en NULL porque no pertenecen a un mes.';

-- Para encontrar el cierre de un ejercicio sin recorrer todos los asientos de
-- la agencia. La fecha entra en el índice porque es lo que distingue un
-- ejercicio de otro.
CREATE INDEX IF NOT EXISTS journal_entries_cierre_ejercicio_idx
  ON journal_entries (org_id, agency_id, entry_date)
  WHERE close_kind IN ('REFUNDICION', 'TRASLADO_RESULTADO');

-- ============================================================
-- Estado del ejercicio
-- ============================================================
-- Reutiliza `accounting_periods` en vez de una tabla nueva: un ejercicio es un
-- período más, solo que anual. Se distingue por el formato — 'AAAA' contra
-- 'AAAA-MM' — así que el CHECK del período tiene que admitir los dos.
--
-- Compartir tabla no es un atajo: significa que reabrir un ejercicio ya tiene
-- resuelto el registro de quién lo hizo, cuándo y por qué, que fue trabajo de
-- la migración anterior.

ALTER TABLE accounting_periods
  DROP CONSTRAINT IF EXISTS accounting_periods_period_check;
ALTER TABLE accounting_periods
  ADD CONSTRAINT accounting_periods_period_check
  CHECK (period ~ '^\d{4}(-\d{2})?$');

COMMENT ON COLUMN accounting_periods.period IS
  'Período contable: AAAA-MM para un mes, AAAA para un ejercicio completo. El índice único (org, agencia, period) alcanza para los dos porque los formatos no se pisan.';
