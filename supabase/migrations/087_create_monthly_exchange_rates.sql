-- =====================================================
-- Migración 087: Tipos de cambio mensuales
-- Permite guardar un TC específico para cada mes
-- =====================================================

CREATE TABLE IF NOT EXISTS monthly_exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  usd_to_ars_rate NUMERIC(18,4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_exchange_rates_year_month 
ON monthly_exchange_rates(year, month);

COMMENT ON TABLE monthly_exchange_rates IS 'Tipos de cambio mensuales para la posición contable';