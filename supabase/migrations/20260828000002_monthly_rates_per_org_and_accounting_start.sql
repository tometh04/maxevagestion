-- VIB-141/VIB-143 — Cotización mensual por agencia y fecha de inicio contable
--
-- 1. EL TIPO DE CAMBIO MENSUAL ERA GLOBAL
-- --------------------------------------
-- `monthly_exchange_rates` no tiene organización, su UNIQUE es (year, month) y
-- la tabla NO tiene RLS activada. O sea: una sola cotización por mes para TODO
-- vibook. Si Lozada cargaba 1.520 para agosto, todas las agencias del sistema
-- quedaban valuadas a 1.520.
--
-- No llegó a explotar porque la tabla está vacía: el endpoint existe desde hace
-- rato pero nadie lo usó. Se arregla antes de empezar a usarla, que es ahora.
--
-- Viola la regla 1 del proyecto (multi-tenant first) y la 2 (no confiar solo en
-- RLS): acá no había ni org_id ni RLS.
--
-- 2. FECHA DE INICIO CONTABLE
-- ---------------------------
-- Las agencias arrancan a llevar la contabilidad en el sistema en un momento
-- dado — Lozada el 1/9/2026 — y lo anterior queda como está. Sin esta fecha,
-- los estados formales tomarían movimientos viejos, con datos que nunca se
-- ordenaron y sin cotizaciones históricas para convertir.
--
-- Los asientos anteriores NO se borran ni se ocultan: se siguen viendo en el
-- Mayor. La fecha solo marca desde cuándo el Balance y el Estado de Resultados
-- toman datos.
--
-- Va en `financial_settings`, que ya es por agencia y ya tiene
-- `primary_currency` (la moneda de presentación) y `monthly_close_day`.

-- ---------------------------------------------------------------- 1
ALTER TABLE monthly_exchange_rates
  ADD COLUMN IF NOT EXISTS org_id uuid;

ALTER TABLE monthly_exchange_rates
  DROP CONSTRAINT IF EXISTS monthly_exchange_rates_org_id_fkey;

ALTER TABLE monthly_exchange_rates
  ADD CONSTRAINT monthly_exchange_rates_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- El UNIQUE viejo es el que hacía la cotización global. Se reemplaza por uno
-- por organización.
ALTER TABLE monthly_exchange_rates
  DROP CONSTRAINT IF EXISTS monthly_exchange_rates_year_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS monthly_exchange_rates_org_year_month_key
  ON monthly_exchange_rates (org_id, year, month);

COMMENT ON COLUMN monthly_exchange_rates.org_id IS
  'Organización dueña de la cotización. Antes la tabla no la tenía y el UNIQUE era (year, month): una sola cotización por mes para todo el sistema.';

-- Mismo trigger que el resto de las tablas con tenant: resuelve el org desde la
-- sesión si el caller no lo pasa.
DROP TRIGGER IF EXISTS trg_auto_org_id_monthly_exchange_rates ON monthly_exchange_rates;
CREATE TRIGGER trg_auto_org_id_monthly_exchange_rates
  BEFORE INSERT ON monthly_exchange_rates
  FOR EACH ROW EXECUTE FUNCTION auto_set_org_id_from_auth();

-- RLS: estaba apagada. Mismo patrón que journal_entries y ledger_movements.
ALTER TABLE monthly_exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON monthly_exchange_rates;
CREATE POLICY tenant_isolation ON monthly_exchange_rates
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ---------------------------------------------------------------- 2
ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS accounting_start_date date;

COMMENT ON COLUMN financial_settings.accounting_start_date IS
  'Desde cuándo esta agencia lleva su contabilidad en vibook. El Balance y el Estado de Resultados toman datos a partir de acá; los asientos anteriores se siguen viendo en el Mayor. NULL = todavía no arrancó.';
