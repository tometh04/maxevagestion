-- Tabla para tramos de viaje (stopovers / multi-destino)
-- Cada operación puede tener N tramos, cada uno con sus propios
-- códigos de reserva, fechas y datos de hotel.

CREATE TABLE operation_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  order_index INTEGER NOT NULL DEFAULT 0,
  destination TEXT NOT NULL,
  departure_date DATE NULL,
  reservation_code_air TEXT NULL,
  airline_name TEXT NULL,
  itr_localizador TEXT NULL,
  hotel_name TEXT NULL,
  reservation_code_hotel TEXT NULL,
  checkin_date DATE NULL,
  checkout_date DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operation_legs_operation_id ON operation_legs(operation_id);
CREATE INDEX idx_operation_legs_agency_id ON operation_legs(agency_id);

ALTER TABLE operation_legs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can manage operation legs"
  ON operation_legs
  FOR ALL
  TO authenticated
  USING (
    agency_id IN (
      SELECT agency_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION update_operation_legs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_operation_legs_updated_at
  BEFORE UPDATE ON operation_legs
  FOR EACH ROW EXECUTE FUNCTION update_operation_legs_updated_at();
