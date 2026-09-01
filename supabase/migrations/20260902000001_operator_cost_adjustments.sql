-- VIB-174 — Ajuste de liquidación de operador
--
-- QUÉ PROBLEMA RESUELVE
-- ---------------------
-- La agencia vende estimando el costo del operador: un hotel a USD 1.550. Sobre
-- ese número calcula el margen y le PAGA la comisión al vendedor. Meses después
-- llega la liquidación definitiva del operador y el costo real es otro: 1.600
-- (perdió 50) o 1.500 (ganó 50 que nadie había contado).
--
-- Hoy esa diferencia no se puede registrar en ningún lado:
--
--   * La deuda (`operator_payments.amount`) no se edita desde ninguna pantalla.
--     El endpoint existe pero no lo llama nadie, y edita el monto a pelo: sin
--     auditoría, sin asiento y sin tocar comisiones.
--   * Editar el costo en la operación no sirve: `applyCommissionPlan` saltea en
--     silencio toda comisión ya pagada (`isLocked`). La comisión queda
--     desalineada del margen y el único rastro es que los números no cierran.
--   * No existe ningún concepto de ajuste de resultado en contabilidad.
--
-- EL CRITERIO: LA HISTORIA NO SE TOCA
-- -----------------------------------
-- La operación conserva su costo y su margen ESTIMADOS. El mes viejo ya se
-- cerró y las comisiones ya se pagaron sobre esos números; reescribirlos sería
-- mover un resultado que alguien ya reportó. La diferencia se imputa al mes en
-- que llega la liquidación (`accrual_date`), como ganancia o pérdida nueva.
--
-- Esto además esquiva de raíz el muro de `isLocked`: no editamos la comisión
-- pagada, agregamos otra. Una fila nueva no choca contra ningún candado.
--
-- SIGNOS (leer antes de tocar nada)
-- ---------------------------------
--   delta_amount = actual − estimado
--     delta > 0  → el operador cobra MÁS → PÉRDIDA para la agencia
--     delta < 0  → el operador cobra MENOS → GANANCIA
--
--   El margen es venta − costo, así que si el costo sube `delta`, la comisión
--   del vendedor baja `pct × delta`. Por eso el ajuste de comisión que se
--   guarda en `seller_shares[].amount` y en `referrer_share_amount` es
--   −pct × delta: NEGATIVO cuando hubo pérdida (el vendedor devuelve) y
--   POSITIVO cuando hubo ganancia (cobra de más).
--
--   `agency_share_amount` es lo que le queda a la agencia, con el mismo signo
--   de resultado (positivo = ganancia):
--       agency_share = (−delta) − Σ seller_shares − referrer_share
--
--   Ejemplo de Yamil, pérdida de 50 con vendedor al 20%:
--       delta = +50 ; seller = −10 ; agency = −50 − (−10) = −40
--
-- POR QUÉ `delta_amount` GUARDA EL DELTA DE COSTO Y NO EL RESULTADO
-- ----------------------------------------------------------------
-- Porque es el número que necesita el cron `audit-operator-debt-drift`, que
-- compara SUM(operation_operators.cost) contra SUM(operator_payments.amount).
-- El ajuste crea esa diferencia A PROPÓSITO: sin restarle los ajustes, el cron
-- alertaría sobre cada ajuste legítimo.

BEGIN;

