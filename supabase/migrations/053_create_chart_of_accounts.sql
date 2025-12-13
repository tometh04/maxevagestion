-- =====================================================
-- Migración 053: Crear Plan de Cuentas Contable
-- Estructura contable estándar con categorización por rubros
-- =====================================================

-- Tabla de Plan de Cuentas
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Código de cuenta (ej: "1.1.01", "2.1.01")
  account_code TEXT NOT NULL UNIQUE,
  
  -- Nombre de la cuenta
  account_name TEXT NOT NULL,
  
  -- Rubro principal: ACTIVO, PASIVO, PATRIMONIO_NETO, RESULTADO
  category TEXT NOT NULL CHECK (category IN ('ACTIVO', 'PASIVO', 'PATRIMONIO_NETO', 'RESULTADO')),
  
  -- Subcategoría dentro del rubro
  -- ACTIVO: CORRIENTE, NO_CORRIENTE
  -- PASIVO: CORRIENTE, NO_CORRIENTE
  -- PATRIMONIO_NETO: CAPITAL, RESERVAS, RESULTADOS
  -- RESULTADO: INGRESOS, EGRESOS, COSTOS, GASTOS
  subcategory TEXT,
  
  -- Tipo de cuenta específica
  account_type TEXT, -- 'CAJA', 'BANCO', 'CUENTAS_POR_COBRAR', 'CUENTAS_POR_PAGAR', 'VENTAS', 'COSTOS', etc.
  
  -- Nivel de jerarquía (1 = principal, 2 = subcuenta, etc.)
  level INTEGER NOT NULL DEFAULT 1,
  
  -- Cuenta padre (para jerarquías)
  parent_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  
  -- Si es cuenta de movimiento (true) o de saldo (false)
  is_movement_account BOOLEAN DEFAULT false,
  
  -- Si está activa
  is_active BOOLEAN DEFAULT true,
  
  -- Orden de visualización
  display_order INTEGER DEFAULT 0,
  
  -- Descripción
  description TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_category ON chart_of_accounts(category);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_code ON chart_of_accounts(account_code);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent ON chart_of_accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_active ON chart_of_accounts(is_active);

-- Comentarios
COMMENT ON TABLE chart_of_accounts IS 'Plan de cuentas contable estándar. Define la estructura contable con categorización por rubros.';
COMMENT ON COLUMN chart_of_accounts.account_code IS 'Código único de la cuenta (ej: "1.1.01")';
COMMENT ON COLUMN chart_of_accounts.category IS 'Rubro principal: ACTIVO, PASIVO, PATRIMONIO_NETO, RESULTADO';
COMMENT ON COLUMN chart_of_accounts.is_movement_account IS 'Si es true, la cuenta registra movimientos. Si es false, es una cuenta de saldo/resumen.';

-- Agregar columna chart_account_id a financial_accounts para relacionar con plan de cuentas
ALTER TABLE financial_accounts 
ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_accounts_chart_account ON financial_accounts(chart_account_id);

-- Insertar estructura básica del Plan de Cuentas
-- ACTIVOS
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, is_movement_account, display_order, description) VALUES
-- ACTIVO CORRIENTE
('1.1', 'ACTIVO CORRIENTE', 'ACTIVO', 'CORRIENTE', NULL, 1, false, 1, 'Activos que se espera convertir en efectivo en menos de un año'),
('1.1.01', 'Caja', 'ACTIVO', 'CORRIENTE', 'CAJA', 2, true, 1, 'Efectivo en caja'),
('1.1.02', 'Bancos', 'ACTIVO', 'CORRIENTE', 'BANCO', 2, true, 2, 'Cuentas bancarias'),
('1.1.03', 'Cuentas por Cobrar', 'ACTIVO', 'CORRIENTE', 'CUENTAS_POR_COBRAR', 2, true, 3, 'Deudas de clientes'),
('1.1.04', 'Mercado Pago', 'ACTIVO', 'CORRIENTE', 'MERCADO_PAGO', 2, true, 4, 'Saldo en Mercado Pago'),
('1.1.05', 'Activos en Stock', 'ACTIVO', 'CORRIENTE', 'ACTIVOS_STOCK', 2, true, 5, 'Vouchers, cupos, hoteles en stock'),

