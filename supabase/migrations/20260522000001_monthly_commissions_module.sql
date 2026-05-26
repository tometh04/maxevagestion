-- ============================================================================
-- MIGRATION — Módulo de Comisiones Mensuales (NUEVO, paralelo al actual)
-- Fecha: 2026-05-22
-- Contexto:
--   Pedido por VICO TRAVEL GROUP. Esquema de comisiones para vendedoras
--   fijas: comisión base sobre el excedente del margen (con tramos) ×
--   factor de desempeño (50% ventas + 50% gestión). Configurable por
--   vendedora. Liquidación mensual con aprobación manual.
--
--   Se implementa en PARALELO al módulo viejo (commission_records,
--   commission_rules) para no romper nada existente. Coexisten.
--
--   Activo solo para tenants con feature flag
--   `features.monthly_commissions_module` en organization_settings.
--   Default: OFF (cero impacto sobre tenants actuales).
--
-- Tablas creadas:
--   1. monthly_commission_rules — config por vendedora (tramos, rangos, piso)
--   2. monthly_commission_settlements — liquidaciones por (seller, mes)
--   3. monthly_commission_adjustments — ajustes retroactivos por cancelaciones
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. monthly_commission_rules: una por vendedora (UNIQUE seller_id)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_commission_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- ─── Comisión base sobre margen ────────────────────────────────────────
  non_commissionable_amount_usd NUMERIC(12, 2) NOT NULL DEFAULT 1450,

  -- Tramos: array de { threshold_usd, percentage }
  -- Default VICO: 4 tramos (15%, 20%, 25%, 30%)
  -- Significado: si margen >= threshold, aplica percentage sobre el excedente entero
  -- Debe estar ordenado asc por threshold. El primer threshold suele coincidir con non_commissionable.
  brackets JSONB NOT NULL DEFAULT '[
    {"threshold_usd": 1450, "percentage": 15},
    {"threshold_usd": 3000, "percentage": 20},
    {"threshold_usd": 5000, "percentage": 25},
    {"threshold_usd": 7000, "percentage": 30}
  ]'::jsonb,

  -- ─── Componente Ventas (50% del factor por default) ────────────────────
  -- Interpolación lineal entre (sales_floor_usd, sales_floor_pct) y
  -- (sales_target_usd, sales_target_pct). Si margen < sales_floor_usd,
  -- escala lineal 0% → sales_floor_pct. Si margen >= sales_target_usd → sales_target_pct.
  sales_floor_usd NUMERIC(12, 2) NOT NULL DEFAULT 19000,
  sales_floor_pct NUMERIC(5, 2) NOT NULL DEFAULT 80,
  sales_target_usd NUMERIC(12, 2) NOT NULL DEFAULT 22000,
  sales_target_pct NUMERIC(5, 2) NOT NULL DEFAULT 100,

  -- ─── Componente Gestión - Indicador 1 (Conversión cotizaciones) ────────
  -- Fórmula: ventas_cerradas / cotizaciones_enviadas_mes
  -- Escala: 0% (rate=0) → mgmt_quotations_floor_pct (rate=mgmt_quotations_floor_rate)
  --         → mgmt_quotations_target_pct (rate=mgmt_quotations_target_rate)
  mgmt_quotations_floor_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.03,  -- 3%
  mgmt_quotations_floor_pct NUMERIC(5, 2) NOT NULL DEFAULT 80,
  mgmt_quotations_target_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.04,  -- 4%
  mgmt_quotations_target_pct NUMERIC(5, 2) NOT NULL DEFAULT 100,

  -- ─── Componente Gestión - Indicador 2 (Conversión leads recibidos) ─────
  mgmt_leads_floor_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.03,
  mgmt_leads_floor_pct NUMERIC(5, 2) NOT NULL DEFAULT 80,
  mgmt_leads_target_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.04,
  mgmt_leads_target_pct NUMERIC(5, 2) NOT NULL DEFAULT 100,

  -- ─── Piso global del componente Gestión ────────────────────────────────
  -- Si el promedio de indicadores < mgmt_floor_pct, se eleva a mgmt_floor_pct.
  -- Colchón para no castigar demasiado a la vendedora por mala conversión.
  mgmt_floor_pct NUMERIC(5, 2) NOT NULL DEFAULT 80,

  -- ─── Pesos del factor de desempeño (default 50/50, debe sumar 100) ─────
  factor_sales_weight_pct NUMERIC(5, 2) NOT NULL DEFAULT 50,
  factor_mgmt_weight_pct NUMERIC(5, 2) NOT NULL DEFAULT 50,
  CONSTRAINT factor_weights_sum_100 CHECK (factor_sales_weight_pct + factor_mgmt_weight_pct = 100),

  -- ─── Configuración del periodo ─────────────────────────────────────────
  -- Qué columna de operations usar para determinar a qué mes pertenece la venta.
  -- DEFAULT 'operation_date' (fecha de venta, el más común).
  date_field_for_period TEXT NOT NULL DEFAULT 'operation_date'
    CHECK (date_field_for_period IN ('operation_date', 'created_at', 'departure_date')),

  -- ─── Estado de la regla ────────────────────────────────────────────────
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE,  -- regla aplica desde este mes (null = siempre)
  effective_to DATE,    -- regla deja de aplicar después de este mes (null = vigente)

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE (seller_id)  -- una regla activa por vendedora
);

