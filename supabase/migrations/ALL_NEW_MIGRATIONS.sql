-- =====================================================
-- MIGRACIONES COMBINADAS - FUNCIONALIDADES DE SAVIA
-- =====================================================
-- Este archivo contiene todas las migraciones nuevas
-- Ejecuta este archivo completo en el SQL Editor de Supabase
-- Fecha: 2025-11-28T22:58:37.895Z
-- =====================================================


-- =====================================================
-- MIGRACIÓN 1/6: 014_create_quotations.sql
-- =====================================================

-- =====================================================
-- FASE 1: SISTEMA DE COTIZACIONES
-- Migración 014: Crear tablas de cotizaciones
-- =====================================================
-- Sistema formal de cotizaciones con aprobación
-- Flujo: Lead → Cotización → Aprobación → Operación

-- Tabla principal de cotizaciones
CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  
  -- Información básica
  quotation_number TEXT UNIQUE NOT NULL, -- Número único de cotización (ej: COT-2025-001)
  destination TEXT NOT NULL,
  origin TEXT,
  region TEXT NOT NULL CHECK (region IN ('ARGENTINA', 'CARIBE', 'BRASIL', 'EUROPA', 'EEUU', 'OTROS', 'CRUCEROS')),
  
  -- Fechas
  departure_date DATE NOT NULL,
  return_date DATE,
  valid_until DATE NOT NULL, -- Fecha de vencimiento de la cotización
  
  -- Pasajeros
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  infants INTEGER DEFAULT 0,
  
  -- Montos
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
  discounts NUMERIC(18,2) DEFAULT 0,
  taxes NUMERIC(18,2) DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  
  -- Estado y aprobación
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT',           -- Borrador
    'SENT',            -- Enviada al cliente
    'PENDING_APPROVAL', -- Pendiente de aprobación
    'APPROVED',        -- Aprobada
    'REJECTED',        -- Rechazada
    'EXPIRED',         -- Expirada
    'CONVERTED'        -- Convertida a operación
  )),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  -- Conversión a operación
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  converted_at TIMESTAMP WITH TIME ZONE,
  
  -- Notas y términos
  notes TEXT,
  terms_and_conditions TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

