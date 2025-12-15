-- Agregar campo list_name para leads de Manychat (independiente de Trello)
-- Este campo almacena el nombre de la lista/columna donde debe aparecer el lead en el kanban
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS list_name TEXT;

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_leads_list_name ON leads(list_name) WHERE list_name IS NOT NULL;

-- Comentario para documentación
COMMENT ON COLUMN leads.list_name IS 'Nombre de la lista/columna del kanban. Para leads de Manychat, se calcula según la lógica de Zapier. Para leads de Trello, se obtiene de la lista de Trello.';

