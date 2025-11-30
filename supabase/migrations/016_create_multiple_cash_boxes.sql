-- =====================================================
-- FASE 2: GESTIÓN DE MÚLTIPLES CAJAS
-- Migración 016: Crear tablas para múltiples cajas
-- =====================================================
-- Sistema de gestión de múltiples cajas con transferencias

-- Tabla de cajas
CREATE TABLE IF NOT EXISTS cash_boxes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL, -- Nombre de la caja (ej: "Caja Principal", "Caja Chica", "Caja USD")
  description TEXT,
  
  -- Tipo de caja
  box_type TEXT NOT NULL DEFAULT 'MAIN' CHECK (box_type IN (
    'MAIN',        -- Caja principal
    'PETTY',       -- Caja chica
    'USD',         -- Caja en dólares
    'BANK',        -- Cuenta bancaria
    'OTHER'        -- Otra
  )),
  
  -- Moneda
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  
  -- Balance
  initial_balance NUMERIC(18,2) DEFAULT 0,
  current_balance NUMERIC(18,2) DEFAULT 0, -- Balance actual (calculado)
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Caja por defecto para la agencia
  
  -- Información adicional
  notes TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Tabla de transferencias entre cajas
CREATE TABLE IF NOT EXISTS cash_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  from_box_id UUID NOT NULL REFERENCES cash_boxes(id) ON DELETE RESTRICT,
  to_box_id UUID NOT NULL REFERENCES cash_boxes(id) ON DELETE RESTRICT,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Monto
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  exchange_rate NUMERIC(18,4), -- Si la transferencia es entre monedas diferentes
  
  -- Fecha
  transfer_date DATE NOT NULL,
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',   -- Pendiente
    'COMPLETED', -- Completada
    'CANCELLED'  -- Cancelada
  )),
  
  -- Información adicional
  reference TEXT,
  notes TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

-- Modificar cash_movements para incluir cash_box_id
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS cash_box_id UUID REFERENCES cash_boxes(id) ON DELETE SET NULL;

-- Índices
CREATE INDEX IF NOT EXISTS idx_cash_boxes_agency_id ON cash_boxes(agency_id);
CREATE INDEX IF NOT EXISTS idx_cash_boxes_is_active ON cash_boxes(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cash_boxes_is_default ON cash_boxes(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_cash_transfers_from_box ON cash_transfers(from_box_id);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_to_box ON cash_transfers(to_box_id);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_agency ON cash_transfers(agency_id);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_status ON cash_transfers(status);
CREATE INDEX IF NOT EXISTS idx_cash_movements_cash_box ON cash_movements(cash_box_id) WHERE cash_box_id IS NOT NULL;

-- Función para calcular balance actual de una caja
CREATE OR REPLACE FUNCTION calculate_cash_box_balance(box_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  initial NUMERIC;
  income NUMERIC;
  expense NUMERIC;
  transfers_out NUMERIC;
  transfers_in NUMERIC;
BEGIN
  -- Obtener balance inicial
  SELECT COALESCE(initial_balance, 0) INTO initial
  FROM cash_boxes
  WHERE id = box_id;
  
  -- Calcular ingresos
  SELECT COALESCE(SUM(amount), 0) INTO income
  FROM cash_movements
  WHERE cash_box_id = box_id
    AND type = 'INCOME';
  
  -- Calcular egresos
  SELECT COALESCE(SUM(amount), 0) INTO expense
  FROM cash_movements
  WHERE cash_box_id = box_id
    AND type = 'EXPENSE';
  
  -- Calcular transferencias salientes
  SELECT COALESCE(SUM(amount), 0) INTO transfers_out
  FROM cash_transfers
  WHERE from_box_id = box_id
    AND status = 'COMPLETED';
  
  -- Calcular transferencias entrantes
  SELECT COALESCE(SUM(amount), 0) INTO transfers_in
  FROM cash_transfers
  WHERE to_box_id = box_id
    AND status = 'COMPLETED';
  
  RETURN initial + income - expense - transfers_out + transfers_in;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar balance cuando hay cambios en movimientos
CREATE OR REPLACE FUNCTION update_cash_box_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Actualizar balance de la caja afectada
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE cash_boxes
    SET current_balance = calculate_cash_box_balance(NEW.cash_box_id)
    WHERE id = NEW.cash_box_id;
  END IF;
  
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.cash_box_id IS NOT NULL AND (TG_OP = 'DELETE' OR OLD.cash_box_id != NEW.cash_box_id) THEN
      UPDATE cash_boxes
      SET current_balance = calculate_cash_box_balance(OLD.cash_box_id)
      WHERE id = OLD.cash_box_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cash_box_balance
  AFTER INSERT OR UPDATE OR DELETE ON cash_movements
  FOR EACH ROW
  EXECUTE FUNCTION update_cash_box_balance();

-- Trigger para actualizar balances cuando hay transferencias
CREATE OR REPLACE FUNCTION update_cash_box_balance_on_transfer()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'COMPLETED') THEN
    -- Actualizar caja origen
    UPDATE cash_boxes
    SET current_balance = calculate_cash_box_balance(NEW.from_box_id)
    WHERE id = NEW.from_box_id;
    
    -- Actualizar caja destino
    UPDATE cash_boxes
    SET current_balance = calculate_cash_box_balance(NEW.to_box_id)
    WHERE id = NEW.to_box_id;
  END IF;
  
  IF TG_OP = 'UPDATE' AND OLD.status = 'COMPLETED' AND NEW.status != 'COMPLETED' THEN
    -- Revertir cambios si se cancela una transferencia completada
    UPDATE cash_boxes
    SET current_balance = calculate_cash_box_balance(OLD.from_box_id)
    WHERE id = OLD.from_box_id;
    
    UPDATE cash_boxes
    SET current_balance = calculate_cash_box_balance(OLD.to_box_id)
    WHERE id = OLD.to_box_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cash_box_balance_on_transfer
  AFTER INSERT OR UPDATE ON cash_transfers
  FOR EACH ROW
  EXECUTE FUNCTION update_cash_box_balance_on_transfer();

-- Comentarios
COMMENT ON TABLE cash_boxes IS 'Cajas múltiples para gestión de efectivo';
COMMENT ON TABLE cash_transfers IS 'Transferencias de dinero entre cajas';
COMMENT ON COLUMN cash_boxes.current_balance IS 'Balance actual calculado automáticamente';
COMMENT ON COLUMN cash_boxes.is_default IS 'Indica si es la caja por defecto de la agencia';

