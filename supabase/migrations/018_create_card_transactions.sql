-- =====================================================
-- FASE 2: TRANSACCIONES CON TARJETAS
-- Migración 018: Crear tabla de transacciones con tarjetas
-- =====================================================
-- Sistema de registro y conciliación de transacciones con tarjetas de crédito/débito

CREATE TABLE IF NOT EXISTS card_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  cash_box_id UUID REFERENCES cash_boxes(id) ON DELETE SET NULL,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información de la transacción
  transaction_number TEXT UNIQUE, -- Número de transacción del procesador
  card_type TEXT NOT NULL CHECK (card_type IN (
    'VISA',
    'MASTERCARD',
    'AMEX',
    'DINERS',
    'CABAL',
    'OTHER'
  )),
  card_last_four TEXT, -- Últimos 4 dígitos de la tarjeta
  
  -- Monto
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  
  -- Comisiones
  commission_percentage NUMERIC(5,2) DEFAULT 0, -- Porcentaje de comisión
  commission_amount NUMERIC(18,2) DEFAULT 0, -- Monto de comisión
  net_amount NUMERIC(18,2) NOT NULL, -- Monto neto después de comisión
  
  -- Fechas
  transaction_date DATE NOT NULL,
  settlement_date DATE, -- Fecha de liquidación
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',      -- Pendiente
    'APPROVED',     -- Aprobada
    'SETTLED',      -- Liquidada
    'REJECTED',     -- Rechazada
    'CANCELLED',    -- Cancelada
    'REFUNDED'      -- Reembolsada
  )),
  
  -- Información del procesador
  processor TEXT, -- Procesador de pagos (ej: "Mercado Pago", "Stripe", etc.)
  authorization_code TEXT, -- Código de autorización
  
  -- Información adicional
  description TEXT,
  notes TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_card_transactions_operation_id ON card_transactions(operation_id);
CREATE INDEX IF NOT EXISTS idx_card_transactions_payment_id ON card_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_card_transactions_cash_box_id ON card_transactions(cash_box_id);
CREATE INDEX IF NOT EXISTS idx_card_transactions_agency_id ON card_transactions(agency_id);
CREATE INDEX IF NOT EXISTS idx_card_transactions_status ON card_transactions(status);
CREATE INDEX IF NOT EXISTS idx_card_transactions_transaction_date ON card_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_card_transactions_settlement_date ON card_transactions(settlement_date) WHERE settlement_date IS NOT NULL;

-- Trigger para actualizar updated_at
CREATE TRIGGER trigger_update_card_transactions_updated_at
  BEFORE UPDATE ON card_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_quotations_updated_at();

-- Función para calcular monto neto automáticamente
CREATE OR REPLACE FUNCTION calculate_card_net_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- Calcular comisión si hay porcentaje
  IF NEW.commission_percentage > 0 AND NEW.commission_amount = 0 THEN
    NEW.commission_amount := NEW.amount * (NEW.commission_percentage / 100);
  END IF;
  
  -- Calcular monto neto
  NEW.net_amount := NEW.amount - NEW.commission_amount;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_card_net_amount
  BEFORE INSERT OR UPDATE ON card_transactions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_card_net_amount();

-- Comentarios
COMMENT ON TABLE card_transactions IS 'Transacciones con tarjetas de crédito/débito';
COMMENT ON COLUMN card_transactions.net_amount IS 'Monto neto después de descontar comisiones';
COMMENT ON COLUMN card_transactions.settlement_date IS 'Fecha en que la transacción fue liquidada por el procesador';

