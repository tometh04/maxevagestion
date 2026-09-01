-- VIB-141 / VIB-140 — Períodos contables y asientos de cierre
--
-- POR QUÉ EXISTE ESTA TABLA
-- -------------------------
-- Las partidas que faltaban para completar el análisis contable (anticipos de
-- clientes y a proveedores, ventas pendientes de facturar, facturas a recibir,
-- revaluación de saldos en otra moneda) NO son asientos que nazcan de un hecho
-- puntual: son ASIENTOS DE CIERRE. Se calculan mirando el estado del negocio al
-- último día del período.
--
-- Eso obliga a que el sistema tenga una noción de período que hoy no tiene. Sin
-- ella no hay forma de contestar dos preguntas que un contador hace siempre:
--
--   1. ¿Este ajuste es de septiembre o de octubre? (hoy no se puede saber)
--   2. ¿Puedo recalcularlo, o el período ya está cerrado y quedó firme?
--
-- CÓMO SE ADMINISTRA
-- ------------------
-- Sin intervención de desarrollo. `financial_settings` ya tiene
-- `monthly_close_day` y `auto_close_month` (nunca se habían usado): la agencia
-- elige el día y si quiere que el cierre corra solo. El cron diario lee esa
-- configuración y cierra a quien le toque. El que prefiera hacerlo a mano tiene
-- el botón. En ningún escenario hace falta que alguien corra un script.
--
-- QUÉ NO HACE, A PROPÓSITO
-- ------------------------
-- Cerrar un período NO bloquea el registro de cobros, pagos ni gastos con fecha
-- anterior. Rechazar un cobro real porque contabilidad cerró el mes rompería la
-- operación diaria de la agencia, que es justamente lo que no queremos tocar.
-- Lo que sí hace es dejar el ajuste firme y permitir detectar después los
-- movimientos posteriores al cierre, que es información para el contador, no un
-- impedimento para el vendedor.

-- ============================================================
-- 1. La tabla de períodos
-- ============================================================
CREATE TABLE IF NOT EXISTS accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- 'YYYY-MM'. Se guarda como texto y no como date porque un período es un mes
  -- entero, no un día: usar una fecha invita a comparar contra el día
  -- equivocado.
  period text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),

  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),

  -- Momento del último cálculo de ajustes, esté abierto o cerrado.
  last_run_at timestamptz,
  closed_at timestamptz,
  closed_by uuid REFERENCES users(id) ON DELETE SET NULL,

  -- Trazabilidad de reapertura: un período que se cerró y se volvió a abrir no
  -- puede parecer uno que nunca se cerró.
  reopened_at timestamptz,
  reopened_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reopen_reason text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Un solo período por agencia y mes.
CREATE UNIQUE INDEX IF NOT EXISTS accounting_periods_unique
  ON accounting_periods (org_id, agency_id, period);

CREATE INDEX IF NOT EXISTS accounting_periods_status_idx
  ON accounting_periods (org_id, status);

ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON accounting_periods;
CREATE POLICY "tenant_isolation" ON accounting_periods
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ============================================================
-- 2. Marcar los asientos que son de cierre
-- ============================================================
-- Se usan columnas propias en vez de reutilizar `entry_kind` porque el índice
-- único que ya existe es (operation_id, entry_kind): con él, una operación no
-- podría tener su ajuste de anticipo en septiembre Y en octubre, que es
-- exactamente lo que un cierre mensual necesita. Dejando `entry_kind` en NULL,
-- los asientos de cierre quedan fuera de ese índice (es parcial, exige
-- entry_kind IS NOT NULL) y no lo alteramos.
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS close_period text,
  ADD COLUMN IF NOT EXISTS close_kind text;

COMMENT ON COLUMN journal_entries.close_period IS
  'Período de cierre (YYYY-MM) al que pertenece este asiento de ajuste. NULL en los asientos que nacen de un hecho puntual.';
COMMENT ON COLUMN journal_entries.close_kind IS
  'Tipo de ajuste de cierre: ANTICIPO_CLIENTE, ANTICIPO_PROVEEDOR, VENTA_SIN_FACTURAR, FACTURA_A_RECIBIR, REVALUACION.';

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_close_kind_check;
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_close_kind_check
  CHECK (close_kind IS NULL OR close_kind = ANY (ARRAY[
    'ANTICIPO_CLIENTE', 'ANTICIPO_PROVEEDOR',
    'VENTA_SIN_FACTURAR', 'FACTURA_A_RECIBIR',
    'REVALUACION'
  ]));

-- Idempotencia del cierre: correrlo dos veces sobre el mismo período no puede
-- duplicar nada. La operación entra en la clave porque los ajustes por
-- operación son uno por operación; el COALESCE cubre los que no tienen ninguna
-- (la revaluación es por cuenta, no por operación) — sin él, PostgreSQL trata
-- cada NULL como distinto y el índice no protegería justamente a esos.
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_close_unique
  ON journal_entries (
    org_id, agency_id, close_period, close_kind,
    COALESCE(operation_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE close_period IS NOT NULL;

CREATE INDEX IF NOT EXISTS journal_entries_close_period_idx
  ON journal_entries (org_id, close_period)
  WHERE close_period IS NOT NULL;

-- ============================================================
-- 3. Qué ajustes genera cada agencia
-- ============================================================
-- La decisión de cuáles de los cuatro ajustes se generan es del contador de
-- cada agencia, no nuestra. Vive acá para que se administre desde la pantalla
-- de configuración contable y nadie tenga que pedirnos que "prendamos" nada.
--
-- Los anticipos vienen prendidos: sin ellos el balance expone una cuenta por
-- cobrar con saldo acreedor, que está mal. Las cuentas de orden vienen
-- apagadas: son informativas y no todos los contadores las usan.
--
-- Nada de esto se activa solo. Mientras `accounting_start_date` esté en NULL
-- —que es como están hoy las seis agencias— el cierre no corre y estas columnas
-- no hacen absolutamente nada.
ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS close_anticipos_clientes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS close_anticipos_proveedores boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS close_ventas_sin_facturar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS close_facturas_a_recibir boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN financial_settings.close_anticipos_clientes IS
  'Genera la reclasificación del excedente cobrado a clientes como pasivo (anticipos).';
COMMENT ON COLUMN financial_settings.close_anticipos_proveedores IS
  'Genera la reclasificación del excedente pagado a operadores como activo (anticipos).';
COMMENT ON COLUMN financial_settings.close_ventas_sin_facturar IS
  'Genera la cuenta de orden por ventas devengadas sin comprobante emitido.';
COMMENT ON COLUMN financial_settings.close_facturas_a_recibir IS
  'Genera la cuenta de orden por costo comprometido sin factura del operador.';
