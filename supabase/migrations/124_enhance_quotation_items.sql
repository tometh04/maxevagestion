-- =====================================================
-- Migration 124: Enhance quotation_items for full service data
-- =====================================================
-- Adds cost tracking, service-specific fields, and operator
-- so quotation items can auto-create operation_services on conversion

-- Alinear item_type con operation_services types
ALTER TABLE quotation_items DROP CONSTRAINT IF EXISTS quotation_items_item_type_check;
ALTER TABLE quotation_items ADD CONSTRAINT quotation_items_item_type_check
  CHECK (item_type IN (
    'HOTEL', 'FLIGHT', 'TRANSFER', 'EXCURSION', 'ASSISTANCE',
    'SEAT', 'LUGGAGE', 'VISA',
    -- Legacy types (backwards compat)
    'ACCOMMODATION', 'ACTIVITY', 'INSURANCE', 'OTHER'
  ));

-- Operator/proveedor por item
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES operators(id) ON DELETE SET NULL;

-- Costo (interno, el cliente no lo ve)
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(18,2) DEFAULT 0;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS cost_currency TEXT DEFAULT 'USD' CHECK (cost_currency IN ('ARS', 'USD'));

-- Renombrar unit_price → sale_amount para consistencia (mantener unit_price como alias)
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS sale_amount NUMERIC(18,2);
-- Migrar datos existentes
UPDATE quotation_items SET sale_amount = unit_price WHERE sale_amount IS NULL;

-- Campos de hotel
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS hotel_name TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS hotel_stars INTEGER;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS hotel_address TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS hotel_phone TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS room_type TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS meal_plan TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS checkin_date DATE;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS checkout_date DATE;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS nights INTEGER;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS rooms INTEGER DEFAULT 1;

-- Campos de vuelo
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS airline TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_route TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_date DATE;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_return_date DATE;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_stops INTEGER DEFAULT 0;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_class TEXT;

-- Campos de transfer
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS transfer_description TEXT;

-- Flag de comisión
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS generates_commission BOOLEAN DEFAULT FALSE;

-- Índice por operador
CREATE INDEX IF NOT EXISTS idx_quotation_items_operator_id ON quotation_items(operator_id) WHERE operator_id IS NOT NULL;

-- Agregar customer_id a quotations (para vincular cliente directo)
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

COMMENT ON COLUMN quotation_items.sale_amount IS 'Precio de venta al cliente (lo que ve)';
COMMENT ON COLUMN quotation_items.cost_amount IS 'Costo interno del proveedor (no visible al cliente)';
COMMENT ON COLUMN quotation_items.operator_id IS 'Proveedor/operador de este servicio';