-- ACTIVO NO CORRIENTE
('1.2', 'ACTIVO NO CORRIENTE', 'ACTIVO', 'NO_CORRIENTE', NULL, 1, false, 2, 'Activos a largo plazo'),
('1.2.01', 'Inversiones', 'ACTIVO', 'NO_CORRIENTE', 'INVERSIONES', 2, true, 1, 'Inversiones a largo plazo'),

-- PASIVO
('2.1', 'PASIVO CORRIENTE', 'PASIVO', 'CORRIENTE', NULL, 1, false, 1, 'Obligaciones a pagar en menos de un año'),
('2.1.01', 'Cuentas por Pagar', 'PASIVO', 'CORRIENTE', 'CUENTAS_POR_PAGAR', 2, true, 1, 'Deudas con operadores y proveedores'),
('2.1.02', 'IVA a Pagar', 'PASIVO', 'CORRIENTE', 'IVA_PAGAR', 2, true, 2, 'IVA pendiente de pago'),
('2.1.03', 'Sueldos a Pagar', 'PASIVO', 'CORRIENTE', 'SUELDOS_PAGAR', 2, true, 3, 'Sueldos pendientes de pago'),

('2.2', 'PASIVO NO CORRIENTE', 'PASIVO', 'NO_CORRIENTE', NULL, 1, false, 2, 'Obligaciones a largo plazo'),
('2.2.01', 'Préstamos a Largo Plazo', 'PASIVO', 'NO_CORRIENTE', 'PRESTAMOS', 2, true, 1, 'Préstamos bancarios a largo plazo'),

-- PATRIMONIO NETO
('3.1', 'PATRIMONIO NETO', 'PATRIMONIO_NETO', NULL, NULL, 1, false, 1, 'Capital y reservas'),
('3.1.01', 'Capital Social', 'PATRIMONIO_NETO', 'CAPITAL', 'CAPITAL_SOCIAL', 2, true, 1, 'Capital aportado por socios'),
('3.1.02', 'Reservas', 'PATRIMONIO_NETO', 'RESERVAS', 'RESERVAS', 2, true, 2, 'Reservas legales y voluntarias'),
('3.1.03', 'Resultados Acumulados', 'PATRIMONIO_NETO', 'RESULTADOS', 'RESULTADOS_ACUMULADOS', 2, true, 3, 'Ganancias retenidas'),

-- RESULTADO
('4.1', 'INGRESOS', 'RESULTADO', 'INGRESOS', NULL, 1, false, 1, 'Ingresos del negocio'),
('4.1.01', 'Ventas de Viajes', 'RESULTADO', 'INGRESOS', 'VENTAS', 2, true, 1, 'Ingresos por venta de paquetes turísticos'),
('4.1.02', 'Otros Ingresos', 'RESULTADO', 'INGRESOS', 'OTROS_INGRESOS', 2, true, 2, 'Ingresos no operativos'),

('4.2', 'COSTOS', 'RESULTADO', 'COSTOS', NULL, 1, false, 2, 'Costos directos'),
('4.2.01', 'Costo de Operadores', 'RESULTADO', 'COSTOS', 'COSTO_OPERADORES', 2, true, 1, 'Costo de servicios de operadores'),
('4.2.02', 'Otros Costos', 'RESULTADO', 'COSTOS', 'OTROS_COSTOS', 2, true, 2, 'Otros costos directos'),

('4.3', 'GASTOS', 'RESULTADO', 'GASTOS', NULL, 1, false, 3, 'Gastos operativos'),
('4.3.01', 'Gastos Administrativos', 'RESULTADO', 'GASTOS', 'GASTOS_ADMIN', 2, true, 1, 'Gastos de administración'),
('4.3.02', 'Gastos de Comercialización', 'RESULTADO', 'GASTOS', 'GASTOS_COMERC', 2, true, 2, 'Gastos de marketing y ventas'),
('4.3.03', 'Comisiones de Vendedores', 'RESULTADO', 'GASTOS', 'COMISIONES', 2, true, 3, 'Comisiones pagadas a vendedores'),
('4.3.04', 'Gastos Financieros', 'RESULTADO', 'GASTOS', 'GASTOS_FINANCIEROS', 2, true, 4, 'Intereses y gastos financieros')
ON CONFLICT (account_code) DO NOTHING;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_chart_of_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_chart_of_accounts_updated_at
  BEFORE UPDATE ON chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_chart_of_accounts_updated_at();

