-- =====================================================
-- Migración 073: Sistema de Comisiones
-- Cálculo y registro de comisiones por vendedor
-- =====================================================

-- Tabla de esquemas de comisiones
CREATE TABLE IF NOT EXISTS commission_schemes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL,
  description TEXT,
  
  -- Tipo de comisión
  commission_type TEXT NOT NULL CHECK (commission_type IN (
    'percentage',     -- Porcentaje del monto
    'fixed',          -- Monto fijo
    'tiered',         -- Escalonado
    'hybrid'          -- Combinación
  )),
  
  -- Valores base
  base_percentage NUMERIC(5,2) DEFAULT 0, -- Porcentaje base
  base_amount NUMERIC(18,2) DEFAULT 0, -- Monto fijo base
  
  -- Aplicación
  applies_to TEXT NOT NULL DEFAULT 'revenue' CHECK (applies_to IN (
    'revenue',        -- Sobre ingresos totales
    'margin',         -- Sobre margen
    'net_margin'      -- Sobre margen neto
  )),
  
  -- Tiers (para comisiones escalonadas)
  -- Ejemplo: [{"min": 0, "max": 100000, "percentage": 5}, {"min": 100001, "max": null, "percentage": 7}]
  tiers JSONB DEFAULT '[]',
  
  -- Condiciones
  min_threshold NUMERIC(18,2) DEFAULT 0, -- Mínimo para activar
  max_cap NUMERIC(18,2), -- Tope máximo de comisión
  
  -- Estado
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de comisiones calculadas/pagadas
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheme_id UUID REFERENCES commission_schemes(id) ON DELETE SET NULL,
  
  -- Período
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Base de cálculo
  base_revenue NUMERIC(18,2) DEFAULT 0, -- Ingresos del período
  base_margin NUMERIC(18,2) DEFAULT 0, -- Margen del período
  operations_count INTEGER DEFAULT 0, -- Operaciones cerradas
  
  -- Comisión calculada
  commission_amount NUMERIC(18,2) NOT NULL,
  
  -- Ajustes
  adjustments NUMERIC(18,2) DEFAULT 0, -- Ajustes manuales
  adjustment_notes TEXT,
  
  -- Total final
  total_amount NUMERIC(18,2) NOT NULL,
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',        -- Pendiente de aprobación
    'approved',       -- Aprobada
    'paid',           -- Pagada
    'cancelled'       -- Cancelada
  )),
  
  -- Fechas de pago
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMP WITH TIME ZONE,
  payment_reference TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de detalle de comisiones (por operación)
CREATE TABLE IF NOT EXISTS commission_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  commission_id UUID NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  
  -- Montos de la operación
  operation_revenue NUMERIC(18,2) NOT NULL,
  operation_margin NUMERIC(18,2),
  
  -- Comisión calculada
  commission_percentage NUMERIC(5,2),
  commission_amount NUMERIC(18,2) NOT NULL,
  
  -- Notas
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_commission_schemes_agency ON commission_schemes(agency_id);
CREATE INDEX IF NOT EXISTS idx_commissions_agency ON commissions(agency_id);
CREATE INDEX IF NOT EXISTS idx_commissions_user ON commissions(user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_period ON commissions(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commission_details_commission ON commission_details(commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_details_operation ON commission_details(operation_id);

-- Comentarios
COMMENT ON TABLE commission_schemes IS 'Esquemas de comisiones configurables';
COMMENT ON TABLE commissions IS 'Comisiones calculadas por vendedor y período';
COMMENT ON TABLE commission_details IS 'Detalle de comisiones por operación';

-- RLS (Row Level Security)
ALTER TABLE commission_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_details ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view commission schemes" ON commission_schemes;
DROP POLICY IF EXISTS "Admins can manage commission schemes" ON commission_schemes;
DROP POLICY IF EXISTS "Users can view own commissions" ON commissions;
DROP POLICY IF EXISTS "Admins can manage commissions" ON commissions;
DROP POLICY IF EXISTS "Users can view commission details" ON commission_details;

-- Políticas para commission_schemes
CREATE POLICY "Users can view commission schemes"
  ON commission_schemes
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage commission schemes"
  ON commission_schemes
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Políticas para commissions
CREATE POLICY "Users can view own commissions"
  ON commissions
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN', 'MANAGER'))
    )
  );

CREATE POLICY "Admins can manage commissions"
  ON commissions
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Políticas para commission_details
CREATE POLICY "Users can view commission details"
  ON commission_details
  FOR SELECT
  USING (
    commission_id IN (
      SELECT id FROM commissions WHERE user_id = auth.uid()
      OR agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
        AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN', 'MANAGER'))
      )
    )
  );

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_commission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS trigger_update_commission_scheme_updated_at ON commission_schemes;
CREATE TRIGGER trigger_update_commission_scheme_updated_at
  BEFORE UPDATE ON commission_schemes
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_updated_at();

DROP TRIGGER IF EXISTS trigger_update_commission_updated_at ON commissions;
CREATE TRIGGER trigger_update_commission_updated_at
  BEFORE UPDATE ON commissions
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_updated_at();
