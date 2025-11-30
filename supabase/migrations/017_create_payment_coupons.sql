-- =====================================================
-- FASE 2: CUPONES DE COBRO
-- Migración 017: Crear tabla de cupones de cobro
-- =====================================================
-- Sistema de generación y seguimiento de cupones de pago

CREATE TABLE IF NOT EXISTS payment_coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información del cupón
  coupon_number TEXT UNIQUE NOT NULL, -- Número único del cupón (ej: CUP-2025-001)
  coupon_type TEXT NOT NULL DEFAULT 'PAYMENT' CHECK (coupon_type IN (
    'PAYMENT',      -- Cupón de pago
    'DEPOSIT',      -- Cupón de depósito
    'BALANCE'       -- Cupón de saldo
  )),
  
  -- Monto
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  
  -- Fechas
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL, -- Fecha de vencimiento
  paid_date DATE, -- Fecha de pago
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',   -- Pendiente de pago
    'PAID',      -- Pagado
    'OVERDUE',   -- Vencido
    'CANCELLED'  -- Cancelado
  )),
  
  -- Información del cliente
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  
  -- Información adicional
  description TEXT,
  notes TEXT,
  payment_reference TEXT, -- Referencia del pago cuando se marca como pagado
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_payment_coupons_operation_id ON payment_coupons(operation_id);
CREATE INDEX IF NOT EXISTS idx_payment_coupons_payment_id ON payment_coupons(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_coupons_customer_id ON payment_coupons(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_coupons_agency_id ON payment_coupons(agency_id);
CREATE INDEX IF NOT EXISTS idx_payment_coupons_status ON payment_coupons(status);
CREATE INDEX IF NOT EXISTS idx_payment_coupons_due_date ON payment_coupons(due_date);
CREATE INDEX IF NOT EXISTS idx_payment_coupons_coupon_number ON payment_coupons(coupon_number);

-- Función para generar número de cupón automático
CREATE OR REPLACE FUNCTION generate_coupon_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  new_number TEXT;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(coupon_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM payment_coupons
  WHERE coupon_number LIKE 'CUP-' || year_part || '-%';
  
  new_number := 'CUP-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE TRIGGER trigger_update_payment_coupons_updated_at
  BEFORE UPDATE ON payment_coupons
  FOR EACH ROW
  EXECUTE FUNCTION update_quotations_updated_at();

-- Trigger para actualizar status a OVERDUE cuando vence
CREATE OR REPLACE FUNCTION check_coupon_overdue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'PENDING' AND NEW.due_date < CURRENT_DATE THEN
    NEW.status = 'OVERDUE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_coupon_overdue
  BEFORE INSERT OR UPDATE ON payment_coupons
  FOR EACH ROW
  EXECUTE FUNCTION check_coupon_overdue();

-- Comentarios
COMMENT ON TABLE payment_coupons IS 'Cupones de cobro generados para clientes';
COMMENT ON COLUMN payment_coupons.coupon_number IS 'Número único del cupón (formato: CUP-YYYY-NNNN)';
COMMENT ON COLUMN payment_coupons.payment_id IS 'ID del pago cuando el cupón se marca como pagado';

