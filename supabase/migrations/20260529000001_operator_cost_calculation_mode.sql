-- =====================================================
-- Migración: Modos de cálculo de costo por operador
-- =====================================================
-- Permite configurar cómo se calcula el costo real a pagar
-- al operador en cada ítem de cotización.
--
-- SIMPLE (default): costo_efectivo = costo_neto × (1 + admin_fee%)
-- COMMISSIONABLE:   costo_efectivo = bruto × (1 − commission% + admin_fee%)
--
-- Jerarquía de resolución:
--   operador.cost_calculation_mode ?? financial_settings.default_cost_calculation_mode ?? 'SIMPLE'
-- =====================================================

-- Operadores: modo propio (NULL = heredar default de agencia)
ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS cost_calculation_mode TEXT DEFAULT NULL
    CHECK (cost_calculation_mode IN ('SIMPLE', 'COMMISSIONABLE')),
  ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (commission_percentage >= 0 AND commission_percentage <= 100);

COMMENT ON COLUMN operators.cost_calculation_mode IS
  'Modo de cálculo de costo para cotizaciones. NULL = heredar default de agencia (financial_settings).';
COMMENT ON COLUMN operators.commission_percentage IS
  'Porcentaje de comisión que el operador paga a la agencia sobre el precio bruto. Solo aplica en modo COMMISSIONABLE.';

-- Quotation items: snapshot del modo y datos commissionable al momento de cotizar
-- (admin_fee_percentage ya existe desde migración 20260427000002)
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS cost_calculation_mode TEXT NOT NULL DEFAULT 'SIMPLE'
    CHECK (cost_calculation_mode IN ('SIMPLE', 'COMMISSIONABLE')),
  ADD COLUMN IF NOT EXISTS gross_price NUMERIC(18,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (commission_percentage >= 0 AND commission_percentage <= 100);

COMMENT ON COLUMN quotation_items.cost_calculation_mode IS
  'Snapshot del modo de cálculo al momento de cotizar. Independiente de cambios posteriores al operador.';
COMMENT ON COLUMN quotation_items.gross_price IS
  'Precio bruto/comisionable ingresado por el vendedor. Solo en modo COMMISSIONABLE.';
COMMENT ON COLUMN quotation_items.commission_percentage IS
  'Snapshot del % de comisión del operador al momento de cotizar.';

-- financial_settings: default de agencia
ALTER TABLE financial_settings
  ADD COLUMN IF NOT EXISTS default_cost_calculation_mode TEXT NOT NULL DEFAULT 'SIMPLE'
    CHECK (default_cost_calculation_mode IN ('SIMPLE', 'COMMISSIONABLE')),
  ADD COLUMN IF NOT EXISTS default_commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (default_commission_percentage >= 0 AND default_commission_percentage <= 100);

COMMENT ON COLUMN financial_settings.default_cost_calculation_mode IS
  'Modo de cálculo de costo por defecto para todos los operadores de la agencia.';
COMMENT ON COLUMN financial_settings.default_commission_percentage IS
  'Porcentaje de comisión default para modo COMMISSIONABLE. Cada operador puede sobreescribirlo.';
