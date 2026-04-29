-- Tabla maestra de destinos
-- Unifica destinos escritos de forma diferente (ej: "PUNTA CANA" y "Punta Cana")

CREATE TABLE IF NOT EXISTS destinations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  name_normalized TEXT NOT NULL,
  country TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_destinations_normalized ON destinations(name_normalized);
CREATE INDEX IF NOT EXISTS idx_destinations_name ON destinations(name);

-- Agregar referencia en operations
ALTER TABLE operations ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES destinations(id);
CREATE INDEX IF NOT EXISTS idx_operations_destination_id ON operations(destination_id);

-- RLS: destinations es lectura para todos los autenticados
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "destinations_select_all" ON destinations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "destinations_insert_admin" ON destinations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "destinations_update_admin" ON destinations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
