-- =====================================================
-- FASE 3: FACTURACIÓN Y DATOS DE CLIENTES
-- Migración 024: Crear tabla operation_passengers
-- =====================================================
-- Sistema de múltiples pasajeros con datos completos

CREATE TABLE IF NOT EXISTS operation_passengers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  
  -- Número de pasajero (1, 2, 3...)
  passenger_number INTEGER NOT NULL,
  
  -- Datos personales
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  nationality TEXT,
  
  -- Documentación
  document_type TEXT CHECK (document_type IN ('DNI', 'PASSPORT', 'LC', 'LE')),
  document_number TEXT,
  
  -- Relaciones
  is_main_passenger BOOLEAN DEFAULT false,
  billing_info_id UUID REFERENCES billing_info(id) ON DELETE SET NULL,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: un solo pasajero principal por operación
  CONSTRAINT unique_main_passenger UNIQUE (operation_id, is_main_passenger) DEFERRABLE INITIALLY DEFERRED,
  -- Constraint: passenger_number único por operación
  CONSTRAINT unique_passenger_number UNIQUE (operation_id, passenger_number)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_operation_passengers_operation ON operation_passengers(operation_id);
CREATE INDEX IF NOT EXISTS idx_operation_passengers_main ON operation_passengers(operation_id, is_main_passenger);

-- Comentarios
COMMENT ON TABLE operation_passengers IS 'Pasajeros de una operación con datos completos';
COMMENT ON COLUMN operation_passengers.passenger_number IS 'Número de orden del pasajero (1, 2, 3...)';
COMMENT ON COLUMN operation_passengers.is_main_passenger IS 'Indica si es el pasajero principal (solo uno por operación)';