-- ============================================================
-- 1. La tabla de ajustes
-- ============================================================
CREATE TABLE IF NOT EXISTS operator_cost_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Se copia de la operación al crear. El reporte por oficina la necesita y
  -- `ledger_movements` no tiene agency_id, así que derivarla después sería
  -- volver a hacer el mismo join en cada lectura.
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,

  -- Nullable: una deuda manual a operador puede no tener operación.
  operation_id UUID REFERENCES operations(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES operators(id) ON DELETE RESTRICT,

  -- SET NULL y no CASCADE: si la deuda se borra, el ajuste ya impactó el
  -- resultado del mes y no puede desaparecer del reporte. Por eso también se
  -- copia el nombre del operador.
  operator_payment_id UUID REFERENCES operator_payments(id) ON DELETE SET NULL,
  operator_name TEXT,

  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  estimated_amount NUMERIC(18,2) NOT NULL CHECK (estimated_amount >= 0),
  actual_amount NUMERIC(18,2) NOT NULL CHECK (actual_amount >= 0),
  delta_amount NUMERIC(18,2) NOT NULL CHECK (delta_amount <> 0),

  -- Reparto del RESULTADO (positivo = ganancia). Ver el bloque de signos.
  agency_share_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  referrer_share_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  seller_shares JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Cotización con la que se valuó el asiento cuando la deuda es en USD.
  exchange_rate NUMERIC(18,4),

  -- Mes al que se imputa. Misma convención que commission_records.accrual_date.
  accrual_date DATE NOT NULL,

  -- Obligatorio, como el motivo de "esto no es un gasto de agencia": un ajuste
  -- sin explicación es imposible de auditar tres meses después.
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),

  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'OPERATOR_PAYMENT')),
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,

  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reversal_reason TEXT,
  reversal_journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operator_cost_adjustments_org_accrual
  ON operator_cost_adjustments (org_id, accrual_date);
CREATE INDEX IF NOT EXISTS idx_operator_cost_adjustments_operation
  ON operator_cost_adjustments (operation_id);
CREATE INDEX IF NOT EXISTS idx_operator_cost_adjustments_payment
  ON operator_cost_adjustments (operator_payment_id);
-- El cron de drift agrupa por (org, operador) para restar los ajustes vivos.
CREATE INDEX IF NOT EXISTS idx_operator_cost_adjustments_operator_live
  ON operator_cost_adjustments (org_id, operator_id)
  WHERE reversed_at IS NULL;

ALTER TABLE operator_cost_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON operator_cost_adjustments;
CREATE POLICY "tenant_isolation" ON operator_cost_adjustments
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON TABLE operator_cost_adjustments IS
  'Diferencia entre el costo estimado de un operador y su liquidación definitiva (VIB-174). Se imputa al mes en que llega la liquidación, no al de la venta: el mes viejo ya se cerró con comisiones pagadas. delta_amount = actual − estimado (>0 = pérdida); los share son resultado (>0 = ganancia).';

COMMENT ON COLUMN operator_cost_adjustments.delta_amount IS
  'actual − estimado. Positivo = el operador cobró más de lo estimado = pérdida. Es el número que el cron audit-operator-debt-drift tiene que restar para no alertar sobre ajustes legítimos.';

COMMENT ON COLUMN operator_cost_adjustments.seller_shares IS
  'Array [{seller_id, percentage, amount}] con el ajuste de comisión de cada vendedor, con signo de resultado: negativo si el vendedor tiene que devolver. El percentage es el snapshot de la comisión ORIGINAL de esa operación, no el vigente hoy.';

-- ============================================================
-- 2. commission_records: la fila de ajuste
-- ============================================================
-- Se reusa la tabla de comisiones en vez de crear una paralela porque así el
-- ajuste entra SOLO al balance del vendedor, al reporte de comisiones, a la
-- línea "Comisiones" del societario y a la liquidación que ya existe. Una tabla
-- aparte obligaría a duplicar todo ese camino.
--
-- `amount` no tiene CHECK de no-negatividad (la migración 20260416000155 se lo
-- puso a payments, cash_movements, ledger_movements y operator_payments, pero
-- no a esta tabla), así que una fila negativa es válida tal cual.

ALTER TABLE commission_records
  DROP CONSTRAINT IF EXISTS commission_records_kind_check;

ALTER TABLE commission_records
  ADD CONSTRAINT commission_records_kind_check
  CHECK (kind IN ('SELLER', 'ADVISOR_MANAGER', 'SERVICE', 'ADJUSTMENT'));

COMMENT ON CONSTRAINT commission_records_kind_check ON public.commission_records IS
  'SELLER y ADVISOR_MANAGER las produce el plan de la operación. SERVICE es la comisión de un servicio, con su propio vendedor y su propio mes. ADJUSTMENT es la corrección por liquidación de operador (VIB-174): no la produce el plan, se imputa al mes del ajuste y puede ser negativa.';

ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS adjustment_id UUID
  REFERENCES operator_cost_adjustments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_commission_records_adjustment
  ON commission_records (adjustment_id)
  WHERE adjustment_id IS NOT NULL;

