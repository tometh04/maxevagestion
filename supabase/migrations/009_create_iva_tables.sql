-- =====================================================
-- FASE 4: MÓDULO IVA Y OPERATOR PAYMENTS
-- Migración 009: Crear tablas de IVA
-- =====================================================
-- Tablas para el cálculo automático de IVA en ventas y compras

-- Tabla para IVA de ventas
CREATE TABLE IF NOT EXISTS iva_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relación con operación
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  
  -- Información monetaria
  sale_amount_total NUMERIC(18,2) NOT NULL,
  net_amount NUMERIC(18,2) NOT NULL,  -- sale_amount_total / 1.21
  iva_amount NUMERIC(18,2) NOT NULL,  -- sale_amount_total - net_amount
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  
  -- Fecha de la venta (usar created_at de la operación o fecha específica)
  sale_date DATE NOT NULL,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para IVA de compras
CREATE TABLE IF NOT EXISTS iva_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relación con operación
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  
  -- Relación con operador
  operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  
  -- Información monetaria
  operator_cost_total NUMERIC(18,2) NOT NULL,
  net_amount NUMERIC(18,2) NOT NULL,  -- operator_cost_total / 1.21
  iva_amount NUMERIC(18,2) NOT NULL,  -- operator_cost_total - net_amount
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  
  -- Fecha de la compra
  purchase_date DATE NOT NULL,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_iva_sales_operation ON iva_sales(operation_id);
CREATE INDEX IF NOT EXISTS idx_iva_sales_date ON iva_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_iva_purchases_operation ON iva_purchases(operation_id);
CREATE INDEX IF NOT EXISTS idx_iva_purchases_operator ON iva_purchases(operator_id);
CREATE INDEX IF NOT EXISTS idx_iva_purchases_date ON iva_purchases(purchase_date);

-- Comentarios para documentación
COMMENT ON TABLE iva_sales IS 'IVA de ventas. Se calcula automáticamente: net = sale_amount_total / 1.21, iva = sale_amount_total - net';
COMMENT ON TABLE iva_purchases IS 'IVA de compras. Se calcula automáticamente: net = operator_cost_total / 1.21, iva = operator_cost_total - net';
COMMENT ON COLUMN iva_sales.net_amount IS 'Monto neto (sin IVA) = sale_amount_total / 1.21';
COMMENT ON COLUMN iva_sales.iva_amount IS 'Monto de IVA = sale_amount_total - net_amount';
COMMENT ON COLUMN iva_purchases.net_amount IS 'Monto neto (sin IVA) = operator_cost_total / 1.21';
COMMENT ON COLUMN iva_purchases.iva_amount IS 'Monto de IVA = operator_cost_total - net_amount';

