-- Tabla para almacenar el orden de listas en CRM Manychat (INDEPENDIENTE de Trello)
-- Esto permite tener un orden personalizado y editable sin depender de la sincronización de Trello

CREATE TABLE IF NOT EXISTS manychat_list_order (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  list_name TEXT NOT NULL,
  position INTEGER NOT NULL, -- Orden de la lista (0, 1, 2, ...)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agency_id, list_name) -- Una lista solo puede aparecer una vez por agencia
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_manychat_list_order_agency_id ON manychat_list_order(agency_id);
CREATE INDEX IF NOT EXISTS idx_manychat_list_order_position ON manychat_list_order(agency_id, position);

-- Habilitar RLS
ALTER TABLE manychat_list_order ENABLE ROW LEVEL SECURITY;

-- Policies: Todos pueden leer, solo admins pueden escribir
CREATE POLICY "Manychat list order is viewable by authenticated users"
  ON manychat_list_order FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Manychat list order is editable by admins"
  ON manychat_list_order FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Comentario para documentación
COMMENT ON TABLE manychat_list_order IS 'Orden personalizado de listas en CRM Manychat. Independiente de Trello. Permite editar el orden de las columnas sin afectar la sincronización de Trello.';
COMMENT ON COLUMN manychat_list_order.list_name IS 'Nombre de la lista (ej: "Leads - Instagram", "Campaña - X", etc.)';
COMMENT ON COLUMN manychat_list_order.position IS 'Posición/orden de la lista (0 = primera, 1 = segunda, etc.)';

