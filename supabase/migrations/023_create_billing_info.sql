-- =====================================================
-- FASE 3: FACTURACIÓN Y DATOS DE CLIENTES
-- Migración 023: Crear tabla billing_info
-- =====================================================
-- Permite facturar a nombre de terceros (familiares, empresas, etc.)

CREATE TABLE IF NOT EXISTS billing_info (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relación con operación o cotización
  operation_id UUID REFERENCES operations(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
  
  -- Tipo de facturación
  billing_type TEXT NOT NULL CHECK (billing_type IN ('CUSTOMER', 'THIRD_PARTY', 'COMPANY')),
  
  -- Datos de la empresa (si aplica)
  company_name TEXT,
  tax_id TEXT, -- CUIT/CUIL
  
  -- Datos personales
  first_name TEXT,
  last_name TEXT,
  
  -- Dirección
  address TEXT,
  city TEXT,
  postal_code TEXT,
  
  -- Contacto
  phone TEXT,
  email TEXT,
  
  -- Notas
  notes TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: debe tener operation_id o quotation_id, pero no ambos
  CONSTRAINT billing_info_relation_check CHECK (
    (operation_id IS NOT NULL AND quotation_id IS NULL) OR
    (operation_id IS NULL AND quotation_id IS NOT NULL)
  )
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_billing_info_operation ON billing_info(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_info_quotation ON billing_info(quotation_id) WHERE quotation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_info_type ON billing_info(billing_type);

-- Comentarios
COMMENT ON TABLE billing_info IS 'Información de facturación para operaciones y cotizaciones. Permite facturar a terceros.';
COMMENT ON COLUMN billing_info.billing_type IS 'Tipo: CUSTOMER (cliente principal), THIRD_PARTY (tercero), COMPANY (empresa)';