-- Tabla de items de cotización
CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  
  -- Información del item
  item_type TEXT NOT NULL CHECK (item_type IN (
    'ACCOMMODATION',  -- Alojamiento
    'FLIGHT',         -- Vuelo
    'TRANSFER',       -- Traslado
    'ACTIVITY',       -- Actividad/Excursión
    'INSURANCE',      -- Seguro
    'VISA',           -- Visa
    'OTHER'           -- Otro
  )),
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  
  -- Tarifario relacionado (si aplica)
  tariff_id UUID, -- FK a tariffs (se creará en siguiente migración)
  
  -- Precios
  unit_price NUMERIC(18,2) NOT NULL,
  discount_percentage NUMERIC(5,2) DEFAULT 0,
  discount_amount NUMERIC(18,2) DEFAULT 0,
  subtotal NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  
  -- Información adicional
  notes TEXT,
  order_index INTEGER DEFAULT 0, -- Para mantener el orden de los items
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_quotations_lead_id ON quotations(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotations_agency_id ON quotations(agency_id);
CREATE INDEX IF NOT EXISTS idx_quotations_seller_id ON quotations(seller_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_quotation_number ON quotations(quotation_number);
CREATE INDEX IF NOT EXISTS idx_quotations_operation_id ON quotations(operation_id);
CREATE INDEX IF NOT EXISTS idx_quotations_valid_until ON quotations(valid_until) WHERE status IN ('SENT', 'PENDING_APPROVAL');
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_tariff_id ON quotation_items(tariff_id) WHERE tariff_id IS NOT NULL;

-- Función para generar número de cotización automático
CREATE OR REPLACE FUNCTION generate_quotation_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  new_number TEXT;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  
  -- Obtener el último número de secuencia del año actual
  SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM quotations
  WHERE quotation_number LIKE 'COT-' || year_part || '-%';
  
  new_number := 'COT-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_quotations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION update_quotations_updated_at();

CREATE TRIGGER trigger_update_quotation_items_updated_at
  BEFORE UPDATE ON quotation_items
  FOR EACH ROW
  EXECUTE FUNCTION update_quotations_updated_at();

-- Comentarios para documentación
COMMENT ON TABLE quotations IS 'Cotizaciones formales del sistema. Flujo: Lead → Cotización → Aprobación → Operación';
COMMENT ON COLUMN quotations.quotation_number IS 'Número único de cotización generado automáticamente (formato: COT-YYYY-NNNN)';
COMMENT ON COLUMN quotations.status IS 'Estado de la cotización: DRAFT, SENT, PENDING_APPROVAL, APPROVED, REJECTED, EXPIRED, CONVERTED';
COMMENT ON COLUMN quotations.operation_id IS 'ID de la operación creada cuando se convierte la cotización';
COMMENT ON TABLE quotation_items IS 'Items individuales de una cotización (alojamiento, vuelo, etc.)';




-- =====================================================
-- MIGRACIÓN 2/6: 015_create_tariffs_and_quotas.sql
-- =====================================================

-- =====================================================
-- FASE 1: TARIFARIOS Y CUPOS
-- Migración 015: Crear tablas de tarifarios y cupos
-- =====================================================
-- Sistema de gestión de tarifarios de operadores y control de cupos

-- Tabla de tarifarios
CREATE TABLE IF NOT EXISTS tariffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL, -- NULL = tarifario global
  
  -- Información básica
  name TEXT NOT NULL, -- Nombre del tarifario (ej: "Caribe Verano 2025")
  description TEXT,
  destination TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('ARGENTINA', 'CARIBE', 'BRASIL', 'EUROPA', 'EEUU', 'OTROS', 'CRUCEROS')),
  
  -- Fechas de vigencia
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  
  -- Tipo de tarifario
  tariff_type TEXT NOT NULL CHECK (tariff_type IN (
    'ACCOMMODATION',  -- Alojamiento
    'FLIGHT',         -- Vuelo
    'PACKAGE',        -- Paquete completo
    'TRANSFER',       -- Traslado
    'ACTIVITY',       -- Actividad/Excursión
    'CRUISE',         -- Crucero
    'OTHER'           -- Otro
  )),
  
  -- Configuración
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  is_active BOOLEAN DEFAULT true,
  
  -- Información adicional
  notes TEXT,
  terms_and_conditions TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Tabla de items de tarifario (precios por categoría/tipo)
CREATE TABLE IF NOT EXISTS tariff_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tariff_id UUID NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
  
  -- Categoría del item
  category TEXT NOT NULL, -- Ej: "Habitación Standard", "Habitación Deluxe", "Adulto", "Menor", etc.
  room_type TEXT, -- Para alojamientos: SINGLE, DOUBLE, TRIPLE, QUAD, etc.
  occupancy_type TEXT CHECK (occupancy_type IN ('SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'SHARED', NULL)),
  
  -- Precios
  base_price NUMERIC(18,2) NOT NULL, -- Precio base por persona/noche/item
  price_per_night BOOLEAN DEFAULT false, -- Si el precio es por noche
  price_per_person BOOLEAN DEFAULT true, -- Si el precio es por persona
  
  -- Descuentos y comisiones
  discount_percentage NUMERIC(5,2) DEFAULT 0,
  commission_percentage NUMERIC(5,2) DEFAULT 0, -- Comisión para la agencia
  
  -- Condiciones
  min_nights INTEGER, -- Mínimo de noches
  max_nights INTEGER, -- Máximo de noches
  min_pax INTEGER DEFAULT 1, -- Mínimo de pasajeros
  max_pax INTEGER, -- Máximo de pasajeros
  
  -- Disponibilidad
  is_available BOOLEAN DEFAULT true,
  
  -- Información adicional
  notes TEXT,
  order_index INTEGER DEFAULT 0,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de cupos disponibles
CREATE TABLE IF NOT EXISTS quotas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  tariff_id UUID REFERENCES tariffs(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  
  -- Información del cupo
  destination TEXT NOT NULL,
  accommodation_name TEXT, -- Nombre del hotel/alojamiento (si aplica)
  room_type TEXT, -- Tipo de habitación
  
  -- Fechas
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  
  -- Disponibilidad
  total_quota INTEGER NOT NULL, -- Cupo total disponible
  reserved_quota INTEGER DEFAULT 0, -- Cupo reservado
  available_quota INTEGER GENERATED ALWAYS AS (total_quota - reserved_quota) STORED, -- Cupo disponible (calculado)
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  
  -- Información adicional
  notes TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Tabla de reservas de cupos (para tracking)
CREATE TABLE IF NOT EXISTS quota_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  quota_id UUID NOT NULL REFERENCES quotas(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL,
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  
  -- Cantidad reservada
  quantity INTEGER NOT NULL,
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'RESERVED' CHECK (status IN (
    'RESERVED',    -- Reservado (temporal)
    'CONFIRMED',   -- Confirmado (asignado a operación)
    'RELEASED',    -- Liberado (cancelado)
    'EXPIRED'      -- Expirado (reserva temporal vencida)
  )),
  
  -- Fechas
  reserved_until TIMESTAMP WITH TIME ZONE, -- Hasta cuándo está reservado (para reservas temporales)
  released_at TIMESTAMP WITH TIME ZONE,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_tariffs_operator_id ON tariffs(operator_id);
CREATE INDEX IF NOT EXISTS idx_tariffs_agency_id ON tariffs(agency_id) WHERE agency_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tariffs_destination ON tariffs(destination);
CREATE INDEX IF NOT EXISTS idx_tariffs_valid_dates ON tariffs(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_tariffs_is_active ON tariffs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tariff_items_tariff_id ON tariff_items(tariff_id);
CREATE INDEX IF NOT EXISTS idx_quotas_tariff_id ON quotas(tariff_id) WHERE tariff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotas_operator_id ON quotas(operator_id);
CREATE INDEX IF NOT EXISTS idx_quotas_dates ON quotas(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_quotas_available ON quotas(available_quota) WHERE is_active = true AND available_quota > 0;
CREATE INDEX IF NOT EXISTS idx_quota_reservations_quota_id ON quota_reservations(quota_id);
CREATE INDEX IF NOT EXISTS idx_quota_reservations_quotation_id ON quota_reservations(quotation_id) WHERE quotation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quota_reservations_operation_id ON quota_reservations(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quota_reservations_status ON quota_reservations(status);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_tariffs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tariffs_updated_at
  BEFORE UPDATE ON tariffs
  FOR EACH ROW
  EXECUTE FUNCTION update_tariffs_updated_at();

CREATE TRIGGER trigger_update_tariff_items_updated_at
  BEFORE UPDATE ON tariff_items
  FOR EACH ROW
  EXECUTE FUNCTION update_tariffs_updated_at();

CREATE TRIGGER trigger_update_quotas_updated_at
  BEFORE UPDATE ON quotas
  FOR EACH ROW
  EXECUTE FUNCTION update_tariffs_updated_at();

-- Función para actualizar cupos reservados cuando se crea una reserva
CREATE OR REPLACE FUNCTION update_quota_reserved_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'RESERVED' THEN
    UPDATE quotas
    SET reserved_quota = reserved_quota + NEW.quantity
    WHERE id = NEW.quota_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'RESERVED' AND NEW.status != 'RESERVED' THEN
      -- Liberar cupo
      UPDATE quotas
      SET reserved_quota = reserved_quota - OLD.quantity
      WHERE id = NEW.quota_id;
    ELSIF OLD.status != 'RESERVED' AND NEW.status = 'RESERVED' THEN
      -- Reservar cupo
      UPDATE quotas
      SET reserved_quota = reserved_quota + NEW.quantity
      WHERE id = NEW.quota_id;
    ELSIF OLD.status = 'RESERVED' AND NEW.status = 'RESERVED' AND OLD.quantity != NEW.quantity THEN
      -- Ajustar cantidad reservada
      UPDATE quotas
      SET reserved_quota = reserved_quota - OLD.quantity + NEW.quantity
      WHERE id = NEW.quota_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'RESERVED' THEN
    -- Liberar cupo al eliminar reserva
    UPDATE quotas
    SET reserved_quota = reserved_quota - OLD.quantity
    WHERE id = OLD.quota_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_quota_reserved_count
  AFTER INSERT OR UPDATE OR DELETE ON quota_reservations
  FOR EACH ROW
  EXECUTE FUNCTION update_quota_reserved_count();

-- Comentarios para documentación
COMMENT ON TABLE tariffs IS 'Tarifarios de operadores con precios y condiciones';
COMMENT ON TABLE tariff_items IS 'Items individuales de un tarifario (categorías, tipos de habitación, etc.)';
COMMENT ON TABLE quotas IS 'Cupos disponibles de operadores por fecha y destino';
COMMENT ON TABLE quota_reservations IS 'Reservas temporales de cupos para cotizaciones u operaciones';
COMMENT ON COLUMN quotas.available_quota IS 'Cupo disponible calculado automáticamente (total - reservado)';




-- =====================================================
-- MIGRACIÓN 3/6: 016_create_multiple_cash_boxes.sql
-- =====================================================

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




-- =====================================================
-- MIGRACIÓN 4/6: 017_create_payment_coupons.sql
-- =====================================================

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




-- =====================================================
-- MIGRACIÓN 5/6: 018_create_card_transactions.sql
-- =====================================================

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




-- =====================================================
-- MIGRACIÓN 6/6: 019_create_non_touristic_movements.sql
-- =====================================================

-- =====================================================
-- FASE 3: INGRESOS/EGRESOS NO TURÍSTICOS
-- Migración 019: Extender cash_movements para movimientos no turísticos
-- =====================================================
-- Categorización de movimientos entre turísticos y no turísticos

-- Agregar campos a cash_movements para categorización
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS is_touristic BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS movement_category TEXT CHECK (movement_category IN (
    'TOURISTIC',           -- Movimiento turístico (relacionado con operaciones)
    'ADMINISTRATIVE',      -- Gastos administrativos
    'RENT',                -- Alquiler
    'UTILITIES',           -- Servicios (luz, agua, gas, internet)
    'SALARIES',            -- Sueldos
    'MARKETING',           -- Marketing y publicidad
    'TAXES',               -- Impuestos
    'INSURANCE',           -- Seguros
    'MAINTENANCE',         -- Mantenimiento
    'OTHER'                -- Otros
  ));

-- Crear tabla de categorías de movimientos no turísticos (para configuración)
CREATE TABLE IF NOT EXISTS non_touristic_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Información
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category_type TEXT NOT NULL CHECK (category_type IN (
    'ADMINISTRATIVE',
    'RENT',
    'UTILITIES',
    'SALARIES',
    'MARKETING',
    'TAXES',
    'INSURANCE',
    'MAINTENANCE',
    'OTHER'
  )),
  
  -- Configuración
  is_active BOOLEAN DEFAULT true,
  is_income BOOLEAN DEFAULT false, -- Si puede ser usado para ingresos
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar categorías por defecto
INSERT INTO non_touristic_categories (name, description, category_type, is_income) VALUES
  ('Gastos Administrativos', 'Gastos generales de administración', 'ADMINISTRATIVE', false),
  ('Alquiler', 'Alquiler de oficina o local', 'RENT', false),
  ('Servicios', 'Luz, agua, gas, internet, teléfono', 'UTILITIES', false),
  ('Sueldos', 'Pago de sueldos y salarios', 'SALARIES', false),
  ('Marketing', 'Publicidad y marketing', 'MARKETING', false),
  ('Impuestos', 'Pago de impuestos', 'TAXES', false),
  ('Seguros', 'Pólizas de seguro', 'INSURANCE', false),
  ('Mantenimiento', 'Mantenimiento y reparaciones', 'MAINTENANCE', false),
  ('Otros', 'Otros gastos no turísticos', 'OTHER', false)
ON CONFLICT (name) DO NOTHING;

-- Índices
CREATE INDEX IF NOT EXISTS idx_cash_movements_is_touristic ON cash_movements(is_touristic);
CREATE INDEX IF NOT EXISTS idx_cash_movements_category ON cash_movements(movement_category) WHERE is_touristic = false;
CREATE INDEX IF NOT EXISTS idx_non_touristic_categories_type ON non_touristic_categories(category_type);
CREATE INDEX IF NOT EXISTS idx_non_touristic_categories_is_active ON non_touristic_categories(is_active) WHERE is_active = true;

-- Comentarios
COMMENT ON COLUMN cash_movements.is_touristic IS 'Indica si el movimiento está relacionado con operaciones turísticas';
COMMENT ON COLUMN cash_movements.movement_category IS 'Categoría del movimiento (solo para no turísticos)';
COMMENT ON TABLE non_touristic_categories IS 'Categorías predefinidas para movimientos no turísticos';



