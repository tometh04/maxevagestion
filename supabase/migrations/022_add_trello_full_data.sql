-- Agregar campo JSONB para guardar TODA la información completa de Trello
-- Esto permite tener acceso a toda la información exactamente como está en Trello
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS trello_full_data JSONB;

-- Crear índice GIN para búsquedas rápidas en el JSONB
CREATE INDEX IF NOT EXISTS idx_leads_trello_full_data ON leads USING GIN (trello_full_data);

-- Comentario para documentación
COMMENT ON COLUMN leads.trello_full_data IS 'Datos completos de la tarjeta de Trello en formato JSON, incluyendo custom fields, checklists, attachments, comments, etc.';

