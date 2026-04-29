-- Itinerary items for purchase detail PDF generation
-- Each operation can have multiple itinerary blocks (hotels, flights, transfers, cars, notes)

CREATE TABLE IF NOT EXISTS itinerary_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  item_type TEXT NOT NULL CHECK (item_type IN ('HOTEL', 'FLIGHT', 'TRANSFER', 'CAR', 'NOTE')),

  -- Hotel fields
  hotel_name TEXT,
  hotel_stars INTEGER CHECK (hotel_stars >= 1 AND hotel_stars <= 5),
  hotel_address TEXT,
  hotel_phone TEXT,
  room_type TEXT,
  meal_plan TEXT,
  checkin_date DATE,
  checkout_date DATE,
  nights INTEGER,
  rooms INTEGER,

  -- Flight fields
  airline TEXT,
  flight_route TEXT,
  flight_date DATE,

  -- Transfer fields
  transfer_description TEXT,

  -- Car fields
  car_company TEXT,
  car_details TEXT,
  car_pickup_date DATE,
  car_return_date DATE,
  car_pickup_location TEXT,
  car_return_location TEXT,

  -- Common fields
  destination_city TEXT,
  date_from DATE,
  date_to DATE,
  notes TEXT,
  image_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_itinerary_items_operation ON itinerary_items(operation_id, sort_order);

ALTER TABLE itinerary_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "itinerary_select" ON itinerary_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "itinerary_insert" ON itinerary_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "itinerary_update" ON itinerary_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "itinerary_delete" ON itinerary_items FOR DELETE TO authenticated USING (true);
