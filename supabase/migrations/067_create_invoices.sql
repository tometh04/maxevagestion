-- =====================================================
-- Migración 067: Crear tablas de Facturación
-- Sistema de facturación electrónica con AFIP
-- =====================================================

-- Tabla de facturas
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Datos AFIP
  cbte_tipo INTEGER NOT NULL, -- Tipo de comprobante (1=Fact A, 6=Fact B, 11=Fact C, etc)
  pto_vta INTEGER NOT NULL, -- Punto de venta
  cbte_nro INTEGER, -- Número de comprobante (asignado por AFIP)
  cae TEXT, -- Código de Autorización Electrónico
  cae_fch_vto TEXT, -- Fecha vencimiento CAE (YYYYMMDD)
  
  -- Datos del receptor
  receptor_doc_tipo INTEGER NOT NULL DEFAULT 80, -- Tipo documento (80=CUIT, 96=DNI, etc)
  receptor_doc_nro TEXT NOT NULL, -- Número de documento
  receptor_nombre TEXT NOT NULL, -- Nombre o razón social
  receptor_domicilio TEXT, -- Domicilio
  receptor_condicion_iva INTEGER, -- Condición frente al IVA
  
  -- Montos
  imp_neto NUMERIC(18,2) NOT NULL DEFAULT 0, -- Importe neto gravado
  imp_iva NUMERIC(18,2) NOT NULL DEFAULT 0, -- Importe IVA
  imp_total NUMERIC(18,2) NOT NULL DEFAULT 0, -- Importe total
  imp_tot_conc NUMERIC(18,2) DEFAULT 0, -- No gravado
  imp_op_ex NUMERIC(18,2) DEFAULT 0, -- Exento
  imp_trib NUMERIC(18,2) DEFAULT 0, -- Tributos
  
  -- Moneda
  moneda TEXT DEFAULT 'PES', -- PES, DOL, etc
  cotizacion NUMERIC(18,4) DEFAULT 1, -- Cotización
  
  -- Concepto
  concepto INTEGER DEFAULT 1, -- 1=Productos, 2=Servicios, 3=Ambos
  fch_serv_desde TEXT, -- Fecha desde servicio (YYYYMMDD)
  fch_serv_hasta TEXT, -- Fecha hasta servicio (YYYYMMDD)
  
  -- Estado y fechas
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'sent', 'authorized', 'rejected', 'cancelled')),
  fecha_emision DATE,
  fecha_vto_pago DATE,
  
  -- Metadata
  afip_response JSONB, -- Respuesta completa de AFIP
  pdf_url TEXT, -- URL del PDF generado
  notes TEXT, -- Notas internas
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Tabla de items de factura
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  -- Descripción
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(18,4) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(18,2) NOT NULL,
  subtotal NUMERIC(18,2) NOT NULL, -- cantidad * precio_unitario
  
  -- IVA
  iva_id INTEGER NOT NULL DEFAULT 5, -- 5=21%, 4=10.5%, 3=0%, etc
  iva_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 21,
  iva_importe NUMERIC(18,2) NOT NULL DEFAULT 0,
  
  -- Total
  total NUMERIC(18,2) NOT NULL, -- subtotal + iva_importe
  
  -- Orden
  orden INTEGER DEFAULT 0,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_invoices_agency ON invoices(agency_id);
CREATE INDEX IF NOT EXISTS idx_invoices_operation ON invoices(operation_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_fecha ON invoices(fecha_emision);
CREATE INDEX IF NOT EXISTS idx_invoices_cbte ON invoices(pto_vta, cbte_tipo, cbte_nro);
CREATE INDEX IF NOT EXISTS idx_invoices_cae ON invoices(cae);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- Comentarios
COMMENT ON TABLE invoices IS 'Facturas electrónicas AFIP';
COMMENT ON COLUMN invoices.cbte_tipo IS 'Tipo de comprobante AFIP (1=Fact A, 6=Fact B, 11=Fact C, 19=Fact E)';
COMMENT ON COLUMN invoices.cae IS 'Código de Autorización Electrónico de AFIP';
COMMENT ON COLUMN invoices.status IS 'Estado: draft, pending, sent, authorized, rejected, cancelled';

-- RLS (Row Level Security)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view invoices for their agencies" ON invoices;
DROP POLICY IF EXISTS "Users can create invoices for their agencies" ON invoices;
DROP POLICY IF EXISTS "Users can update invoices for their agencies" ON invoices;
DROP POLICY IF EXISTS "Users can view invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Users can manage invoice items" ON invoice_items;

-- Política: Usuarios pueden ver facturas de sus agencias
CREATE POLICY "Users can view invoices for their agencies"
  ON invoices
  FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- Política: Usuarios pueden crear facturas para sus agencias
CREATE POLICY "Users can create invoices for their agencies"
  ON invoices
  FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- Política: Usuarios pueden actualizar facturas de sus agencias
CREATE POLICY "Users can update invoices for their agencies"
  ON invoices
  FOR UPDATE
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- Política: Usuarios pueden ver items de facturas que pueden ver
CREATE POLICY "Users can view invoice items"
  ON invoice_items
  FOR SELECT
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
  );

-- Política: Usuarios pueden gestionar items de facturas de sus agencias
CREATE POLICY "Users can manage invoice items"
  ON invoice_items
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
  );

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_invoice_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_invoice_updated_at ON invoices;
CREATE TRIGGER trigger_update_invoice_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_updated_at();
