ALTER TABLE quotation_items
ADD COLUMN IF NOT EXISTS destination_city TEXT;

COMMENT ON COLUMN quotation_items.destination_city IS 'Ciudad o destino especifico del item de cotizacion, util para hoteles en viajes multidestino';
