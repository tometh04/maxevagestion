-- Add flight screenshot URL to quotation items
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_screenshot_url TEXT;

COMMENT ON COLUMN quotation_items.flight_screenshot_url IS 'URL of uploaded flight screenshot image';
