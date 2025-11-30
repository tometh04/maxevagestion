-- =====================================================
-- FASE 2: EXTENSIÓN DE TABLAS Y CAMPOS
-- Migración 007: Agregar campos contables a leads
-- =====================================================
-- Campos para manejar depósitos y precios cotizados en leads

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS quoted_price NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS has_deposit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS deposit_currency TEXT CHECK (deposit_currency IN ('ARS', 'USD')),
  ADD COLUMN IF NOT EXISTS deposit_method TEXT,
  ADD COLUMN IF NOT EXISTS deposit_date DATE;

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_leads_quoted_price ON leads(quoted_price) WHERE quoted_price IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_has_deposit ON leads(has_deposit) WHERE has_deposit = true;
CREATE INDEX IF NOT EXISTS idx_leads_deposit_date ON leads(deposit_date) WHERE deposit_date IS NOT NULL;

-- Comentarios para documentación
COMMENT ON COLUMN leads.quoted_price IS 'Precio cotizado al cliente para este lead';
COMMENT ON COLUMN leads.has_deposit IS 'Indica si el lead tiene un depósito recibido';
COMMENT ON COLUMN leads.deposit_amount IS 'Monto del depósito recibido';
COMMENT ON COLUMN leads.deposit_currency IS 'Moneda del depósito (ARS o USD)';
COMMENT ON COLUMN leads.deposit_method IS 'Método de pago del depósito (CASH, BANK, MP, etc.)';
COMMENT ON COLUMN leads.deposit_date IS 'Fecha en que se recibió el depósito';

