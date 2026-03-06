-- =====================================================
-- Migración 106: Crear tabla operation_services
-- Servicios adicionales asociados a una operación
-- (asiento, transfer, visa, etc.)
-- =====================================================

CREATE TABLE IF NOT EXISTS operation_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,

  -- Tipo de servicio
  service_type TEXT NOT NULL CHECK (service_type IN (
    'SEAT',       -- Asiento / Butaca
    'LUGGAGE',    -- Equipaje
    'VISA',       -- Visado
    'TRANSFER',   -- Traslado/Transfer
    'ASSISTANCE'  -- Asistencia al viajero
  )),

  -- Nombre/descripción opcional
  name TEXT,

  -- Financiero
  price NUMERIC(18,2) NOT NULL DEFAULT 0,   -- Precio al cliente
  cost  NUMERIC(18,2) NOT NULL DEFAULT 0,   -- Costo al proveedor
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('ARS', 'USD')),

  -- Si este servicio genera comisión al vendedor
  generates_commission BOOLEAN NOT NULL DEFAULT false,

  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_operation_services_operation ON operation_services(operation_id);
CREATE INDEX IF NOT EXISTS idx_operation_services_type ON operation_services(service_type);

COMMENT ON TABLE operation_services IS 'Servicios adicionales (asiento, transfer, visa, etc.) asociados a una operación';
