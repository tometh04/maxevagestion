-- =====================================================
-- Migración 087: Crear tabla de tipos de cambio mensuales
-- Para dolarización de balances en Posición Contable Mensual
-- =====================================================

CREATE TABLE IF NOT EXISTS monthly_exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  usd_to_ars_rate NUMERIC(18,4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(year, month)
);

-- Índice para búsquedas rápidas por año/mes
CREATE INDEX IF NOT EXISTS idx_monthly_exchange_rates_year_month ON monthly_exchange_rates(year, month);

-- Comentarios
COMMENT ON TABLE monthly_exchange_rates IS 'Tipos de cambio mensuales para dolarización de balances contables';
COMMENT ON COLUMN monthly_exchange_rates.year IS 'Año del mes';
COMMENT ON COLUMN monthly_exchange_rates.month IS 'Mes (1-12)';
COMMENT ON COLUMN monthly_exchange_rates.usd_to_ars_rate IS 'Tipo de cambio USD a ARS para ese mes';
COMMENT ON COLUMN monthly_exchange_rates.created_by IS 'Usuario que creó/actualizó el tipo de cambio';
