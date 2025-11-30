-- =====================================================
-- FASE 6: MEJORAS AL MÓDULO DE COMISIONES Y FX
-- Migración 013: Crear tabla exchange_rates
-- =====================================================

-- Tabla para almacenar tasas de cambio históricas
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Fecha de la tasa (solo fecha, sin hora)
  rate_date DATE NOT NULL,
  
  -- Moneda base y destino (por ahora solo USD -> ARS)
  from_currency TEXT NOT NULL CHECK (from_currency IN ('USD')),
  to_currency TEXT NOT NULL CHECK (to_currency IN ('ARS')),
  
  -- Tasa de cambio (cuántos ARS por 1 USD)
  rate NUMERIC(18,4) NOT NULL CHECK (rate > 0),
  
  -- Fuente de la tasa (opcional, para auditoría)
  source TEXT, -- 'MANUAL', 'API', 'BCRA', etc.
  
  -- Notas opcionales
  notes TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Una tasa por día y par de monedas
  UNIQUE(rate_date, from_currency, to_currency)
);

-- Índice para búsquedas rápidas por fecha
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(rate_date DESC);

-- Índice para búsquedas por monedas
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);

-- Comentarios para documentación
COMMENT ON TABLE exchange_rates IS 'Almacena tasas de cambio históricas para conversión de monedas';
COMMENT ON COLUMN exchange_rates.rate_date IS 'Fecha de la tasa (solo fecha, sin hora)';
COMMENT ON COLUMN exchange_rates.rate IS 'Tasa de cambio: cuántos ARS equivalen a 1 USD';
COMMENT ON COLUMN exchange_rates.source IS 'Fuente de la tasa: MANUAL, API, BCRA, etc.';

-- Función para obtener la tasa más reciente para una fecha
-- Si no hay tasa exacta para esa fecha, devuelve la más cercana anterior
CREATE OR REPLACE FUNCTION get_exchange_rate(
  p_date DATE,
  p_from_currency TEXT DEFAULT 'USD',
  p_to_currency TEXT DEFAULT 'ARS'
) RETURNS NUMERIC(18,4) AS $$
DECLARE
  v_rate NUMERIC(18,4);
BEGIN
  SELECT rate INTO v_rate
  FROM exchange_rates
  WHERE from_currency = p_from_currency
    AND to_currency = p_to_currency
    AND rate_date <= p_date
  ORDER BY rate_date DESC
  LIMIT 1;
  
  -- Si no hay tasa, devolver NULL (el código debe manejar esto)
  RETURN v_rate;
END;
$$ LANGUAGE plpgsql;

-- Comentario para la función
COMMENT ON FUNCTION get_exchange_rate IS 'Obtiene la tasa de cambio más reciente para una fecha dada';

