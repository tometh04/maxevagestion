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

