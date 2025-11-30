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

