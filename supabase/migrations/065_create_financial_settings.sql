-- =====================================================
-- Migración 065: Crear Configuración Financiera
-- Sistema de configuración para el módulo financiero
-- =====================================================

-- Tabla de configuración financiera (una por agencia)
CREATE TABLE IF NOT EXISTS financial_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Configuración de monedas y tipos de cambio
  -- Moneda principal del sistema
  primary_currency TEXT DEFAULT 'ARS' CHECK (primary_currency IN ('ARS', 'USD')),
  
  -- Monedas habilitadas (JSON array)
  -- Ejemplo: ["ARS", "USD"]
  enabled_currencies JSONB DEFAULT '["ARS", "USD"]'::jsonb,
  
  -- Fuente de tipos de cambio (JSON object)
  -- Ejemplo: {"source": "manual", "auto_update": false, "update_frequency": "daily"}
  exchange_rate_config JSONB DEFAULT '{"source": "manual", "auto_update": false}'::jsonb,
  
  -- Tipo de cambio por defecto USD/ARS (si es manual)
  default_usd_rate NUMERIC(18,4) DEFAULT 1000.00,
  
  -- Configuración de cuentas financieras
  -- Cuentas por defecto a usar (JSON object)
  -- Ejemplo: {"cash_ars": "uuid", "bank_ars": "uuid", "mp_ars": "uuid"}
  default_accounts JSONB DEFAULT '{}'::jsonb,
  
  -- Auto-crear cuenta si no existe
  auto_create_accounts BOOLEAN DEFAULT false,
  
  -- Configuración de métodos de pago
  -- Métodos habilitados (JSON array)
  -- Ejemplo: ["CASH", "BANK", "MP", "CREDIT_CARD"]
  enabled_payment_methods JSONB DEFAULT '["CASH", "BANK", "MP"]'::jsonb,
  
  -- Configuración de comisiones
  -- Reglas de comisión por defecto (JSON object)
  -- Ejemplo: {"seller_percentage": 10, "agency_percentage": 5}
  default_commission_rules JSONB DEFAULT '{}'::jsonb,
  
  -- Auto-calcular comisiones
  auto_calculate_commissions BOOLEAN DEFAULT true,
  
  -- Configuración contable
  -- Auto-crear movimientos contables
  auto_create_ledger_entries BOOLEAN DEFAULT true,
  
  -- Auto-crear registros IVA
  auto_create_iva_entries BOOLEAN DEFAULT true,
  
  -- Auto-crear pagos a operadores
  auto_create_operator_payments BOOLEAN DEFAULT true,
  
  -- Cuenta contable por defecto para ingresos
  default_income_chart_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  
  -- Cuenta contable por defecto para gastos
  default_expense_chart_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  
  -- Configuración de facturación
  -- Auto-generar facturas
  auto_generate_invoices BOOLEAN DEFAULT false,
  
  -- Punto de venta por defecto (para AFIP)
  default_point_of_sale INTEGER DEFAULT 1,
  
  -- Configuración de reportes
  -- Fecha de cierre mensual (día del mes)
  monthly_close_day INTEGER DEFAULT 1,
  
  -- Auto-cerrar mes
  auto_close_month BOOLEAN DEFAULT false,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  UNIQUE(agency_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_financial_settings_agency ON financial_settings(agency_id);

-- Comentarios
COMMENT ON TABLE financial_settings IS 'Configuración del módulo financiero por agencia';
COMMENT ON COLUMN financial_settings.enabled_currencies IS 'Monedas habilitadas en el sistema';
COMMENT ON COLUMN financial_settings.exchange_rate_config IS 'Configuración de fuente y actualización de tipos de cambio';
COMMENT ON COLUMN financial_settings.default_accounts IS 'Cuentas financieras por defecto por tipo';
COMMENT ON COLUMN financial_settings.enabled_payment_methods IS 'Métodos de pago habilitados';
COMMENT ON COLUMN financial_settings.default_commission_rules IS 'Reglas de comisión por defecto';

-- RLS (Row Level Security)
ALTER TABLE financial_settings ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view financial settings for their agencies" ON financial_settings;
DROP POLICY IF EXISTS "Only admins can modify financial settings" ON financial_settings;

-- Política: Solo usuarios con acceso a finanzas pueden ver configuración
CREATE POLICY "Users can view financial settings for their agencies"
  ON financial_settings
  FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- Política: Solo ADMIN y SUPER_ADMIN pueden modificar configuración
CREATE POLICY "Only admins can modify financial settings"
  ON financial_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );
