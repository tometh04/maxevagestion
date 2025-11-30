-- =====================================================
-- Optimización de Sincronización de Trello
-- Migración 030: Agregar checkpoint de última sincronización
-- =====================================================

-- Agregar campo para guardar la fecha de la última sincronización
ALTER TABLE settings_trello
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;

-- Crear índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_settings_trello_last_sync ON settings_trello(last_sync_at) WHERE last_sync_at IS NOT NULL;

-- Comentario
COMMENT ON COLUMN settings_trello.last_sync_at IS 'Fecha y hora de la última sincronización exitosa. Se usa para sincronización incremental (solo sincronizar cambios desde esta fecha)';

