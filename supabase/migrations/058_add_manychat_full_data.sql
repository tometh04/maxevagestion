-- Agregar campo JSONB para guardar TODA la información completa de Manychat
-- Similar a trello_full_data, pero para leads de Manychat
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS manychat_full_data JSONB;

-- Crear índice GIN para búsquedas rápidas en el JSONB
CREATE INDEX IF NOT EXISTS idx_leads_manychat_full_data ON leads USING GIN (manychat_full_data);

-- Comentario para documentación
COMMENT ON COLUMN leads.manychat_full_data IS 'Datos completos del lead de Manychat en formato JSON, incluyendo todos los campos custom, metadata, etc.';

