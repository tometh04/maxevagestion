-- Migration 133: Agregar agency_id a wa_devices para diferenciar celulares por agencia
-- Permite filtrar dispositivos, conversaciones y métricas por agencia

ALTER TABLE wa_devices
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

-- Índice para filtrar por agencia
CREATE INDEX IF NOT EXISTS idx_wa_devices_agency ON wa_devices(agency_id) WHERE agency_id IS NOT NULL;

COMMENT ON COLUMN wa_devices.agency_id IS 'Agencia a la que pertenece este dispositivo WhatsApp. NULL = sin agencia asignada.';