CREATE INDEX IF NOT EXISTS idx_monthly_commission_rules_org ON monthly_commission_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_monthly_commission_rules_seller ON monthly_commission_rules(seller_id);

ALTER TABLE monthly_commission_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON monthly_commission_rules;
CREATE POLICY tenant_isolation ON monthly_commission_rules
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON TABLE monthly_commission_rules IS
  'Reglas de comisión mensual per-vendedora. Pedido por VICO TRAVEL 2026-05.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. monthly_commission_settlements: liquidaciones por (seller, mes)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_commission_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,  -- formato "YYYY-MM" (ej. "2026-05")

  -- ─── Snapshot del cálculo (en USD) ─────────────────────────────────────
  total_margin_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  non_commissionable_amount_usd NUMERIC(12, 2) NOT NULL,
  excess_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bracket_applied_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  base_commission_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Factor de desempeño
  sales_component_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  mgmt_quotations_indicator_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  mgmt_leads_indicator_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  mgmt_manual_indicator_pct NUMERIC(5, 2),  -- NULL si admin no cargó el 3ro (opcional)
  mgmt_component_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,  -- promedio (+ piso aplicado)
  performance_factor_pct NUMERIC(7, 4) NOT NULL DEFAULT 0,  -- factor final 0—100%

  -- Ajustes retroactivos (descuentos por cancelaciones de meses anteriores)
  retroactive_adjustment_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Comisión final = base × factor + ajustes retro
  final_commission_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- ─── Snapshot de la regla aplicada (frozen at calculation time) ────────
  rule_snapshot JSONB NOT NULL,

  -- ─── Inputs raw del cálculo (para auditoría / re-cálculo) ──────────────
  -- Total de cotizaciones enviadas en el mes (denominador del indicador 1)
  quotations_sent_count INTEGER NOT NULL DEFAULT 0,
  -- Total de leads asignados a la vendedora en el mes (denominador indicador 2)
  leads_received_count INTEGER NOT NULL DEFAULT 0,
  -- Ventas cerradas que contaron (numerador de ambos indicadores)
  sales_closed_count INTEGER NOT NULL DEFAULT 0,
  -- IDs de operations que contaron (auditoría)
  operations_included JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- ─── Estado del settlement ─────────────────────────────────────────────
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'CANCELLED')),
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (seller_id, year_month),
  CONSTRAINT year_month_format CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$')
);

CREATE INDEX IF NOT EXISTS idx_monthly_settlements_org ON monthly_commission_settlements(org_id);
CREATE INDEX IF NOT EXISTS idx_monthly_settlements_seller ON monthly_commission_settlements(seller_id);
CREATE INDEX IF NOT EXISTS idx_monthly_settlements_year_month ON monthly_commission_settlements(year_month);
CREATE INDEX IF NOT EXISTS idx_monthly_settlements_status ON monthly_commission_settlements(status);

ALTER TABLE monthly_commission_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON monthly_commission_settlements;
CREATE POLICY tenant_isolation ON monthly_commission_settlements
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON TABLE monthly_commission_settlements IS
  'Liquidaciones mensuales de comisiones. Una por (seller, year_month). Pedido VICO 2026-05.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. monthly_commission_adjustments: ajustes retroactivos
--    Cuando una operation de un mes ya liquidado se cancela, en lugar de
--    re-abrir el settlement aprobado, creamos un adjustment que se descuenta
--    del próximo settlement.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_commission_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- De dónde viene el ajuste
  source_operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  source_settlement_id UUID REFERENCES monthly_commission_settlements(id) ON DELETE SET NULL,

  -- Dónde se aplicó (cuando ya fue procesado)
  applied_in_settlement_id UUID REFERENCES monthly_commission_settlements(id) ON DELETE SET NULL,

  amount_usd NUMERIC(14, 2) NOT NULL,  -- NEGATIVO para descuentos (cancelaciones)
  reason TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPLIED', 'CANCELLED')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_adjustments_org ON monthly_commission_adjustments(org_id);
