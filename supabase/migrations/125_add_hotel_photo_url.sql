-- Add hotel_photo_url to quotation_items and itinerary_items
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS hotel_photo_url TEXT;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS hotel_photo_url TEXT;

COMMENT ON COLUMN quotation_items.hotel_photo_url IS 'URL de foto del hotel (Google Places)';
COMMENT ON COLUMN itinerary_items.hotel_photo_url IS 'URL de foto del hotel (Google Places)';