-- El unique parcial de 20260818000002 es `(operation_id, seller_id) WHERE kind
-- <> 'SERVICE'`. Con ADJUSTMENT adentro, el segundo ajuste de la misma
-- operación y el mismo vendedor chocaría — y son legítimos: una operación puede
-- tener varias patas y varias liquidaciones que llegan en meses distintos.
DROP INDEX IF EXISTS unique_commission_operation_seller_non_service;

CREATE UNIQUE INDEX IF NOT EXISTS unique_commission_operation_seller_non_service
  ON commission_records (operation_id, seller_id)
  WHERE kind NOT IN ('SERVICE', 'ADJUSTMENT');

COMMENT ON INDEX unique_commission_operation_seller_non_service IS
  '"Una persona, una fila por operación" para las comisiones que produce el plan. SERVICE queda afuera porque tiene su propio unique por servicio; ADJUSTMENT queda afuera porque una operación puede acumular varios ajustes de liquidación (VIB-174).';

-- ============================================================
-- 3. journal_entries: origen AUTO_ADJUSTMENT
-- ============================================================
ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_check;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_source_check
  CHECK (source IN ('MANUAL', 'AUTO_PAYMENT', 'AUTO_CONFIRMATION', 'AUTO_COMMISSION', 'AUTO_FX', 'AUTO_ADJUSTMENT'));

-- ============================================================
-- 4. Las dos cuentas de resultado
-- ============================================================
-- Simétricas a 4.1.05 / 4.3.13 (diferencia de cambio positiva y negativa), que
-- es el precedente del repo para un resultado que puede caer para cualquier
-- lado. Se podría haber usado 4.2.01 Costo de Operadores —el ajuste ES una
-- corrección de costo— pero entonces la ganancia quedaría como un costo
-- negativo dentro de la línea de costos, invisible. Con cuentas propias, el
-- Estado de Resultados muestra cuánto se corrigió sin que haya que buscarlo.
--
-- El plan de cuentas es por organización desde VIB-145, así que se siembra una
-- fila por org, resolviendo el padre dentro de la misma org.

INSERT INTO chart_of_accounts (
  org_id, account_code, account_name, category, subcategory, account_type,
  level, parent_id, is_movement_account, is_active, display_order, description
)
SELECT
  p.org_id, '4.1.06', 'Ajuste de Liquidación de Operadores (ganancia)',
  'RESULTADO', 'INGRESOS', 'AJUSTE_LIQ_POS', 2, p.id, true, true, 6,
  'Ganancia por diferencia entre el costo estimado del operador y su liquidación definitiva'
FROM chart_of_accounts p
WHERE p.account_code = '4.1'
ON CONFLICT (org_id, account_code) DO NOTHING;

INSERT INTO chart_of_accounts (
  org_id, account_code, account_name, category, subcategory, account_type,
  level, parent_id, is_movement_account, is_active, display_order, description
)
SELECT
  p.org_id, '4.3.16', 'Ajuste de Liquidación de Operadores (pérdida)',
  'RESULTADO', 'GASTOS', 'AJUSTE_LIQ_NEG', 2, p.id, true, true, 16,
  'Pérdida por diferencia entre el costo estimado del operador y su liquidación definitiva'
FROM chart_of_accounts p
WHERE p.account_code = '4.3'
ON CONFLICT (org_id, account_code) DO NOTHING;

-- ============================================================
-- 5. La perilla por agencia
-- ============================================================
-- El ajuste contable se registra SIEMPRE: es un hecho, no una opción. Lo que se
-- configura es si el resultado se reparte con el vendedor. Va prendida porque
-- es el criterio más común —el vendedor cobró sobre una ganancia que no fue—,
-- pero una agencia que se come sola las diferencias la apaga.
ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS operator_adjustment_split_with_seller BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN financial_settings.operator_adjustment_split_with_seller IS
  'Si el ajuste de liquidación de operador se reparte con el vendedor y el referidor según el porcentaje de su comisión original (VIB-174). Apagada, el resultado del ajuste queda 100% en la agencia.';

COMMIT;