CREATE INDEX IF NOT EXISTS idx_monthly_adjustments_seller_status ON monthly_commission_adjustments(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_monthly_adjustments_source_op ON monthly_commission_adjustments(source_operation_id);

ALTER TABLE monthly_commission_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON monthly_commission_adjustments;
CREATE POLICY tenant_isolation ON monthly_commission_adjustments
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON TABLE monthly_commission_adjustments IS
  'Ajustes retroactivos de comisiones (cancelaciones de meses liquidados). Se descuentan del próximo settlement.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Trigger BEFORE UPDATE en operations: detecta cancelación retroactiva
--    Si una operation pasa a CANCELLED Y existe un settlement APPROVED del
--    seller que la contó, crea un adjustment pendiente.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_monthly_commission_cancellation_adjustment()
RETURNS TRIGGER AS $$
DECLARE
  v_year_month TEXT;
  v_settlement_id UUID;
  v_seller_id UUID;
  v_margin_usd NUMERIC;
  v_rate NUMERIC;
BEGIN
  -- Solo nos interesa cuando el status pasa A 'CANCELLED' (no ya estaba)
  IF NEW.status != 'CANCELLED' OR OLD.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;

  -- Skip si no tiene seller asignado
  IF NEW.seller_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_seller_id := NEW.seller_id;

  -- Verificar que existe regla activa para este seller (sino, no aplica este módulo)
  IF NOT EXISTS (
    SELECT 1 FROM monthly_commission_rules
    WHERE seller_id = v_seller_id AND enabled = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  -- Determinar el año-mes según el date_field_for_period de la regla
  SELECT TO_CHAR(
    CASE (SELECT date_field_for_period FROM monthly_commission_rules WHERE seller_id = v_seller_id)
      WHEN 'created_at' THEN NEW.created_at::date
      WHEN 'departure_date' THEN NEW.departure_date
      ELSE NEW.operation_date
    END,
    'YYYY-MM'
  ) INTO v_year_month;

  IF v_year_month IS NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar settlement APPROVED de ese mes para este seller
  SELECT id INTO v_settlement_id
  FROM monthly_commission_settlements
  WHERE seller_id = v_seller_id
    AND year_month = v_year_month
    AND status IN ('APPROVED', 'PAID');

  IF v_settlement_id IS NULL THEN
    RETURN NEW;  -- mes no liquidado todavía, el cálculo lo va a excluir naturalmente
  END IF;

  -- Calcular el margen USD de la operation cancelada
  v_rate := COALESCE(
    (SELECT rate FROM exchange_rates
     WHERE rate_date <= NEW.operation_date::date
     ORDER BY rate_date DESC LIMIT 1),
    1
  );

  IF NEW.currency = 'USD' THEN
    v_margin_usd := COALESCE(NEW.sale_amount_total, 0) - COALESCE(NEW.operator_cost, 0);
  ELSE
    v_margin_usd := (COALESCE(NEW.sale_amount_total, 0) - COALESCE(NEW.operator_cost, 0)) / NULLIF(v_rate, 0);
  END IF;

  -- Insert ajuste pendiente (signo negativo = descuento al seller)
  -- Nota: este es el margen, no la comisión exacta. El próximo cálculo
  -- de settlement va a aplicar el factor real al momento de descontar.
  -- Para simplicidad, descontamos el margen y dejamos que el recálculo
  -- del settlement aplique los porcentajes. (Esto está aproximado — para
  -- un descuento exacto habría que recalcular el settlement original,
  -- restar la operation y calcular el delta.)
  INSERT INTO monthly_commission_adjustments (
    seller_id, org_id, source_operation_id, source_settlement_id,
    amount_usd, reason, status
  ) VALUES (
    v_seller_id,
    NEW.org_id,
    NEW.id,
    v_settlement_id,
    -COALESCE(v_margin_usd, 0),
    'Cancelación retroactiva de operation ' || NEW.id || ' (mes ' || v_year_month || ' ya liquidado)',
    'PENDING'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monthly_commission_cancellation ON operations;
CREATE TRIGGER trg_monthly_commission_cancellation
  AFTER UPDATE ON operations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_monthly_commission_cancellation_adjustment();

COMMENT ON FUNCTION trigger_monthly_commission_cancellation_adjustment() IS
  'Detecta cancelaciones de operations en meses ya liquidados y crea ajustes retroactivos pendientes para el próximo settlement.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Trigger updated_at
-- ────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_monthly_commission_rules ON monthly_commission_rules;
CREATE TRIGGER set_updated_at_monthly_commission_rules
  BEFORE UPDATE ON monthly_commission_rules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_monthly_commission_settlements ON monthly_commission_settlements;
CREATE TRIGGER set_updated_at_monthly_commission_settlements
  BEFORE UPDATE ON monthly_commission_settlements
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_monthly_commission_adjustments ON monthly_commission_adjustments;
CREATE TRIGGER set_updated_at_monthly_commission_adjustments
  BEFORE UPDATE ON monthly_commission_adjustments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
