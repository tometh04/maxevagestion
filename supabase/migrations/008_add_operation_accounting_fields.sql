-- =====================================================
-- FASE 2: EXTENSIÓN DE TABLAS Y CAMPOS
-- Migración 008: Agregar campos contables a operations
-- =====================================================
-- Campos para mejorar el tracking contable y operativo

-- Agregar campos nuevos
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS file_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS product_type TEXT CHECK (product_type IN ('AEREO', 'HOTEL', 'PAQUETE', 'CRUCERO', 'OTRO')),
  ADD COLUMN IF NOT EXISTS checkin_date DATE,
  ADD COLUMN IF NOT EXISTS checkout_date DATE,
  ADD COLUMN IF NOT EXISTS passengers JSONB,
  ADD COLUMN IF NOT EXISTS seller_secondary_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_currency TEXT CHECK (sale_currency IN ('ARS', 'USD')) DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS operator_cost_currency TEXT CHECK (operator_cost_currency IN ('ARS', 'USD')) DEFAULT 'ARS';

-- Migrar datos existentes:
-- 1. Si product_type no está definido, inferirlo de type
UPDATE operations
SET product_type = CASE
  WHEN type = 'FLIGHT' THEN 'AEREO'
  WHEN type = 'HOTEL' THEN 'HOTEL'
  WHEN type = 'PACKAGE' THEN 'PAQUETE'
  WHEN type = 'CRUISE' THEN 'CRUCERO'
  ELSE 'OTRO'
END
WHERE product_type IS NULL;

-- 2. Si sale_currency no está definido, usar currency existente
UPDATE operations
SET sale_currency = currency
WHERE sale_currency IS NULL;

-- 3. Si operator_cost_currency no está definido, usar currency existente
UPDATE operations
SET operator_cost_currency = currency
WHERE operator_cost_currency IS NULL;

-- 4. Generar file_code para operaciones existentes que no lo tengan
-- Formato: OP-{YYYYMMDD}-{ID corto}
UPDATE operations
SET file_code = 'OP-' || TO_CHAR(created_at, 'YYYYMMDD') || '-' || SUBSTRING(id::text, 1, 8)
WHERE file_code IS NULL;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_operations_file_code ON operations(file_code) WHERE file_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operations_product_type ON operations(product_type);
CREATE INDEX IF NOT EXISTS idx_operations_seller_secondary ON operations(seller_secondary_id) WHERE seller_secondary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operations_checkin_date ON operations(checkin_date) WHERE checkin_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operations_checkout_date ON operations(checkout_date) WHERE checkout_date IS NOT NULL;

-- Comentarios para documentación
COMMENT ON COLUMN operations.file_code IS 'Código único de archivo/expediente de la operación';
COMMENT ON COLUMN operations.product_type IS 'Tipo de producto: AEREO, HOTEL, PAQUETE, CRUCERO, OTRO';
COMMENT ON COLUMN operations.checkin_date IS 'Fecha de check-in (para hoteles)';
COMMENT ON COLUMN operations.checkout_date IS 'Fecha de check-out (para hoteles)';
COMMENT ON COLUMN operations.passengers IS 'Información detallada de pasajeros en formato JSON';
COMMENT ON COLUMN operations.seller_secondary_id IS 'Vendedor secundario (para comisiones compartidas)';
COMMENT ON COLUMN operations.sale_currency IS 'Moneda de la venta (ARS o USD)';
COMMENT ON COLUMN operations.operator_cost_currency IS 'Moneda del costo del operador (ARS o USD)';

