-- =====================================================
-- FASE 2: FECHAS Y RECORDATORIOS
-- Migración 021: Agregar fechas a leads
-- =====================================================
-- Agregar campos de fechas para check-in, salida estimada y seguimiento

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS estimated_checkin_date DATE,
  ADD COLUMN IF NOT EXISTS estimated_departure_date DATE,
  ADD COLUMN IF NOT EXISTS follow_up_date DATE;

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_leads_checkin_date ON leads(estimated_checkin_date) WHERE estimated_checkin_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_date ON leads(follow_up_date) WHERE follow_up_date IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN leads.estimated_checkin_date IS 'Fecha estimada de check-in del viaje';
COMMENT ON COLUMN leads.estimated_departure_date IS 'Fecha estimada de salida del viaje';
COMMENT ON COLUMN leads.follow_up_date IS 'Fecha para hacer seguimiento al lead';

