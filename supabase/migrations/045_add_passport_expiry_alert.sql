-- =====================================================
-- Agregar tipo de alerta PASSPORT_EXPIRY
-- Migración 045: Alertas de pasaportes vencidos
-- =====================================================

-- Agregar lead_id a alerts si no existe (para alertas de pasaportes en leads)
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE;

-- Actualizar constraint de tipo para incluir PASSPORT_EXPIRY
ALTER TABLE alerts
  DROP CONSTRAINT IF EXISTS alerts_type_check;

ALTER TABLE alerts
  ADD CONSTRAINT alerts_type_check 
  CHECK (type IN (
    'PAYMENT_DUE', 
    'OPERATOR_DUE', 
    'UPCOMING_TRIP', 
    'MISSING_DOC', 
    'GENERIC',
    'PAYMENT_REMINDER_7D',
    'PAYMENT_REMINDER_3D', 
    'PAYMENT_REMINDER_TODAY',
    'PAYMENT_OVERDUE',
    'LEAD_CHECKIN_30D',
    'LEAD_CHECKIN_15D',
    'LEAD_CHECKIN_7D',
    'LEAD_CHECKIN_TODAY',
    'RECURRING_PAYMENT',
    'PASSPORT_EXPIRY'
  ));

-- Índice para buscar alertas de leads
CREATE INDEX IF NOT EXISTS idx_alerts_lead ON alerts(lead_id) WHERE lead_id IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN alerts.lead_id IS 'Lead asociado a la alerta (para alertas de pasaportes en leads)';

