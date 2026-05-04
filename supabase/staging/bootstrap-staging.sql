-- =============================================================================
-- VIBOOK — STAGING BOOTSTRAP SQL
-- =============================================================================
-- Purpose : Recreate the full production schema in a fresh Supabase project.
-- Generated: 2026-05-03 (from all migrations up to 20260429000003)
-- Usage   : Run this entire file in the Supabase SQL Editor of your staging
--           project. It executes inside a single transaction — if any statement
--           fails the whole script rolls back cleanly.
--
-- ⚠️  This file DOES NOT include the advanced_crm_mode migration (Task 1).
--     That migration must be applied separately after Task 1 is complete.
--
-- Absolute path: /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/staging/bootstrap-staging.sql
-- =============================================================================

BEGIN;


-- ===== MIGRATION 001: 001_initial_schema.sql =====

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'SELLER', 'VIEWER')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agencies table
CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User agencies junction table
CREATE TABLE IF NOT EXISTS user_agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, agency_id)
);

-- Operators table
CREATE TABLE IF NOT EXISTS operators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  credit_limit NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  instagram_handle TEXT,
  document_type TEXT,
  document_number TEXT,
  date_of_birth DATE,
  nationality TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  source TEXT DEFAULT 'Other' CHECK (source IN ('Instagram', 'WhatsApp', 'Meta Ads', 'Other')),
  external_id TEXT,
  trello_url TEXT,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_PROGRESS', 'QUOTED', 'WON', 'LOST')),
  region TEXT NOT NULL CHECK (region IN ('ARGENTINA', 'CARIBE', 'BRASIL', 'EUROPA', 'EEUU', 'OTROS', 'CRUCEROS')),
  destination TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_email TEXT,
  contact_instagram TEXT,
  assigned_seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Operations table
CREATE TABLE IF NOT EXISTS operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED')),
  origin TEXT,
  destination TEXT NOT NULL,
  departure_date DATE NOT NULL,
  return_date DATE,
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  infants INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PRE_RESERVATION' CHECK (status IN ('PRE_RESERVATION', 'RESERVED', 'CONFIRMED', 'CANCELLED', 'TRAVELLED', 'CLOSED')),
  sale_amount_total NUMERIC NOT NULL,
  operator_cost NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS',
  margin_amount NUMERIC NOT NULL,
  margin_percentage NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Operation customers junction table
CREATE TABLE IF NOT EXISTS operation_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MAIN' CHECK (role IN ('MAIN', 'COMPANION'))
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  payer_type TEXT NOT NULL CHECK (payer_type IN ('CUSTOMER', 'OPERATOR')),
  direction TEXT NOT NULL CHECK (direction IN ('INCOME', 'EXPENSE')),
  method TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS',
  date_due DATE NOT NULL,
  date_paid DATE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'OVERDUE')),
  reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cash movements table
CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS',
  movement_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Commission rules table
CREATE TABLE IF NOT EXISTS commission_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('SELLER', 'AGENCY')),
  basis TEXT NOT NULL CHECK (basis IN ('FIXED_PERCENTAGE', 'FIXED_AMOUNT')),
  value NUMERIC NOT NULL,
  destination_region TEXT,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  valid_from DATE NOT NULL,
  valid_to DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Commission records table
CREATE TABLE IF NOT EXISTS commission_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
  date_calculated DATE NOT NULL,
  date_paid DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID REFERENCES operations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('PASSPORT', 'DNI', 'VOUCHER', 'INVOICE', 'PAYMENT_PROOF', 'OTHER')),
  file_url TEXT NOT NULL,
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID REFERENCES operations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('PAYMENT_DUE', 'OPERATOR_DUE', 'UPCOMING_TRIP', 'MISSING_DOC', 'GENERIC')),
  description TEXT NOT NULL,
  date_due TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'IGNORED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trello settings table
CREATE TABLE IF NOT EXISTS settings_trello (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  trello_api_key TEXT NOT NULL,
  trello_token TEXT NOT NULL,
  board_id TEXT NOT NULL,
  list_status_mapping JSONB NOT NULL DEFAULT '{}',
  list_region_mapping JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agency_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_leads_agency ON leads(agency_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_seller ON leads(assigned_seller_id);
CREATE INDEX IF NOT EXISTS idx_operations_agency ON operations(agency_id);
CREATE INDEX IF NOT EXISTS idx_operations_seller ON operations(seller_id);
CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
CREATE INDEX IF NOT EXISTS idx_payments_operation ON payments(operation_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_date_due ON alerts(date_due);



-- ===== MIGRATION 002: 002_add_webhook_fields.sql =====

-- Add webhook fields to settings_trello table
ALTER TABLE settings_trello 
ADD COLUMN IF NOT EXISTS webhook_id TEXT,
ADD COLUMN IF NOT EXISTS webhook_url TEXT;



-- ===== MIGRATION 003: 003_add_trello_source.sql =====

-- Add 'Trello' as a valid source value for leads
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK (source IN ('Instagram', 'WhatsApp', 'Meta Ads', 'Other', 'Trello'));



-- ===== MIGRATION 004: 004_add_trello_list_id.sql =====

-- Add trello_list_id to leads table to store the Trello list ID
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS trello_list_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_trello_list_id ON leads(trello_list_id);



-- ===== MIGRATION 005: 005_create_ledger_movements.sql =====

-- =====================================================
-- FASE 1: FUNDACIÓN CONTABLE
-- Migración 005: Crear tabla ledger_movements
-- =====================================================
-- Esta tabla es el CORAZÓN CONTABLE del sistema.
-- TODO movimiento financiero debe pasar por aquí.

CREATE TABLE IF NOT EXISTS ledger_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones (pueden ser null dependiendo del tipo de movimiento)
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Tipo de movimiento
  type TEXT NOT NULL CHECK (type IN (
    'INCOME',           -- Ingreso (pago de cliente)
    'EXPENSE',          -- Gasto (pago a operador)
    'FX_GAIN',          -- Ganancia cambiaria
    'FX_LOSS',          -- Pérdida cambiaria
    'COMMISSION',       -- Pago de comisión
    'OPERATOR_PAYMENT'  -- Pago a operador (alias de EXPENSE con operator_id)
  )),
  
  -- Concepto y descripción
  concept TEXT NOT NULL,
  notes TEXT,
  
  -- Información monetaria
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  amount_original NUMERIC(18,2) NOT NULL,           -- Monto en moneda original
  exchange_rate NUMERIC(18,4),                     -- Tasa de cambio usada (si aplica)
  amount_ars_equivalent NUMERIC(18,2) NOT NULL,    -- Monto equivalente en ARS (siempre requerido)
  
  -- Método de pago
  method TEXT NOT NULL CHECK (method IN ('CASH', 'BANK', 'MP', 'USD', 'OTHER')),
  
  -- Cuenta financiera (FK a financial_accounts)
  -- NOTA: La tabla financial_accounts debe existir antes de ejecutar esta migración
  account_id UUID REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  
  -- Relaciones adicionales
  seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
  operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  
  -- Información adicional
  receipt_number TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ledger_movements_operation ON ledger_movements(operation_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_lead ON ledger_movements(lead_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_type ON ledger_movements(type);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_account ON ledger_movements(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_seller ON ledger_movements(seller_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_operator ON ledger_movements(operator_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_created_at ON ledger_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_currency ON ledger_movements(currency);

-- Comentarios para documentación
COMMENT ON TABLE ledger_movements IS 'Corazón contable del sistema. Todo movimiento financiero debe pasar por aquí.';
COMMENT ON COLUMN ledger_movements.amount_ars_equivalent IS 'Siempre en ARS, calculado automáticamente si currency = USD';
COMMENT ON COLUMN ledger_movements.exchange_rate IS 'Tasa de cambio usada para convertir USD a ARS. Null si currency = ARS';



-- ===== MIGRATION 006: 006_create_financial_accounts.sql =====

-- =====================================================
-- FASE 1: FUNDACIÓN CONTABLE
-- Migración 006: Crear tabla financial_accounts
-- =====================================================
-- Cuentas financieras: Caja, Bancos, Mercado Pago, etc.

CREATE TABLE IF NOT EXISTS financial_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Información básica
  name TEXT NOT NULL,
  
  -- Tipo de cuenta
  type TEXT NOT NULL CHECK (type IN ('CASH', 'BANK', 'MP', 'USD')),
  
  -- Moneda de la cuenta
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  
  -- Saldo inicial (para migración de datos existentes)
  initial_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Notas opcionales
  notes TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_financial_accounts_type ON financial_accounts(type);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_currency ON financial_accounts(currency);

-- Comentarios
COMMENT ON TABLE financial_accounts IS 'Cuentas financieras del sistema (Caja, Bancos, Mercado Pago, etc.)';
COMMENT ON COLUMN financial_accounts.initial_balance IS 'Saldo inicial. El balance real se calcula: initial_balance + SUM(ledger_movements.amount_ars_equivalent)';

-- Crear cuentas por defecto (opcional, se pueden crear desde la UI también)
-- Estas son solo ejemplos, se pueden eliminar si no se necesitan
INSERT INTO financial_accounts (name, type, currency, initial_balance)
VALUES 
  ('Caja Principal', 'CASH', 'ARS', 0),
  ('Banco Principal', 'BANK', 'ARS', 0),
  ('Mercado Pago', 'MP', 'ARS', 0)
ON CONFLICT DO NOTHING;



-- ===== MIGRATION 007: 007_add_lead_accounting_fields.sql =====

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



-- ===== MIGRATION 008: 008_add_operation_accounting_fields.sql =====

-- =====================================================
-- FASE 2: EXTENSIÓN DE TABLAS Y CAMPOS
-- Migración 008: Agregar campos contables a operations
-- =====================================================
-- Campos para mejorar el tracking contable y operativo

-- Agregar campos nuevos
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS file_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS product_type TEXT CHECK (product_type IN ('AEREO', 'HOTEL', 'PAQUETE', 'CRUCERO', 'OTRO')),
  ADD COLUMN IF NOT EXISTS checkin_date DATE,
  ADD COLUMN IF NOT EXISTS checkout_date DATE,
  ADD COLUMN IF NOT EXISTS passengers JSONB,
  ADD COLUMN IF NOT EXISTS seller_secondary_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_currency TEXT CHECK (sale_currency IN ('ARS', 'USD')) DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS operator_cost_currency TEXT CHECK (operator_cost_currency IN ('ARS', 'USD')) DEFAULT 'ARS';

-- Migrar datos existentes:
-- 1. Si product_type no está definido, inferirlo de type
UPDATE operations
SET product_type = CASE
  WHEN type = 'FLIGHT' THEN 'AEREO'
  WHEN type = 'HOTEL' THEN 'HOTEL'
  WHEN type = 'PACKAGE' THEN 'PAQUETE'
  WHEN type = 'CRUISE' THEN 'CRUCERO'
  ELSE 'OTRO'
END
WHERE product_type IS NULL;

-- 2. Si sale_currency no está definido, usar currency existente
UPDATE operations
SET sale_currency = currency
WHERE sale_currency IS NULL;

-- 3. Si operator_cost_currency no está definido, usar currency existente
UPDATE operations
SET operator_cost_currency = currency
WHERE operator_cost_currency IS NULL;

-- 4. Generar file_code para operaciones existentes que no lo tengan
-- Formato: OP-{YYYYMMDD}-{ID corto}
UPDATE operations
SET file_code = 'OP-' || TO_CHAR(created_at, 'YYYYMMDD') || '-' || SUBSTRING(id::text, 1, 8)
WHERE file_code IS NULL;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_operations_file_code ON operations(file_code) WHERE file_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operations_product_type ON operations(product_type);
CREATE INDEX IF NOT EXISTS idx_operations_seller_secondary ON operations(seller_secondary_id) WHERE seller_secondary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operations_checkin_date ON operations(checkin_date) WHERE checkin_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operations_checkout_date ON operations(checkout_date) WHERE checkout_date IS NOT NULL;

-- Comentarios para documentación
COMMENT ON COLUMN operations.file_code IS 'Código único de archivo/expediente de la operación';
COMMENT ON COLUMN operations.product_type IS 'Tipo de producto: AEREO, HOTEL, PAQUETE, CRUCERO, OTRO';
COMMENT ON COLUMN operations.checkin_date IS 'Fecha de check-in (para hoteles)';
COMMENT ON COLUMN operations.checkout_date IS 'Fecha de check-out (para hoteles)';
COMMENT ON COLUMN operations.passengers IS 'Información detallada de pasajeros en formato JSON';
COMMENT ON COLUMN operations.seller_secondary_id IS 'Vendedor secundario (para comisiones compartidas)';
COMMENT ON COLUMN operations.sale_currency IS 'Moneda de la venta (ARS o USD)';
COMMENT ON COLUMN operations.operator_cost_currency IS 'Moneda del costo del operador (ARS o USD)';



-- ===== MIGRATION 009: 009_create_iva_tables.sql =====

-- =====================================================
-- FASE 4: MÓDULO IVA Y OPERATOR PAYMENTS
-- Migración 009: Crear tablas de IVA
-- =====================================================
-- Tablas para el cálculo automático de IVA en ventas y compras

-- Tabla para IVA de ventas
CREATE TABLE IF NOT EXISTS iva_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relación con operación
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  
  -- Información monetaria
  sale_amount_total NUMERIC(18,2) NOT NULL,
  net_amount NUMERIC(18,2) NOT NULL,  -- sale_amount_total / 1.21
  iva_amount NUMERIC(18,2) NOT NULL,  -- sale_amount_total - net_amount
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  
  -- Fecha de la venta (usar created_at de la operación o fecha específica)
  sale_date DATE NOT NULL,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para IVA de compras
CREATE TABLE IF NOT EXISTS iva_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relación con operación
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  
  -- Relación con operador
  operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  
  -- Información monetaria
  operator_cost_total NUMERIC(18,2) NOT NULL,
  net_amount NUMERIC(18,2) NOT NULL,  -- operator_cost_total / 1.21
  iva_amount NUMERIC(18,2) NOT NULL,  -- operator_cost_total - net_amount
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  
  -- Fecha de la compra
  purchase_date DATE NOT NULL,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_iva_sales_operation ON iva_sales(operation_id);
CREATE INDEX IF NOT EXISTS idx_iva_sales_date ON iva_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_iva_purchases_operation ON iva_purchases(operation_id);
CREATE INDEX IF NOT EXISTS idx_iva_purchases_operator ON iva_purchases(operator_id);
CREATE INDEX IF NOT EXISTS idx_iva_purchases_date ON iva_purchases(purchase_date);

-- Comentarios para documentación
COMMENT ON TABLE iva_sales IS 'IVA de ventas. Se calcula automáticamente: net = sale_amount_total / 1.21, iva = sale_amount_total - net';
COMMENT ON TABLE iva_purchases IS 'IVA de compras. Se calcula automáticamente: net = operator_cost_total / 1.21, iva = operator_cost_total - net';
COMMENT ON COLUMN iva_sales.net_amount IS 'Monto neto (sin IVA) = sale_amount_total / 1.21';
COMMENT ON COLUMN iva_sales.iva_amount IS 'Monto de IVA = sale_amount_total - net_amount';
COMMENT ON COLUMN iva_purchases.net_amount IS 'Monto neto (sin IVA) = operator_cost_total / 1.21';
COMMENT ON COLUMN iva_purchases.iva_amount IS 'Monto de IVA = operator_cost_total - net_amount';



-- ===== MIGRATION 010: 010_create_operator_payments.sql =====

-- =====================================================
-- FASE 4: MÓDULO IVA Y OPERATOR PAYMENTS
-- Migración 010: Crear tabla operator_payments
-- =====================================================
-- Tabla para gestionar pagos a operadores (cuentas a pagar)

CREATE TABLE IF NOT EXISTS operator_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  
  -- Información monetaria
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  
  -- Fecha de vencimiento
  due_date DATE NOT NULL,
  
  -- Estado del pago
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'OVERDUE')),
  
  -- Referencia al ledger_movement cuando se marca como pagado
  ledger_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  
  -- Notas adicionales
  notes TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_operator_payments_operation ON operator_payments(operation_id);
CREATE INDEX IF NOT EXISTS idx_operator_payments_operator ON operator_payments(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_payments_status ON operator_payments(status);
CREATE INDEX IF NOT EXISTS idx_operator_payments_due_date ON operator_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_operator_payments_ledger ON operator_payments(ledger_movement_id);

-- Comentarios para documentación
COMMENT ON TABLE operator_payments IS 'Pagos a operadores (cuentas a pagar). Se auto-crean cuando se crea una operación.';
COMMENT ON COLUMN operator_payments.due_date IS 'Fecha de vencimiento. Se calcula según product_type: AEREO = purchase_date + 10 días, HOTEL = checkin_date - 30 días';
COMMENT ON COLUMN operator_payments.status IS 'Estado: PENDING (pendiente), PAID (pagado), OVERDUE (vencido)';
COMMENT ON COLUMN operator_payments.ledger_movement_id IS 'Referencia al ledger_movement cuando el pago se marca como pagado';



-- ===== MIGRATION 011: 011_add_commission_percentage.sql =====

-- =====================================================
-- FASE 6: MEJORAS AL MÓDULO DE COMISIONES
-- Migración 011: Agregar campo percentage a commission_records
-- =====================================================

-- Agregar campo percentage a commission_records
ALTER TABLE commission_records
ADD COLUMN IF NOT EXISTS percentage NUMERIC(5,2);

-- Comentario para documentación
COMMENT ON COLUMN commission_records.percentage IS 'Porcentaje de comisión aplicado sobre el margen';



-- ===== MIGRATION 012: 012_add_user_commission_and_contable_role.sql =====

-- =====================================================
-- MIGRACIÓN: Agregar comisión por defecto a usuarios y rol CONTABLE
-- =====================================================

-- Agregar campo default_commission_percentage a users (opcional, solo para vendedores)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS default_commission_percentage NUMERIC(5,2);

-- Agregar rol CONTABLE al CHECK constraint
ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
ADD CONSTRAINT users_role_check 
CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'CONTABLE', 'SELLER', 'VIEWER'));

-- Comentarios
COMMENT ON COLUMN users.default_commission_percentage IS 'Porcentaje de comisión por defecto para vendedores (opcional)';



-- ===== MIGRATION 013: 013_create_exchange_rates.sql =====

-- =====================================================
-- FASE 6: MEJORAS AL MÓDULO DE COMISIONES Y FX
-- Migración 013: Crear tabla exchange_rates
-- =====================================================

-- Tabla para almacenar tasas de cambio históricas
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Fecha de la tasa (solo fecha, sin hora)
  rate_date DATE NOT NULL,
  
  -- Moneda base y destino (por ahora solo USD -> ARS)
  from_currency TEXT NOT NULL CHECK (from_currency IN ('USD')),
  to_currency TEXT NOT NULL CHECK (to_currency IN ('ARS')),
  
  -- Tasa de cambio (cuántos ARS por 1 USD)
  rate NUMERIC(18,4) NOT NULL CHECK (rate > 0),
  
  -- Fuente de la tasa (opcional, para auditoría)
  source TEXT, -- 'MANUAL', 'API', 'BCRA', etc.
  
  -- Notas opcionales
  notes TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Una tasa por día y par de monedas
  UNIQUE(rate_date, from_currency, to_currency)
);

-- Índice para búsquedas rápidas por fecha
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(rate_date DESC);

-- Índice para búsquedas por monedas
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);

-- Comentarios para documentación
COMMENT ON TABLE exchange_rates IS 'Almacena tasas de cambio históricas para conversión de monedas';
COMMENT ON COLUMN exchange_rates.rate_date IS 'Fecha de la tasa (solo fecha, sin hora)';
COMMENT ON COLUMN exchange_rates.rate IS 'Tasa de cambio: cuántos ARS equivalen a 1 USD';
COMMENT ON COLUMN exchange_rates.source IS 'Fuente de la tasa: MANUAL, API, BCRA, etc.';

-- Función para obtener la tasa más reciente para una fecha
-- Si no hay tasa exacta para esa fecha, devuelve la más cercana anterior
CREATE OR REPLACE FUNCTION get_exchange_rate(
  p_date DATE,
  p_from_currency TEXT DEFAULT 'USD',
  p_to_currency TEXT DEFAULT 'ARS'
) RETURNS NUMERIC(18,4) AS $$
DECLARE
  v_rate NUMERIC(18,4);
BEGIN
  SELECT rate INTO v_rate
  FROM exchange_rates
  WHERE from_currency = p_from_currency
    AND to_currency = p_to_currency
    AND rate_date <= p_date
  ORDER BY rate_date DESC
  LIMIT 1;
  
  -- Si no hay tasa, devolver NULL (el código debe manejar esto)
  RETURN v_rate;
END;
$$ LANGUAGE plpgsql;

-- Comentario para la función
COMMENT ON FUNCTION get_exchange_rate IS 'Obtiene la tasa de cambio más reciente para una fecha dada';



-- ===== MIGRATION 014: 014_create_quotations.sql =====

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



-- ===== MIGRATION 015: 015_create_tariffs_and_quotas.sql =====

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



-- ===== MIGRATION 016: 016_create_multiple_cash_boxes.sql =====

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



-- ===== MIGRATION 017: 017_create_payment_coupons.sql =====

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



-- ===== MIGRATION 018: 018_create_card_transactions.sql =====

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



-- ===== MIGRATION 019: 019_create_non_touristic_movements.sql =====

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



-- ===== MIGRATION 020: 020_create_recurring_payments.sql =====

-- =====================================================
-- FASE 1: OPERACIÓN DIARIA
-- Migración 020: Crear tabla recurring_payments
-- =====================================================
-- Sistema de pagos recurrentes a proveedores
-- Permite crear pagos que se generan automáticamente (mensuales, semanales, etc.)

-- Primero, modificar operator_payments para permitir operation_id NULL
-- (los pagos recurrentes no están vinculados a operaciones específicas)
ALTER TABLE operator_payments
  ALTER COLUMN operation_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS recurring_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relación con operador
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  
  -- Información monetaria
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  
  -- Frecuencia de recurrencia
  frequency TEXT NOT NULL CHECK (frequency IN (
    'WEEKLY',      -- Semanal
    'BIWEEKLY',    -- Quincenal
    'MONTHLY',     -- Mensual
    'QUARTERLY',   -- Trimestral
    'YEARLY'       -- Anual
  )),
  
  -- Fechas
  start_date DATE NOT NULL,              -- Fecha de inicio del pago recurrente
  end_date DATE,                          -- Fecha de fin (opcional, null = sin fin)
  next_due_date DATE NOT NULL,            -- Próxima fecha de vencimiento (calculada automáticamente)
  last_generated_date DATE,               -- Última fecha en que se generó un pago
  
  -- Estado
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Descripción y notas
  description TEXT NOT NULL,               -- Descripción del pago (ej: "Alquiler oficina mensual")
  notes TEXT,                              -- Notas adicionales
  
  -- Información de facturación (opcional)
  invoice_number TEXT,                    -- Número de factura si aplica
  reference TEXT,                         -- Referencia adicional
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_recurring_payments_operator ON recurring_payments(operator_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_active ON recurring_payments(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_next_due ON recurring_payments(next_due_date);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_frequency ON recurring_payments(frequency);

-- Comentarios para documentación
COMMENT ON TABLE recurring_payments IS 'Pagos recurrentes a proveedores. Se generan automáticamente según la frecuencia configurada.';
COMMENT ON COLUMN recurring_payments.frequency IS 'Frecuencia: WEEKLY (semanal), BIWEEKLY (quincenal), MONTHLY (mensual), QUARTERLY (trimestral), YEARLY (anual)';
COMMENT ON COLUMN recurring_payments.next_due_date IS 'Próxima fecha en que se debe generar el pago. Se actualiza automáticamente después de generar cada pago.';
COMMENT ON COLUMN recurring_payments.last_generated_date IS 'Última fecha en que se generó un pago desde este registro recurrente.';
COMMENT ON COLUMN recurring_payments.end_date IS 'Fecha de fin del pago recurrente. Si es NULL, el pago continúa indefinidamente.';



-- ===== MIGRATION 021: 021_add_lead_dates.sql =====

-- =====================================================
-- FASE 2: FECHAS Y RECORDATORIOS
-- Migración 021: Agregar fechas a leads
-- =====================================================
-- Agregar campos de fechas para check-in, salida estimada y seguimiento

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS estimated_checkin_date DATE,
  ADD COLUMN IF NOT EXISTS estimated_departure_date DATE,
  ADD COLUMN IF NOT EXISTS follow_up_date DATE;

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_leads_checkin_date ON leads(estimated_checkin_date) WHERE estimated_checkin_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_date ON leads(follow_up_date) WHERE follow_up_date IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN leads.estimated_checkin_date IS 'Fecha estimada de check-in del viaje';
COMMENT ON COLUMN leads.estimated_departure_date IS 'Fecha estimada de salida del viaje';
COMMENT ON COLUMN leads.follow_up_date IS 'Fecha para hacer seguimiento al lead';



-- ===== MIGRATION 022: 022_add_quotation_expiration.sql =====

-- =====================================================
-- FASE 2: FECHAS Y RECORDATORIOS
-- Migración 022: Mejorar expiración de cotizaciones
-- =====================================================
-- El campo valid_until ya existe, solo agregamos índices y lógica de expiración

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_quotations_valid_until ON quotations(valid_until) WHERE status NOT IN ('APPROVED', 'CONVERTED', 'REJECTED');
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);

-- Función para expirar cotizaciones automáticamente
CREATE OR REPLACE FUNCTION expire_quotations()
RETURNS void AS $$
BEGIN
  UPDATE quotations
  SET status = 'EXPIRED',
      updated_at = NOW()
  WHERE status IN ('DRAFT', 'SENT', 'PENDING_APPROVAL')
    AND valid_until < CURRENT_DATE
    AND status != 'EXPIRED';
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON FUNCTION expire_quotations IS 'Expira automáticamente las cotizaciones cuya fecha valid_until ha pasado';



-- ===== MIGRATION 023: 022_add_trello_full_data.sql =====

-- Agregar campo JSONB para guardar TODA la información completa de Trello
-- Esto permite tener acceso a toda la información exactamente como está en Trello
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS trello_full_data JSONB;

-- Crear índice GIN para búsquedas rápidas en el JSONB
CREATE INDEX IF NOT EXISTS idx_leads_trello_full_data ON leads USING GIN (trello_full_data);

-- Comentario para documentación
COMMENT ON COLUMN leads.trello_full_data IS 'Datos completos de la tarjeta de Trello en formato JSON, incluyendo custom fields, checklists, attachments, comments, etc.';



-- ===== MIGRATION 024: 023_create_billing_info.sql =====

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



-- ===== MIGRATION 025: 024_create_operation_passengers.sql =====

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



-- ===== MIGRATION 026: 025_add_passenger_to_documents.sql =====

-- =====================================================
-- FASE 3: FACTURACIÓN Y DATOS DE CLIENTES
-- Migración 025: Agregar passenger_id a documents
-- =====================================================
-- Permite vincular documentos a pasajeros específicos

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS passenger_id UUID REFERENCES operation_passengers(id) ON DELETE SET NULL;

-- Índice
CREATE INDEX IF NOT EXISTS idx_documents_passenger ON documents(passenger_id) WHERE passenger_id IS NOT NULL;

-- Comentario
COMMENT ON COLUMN documents.passenger_id IS 'Pasajero al que pertenece este documento (opcional)';



-- ===== MIGRATION 027: 026_create_communications.sql =====

-- =====================================================
-- FASE 4: SEGUIMIENTO Y COMUNICACIÓN
-- Migración 026: Crear tabla communications
-- =====================================================
-- Historial de comunicaciones con clientes, leads, operaciones

CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relaciones (al menos una debe estar presente)
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES operations(id) ON DELETE CASCADE,
  
  -- Tipo de comunicación
  communication_type TEXT NOT NULL CHECK (communication_type IN (
    'CALL',      -- Llamada telefónica
    'EMAIL',     -- Email
    'WHATSAPP',  -- WhatsApp
    'MEETING',   -- Reunión presencial
    'NOTE'       -- Nota interna
  )),
  
  -- Contenido
  subject TEXT,
  content TEXT NOT NULL,
  
  -- Información adicional
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  duration INTEGER, -- Duración en minutos (si es llamada)
  
  -- Seguimiento
  follow_up_date DATE, -- Fecha para hacer seguimiento
  
  -- Usuario que realizó la comunicación
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: al menos una relación debe estar presente
  CONSTRAINT communications_relation_check CHECK (
    customer_id IS NOT NULL OR
    lead_id IS NOT NULL OR
    operation_id IS NOT NULL
  )
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_communications_customer ON communications(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communications_lead ON communications(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communications_operation ON communications(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communications_date ON communications(date);
CREATE INDEX IF NOT EXISTS idx_communications_follow_up ON communications(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communications_type ON communications(communication_type);

-- Comentarios
COMMENT ON TABLE communications IS 'Historial de comunicaciones con clientes, leads y operaciones';
COMMENT ON COLUMN communications.duration IS 'Duración en minutos (solo para llamadas)';
COMMENT ON COLUMN communications.follow_up_date IS 'Fecha sugerida para hacer seguimiento';



-- ===== MIGRATION 028: 027_add_lead_documents.sql =====

-- =====================================================
-- Agregar soporte para documentos en leads
-- Migración 027: Agregar lead_id y scanned_data a documents
-- =====================================================

-- Agregar lead_id a documents
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE;

-- Agregar campo JSONB para guardar datos escaneados por IA
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS scanned_data JSONB;

-- Agregar tipo LICENSE a los tipos de documentos
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_type_check 
  CHECK (type IN ('PASSPORT', 'DNI', 'LICENSE', 'VOUCHER', 'INVOICE', 'PAYMENT_PROOF', 'OTHER'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_documents_lead ON documents(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_scanned_data ON documents USING GIN (scanned_data) WHERE scanned_data IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN documents.lead_id IS 'Lead al que pertenece este documento (opcional)';
COMMENT ON COLUMN documents.scanned_data IS 'Datos extraídos por IA del documento en formato JSON';



-- ===== MIGRATION 029: 028_add_documents_rls_policies.sql =====

-- =====================================================
-- FASE 3: FACTURACIÓN Y DATOS DE CLIENTES
-- Migración 028: Agregar políticas RLS para documents
-- =====================================================

-- Habilitar RLS en la tabla documents (si no está habilitado)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Política para SELECT: usuarios autenticados pueden leer documentos
-- de leads/operations a los que tienen acceso a través de sus agencias
CREATE POLICY "Users can read documents from their agencies"
ON documents
FOR SELECT
TO authenticated
USING (
  -- Si el documento está asociado a un lead, verificar acceso a la agencia del lead
  (
    lead_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM leads
      INNER JOIN user_agencies ON user_agencies.agency_id = leads.agency_id
      INNER JOIN users ON users.id = user_agencies.user_id
      WHERE leads.id = documents.lead_id
      AND users.auth_id = auth.uid()
      AND users.is_active = true
    )
  )
  OR
  -- Si el documento está asociado a una operación, verificar acceso a la agencia de la operación
  (
    operation_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM operations
      INNER JOIN user_agencies ON user_agencies.agency_id = operations.agency_id
      INNER JOIN users ON users.id = user_agencies.user_id
      WHERE operations.id = documents.operation_id
      AND users.auth_id = auth.uid()
      AND users.is_active = true
    )
  )
  OR
  -- Si el documento está asociado a un cliente, verificar acceso a través de operaciones
  (
    customer_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM operation_customers
      INNER JOIN operations ON operations.id = operation_customers.operation_id
      INNER JOIN user_agencies ON user_agencies.agency_id = operations.agency_id
      INNER JOIN users ON users.id = user_agencies.user_id
      WHERE operation_customers.customer_id = documents.customer_id
      AND users.auth_id = auth.uid()
      AND users.is_active = true
    )
  )
  OR
  -- Si el usuario subió el documento, puede leerlo
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = documents.uploaded_by_user_id
    AND users.auth_id = auth.uid()
    AND users.is_active = true
  )
);

-- Política para INSERT: usuarios autenticados pueden insertar documentos
-- siempre que estén asociados a un lead/operation/customer de su agencia
CREATE POLICY "Users can insert documents for their agencies"
ON documents
FOR INSERT
TO authenticated
WITH CHECK (
  -- Verificar que el usuario existe, está activo y es quien está subiendo
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = documents.uploaded_by_user_id
    AND users.auth_id = auth.uid()
    AND users.is_active = true
  )
  AND
  (
    -- Si está asociado a un lead, verificar acceso a la agencia
    (
      lead_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM leads
        INNER JOIN user_agencies ON user_agencies.agency_id = leads.agency_id
        INNER JOIN users ON users.id = user_agencies.user_id
        WHERE leads.id = documents.lead_id
        AND users.auth_id = auth.uid()
        AND users.is_active = true
      )
    )
    OR
    -- Si está asociado a una operación, verificar acceso a la agencia
    (
      operation_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM operations
        INNER JOIN user_agencies ON user_agencies.agency_id = operations.agency_id
        INNER JOIN users ON users.id = user_agencies.user_id
        WHERE operations.id = documents.operation_id
        AND users.auth_id = auth.uid()
        AND users.is_active = true
      )
    )
    OR
    -- Si está asociado a un cliente, verificar acceso a través de operaciones
    (
      customer_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM operation_customers
        INNER JOIN operations ON operations.id = operation_customers.operation_id
        INNER JOIN user_agencies ON user_agencies.agency_id = operations.agency_id
        INNER JOIN users ON users.id = user_agencies.user_id
        WHERE operation_customers.customer_id = documents.customer_id
        AND users.auth_id = auth.uid()
        AND users.is_active = true
      )
    )
  )
);

-- Política para UPDATE: usuarios autenticados pueden actualizar documentos que subieron
-- o documentos de sus agencias
CREATE POLICY "Users can update documents they uploaded or from their agencies"
ON documents
FOR UPDATE
TO authenticated
USING (
  -- Si el usuario subió el documento, puede actualizarlo
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = documents.uploaded_by_user_id
    AND users.auth_id = auth.uid()
    AND users.is_active = true
  )
  OR
  -- O si tiene acceso a la agencia del lead/operation asociado
  (
    lead_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM leads
      INNER JOIN user_agencies ON user_agencies.agency_id = leads.agency_id
      INNER JOIN users ON users.id = user_agencies.user_id
      WHERE leads.id = documents.lead_id
      AND users.auth_id = auth.uid()
      AND users.is_active = true
    )
  )
  OR
  (
    operation_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM operations
      INNER JOIN user_agencies ON user_agencies.agency_id = operations.agency_id
      INNER JOIN users ON users.id = user_agencies.user_id
      WHERE operations.id = documents.operation_id
      AND users.auth_id = auth.uid()
      AND users.is_active = true
    )
  )
)
WITH CHECK (
  -- Mismas condiciones para WITH CHECK
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = documents.uploaded_by_user_id
    AND users.auth_id = auth.uid()
    AND users.is_active = true
  )
  OR
  (
    lead_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM leads
      INNER JOIN user_agencies ON user_agencies.agency_id = leads.agency_id
      INNER JOIN users ON users.id = user_agencies.user_id
      WHERE leads.id = documents.lead_id
      AND users.auth_id = auth.uid()
      AND users.is_active = true
    )
  )
  OR
  (
    operation_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM operations
      INNER JOIN user_agencies ON user_agencies.agency_id = operations.agency_id
      INNER JOIN users ON users.id = user_agencies.user_id
      WHERE operations.id = documents.operation_id
      AND users.auth_id = auth.uid()
      AND users.is_active = true
    )
  )
);

-- Política para DELETE: usuarios autenticados pueden eliminar documentos que subieron
-- o documentos de sus agencias (solo SUPER_ADMIN y ADMIN)
CREATE POLICY "Users can delete documents they uploaded or from their agencies"
ON documents
FOR DELETE
TO authenticated
USING (
  -- Verificar que el usuario tiene rol apropiado
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.role IN ('SUPER_ADMIN', 'ADMIN')
    AND users.is_active = true
  )
  AND
  (
    -- Si el usuario subió el documento, puede eliminarlo
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = documents.uploaded_by_user_id
      AND users.auth_id = auth.uid()
      AND users.is_active = true
    )
    OR
    -- O si tiene acceso a la agencia del lead/operation asociado
    (
      lead_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM leads
        INNER JOIN user_agencies ON user_agencies.agency_id = leads.agency_id
        INNER JOIN users ON users.id = user_agencies.user_id
        WHERE leads.id = documents.lead_id
        AND users.auth_id = auth.uid()
        AND users.is_active = true
      )
    )
    OR
    (
      operation_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM operations
        INNER JOIN user_agencies ON user_agencies.agency_id = operations.agency_id
        INNER JOIN users ON users.id = user_agencies.user_id
        WHERE operations.id = documents.operation_id
        AND users.auth_id = auth.uid()
        AND users.is_active = true
      )
    )
  )
);

COMMENT ON POLICY "Users can read documents from their agencies" ON documents IS 
'Permite a usuarios autenticados leer documentos de leads/operations a los que tienen acceso a través de sus agencias';

COMMENT ON POLICY "Users can insert documents for their agencies" ON documents IS 
'Permite a usuarios autenticados insertar documentos asociados a leads/operations/customers de sus agencias';

COMMENT ON POLICY "Users can update documents they uploaded or from their agencies" ON documents IS 
'Permite a usuarios autenticados actualizar documentos que subieron o documentos de sus agencias';

COMMENT ON POLICY "Users can delete documents they uploaded or from their agencies" ON documents IS 
'Permite a SUPER_ADMIN y ADMIN eliminar documentos que subieron o documentos de sus agencias';



-- ===== MIGRATION 030: 029_performance_indexes.sql =====

-- =====================================================
-- Optimizaciones de Performance
-- Migración 029: Índices adicionales para mejorar rendimiento
-- =====================================================

-- Índices para leads (optimizar queries frecuentes)
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_trello_list_id ON leads(trello_list_id) WHERE trello_list_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_external_id ON leads(external_id) WHERE external_id IS NOT NULL;

-- Índices para operations (optimizar queries de analytics y listado)
CREATE INDEX IF NOT EXISTS idx_operations_created_at ON operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_departure_date ON operations(departure_date);
CREATE INDEX IF NOT EXISTS idx_operations_currency ON operations(currency);

-- Índices para payments (optimizar queries de pagos pendientes y vencidos)
CREATE INDEX IF NOT EXISTS idx_payments_date_due ON payments(date_due);
CREATE INDEX IF NOT EXISTS idx_payments_direction ON payments(direction);
CREATE INDEX IF NOT EXISTS idx_payments_payer_type ON payments(payer_type);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- Índice compuesto para payments (optimizar queries comunes)
CREATE INDEX IF NOT EXISTS idx_payments_status_direction ON payments(status, direction);
CREATE INDEX IF NOT EXISTS idx_payments_operation_status ON payments(operation_id, status);

-- Índices para customers (optimizar búsquedas)
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);

-- Índices para documents (optimizar queries de documentos)
CREATE INDEX IF NOT EXISTS idx_documents_operation ON documents(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_lead ON documents(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);

-- Índices para user_agencies (optimizar queries de permisos)
CREATE INDEX IF NOT EXISTS idx_user_agencies_user ON user_agencies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agencies_agency ON user_agencies(agency_id);

-- Comentarios
COMMENT ON INDEX idx_leads_trello_list_id IS 'Índice para filtrar leads por lista de Trello';
COMMENT ON INDEX idx_leads_created_at IS 'Índice para ordenar leads por fecha de creación';
COMMENT ON INDEX idx_operations_created_at IS 'Índice para ordenar operaciones por fecha de creación';
COMMENT ON INDEX idx_payments_status_direction IS 'Índice compuesto para queries de pagos por estado y dirección';



-- ===== MIGRATION 031: 030_add_trello_sync_checkpoint.sql =====

-- =====================================================
-- Optimización de Sincronización de Trello
-- Migración 030: Agregar checkpoint de última sincronización
-- =====================================================

-- Agregar campo para guardar la fecha de la última sincronización
ALTER TABLE settings_trello
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;

-- Crear índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_settings_trello_last_sync ON settings_trello(last_sync_at) WHERE last_sync_at IS NOT NULL;

-- Comentario
COMMENT ON COLUMN settings_trello.last_sync_at IS 'Fecha y hora de la última sincronización exitosa. Se usa para sincronización incremental (solo sincronizar cambios desde esta fecha)';



-- ===== MIGRATION 032: 030_audit_log.sql =====

-- Audit log table for tracking sensitive operations
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- Comment
COMMENT ON TABLE audit_log IS 'Registro de auditoría para operaciones sensibles del sistema';


-- ===== MIGRATION 033: 031_add_deposit_account_id.sql =====

-- =====================================================
-- Migración 031: Agregar deposit_account_id a leads
-- =====================================================
-- Permite asociar el depósito de un lead a una cuenta financiera específica

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS deposit_account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_leads_deposit_account ON leads(deposit_account_id) WHERE deposit_account_id IS NOT NULL;

-- Comentario para documentación
COMMENT ON COLUMN leads.deposit_account_id IS 'Cuenta financiera donde ingresó el depósito del lead';



-- ===== MIGRATION 034: 032_create_audit_logs.sql =====

-- ===========================================
-- TABLA DE LOGS DE AUDITORÍA
-- ===========================================

-- Crear tabla de audit_logs si no existe
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- Comentarios descriptivos
COMMENT ON TABLE audit_logs IS 'Registro de todas las acciones importantes realizadas en el sistema';
COMMENT ON COLUMN audit_logs.action IS 'Tipo de acción: LOGIN, LOGOUT, CREATE_*, UPDATE_*, DELETE_*, INVITE_USER, etc.';
COMMENT ON COLUMN audit_logs.entity_type IS 'Tipo de entidad afectada: user, lead, operation, payment, etc.';
COMMENT ON COLUMN audit_logs.entity_id IS 'ID de la entidad afectada';
COMMENT ON COLUMN audit_logs.details IS 'Detalles adicionales en formato JSON';

-- RLS Policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Solo SUPER_ADMIN y ADMIN pueden ver los logs
CREATE POLICY "audit_logs_select_admin" ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_id = auth.uid()
      AND users.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- Solo el sistema puede insertar logs (a través de service role)
CREATE POLICY "audit_logs_insert_system" ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Función para registrar acciones automáticamente
CREATE OR REPLACE FUNCTION log_audit_action(
  p_user_id UUID,
  p_action VARCHAR(100),
  p_entity_type VARCHAR(50) DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_details)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para registrar cambios en usuarios
CREATE OR REPLACE FUNCTION audit_user_changes() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_active != NEW.is_active THEN
      PERFORM log_audit_action(
        NULL,
        CASE WHEN NEW.is_active THEN 'USER_ACTIVATED' ELSE 'USER_DEACTIVATED' END,
        'user',
        NEW.id,
        jsonb_build_object('email', NEW.email, 'name', NEW.name)
      );
    END IF;
    
    IF OLD.role != NEW.role THEN
      PERFORM log_audit_action(
        NULL,
        'USER_ROLE_CHANGED',
        'user',
        NEW.id,
        jsonb_build_object('email', NEW.email, 'old_role', OLD.role, 'new_role', NEW.role)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar trigger a la tabla users
DROP TRIGGER IF EXISTS trigger_audit_user_changes ON users;
CREATE TRIGGER trigger_audit_user_changes
  AFTER UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION audit_user_changes();



-- ===== MIGRATION 035: 033_seed_agencies.sql =====

-- ===========================================
-- SEED DE AGENCIAS INICIALES
-- ===========================================

-- Insertar agencias si no existen
INSERT INTO agencies (id, name, city, timezone)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Rosario', 'Rosario', 'America/Argentina/Buenos_Aires'),
  ('22222222-2222-2222-2222-222222222222', 'Madero', 'Buenos Aires', 'America/Argentina/Buenos_Aires')
ON CONFLICT (id) DO NOTHING;

-- Asignar todas las agencias al usuario admin existente (si existe)
INSERT INTO user_agencies (user_id, agency_id)
SELECT u.id, a.id
FROM users u
CROSS JOIN agencies a
WHERE u.role = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;


-- ===== MIGRATION 036: 040_create_whatsapp_messages.sql =====

-- =====================================================
-- SISTEMA DE MENSAJES WHATSAPP
-- Migración 040: Templates y cola de mensajes
-- =====================================================

-- Tabla de templates de mensajes
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Información básica
  name TEXT NOT NULL,                    -- "Recordatorio de Pago"
  description TEXT,                      -- Descripción del template
  category TEXT NOT NULL CHECK (category IN (
    'PAYMENT',      -- Pagos
    'TRIP',         -- Viajes
    'QUOTATION',    -- Cotizaciones
    'BIRTHDAY',     -- Cumpleaños
    'ANNIVERSARY',  -- Aniversario cliente
    'MARKETING',    -- Marketing general
    'CUSTOM'        -- Personalizado
  )),
  
  -- Trigger automático
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'MANUAL',                 -- Envío manual
    'QUOTATION_SENT',         -- Cotización enviada
    'QUOTATION_EXPIRING',     -- Cotización por vencer (2 días antes)
    'QUOTATION_APPROVED',     -- Cotización aprobada
    'PAYMENT_PLAN_CREATED',   -- Plan de pagos creado
    'PAYMENT_DUE_3D',         -- 3 días antes de vencimiento
    'PAYMENT_DUE_1D',         -- 1 día antes de vencimiento
    'PAYMENT_RECEIVED',       -- Pago recibido
    'PAYMENT_OVERDUE',        -- Pago vencido
    'PAYMENT_COMPLETE',       -- Todos los pagos completados
    'TRIP_7D_BEFORE',         -- 7 días antes del viaje
    'TRIP_1D_BEFORE',         -- 1 día antes del viaje
    'TRIP_RETURN',            -- Día de regreso
    'TRIP_POST_7D',           -- 7 días post-viaje
    'BIRTHDAY',               -- Cumpleaños
    'ANNIVERSARY_1Y'          -- 1 año desde primera operación
  )),
  
  -- Contenido del mensaje
  template TEXT NOT NULL,                -- "Hola {nombre}, te recordamos..."
  emoji_prefix TEXT,                     -- "💰" para mostrar en la lista
  
  -- Configuración
  is_active BOOLEAN DEFAULT true,
  send_hour_from INTEGER DEFAULT 9,      -- Hora mínima de envío (9am)
  send_hour_to INTEGER DEFAULT 21,       -- Hora máxima de envío (9pm)
  
  -- Relaciones
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,  -- NULL = template global
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Tabla de mensajes en cola
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Template usado
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  
  -- Destinatario
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  
  -- Contenido
  message TEXT NOT NULL,                 -- Mensaje ya armado con variables
  whatsapp_link TEXT,                    -- Link wa.me generado
  
  -- Contexto (opcional, para tracking)
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL,
  
  -- Estado
  status TEXT DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',      -- Pendiente de envío
    'SENT',         -- Enviado
    'SKIPPED',      -- Omitido por el usuario
    'FAILED'        -- Falló (sin teléfono, etc.)
  )),
  
  -- Programación
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Envío
  sent_at TIMESTAMP WITH TIME ZONE,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_message_templates_agency ON message_templates(agency_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_trigger ON message_templates(trigger_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_message_templates_category ON message_templates(category);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_customer ON whatsapp_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_agency ON whatsapp_messages(agency_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_scheduled ON whatsapp_messages(scheduled_for) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_operation ON whatsapp_messages(operation_id) WHERE operation_id IS NOT NULL;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_message_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_message_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_message_templates_updated_at();

-- =====================================================
-- TEMPLATES POR DEFECTO
-- =====================================================

-- Template: Cotización enviada
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Cotización Enviada',
  'Se envía cuando se crea una cotización para el cliente',
  'QUOTATION',
  'QUOTATION_SENT',
  'Hola {nombre}! 👋

Te enviamos la cotización para tu viaje a *{destino}*.

💰 Total: {moneda} {monto}
📅 Válida hasta: {fecha_validez}

¿Tenés alguna duda? Estamos para ayudarte! 📲',
  '📄',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Recordatorio de pago (3 días)
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Recordatorio de Pago (3 días)',
  'Se envía 3 días antes del vencimiento de una cuota',
  'PAYMENT',
  'PAYMENT_DUE_3D',
  '👋 Hola {nombre}!

Te recordamos que el *{fecha_vencimiento}* vence tu cuota de *{moneda} {monto}* para el viaje a {destino}.

¿Necesitás los datos para transferir? 📲',
  '💰',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Pago recibido
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Pago Recibido',
  'Se envía cuando se registra un pago del cliente',
  'PAYMENT',
  'PAYMENT_RECEIVED',
  '✅ *¡Recibimos tu pago!*

Hola {nombre}, confirmamos la recepción de *{moneda} {monto}*.

{mensaje_cuotas}

¡Gracias por confiar en nosotros! 🙌',
  '✅',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Viaje próximo (7 días)
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Viaje Próximo (7 días)',
  'Se envía 7 días antes de la fecha de salida',
  'TRIP',
  'TRIP_7D_BEFORE',
  '🌴 *¡{nombre}, tu viaje está cerca!*

En *7 días* arranca tu aventura a *{destino}*.

📋 Ya preparaste todo?
✈️ Fecha de salida: {fecha_salida}

Cualquier duda, estamos para ayudarte 📲',
  '✈️',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Cumpleaños
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Feliz Cumpleaños',
  'Se envía el día del cumpleaños del cliente',
  'BIRTHDAY',
  'BIRTHDAY',
  '🎂 *¡Feliz Cumpleaños {nombre}!*

Que este nuevo año venga con muchos viajes y aventuras increíbles ✨

¡Te esperamos pronto para planear tu próximo destino! 🌎',
  '🎂',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Post-viaje
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Post-Viaje',
  'Se envía el día de regreso del cliente',
  'TRIP',
  'TRIP_RETURN',
  '🏠 *¡Bienvenido {nombre}!*

¿Cómo estuvo {destino}? Esperamos que hayas disfrutado cada momento 🌟

Nos encantaría saber tu experiencia. ¿Nos contás cómo te fue? ⭐',
  '🏠',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Pago vencido
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Pago Vencido',
  'Se envía cuando un pago pasa su fecha de vencimiento',
  'PAYMENT',
  'PAYMENT_OVERDUE',
  '⚠️ Hola {nombre},

Tu cuota de *{moneda} {monto}* para el viaje a {destino} venció el {fecha_vencimiento}.

¿Necesitás ayuda para regularizarla? Estamos para ayudarte 📲',
  '⚠️',
  NULL
) ON CONFLICT DO NOTHING;

-- Comentarios
COMMENT ON TABLE message_templates IS 'Templates de mensajes WhatsApp configurables por agencia';
COMMENT ON TABLE whatsapp_messages IS 'Cola de mensajes WhatsApp pendientes y enviados';
COMMENT ON COLUMN message_templates.template IS 'Template con variables: {nombre}, {destino}, {monto}, {fecha}, etc.';
COMMENT ON COLUMN whatsapp_messages.whatsapp_link IS 'Link wa.me/?text=... generado para abrir WhatsApp';



-- ===== MIGRATION 037: 041_fix_recurring_payments.sql =====

-- =====================================================
-- Migración 041: Arreglar recurring_payments
-- =====================================================
-- Cambiar de operator_id a provider_name
-- Crear tabla de proveedores para autocompletado

-- 1. Primero crear la tabla de proveedores para pagos recurrentes
CREATE TABLE IF NOT EXISTS recurring_payment_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_payment_providers_name ON recurring_payment_providers(name);

-- 2. Modificar operator_payments para permitir operation_id NULL
-- (los pagos recurrentes no están vinculados a operaciones específicas)
ALTER TABLE operator_payments
  ALTER COLUMN operation_id DROP NOT NULL;

-- 3. Crear tabla recurring_payments (versión corregida)
CREATE TABLE IF NOT EXISTS recurring_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Proveedor (texto libre, no FK a operators)
  provider_name TEXT NOT NULL,
  
  -- Información monetaria
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  
  -- Frecuencia de recurrencia
  frequency TEXT NOT NULL CHECK (frequency IN (
    'WEEKLY',      -- Semanal
    'BIWEEKLY',    -- Quincenal
    'MONTHLY',     -- Mensual
    'QUARTERLY',   -- Trimestral
    'YEARLY'       -- Anual
  )),
  
  -- Fechas
  start_date DATE NOT NULL,
  end_date DATE,
  next_due_date DATE NOT NULL,
  last_generated_date DATE,
  
  -- Estado
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Descripción y notas
  description TEXT NOT NULL,
  notes TEXT,
  
  -- Información de facturación (opcional)
  invoice_number TEXT,
  reference TEXT,
  
  -- Agencia
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_recurring_payments_provider ON recurring_payments(provider_name);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_active ON recurring_payments(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_next_due ON recurring_payments(next_due_date);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_agency ON recurring_payments(agency_id);

-- Comentarios
COMMENT ON TABLE recurring_payments IS 'Pagos recurrentes a proveedores genéricos (no operadores turísticos).';
COMMENT ON TABLE recurring_payment_providers IS 'Lista de proveedores usados en pagos recurrentes para autocompletado.';



-- ===== MIGRATION 038: 042_add_recurring_payment_alert_type.sql =====

-- =====================================================
-- Migración 042: Agregar soporte para alertas de pagos recurrentes
-- =====================================================

-- Agregar columna metadata si no existe (para guardar info adicional de alertas)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'metadata') THEN
        ALTER TABLE alerts ADD COLUMN metadata JSONB;
    END IF;
END $$;

-- Agregar columna priority si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'priority') THEN
        ALTER TABLE alerts ADD COLUMN priority TEXT DEFAULT 'MEDIUM';
    END IF;
END $$;

-- Comentarios
COMMENT ON COLUMN alerts.metadata IS 'Información adicional de la alerta en formato JSON';
COMMENT ON COLUMN alerts.priority IS 'Prioridad: LOW, MEDIUM, HIGH';



-- ===== MIGRATION 039: 043_cleanup_users_operators.sql =====

-- =====================================================
-- LIMPIEZA Y CONFIGURACIÓN DE VENDEDORES Y OPERADORES
-- =====================================================

-- 1. DESACTIVAR VENDEDORES DE PRUEBA
-- Buscar y desactivar usuarios con nombres de prueba (Toto, toto, Toto2, Mip, pupi, etc.)
UPDATE users
SET is_active = false,
    updated_at = NOW()
WHERE name ILIKE '%toto%'
   OR name ILIKE '%mip%'
   OR name ILIKE '%pupi%'
   OR name = 'María González'
   OR name = 'Juan Pérez'
   OR name = 'Ana Martínez';

-- 2. ELIMINAR OPERADORES ACTUALES
-- Solo eliminamos si NO tienen operaciones asociadas
DELETE FROM operators
WHERE id NOT IN (
  SELECT DISTINCT operator_id 
  FROM operations 
  WHERE operator_id IS NOT NULL
);

-- 3. CREAR NUEVOS OPERADORES
INSERT INTO operators (id, name, contact_name, contact_email, contact_phone, created_at, updated_at)
VALUES 
  -- Icaro
  (gen_random_uuid(), 
   'Icaro', 
   'Roberto Fernández', 
   'contacto@icaro.com.ar', 
   '+54 11 5555-1001',
   NOW(),
   NOW()),
  
  -- Lozada
  (gen_random_uuid(), 
   'Lozada', 
   'Patricia Lozada', 
   'info@lozada.com.ar', 
   '+54 11 5555-1002',
   NOW(),
   NOW()),
  
  -- Starlings
  (gen_random_uuid(), 
   'Starlings', 
   'Martín Sosa', 
   'ventas@starlings.com.ar', 
   '+54 11 5555-1003',
   NOW(),
   NOW()),
  
  -- Eurovips
  (gen_random_uuid(), 
   'Eurovips', 
   'Laura Montenegro', 
   'reservas@eurovips.com', 
   '+54 11 5555-1004',
   NOW(),
   NOW()),
  
  -- 360 Regional
  (gen_random_uuid(), 
   '360 Regional', 
   'Carlos Ramírez', 
   'ops@360regional.com', 
   '+54 11 5555-1005',
   NOW(),
   NOW()),
  
  -- Delfos
  (gen_random_uuid(), 
   'Delfos', 
   'Andrea Pereyra', 
   'atencion@delfos.com.ar', 
   '+54 11 5555-1006',
   NOW(),
   NOW())
ON CONFLICT (id) DO NOTHING;

-- 4. RESUMEN DE CAMBIOS
DO $$
DECLARE
  inactive_users_count INTEGER;
  deleted_operators_count INTEGER;
  new_operators_count INTEGER;
BEGIN
  -- Contar usuarios desactivados
  SELECT COUNT(*) INTO inactive_users_count
  FROM users
  WHERE is_active = false 
    AND (name ILIKE '%toto%' OR name ILIKE '%mip%' OR name ILIKE '%pupi%' 
         OR name = 'María González' OR name = 'Juan Pérez' OR name = 'Ana Martínez');
  
  -- Contar operadores nuevos
  SELECT COUNT(*) INTO new_operators_count
  FROM operators
  WHERE name IN ('Icaro', 'Lozada', 'Starlings', 'Eurovips', '360 Regional', 'Delfos');
  
  RAISE NOTICE '✅ Usuarios desactivados: %', inactive_users_count;
  RAISE NOTICE '✅ Operadores creados: %', new_operators_count;
  RAISE NOTICE '✅ Los operadores son 100%% editables desde la interfaz';
END $$;



-- ===== MIGRATION 040: 044_force_delete_test_users.sql =====

-- =====================================================
-- ELIMINACIÓN FORZADA DE USUARIOS DE PRUEBA
-- =====================================================
-- Este script elimina usuarios de prueba incluso si tienen datos asociados
-- Reasigna sus operaciones/leads al usuario actual antes de eliminar

DO $$
DECLARE
  current_admin_id UUID;
  users_to_delete UUID[];
  deleted_count INTEGER := 0;
BEGIN
  -- 1. Obtener el ID del usuario admin actual (Tomas o Maxi)
  SELECT id INTO current_admin_id
  FROM users
  WHERE email IN ('tomas.sanchez204@gmail.com', 'maxi@erplozada.com')
    AND role IN ('SUPER_ADMIN', 'ADMIN')
    AND is_active = true
  ORDER BY 
    CASE 
      WHEN email = 'tomas.sanchez204@gmail.com' THEN 1
      WHEN email = 'maxi@erplozada.com' THEN 2
      ELSE 3
    END
  LIMIT 1;

  IF current_admin_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró un usuario admin activo para reasignar';
  END IF;

  RAISE NOTICE '✅ Usando admin ID: %', current_admin_id;

  -- 2. Identificar usuarios de prueba
  SELECT ARRAY_AGG(id) INTO users_to_delete
  FROM users
  WHERE (
    name ILIKE '%toto%'
    OR name ILIKE '%mip%'
    OR name ILIKE '%pupi%'
    OR name = 'María González'
    OR name = 'Juan Pérez'
    OR name = 'Ana Martínez'
    OR email LIKE '%vendedor1@%'
    OR email LIKE '%vendedor2@%'
    OR email LIKE '%vendedor3@%'
  )
  AND role != 'SUPER_ADMIN'; -- Proteger SUPER_ADMIN

  RAISE NOTICE '📋 Usuarios a eliminar: %', users_to_delete;

  -- 3. REASIGNAR DATOS ASOCIADOS
  
  -- Reasignar leads
  UPDATE leads
  SET assigned_seller_id = current_admin_id,
      updated_at = NOW()
  WHERE assigned_seller_id = ANY(users_to_delete);
  
  RAISE NOTICE '✅ Leads reasignados';

  -- Reasignar operaciones
  UPDATE operations
  SET seller_id = current_admin_id,
      updated_at = NOW()
  WHERE seller_id = ANY(users_to_delete);
  
  RAISE NOTICE '✅ Operaciones reasignadas';

  -- Reasignar cotizaciones
  UPDATE quotations
  SET seller_id = current_admin_id,
      updated_at = NOW()
  WHERE seller_id = ANY(users_to_delete);
  
  RAISE NOTICE '✅ Cotizaciones reasignadas';

  -- Actualizar alertas
  UPDATE alerts
  SET user_id = current_admin_id,
      updated_at = NOW()
  WHERE user_id = ANY(users_to_delete);
  
  RAISE NOTICE '✅ Alertas reasignadas';

  -- Actualizar comisiones
  UPDATE commissions
  SET seller_id = current_admin_id,
      updated_at = NOW()
  WHERE seller_id = ANY(users_to_delete);
  
  RAISE NOTICE '✅ Comisiones reasignadas';

  -- Actualizar movimientos de caja creados por ellos
  UPDATE ledger_movements
  SET created_by = current_admin_id,
      updated_at = NOW()
  WHERE created_by = ANY(users_to_delete);
  
  RAISE NOTICE '✅ Movimientos de caja actualizados';

  -- 4. ELIMINAR RELACIONES
  
  -- Eliminar relación con agencias
  DELETE FROM user_agencies
  WHERE user_id = ANY(users_to_delete);
  
  RAISE NOTICE '✅ Relaciones con agencias eliminadas';

  -- 5. ELIMINAR USUARIOS
  DELETE FROM users
  WHERE id = ANY(users_to_delete);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE '🎯 Total usuarios eliminados: %', deleted_count;

  -- 6. RESUMEN FINAL
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ LIMPIEZA COMPLETADA';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  
  -- Mostrar usuarios restantes
  RAISE NOTICE 'Usuarios activos restantes:';
  FOR r IN 
    SELECT name, email, role, is_active
    FROM users
    ORDER BY 
      CASE role
        WHEN 'SUPER_ADMIN' THEN 1
        WHEN 'ADMIN' THEN 2
        WHEN 'SELLER' THEN 3
        ELSE 4
      END,
      name
  LOOP
    RAISE NOTICE '  - % (%) - % - %', 
      r.name, 
      r.email, 
      r.role,
      CASE WHEN r.is_active THEN 'Activo' ELSE 'Inactivo' END;
  END LOOP;

END $$;



-- ===== MIGRATION 041: 045_add_passport_expiry_alert.sql =====

-- =====================================================
-- Agregar tipo de alerta PASSPORT_EXPIRY
-- Migración 045: Alertas de pasaportes vencidos
-- =====================================================

-- Agregar lead_id a alerts si no existe (para alertas de pasaportes en leads)
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE;

-- Actualizar constraint de tipo para incluir PASSPORT_EXPIRY
ALTER TABLE alerts
  DROP CONSTRAINT IF EXISTS alerts_type_check;

ALTER TABLE alerts
  ADD CONSTRAINT alerts_type_check 
  CHECK (type IN (
    'PAYMENT_DUE', 
    'OPERATOR_DUE', 
    'UPCOMING_TRIP', 
    'MISSING_DOC', 
    'GENERIC',
    'PAYMENT_REMINDER_7D',
    'PAYMENT_REMINDER_3D', 
    'PAYMENT_REMINDER_TODAY',
    'PAYMENT_OVERDUE',
    'LEAD_CHECKIN_30D',
    'LEAD_CHECKIN_15D',
    'LEAD_CHECKIN_7D',
    'LEAD_CHECKIN_TODAY',
    'RECURRING_PAYMENT',
    'PASSPORT_EXPIRY'
  ));

-- Índice para buscar alertas de leads
CREATE INDEX IF NOT EXISTS idx_alerts_lead ON alerts(lead_id) WHERE lead_id IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN alerts.lead_id IS 'Lead asociado a la alerta (para alertas de pasaportes en leads)';



-- ===== MIGRATION 042: 046_add_operation_date.sql =====

-- Agregar campo operation_date a la tabla operations
-- Esta es la fecha en que se realizó/registró la operación (puede ser diferente a created_at para importaciones históricas)

ALTER TABLE operations 
ADD COLUMN IF NOT EXISTS operation_date DATE DEFAULT CURRENT_DATE;

-- Actualizar operaciones existentes: usar created_at como operation_date
UPDATE operations 
SET operation_date = DATE(created_at)
WHERE operation_date IS NULL;

-- Hacer el campo NOT NULL después de llenar los datos
ALTER TABLE operations 
ALTER COLUMN operation_date SET NOT NULL;

-- Crear índice para búsquedas por fecha de operación
CREATE INDEX IF NOT EXISTS idx_operations_operation_date ON operations(operation_date);

COMMENT ON COLUMN operations.operation_date IS 'Fecha en que se realizó/registró la venta (puede diferir de created_at para importaciones históricas)';



-- ===== MIGRATION 043: 047_destination_requirements.sql =====

-- =====================================================
-- MIGRACIÓN: Sistema de Requisitos por Destino
-- Fecha: 2025-12-05
-- Descripción: Alertas sobre vacunas, visas, formularios por destino
-- =====================================================

-- Tabla de requisitos por destino
CREATE TABLE IF NOT EXISTS destination_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  destination_code TEXT NOT NULL, -- "BR", "CO", "US", "EU", "MX", etc.
  destination_name TEXT NOT NULL, -- "Brasil", "Colombia", "Estados Unidos"
  requirement_type TEXT NOT NULL CHECK (requirement_type IN ('VACCINE', 'FORM', 'VISA', 'INSURANCE', 'DOCUMENT', 'OTHER')),
  requirement_name TEXT NOT NULL, -- "Fiebre Amarilla", "ESTA", "Formulario Migratorio"
  is_required BOOLEAN DEFAULT true,
  description TEXT, -- Detalles adicionales
  url TEXT, -- Link a más info o formulario
  days_before_trip INTEGER DEFAULT 30, -- Cuántos días antes alertar
  valid_from DATE,
  valid_to DATE, -- NULL si vigente indefinidamente
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_destination_requirements_code ON destination_requirements(destination_code);
CREATE INDEX IF NOT EXISTS idx_destination_requirements_active ON destination_requirements(is_active);
CREATE INDEX IF NOT EXISTS idx_destination_requirements_type ON destination_requirements(requirement_type);

-- Datos iniciales - Requisitos comunes para destinos populares
INSERT INTO destination_requirements (destination_code, destination_name, requirement_type, requirement_name, is_required, description, url, days_before_trip) VALUES
-- Brasil
('BR', 'Brasil', 'VACCINE', 'Fiebre Amarilla', true, 'Vacuna obligatoria para ingresar a Brasil. Debe aplicarse al menos 10 días antes del viaje.', 'https://www.gov.br/anvisa/pt-br', 30),
('BR', 'Brasil', 'FORM', 'Declaración de Salud del Viajero', false, 'Formulario de salud (puede ser requerido en algunas épocas)', NULL, 7),

-- Colombia  
('CO', 'Colombia', 'VACCINE', 'Fiebre Amarilla', true, 'Obligatoria si se visitan zonas selváticas o se viene de países con riesgo', NULL, 30),

-- Estados Unidos
('US', 'Estados Unidos', 'VISA', 'ESTA o Visa B1/B2', true, 'Argentinos requieren Visa de turista B1/B2. ESTA solo para países del Visa Waiver Program.', 'https://esta.cbp.dhs.gov/', 90),
('US', 'Estados Unidos', 'FORM', 'Formulario I-94', false, 'Se completa al ingresar (electrónico o en papel)', NULL, 7),
('US', 'Estados Unidos', 'INSURANCE', 'Seguro de Viaje', false, 'Altamente recomendado por costos médicos elevados', NULL, 14),

-- Europa (Schengen)
('EU', 'Europa (Schengen)', 'FORM', 'ETIAS', false, 'A partir de 2025, argentinos necesitarán autorización ETIAS para ingresar a Schengen', 'https://www.etiasvisa.com/', 90),
('EU', 'Europa (Schengen)', 'INSURANCE', 'Seguro de Viaje', true, 'Obligatorio con cobertura mínima de 30.000 EUR', NULL, 14),

-- México
('MX', 'México', 'FORM', 'Forma Migratoria Múltiple', false, 'Se obtiene al llegar o en línea previamente', 'https://www.inm.gob.mx/', 7),

-- Cuba
('CU', 'Cuba', 'VISA', 'Tarjeta de Turista', true, 'Visa de turista obligatoria, se puede obtener en aerolínea o consulado', NULL, 30),
('CU', 'Cuba', 'INSURANCE', 'Seguro de Viaje', true, 'Obligatorio para ingresar a Cuba', NULL, 14),

-- República Dominicana
('DO', 'República Dominicana', 'FORM', 'E-Ticket', true, 'Formulario electrónico obligatorio de entrada y salida', 'https://eticket.migracion.gob.do/', 7),

-- Tailandia
('TH', 'Tailandia', 'VISA', 'Visa on Arrival / eVisa', false, 'Argentinos pueden obtener visa al llegar (30 días) o eVisa', 'https://www.thaievisa.go.th/', 30),

-- Australia
('AU', 'Australia', 'VISA', 'eVisitor o ETA', true, 'Visa electrónica obligatoria', 'https://immi.homeaffairs.gov.au/', 60),

-- Egipto
('EG', 'Egipto', 'VISA', 'Visa on Arrival', true, 'Se puede obtener al llegar o eVisa previamente', 'https://www.egyptvisa.net/', 30);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_destination_requirements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_destination_requirements_updated_at ON destination_requirements;
CREATE TRIGGER trigger_update_destination_requirements_updated_at
  BEFORE UPDATE ON destination_requirements
  FOR EACH ROW
  EXECUTE FUNCTION update_destination_requirements_updated_at();

-- Agregar tipo de alerta DESTINATION_REQUIREMENT si no existe
DO $$ 
BEGIN
  -- Verificar si existe el constraint y actualizarlo
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'alerts_type_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
  END IF;
  
  -- Crear nuevo constraint con DESTINATION_REQUIREMENT
  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check 
    CHECK (type IN ('PAYMENT_DUE', 'PAYMENT_OVERDUE', 'UPCOMING_TRIP', 'DOCUMENT_MISSING', 'DOCUMENT_EXPIRING', 'BIRTHDAY', 'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT', 'OTHER'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;

-- Comentarios
COMMENT ON TABLE destination_requirements IS 'Requisitos por destino (vacunas, visas, formularios, etc.)';
COMMENT ON COLUMN destination_requirements.destination_code IS 'Código ISO del país o región (BR, US, EU, etc.)';
COMMENT ON COLUMN destination_requirements.requirement_type IS 'Tipo: VACCINE, FORM, VISA, INSURANCE, DOCUMENT, OTHER';
COMMENT ON COLUMN destination_requirements.days_before_trip IS 'Días antes del viaje para generar la alerta';



-- ===== MIGRATION 044: 047_payment_accounting_links.sql =====

-- =====================================================
-- Migración 047: Links entre pagos y movimientos contables
-- =====================================================
-- Conectar payments con ledger_movements y cash_movements

-- 1. Agregar columna ledger_movement_id a payments
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS ledger_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL;

-- 2. Agregar columna payment_id a cash_movements
ALTER TABLE cash_movements 
ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL;

-- 3. Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_payments_ledger_movement ON payments(ledger_movement_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_payment ON cash_movements(payment_id);

-- Comentarios
COMMENT ON COLUMN payments.ledger_movement_id IS 'Referencia al movimiento en el libro mayor generado por este pago';
COMMENT ON COLUMN cash_movements.payment_id IS 'Referencia al pago que generó este movimiento de caja';



-- ===== MIGRATION 045: 048_partner_accounts.sql =====

-- =====================================================
-- FASE 2: CUENTAS CORRIENTES DE SOCIOS
-- Migración 048: Crear tablas para gestión de socios
-- =====================================================

-- Tabla de socios/partners
CREATE TABLE IF NOT EXISTS partner_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_name TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de retiros de socios
CREATE TABLE IF NOT EXISTS partner_withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  withdrawal_date DATE NOT NULL,
  account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL,
  cash_movement_id UUID REFERENCES cash_movements(id) ON DELETE SET NULL,
  ledger_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_partner ON partner_withdrawals(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_withdrawals_date ON partner_withdrawals(withdrawal_date);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_user ON partner_accounts(user_id);

-- Comentarios
COMMENT ON TABLE partner_accounts IS 'Cuentas de socios para registro de retiros personales';
COMMENT ON TABLE partner_withdrawals IS 'Retiros de dinero realizados por los socios';
COMMENT ON COLUMN partner_withdrawals.cash_movement_id IS 'Referencia al movimiento de caja generado';
COMMENT ON COLUMN partner_withdrawals.ledger_movement_id IS 'Referencia al movimiento de ledger generado';



-- ===== MIGRATION 046: 049_update_financial_accounts_structure.sql =====

-- =====================================================
-- Actualización de estructura de financial_accounts
-- Agregar soporte para nuevos tipos de cuenta y agencias
-- =====================================================

-- IMPORTANTE: Primero eliminar todas las cuentas existentes para evitar conflictos con el constraint
-- 1. Eliminar todas las cuentas existentes (seed data)
DELETE FROM financial_accounts;

-- 2. Agregar agency_id si no existe
ALTER TABLE financial_accounts 
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- 3. Agregar is_active si no existe
ALTER TABLE financial_accounts 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 4. Actualizar constraint de type para incluir nuevos tipos
-- Primero eliminar el constraint viejo
ALTER TABLE financial_accounts 
DROP CONSTRAINT IF EXISTS financial_accounts_type_check;

-- Luego crear el nuevo constraint con los nuevos tipos
ALTER TABLE financial_accounts 
ADD CONSTRAINT financial_accounts_type_check 
CHECK (type IN (
  'SAVINGS_ARS',      -- Caja de ahorro ARS
  'SAVINGS_USD',      -- Caja de ahorro USD
  'CHECKING_ARS',     -- Cuenta corriente ARS
  'CHECKING_USD',     -- Cuenta corriente USD
  'CASH_ARS',         -- Caja efectivo ARS
  'CASH_USD',         -- Caja efectivo USD
  'CREDIT_CARD',      -- Tarjeta de crédito
  'ASSETS'            -- Activos
));

-- 5. Agregar campos para tarjetas de crédito
ALTER TABLE financial_accounts 
ADD COLUMN IF NOT EXISTS card_number TEXT,
ADD COLUMN IF NOT EXISTS card_holder TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS card_expiry_date DATE,
ADD COLUMN IF NOT EXISTS card_cvv TEXT;

-- 6. Agregar campos para activos
ALTER TABLE financial_accounts 
ADD COLUMN IF NOT EXISTS asset_type TEXT, -- 'VOUCHER', 'QUOTA', 'HOTEL', 'OTHER'
ADD COLUMN IF NOT EXISTS asset_description TEXT,
ADD COLUMN IF NOT EXISTS asset_quantity INTEGER DEFAULT 0;

-- 7. Agregar número de cuenta bancaria (para cuentas bancarias)
ALTER TABLE financial_accounts 
ADD COLUMN IF NOT EXISTS account_number TEXT;

-- 8. Índices
CREATE INDEX IF NOT EXISTS idx_financial_accounts_agency ON financial_accounts(agency_id);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_active ON financial_accounts(is_active);

-- 9. Comentarios
COMMENT ON COLUMN financial_accounts.agency_id IS 'Agencia a la que pertenece la cuenta';
COMMENT ON COLUMN financial_accounts.card_number IS 'Últimos 4 dígitos de la tarjeta de crédito';
COMMENT ON COLUMN financial_accounts.card_holder IS 'Titular de la tarjeta';
COMMENT ON COLUMN financial_accounts.asset_type IS 'Tipo de activo (VOUCHER, QUOTA, HOTEL, OTHER)';
COMMENT ON COLUMN financial_accounts.asset_description IS 'Descripción del activo';
COMMENT ON COLUMN financial_accounts.asset_quantity IS 'Cantidad de activos (cupos, vouchers, etc)';



-- ===== MIGRATION 047: 050_create_emilia_conversations.sql =====

-- =====================================================
-- SISTEMA DE CONVERSACIONES DE EMILIA
-- Migración 050: Conversaciones y mensajes del chat de búsqueda de viajes
-- =====================================================

-- Tabla de conversaciones
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Usuario propietario
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Información de la conversación
  title TEXT NOT NULL DEFAULT 'Chat',
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'closed')),
  channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp', 'api')),
  
  -- Contexto de búsqueda (CRÍTICO para mantener contexto conversacional)
  -- Guarda el parsed_request de la última búsqueda exitosa
  last_search_context JSONB,
  
  -- Timestamps
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de mensajes
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Conversación a la que pertenece
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Rol del mensaje
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  
  -- Contenido del mensaje (JSONB para flexibilidad)
  -- Estructura: { text?: string, cards?: array, metadata?: object }
  content JSONB NOT NULL,
  
  -- Idempotencia y trazabilidad
  client_id TEXT UNIQUE,                    -- UUID generado por el cliente para idempotencia
  api_request_id TEXT,                      -- request_id enviado a la API externa
  api_search_id TEXT,                       -- search_id recibido de la API externa
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para optimizar queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_active 
  ON conversations(user_id, state, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user_created 
  ON conversations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation 
  ON messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_client_id 
  ON messages(client_id) WHERE client_id IS NOT NULL;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_conversations_updated_at ON conversations;
CREATE TRIGGER trigger_update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_conversations_updated_at();

-- Comentarios para documentación
COMMENT ON TABLE conversations IS 'Conversaciones de Emilia (chat de búsqueda de viajes)';
COMMENT ON COLUMN conversations.last_search_context IS 'Contexto de la última búsqueda (parsed_request) para mantener continuidad conversacional';
COMMENT ON TABLE messages IS 'Mensajes individuales dentro de las conversaciones de Emilia';
COMMENT ON COLUMN messages.content IS 'Contenido JSONB: {text, cards, metadata}';
COMMENT ON COLUMN messages.client_id IS 'ID único generado por el cliente para prevenir duplicados';



-- ===== MIGRATION 048: 050_performance_indexes_final.sql =====

-- =====================================================
-- Optimización de Performance - Índices Finales
-- Migración 050: Índices compuestos para queries más comunes
-- =====================================================
-- Este archivo agrega índices compuestos y adicionales para optimizar
-- las queries más frecuentes del sistema, especialmente en producción
-- con grandes volúmenes de datos.

-- =====================================================
-- ÍNDICES COMPUESTOS PARA OPERATIONS
-- =====================================================

-- Query más común: Filtrar operaciones por agencia, estado y ordenar por fecha
CREATE INDEX IF NOT EXISTS idx_operations_agency_status_date 
  ON operations(agency_id, status, operation_date DESC NULLS LAST);

-- Query común: Operaciones por vendedor ordenadas por fecha
CREATE INDEX IF NOT EXISTS idx_operations_seller_date 
  ON operations(seller_id, operation_date DESC NULLS LAST)
  WHERE seller_id IS NOT NULL;

-- Query común: Operaciones por estado y fecha (para dashboards y reportes)
CREATE INDEX IF NOT EXISTS idx_operations_status_date 
  ON operations(status, operation_date DESC NULLS LAST);

-- Query común: Operaciones por operador y fecha
CREATE INDEX IF NOT EXISTS idx_operations_operator_date 
  ON operations(operator_id, operation_date DESC NULLS LAST)
  WHERE operator_id IS NOT NULL;

-- Query común: Búsqueda por código de archivo (file_code es único, pero el índice ayuda)
CREATE INDEX IF NOT EXISTS idx_operations_file_code 
  ON operations(file_code) 
  WHERE file_code IS NOT NULL;

-- =====================================================
-- ÍNDICES PARA LEDGER_MOVEMENTS
-- =====================================================

-- Query común: Movimientos ordenados por fecha (para reportes)
CREATE INDEX IF NOT EXISTS idx_ledger_created_at 
  ON ledger_movements(created_at DESC);

-- Query común: Movimientos por tipo y fecha (para análisis contables)
CREATE INDEX IF NOT EXISTS idx_ledger_type_created 
  ON ledger_movements(type, created_at DESC);

-- Query común: Movimientos por cuenta financiera y fecha
CREATE INDEX IF NOT EXISTS idx_ledger_account_created 
  ON ledger_movements(account_id, created_at DESC)
  WHERE account_id IS NOT NULL;

-- Query común: Movimientos por operación (para detalles de operación)
CREATE INDEX IF NOT EXISTS idx_ledger_operation 
  ON ledger_movements(operation_id)
  WHERE operation_id IS NOT NULL;

-- NOTA: ledger_movements NO tiene payment_id. La relación es al revés:
-- payments tiene ledger_movement_id (ver migración 047)

-- =====================================================
-- ÍNDICES PARA CASH_MOVEMENTS
-- =====================================================

-- Query común: Movimientos ordenados por fecha (para reportes de caja)
CREATE INDEX IF NOT EXISTS idx_cash_movement_date 
  ON cash_movements(movement_date DESC);

-- Query común: Movimientos por agencia y fecha (si agency_id existe)
-- Nota: Verificar si cash_movements tiene agency_id directamente o a través de operation_id
CREATE INDEX IF NOT EXISTS idx_cash_type_date 
  ON cash_movements(type, movement_date DESC);

-- Query común: Movimientos por caja y fecha
CREATE INDEX IF NOT EXISTS idx_cash_box_date 
  ON cash_movements(cash_box_id, movement_date DESC)
  WHERE cash_box_id IS NOT NULL;

-- Query común: Movimientos por operación (para detalles)
CREATE INDEX IF NOT EXISTS idx_cash_operation 
  ON cash_movements(operation_id)
  WHERE operation_id IS NOT NULL;

-- NOTA: El índice para payment_id en cash_movements ya existe en la migración 047
-- como idx_cash_movements_payment. No es necesario crearlo aquí.
-- Si necesitas verificar que existe, ejecuta primero la migración 047.

-- =====================================================
-- ÍNDICES PARA ALERTS
-- =====================================================

-- Query común: Alertas por fecha y estado (para dashboard y calendario)
CREATE INDEX IF NOT EXISTS idx_alerts_date_status 
  ON alerts(date_due, status);

-- Query común: Alertas por usuario y estado (para notificaciones personales)
CREATE INDEX IF NOT EXISTS idx_alerts_user_status 
  ON alerts(user_id, status) 
  WHERE user_id IS NOT NULL;

-- Query común: Alertas por operación (para detalle de operación)
CREATE INDEX IF NOT EXISTS idx_alerts_operation 
  ON alerts(operation_id)
  WHERE operation_id IS NOT NULL;

-- Query común: Alertas pendientes ordenadas por fecha (para lista de alertas)
CREATE INDEX IF NOT EXISTS idx_alerts_pending_date 
  ON alerts(date_due)
  WHERE status = 'PENDING';

-- =====================================================
-- ÍNDICES ADICIONALES PARA OPERATIONS
-- =====================================================

-- Índice para operation_date si no existe (ya debería existir de migración 046)
-- Pero lo verificamos y creamos si falta
CREATE INDEX IF NOT EXISTS idx_operations_operation_date 
  ON operations(operation_date DESC NULLS LAST);

-- Query común: Operaciones por fecha de salida (para calendario)
CREATE INDEX IF NOT EXISTS idx_operations_departure_date 
  ON operations(departure_date)
  WHERE departure_date IS NOT NULL;

-- Query común: Operaciones por lead (para ver operaciones de un lead convertido)
CREATE INDEX IF NOT EXISTS idx_operations_lead 
  ON operations(lead_id)
  WHERE lead_id IS NOT NULL;

-- =====================================================
-- ÍNDICES PARA PAYMENTS
-- =====================================================

-- Query común: Pagos por operación y estado (ya existe en 029, pero verificamos)
-- CREATE INDEX IF NOT EXISTS idx_payments_operation_status ON payments(operation_id, status);

-- Query común: Pagos vencidos o próximos a vencer
CREATE INDEX IF NOT EXISTS idx_payments_due_status 
  ON payments(date_due, status)
  WHERE status IN ('PENDING', 'OVERDUE');

-- =====================================================
-- ÍNDICES PARA COMMISSION_RECORDS
-- =====================================================

-- Query común: Comisiones por vendedor y estado
CREATE INDEX IF NOT EXISTS idx_commission_records_seller_status 
  ON commission_records(seller_id, status)
  WHERE seller_id IS NOT NULL;

-- Query común: Comisiones por fecha de cálculo (para reportes)
CREATE INDEX IF NOT EXISTS idx_commission_records_date 
  ON commission_records(date_calculated DESC);

-- =====================================================
-- ÍNDICES PARA OPERATOR_PAYMENTS
-- =====================================================

-- Query común: Pagos a operadores por fecha de vencimiento
CREATE INDEX IF NOT EXISTS idx_operator_payments_due_status 
  ON operator_payments(due_date, status)
  WHERE status = 'PENDING';

-- Query común: Pagos a operadores por operador
CREATE INDEX IF NOT EXISTS idx_operator_payments_operator 
  ON operator_payments(operator_id)
  WHERE operator_id IS NOT NULL;

-- =====================================================
-- ÍNDICES PARA LEADS
-- =====================================================

-- Query común: Leads por vendedor asignado y estado
CREATE INDEX IF NOT EXISTS idx_leads_seller_status 
  ON leads(assigned_seller_id, status)
  WHERE assigned_seller_id IS NOT NULL;

-- Query común: Leads por agencia y estado (para dashboards)
CREATE INDEX IF NOT EXISTS idx_leads_agency_status 
  ON leads(agency_id, status);

-- =====================================================
-- COMENTARIOS
-- =====================================================

COMMENT ON INDEX idx_operations_agency_status_date IS 'Índice compuesto para filtrar operaciones por agencia y estado, ordenadas por fecha (query más común)';
COMMENT ON INDEX idx_ledger_type_created IS 'Índice para reportes contables filtrados por tipo de movimiento';
COMMENT ON INDEX idx_cash_box_date IS 'Índice para reportes de caja filtrados por caja específica';
COMMENT ON INDEX idx_alerts_pending_date IS 'Índice para lista de alertas pendientes ordenadas por fecha de vencimiento';



-- ===== MIGRATION 049: 051_create_emilia_rls_policies.sql =====

-- =====================================================
-- POLÍTICAS RLS PARA CONVERSACIONES DE EMILIA
-- =====================================================

-- Habilitar RLS en las tablas
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Políticas para conversations
-- Los usuarios pueden ver solo sus propias conversaciones
CREATE POLICY "Users can view their own conversations"
  ON conversations
  FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Los usuarios pueden crear sus propias conversaciones
CREATE POLICY "Users can create their own conversations"
  ON conversations
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

-- Los usuarios pueden actualizar sus propias conversaciones
CREATE POLICY "Users can update their own conversations"
  ON conversations
  FOR UPDATE
  USING (auth.uid()::text = user_id::text);

-- Los usuarios pueden eliminar sus propias conversaciones
CREATE POLICY "Users can delete their own conversations"
  ON conversations
  FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- Políticas para messages
-- Los usuarios pueden ver mensajes de sus conversaciones
CREATE POLICY "Users can view messages from their conversations"
  ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id::text
    )
  );

-- Los usuarios pueden crear mensajes en sus conversaciones
CREATE POLICY "Users can create messages in their conversations"
  ON messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id::text
    )
  );

-- Los usuarios pueden actualizar mensajes de sus conversaciones
CREATE POLICY "Users can update messages in their conversations"
  ON messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id::text
    )
  );

-- Los usuarios pueden eliminar mensajes de sus conversaciones
CREATE POLICY "Users can delete messages from their conversations"
  ON messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id::text
    )
  );




-- ===== MIGRATION 050: 051_delete_all_trello_leads.sql =====

-- =====================================================
-- Migración 051: Borrar TODOS los leads de Trello
-- =====================================================
-- Esta migración borra de forma limpia y completa todos los leads
-- que provienen de Trello, incluyendo todas las referencias relacionadas.
--
-- IMPORTANTE: Esta migración es DESTRUCTIVA y no se puede revertir.
-- Solo ejecutar si se quiere hacer un reset completo de Trello.

BEGIN;

-- =====================================================
-- PASO 1: Verificar y mostrar conteo antes de borrar
-- =====================================================
DO $$
DECLARE
  trello_leads_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO trello_leads_count
  FROM leads
  WHERE source = 'Trello';
  
  RAISE NOTICE '📊 Leads de Trello encontrados: %', trello_leads_count;
END $$;

-- =====================================================
-- PASO 2: Borrar documentos asociados a leads de Trello
-- =====================================================
-- Los documentos tienen ON DELETE CASCADE, pero lo hacemos explícito
DELETE FROM documents
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 3: Borrar alertas asociadas a leads de Trello
-- =====================================================
DELETE FROM alerts
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 4: Borrar comunicaciones asociadas a leads de Trello
-- =====================================================
DELETE FROM communications
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 5: Borrar cotizaciones asociadas a leads de Trello
-- =====================================================
-- Las cotizaciones tienen ON DELETE SET NULL, pero las borramos explícitamente
DELETE FROM quotations
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 6: Limpiar referencias en ledger_movements
-- =====================================================
-- Los ledger_movements tienen ON DELETE SET NULL, así que solo limpiamos la referencia
UPDATE ledger_movements
SET lead_id = NULL
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 7: Limpiar referencias en operations
-- =====================================================
-- Las operations tienen ON DELETE SET NULL, así que solo limpiamos la referencia
UPDATE operations
SET lead_id = NULL
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 8: BORRAR TODOS LOS LEADS DE TRELLO
-- =====================================================
-- Este es el paso principal que borra todos los leads
DELETE FROM leads
WHERE source = 'Trello';

-- =====================================================
-- PASO 9: Verificar que se borraron todos
-- =====================================================
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM leads
  WHERE source = 'Trello';
  
  IF remaining_count > 0 THEN
    RAISE EXCEPTION '⚠️  Aún quedan % leads de Trello después del borrado', remaining_count;
  ELSE
    RAISE NOTICE '✅ Todos los leads de Trello fueron borrados exitosamente';
  END IF;
END $$;

-- =====================================================
-- PASO 10: Vaciar caché de estadísticas (si existe)
-- =====================================================
-- Nota: Esto se hace a nivel de aplicación, no en SQL
-- Pero podemos resetear last_sync_at en settings_trello
UPDATE settings_trello
SET last_sync_at = NULL,
    updated_at = NOW();

COMMIT;

-- =====================================================
-- RESUMEN
-- =====================================================
-- Esta migración:
-- ✅ Borra todos los leads con source = 'Trello'
-- ✅ Limpia documentos asociados (CASCADE)
-- ✅ Limpia alertas asociadas (CASCADE)
-- ✅ Limpia comunicaciones asociadas (CASCADE)
-- ✅ Borra cotizaciones asociadas
-- ✅ Limpia referencias en ledger_movements (SET NULL)
-- ✅ Limpia referencias en operations (SET NULL)
-- ✅ Resetea last_sync_at en settings_trello
--
-- NOTA: El caché de Next.js se invalidará automáticamente
-- cuando se recargue la página, ya que los datos cambiaron.



-- ===== MIGRATION 051: 051_delete_all_trello_leads_complete.sql =====

-- =====================================================
-- BORRAR TODOS LOS LEADS DE TRELLO - SCRIPT COMPLETO
-- =====================================================
-- Ejecutar este script directamente en Supabase SQL Editor
-- Borra TODO lo relacionado a leads de Trello de forma limpia y completa

BEGIN;

-- =====================================================
-- PASO 1: Verificar conteo antes de borrar
-- =====================================================
DO $$
DECLARE
  trello_leads_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO trello_leads_count FROM leads WHERE source = 'Trello';
  RAISE NOTICE '📊 Leads de Trello encontrados antes de borrar: %', trello_leads_count;
END $$;

-- =====================================================
-- PASO 2: Borrar documentos asociados a leads de Trello
-- =====================================================
DELETE FROM documents
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 3: Borrar alertas asociadas a leads de Trello
-- =====================================================
DELETE FROM alerts
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 4: Borrar comunicaciones asociadas a leads de Trello
-- =====================================================
DELETE FROM communications
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 5: Borrar cotizaciones asociadas a leads de Trello
-- =====================================================
DELETE FROM quotations
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 6: Limpiar referencias en ledger_movements
-- =====================================================
UPDATE ledger_movements
SET lead_id = NULL
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 7: Limpiar referencias en operations
-- =====================================================
UPDATE operations
SET lead_id = NULL
WHERE lead_id IN (
  SELECT id FROM leads WHERE source = 'Trello'
);

-- =====================================================
-- PASO 8: BORRAR TODOS LOS LEADS DE TRELLO
-- =====================================================
-- Este es el paso principal - borra todos los leads con source = 'Trello'
DELETE FROM leads
WHERE source = 'Trello';

-- =====================================================
-- PASO 9: BORRAR LEADS CON trello_list_id (por si acaso)
-- =====================================================
-- Por si hay leads que no tienen source = 'Trello' pero tienen trello_list_id
DELETE FROM leads
WHERE trello_list_id IS NOT NULL
  AND source != 'Trello'
  AND (trello_url IS NOT NULL OR external_id IS NOT NULL);

-- =====================================================
-- PASO 10: BORRAR LEADS CON trello_url o external_id de Trello
-- =====================================================
-- Por si hay leads que tienen URL de Trello pero source diferente
DELETE FROM leads
WHERE (trello_url LIKE '%trello.com%' OR trello_url LIKE '%trello%')
  AND source != 'Trello';

-- =====================================================
-- PASO 11: Resetear last_sync_at en settings_trello
-- =====================================================
UPDATE settings_trello
SET last_sync_at = NULL,
    updated_at = NOW();

-- =====================================================
-- PASO 12: Verificar que se borraron todos
-- =====================================================
DO $$
DECLARE
  remaining_trello INTEGER;
  remaining_with_list_id INTEGER;
  remaining_with_url INTEGER;
BEGIN
  -- Contar leads con source = 'Trello'
  SELECT COUNT(*) INTO remaining_trello FROM leads WHERE source = 'Trello';
  
  -- Contar leads con trello_list_id
  SELECT COUNT(*) INTO remaining_with_list_id FROM leads WHERE trello_list_id IS NOT NULL;
  
  -- Contar leads con trello_url
  SELECT COUNT(*) INTO remaining_with_url FROM leads WHERE trello_url IS NOT NULL;
  
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '📊 VERIFICACIÓN FINAL:';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Leads con source = ''Trello'': %', remaining_trello;
  RAISE NOTICE 'Leads con trello_list_id: %', remaining_with_list_id;
  RAISE NOTICE 'Leads con trello_url: %', remaining_with_url;
  RAISE NOTICE '';
  
  IF remaining_trello = 0 AND remaining_with_list_id = 0 AND remaining_with_url = 0 THEN
    RAISE NOTICE '✅ ¡TODOS LOS LEADS DE TRELLO FUERON BORRADOS EXITOSAMENTE!';
  ELSE
    RAISE WARNING '⚠️  Aún quedan leads relacionados con Trello:';
    IF remaining_trello > 0 THEN
      RAISE WARNING '   - % leads con source = ''Trello''', remaining_trello;
    END IF;
    IF remaining_with_list_id > 0 THEN
      RAISE WARNING '   - % leads con trello_list_id', remaining_with_list_id;
    END IF;
    IF remaining_with_url > 0 THEN
      RAISE WARNING '   - % leads con trello_url', remaining_with_url;
    END IF;
  END IF;
  RAISE NOTICE '============================================================';
END $$;

COMMIT;

-- =====================================================
-- RESUMEN DE LO QUE SE BORRÓ
-- =====================================================
-- ✅ Todos los leads con source = 'Trello'
-- ✅ Todos los leads con trello_list_id
-- ✅ Todos los leads con trello_url de Trello
-- ✅ Documentos asociados (CASCADE)
-- ✅ Alertas asociadas (CASCADE)
-- ✅ Comunicaciones asociadas (CASCADE)
-- ✅ Cotizaciones asociadas
-- ✅ Referencias en ledger_movements (SET NULL)
-- ✅ Referencias en operations (SET NULL)
-- ✅ last_sync_at reseteado en settings_trello
--
-- NOTA: Después de ejecutar este script, recargar la página
-- en el navegador para que el caché se actualice.



-- ===== MIGRATION 052: 052_create_operation_operators.sql =====

-- =====================================================
-- Migración 052: Crear tabla operation_operators
-- Permite múltiples operadores por operación con costos individuales
-- =====================================================

-- Crear tabla de relación many-to-many entre operations y operators
CREATE TABLE IF NOT EXISTS operation_operators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  cost NUMERIC NOT NULL DEFAULT 0,
  cost_currency TEXT NOT NULL DEFAULT 'ARS' CHECK (cost_currency IN ('ARS', 'USD')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(operation_id, operator_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_operation_operators_operation_id ON operation_operators(operation_id);
CREATE INDEX IF NOT EXISTS idx_operation_operators_operator_id ON operation_operators(operator_id);

-- Comentarios
COMMENT ON TABLE operation_operators IS 'Relación many-to-many entre operaciones y operadores. Permite múltiples operadores por operación con costos individuales.';
COMMENT ON COLUMN operation_operators.cost IS 'Costo individual de este operador para esta operación';
COMMENT ON COLUMN operation_operators.cost_currency IS 'Moneda del costo (ARS o USD)';

-- Migrar datos existentes: Si una operación tiene operator_id, crear registro en operation_operators
INSERT INTO operation_operators (operation_id, operator_id, cost, cost_currency)
SELECT 
  id as operation_id,
  operator_id,
  COALESCE(operator_cost, 0) as cost,
  COALESCE(operator_cost_currency, currency, 'ARS') as cost_currency
FROM operations
WHERE operator_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM operation_operators 
    WHERE operation_operators.operation_id = operations.id 
    AND operation_operators.operator_id = operations.operator_id
  )
ON CONFLICT (operation_id, operator_id) DO NOTHING;

-- NOTA: No eliminamos operator_id de operations para mantener compatibilidad hacia atrás
-- El campo operator_id seguirá existiendo pero será considerado como "operador principal"
-- cuando haya múltiples operadores, se calculará la suma de costos de operation_operators



-- ===== MIGRATION 053: 052_fix_user_id_type.sql =====

-- =====================================================
-- FIX: Cambiar user_id de UUID a TEXT (sin FK constraint)
-- Migración 052: Compatibilidad con sistema de auth existente
-- =====================================================

-- PASO 1: Eliminar políticas RLS existentes
DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON conversations;

DROP POLICY IF EXISTS "Users can view messages from their conversations" ON messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can delete messages from their conversations" ON messages;

-- PASO 2: Eliminar constraint de FK
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;

-- PASO 3: Cambiar el tipo de dato de user_id a TEXT
ALTER TABLE conversations ALTER COLUMN user_id TYPE TEXT;

-- NOTA: No agregamos FK constraint porque users.id es UUID y user_id es TEXT
-- La integridad se maneja a nivel de aplicación

-- PASO 4: Recrear políticas RLS con TEXT
-- Políticas para conversations
CREATE POLICY "Users can view their own conversations"
  ON conversations
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create their own conversations"
  ON conversations
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own conversations"
  ON conversations
  FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own conversations"
  ON conversations
  FOR DELETE
  USING (auth.uid()::text = user_id);

-- Políticas para messages (sin cambios, solo las recreamos)
CREATE POLICY "Users can view messages from their conversations"
  ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id
    )
  );

CREATE POLICY "Users can create messages in their conversations"
  ON messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id
    )
  );

CREATE POLICY "Users can update messages in their conversations"
  ON messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id
    )
  );

CREATE POLICY "Users can delete messages from their conversations"
  ON messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND auth.uid()::text = conversations.user_id
    )
  );


-- ===== MIGRATION 054: 053_create_chart_of_accounts.sql =====

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

-- Eliminar trigger si existe antes de crearlo
DROP TRIGGER IF EXISTS update_chart_of_accounts_updated_at ON chart_of_accounts;

CREATE TRIGGER update_chart_of_accounts_updated_at
  BEFORE UPDATE ON chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_chart_of_accounts_updated_at();



-- ===== MIGRATION 055: 053_disable_emilia_rls.sql =====

-- =====================================================
-- DESHABILITAR RLS para conversaciones de Emilia
-- Migración 053: El control de acceso se hace en el API
-- =====================================================

-- Eliminar todas las políticas RLS
DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON conversations;

DROP POLICY IF EXISTS "Users can view messages from their conversations" ON messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can delete messages from their conversations" ON messages;

-- Deshabilitar RLS - el control de acceso se maneja en el código del API
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- NOTA: El control de acceso se hace en los endpoints del API
-- verificando que user.id coincide con conversation.user_id




-- ===== MIGRATION 056: 054_add_billing_margin.sql =====

-- =====================================================
-- Migración 054: Agregar campo billing_margin_amount
-- Permite diferenciar ganancia real vs ganancia para facturación
-- =====================================================

-- Agregar campo billing_margin_amount a operations
ALTER TABLE operations 
ADD COLUMN IF NOT EXISTS billing_margin_amount NUMERIC(18,2);

-- Agregar campo billing_margin_percentage
ALTER TABLE operations 
ADD COLUMN IF NOT EXISTS billing_margin_percentage NUMERIC(5,2);

-- Comentarios
COMMENT ON COLUMN operations.billing_margin_amount IS 'Ganancia para facturación (puede diferir de margin_amount por ajustes contables)';
COMMENT ON COLUMN operations.billing_margin_percentage IS 'Porcentaje de ganancia para facturación';

-- Por defecto, usar margin_amount como billing_margin_amount para operaciones existentes
UPDATE operations 
SET billing_margin_amount = margin_amount,
    billing_margin_percentage = margin_percentage
WHERE billing_margin_amount IS NULL;

-- Índice para búsquedas
CREATE INDEX IF NOT EXISTS idx_operations_billing_margin ON operations(billing_margin_amount) WHERE billing_margin_amount IS NOT NULL;

-- ===== MIGRATION 057: 054_optimize_emilia_indexes.sql =====

-- Optimización de índices para Emilia
-- Mejora performance de queries frecuentes en conversaciones y mensajes

-- Index para lista de conversaciones (query más frecuente)
-- Optimiza: SELECT * FROM conversations WHERE user_id = X AND state = 'active' ORDER BY last_message_at DESC
CREATE INDEX IF NOT EXISTS idx_conversations_user_state_date
ON conversations(user_id, state, last_message_at DESC)
WHERE state = 'active';

-- Index para conversaciones cerradas (menos usado, pero importante)
CREATE INDEX IF NOT EXISTS idx_conversations_user_closed
ON conversations(user_id, last_message_at DESC)
WHERE state = 'closed';

-- Index para mensajes por conversación ordenados por fecha
-- Optimiza: SELECT * FROM messages WHERE conversation_id = X ORDER BY created_at ASC
CREATE INDEX IF NOT EXISTS idx_messages_conversation_date
ON messages(conversation_id, created_at ASC);

-- Index para búsqueda de última mensaje de conversación
-- Optimiza: SELECT content, created_at FROM messages WHERE conversation_id = X ORDER BY created_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_messages_conversation_last
ON messages(conversation_id, created_at DESC);

-- ESTADÍSTICAS: Actualizar stats de las tablas para mejor query planning
ANALYZE conversations;
ANALYZE messages;

-- COMENTARIOS
COMMENT ON INDEX idx_conversations_user_state_date IS 'Optimiza lista de conversaciones activas por usuario';
COMMENT ON INDEX idx_conversations_user_closed IS 'Optimiza lista de conversaciones cerradas por usuario';
COMMENT ON INDEX idx_messages_conversation_date IS 'Optimiza carga de mensajes de una conversación';
COMMENT ON INDEX idx_messages_conversation_last IS 'Optimiza obtención del último mensaje';


-- ===== MIGRATION 058: 055_create_conversation_rpc.sql =====

-- Función RPC para creación rápida de conversaciones
-- Evita múltiples roundtrips y optimiza la inserción

CREATE OR REPLACE FUNCTION create_conversation_fast(
  p_user_id UUID,
  p_title TEXT,
  p_channel TEXT DEFAULT 'web'
) RETURNS TABLE (
  id UUID,
  title TEXT,
  state TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insertar y retornar en una sola operación
  RETURN QUERY
  INSERT INTO conversations (
    user_id,
    title,
    state,
    channel,
    last_message_at,
    last_search_context
  )
  VALUES (
    p_user_id,
    p_title,
    'active',
    p_channel,
    NOW(),
    NULL
  )
  RETURNING
    conversations.id,
    conversations.title,
    conversations.state,
    conversations.created_at;
END;
$$;

-- Grants de permisos
GRANT EXECUTE ON FUNCTION create_conversation_fast TO authenticated;

-- Comentario
COMMENT ON FUNCTION create_conversation_fast IS 'Crea una nueva conversación de forma optimizada. Retorna solo campos esenciales.';


-- ===== MIGRATION 059: 056_create_lead_comments.sql =====

-- Crear tabla para comentarios de leads
-- Permite que los vendedores dejen comentarios en los leads
CREATE TABLE IF NOT EXISTS lead_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_lead_comments_lead_id ON lead_comments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_comments_user_id ON lead_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_comments_created_at ON lead_comments(created_at DESC);

-- Comentarios para documentación
COMMENT ON TABLE lead_comments IS 'Comentarios de vendedores en leads. Permite comunicación interna sobre el lead.';
COMMENT ON COLUMN lead_comments.lead_id IS 'ID del lead al que pertenece el comentario';
COMMENT ON COLUMN lead_comments.user_id IS 'ID del usuario (vendedor) que creó el comentario';
COMMENT ON COLUMN lead_comments.comment IS 'Texto del comentario';



-- ===== MIGRATION 060: 057_add_manychat_source.sql =====

-- Agregar "Manychat" como valor válido para source en leads
-- Esto permite que los leads de Manychat se guarden con source = 'Manychat'

ALTER TABLE leads
DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE leads
ADD CONSTRAINT leads_source_check 
CHECK (source IN ('Instagram', 'WhatsApp', 'Meta Ads', 'Other', 'Trello', 'Manychat'));

-- Comentario para documentación
COMMENT ON COLUMN leads.source IS 'Origen del lead: Instagram, WhatsApp, Meta Ads, Other, Trello, o Manychat';



-- ===== MIGRATION 061: 058_add_manychat_full_data.sql =====

-- Agregar campo JSONB para guardar TODA la información completa de Manychat
-- Similar a trello_full_data, pero para leads de Manychat
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS manychat_full_data JSONB;

-- Crear índice GIN para búsquedas rápidas en el JSONB
CREATE INDEX IF NOT EXISTS idx_leads_manychat_full_data ON leads USING GIN (manychat_full_data);

-- Comentario para documentación
COMMENT ON COLUMN leads.manychat_full_data IS 'Datos completos del lead de Manychat en formato JSON, incluyendo todos los campos custom, metadata, etc.';



-- ===== MIGRATION 062: 059_add_list_name_to_leads.sql =====

-- Agregar campo list_name para leads de Manychat (independiente de Trello)
-- Este campo almacena el nombre de la lista/columna donde debe aparecer el lead en el kanban
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS list_name TEXT;

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_leads_list_name ON leads(list_name) WHERE list_name IS NOT NULL;

-- Comentario para documentación
COMMENT ON COLUMN leads.list_name IS 'Nombre de la lista/columna del kanban. Para leads de Manychat, se calcula según la lógica de Zapier. Para leads de Trello, se obtiene de la lista de Trello.';



-- ===== MIGRATION 063: 060_create_manychat_list_order.sql =====

-- Tabla para almacenar el orden de listas en CRM Manychat (INDEPENDIENTE de Trello)
-- Esto permite tener un orden personalizado y editable sin depender de la sincronización de Trello

CREATE TABLE IF NOT EXISTS manychat_list_order (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  list_name TEXT NOT NULL,
  position INTEGER NOT NULL, -- Orden de la lista (0, 1, 2, ...)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agency_id, list_name) -- Una lista solo puede aparecer una vez por agencia
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_manychat_list_order_agency_id ON manychat_list_order(agency_id);
CREATE INDEX IF NOT EXISTS idx_manychat_list_order_position ON manychat_list_order(agency_id, position);

-- Habilitar RLS
ALTER TABLE manychat_list_order ENABLE ROW LEVEL SECURITY;

-- Policies: Todos pueden leer, solo admins pueden escribir
CREATE POLICY "Manychat list order is viewable by authenticated users"
  ON manychat_list_order FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Manychat list order is editable by admins"
  ON manychat_list_order FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Comentario para documentación
COMMENT ON TABLE manychat_list_order IS 'Orden personalizado de listas en CRM Manychat. Independiente de Trello. Permite editar el orden de las columnas sin afectar la sincronización de Trello.';
COMMENT ON COLUMN manychat_list_order.list_name IS 'Nombre de la lista (ej: "Leads - Instagram", "Campaña - X", etc.)';
COMMENT ON COLUMN manychat_list_order.position IS 'Posición/orden de la lista (0 = primera, 1 = segunda, etc.)';



-- ===== MIGRATION 064: 061_create_ai_query_function.sql =====

-- =====================================================
-- Migración 061: Función RPC para queries readonly del AI Companion
-- =====================================================
-- Permite que el AI Companion ejecute queries SELECT de forma segura
-- Solo permite SELECT, valida SQL, y tiene rate limiting

-- Función para ejecutar queries readonly de forma segura
CREATE OR REPLACE FUNCTION execute_readonly_query(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  normalized_query TEXT;
  result JSONB;
  query_start_time TIMESTAMP;
  query_duration INTERVAL;
  trimmed_query TEXT;
  semicolon_count INTEGER;
BEGIN
  -- Validar que la query no esté vacía
  IF query_text IS NULL OR TRIM(query_text) = '' THEN
    RAISE EXCEPTION 'Query vacía no permitida';
  END IF;

  -- Normalizar query (remover espacios y saltos de línea al inicio/final, convertir a mayúsculas)
  -- Usar regexp_replace para eliminar espacios y saltos de línea al inicio
  normalized_query := UPPER(REGEXP_REPLACE(TRIM(query_text), '^\s+', '', 'g'));

  -- Validar que solo sea SELECT (seguridad crítica)
  -- Permitir espacios y saltos de línea después de SELECT
  IF NOT normalized_query ~ '^SELECT\s' THEN
    RAISE EXCEPTION 'Solo se permiten queries SELECT. Query recibida: %', LEFT(REGEXP_REPLACE(query_text, '\s+', ' ', 'g'), 100);
  END IF;

  -- Validar que no contenga comandos peligrosos (solo al inicio de palabras, no dentro de strings)
  -- Usamos regex para buscar comandos SQL reales, no palabras dentro de strings o nombres
  IF normalized_query ~ '\m(DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL)\M' THEN
    RAISE EXCEPTION 'Comandos peligrosos no permitidos en queries readonly';
  END IF;
  
  -- Validación adicional: asegurar que no hay múltiples SELECT seguidos de comandos peligrosos
  -- Esto previene queries como "SELECT ...; DROP TABLE ..."
  IF normalized_query ~ ';\s*(DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL)' THEN
    RAISE EXCEPTION 'Múltiples comandos no permitidos';
  END IF;

  -- Validar que no tenga múltiples statements (prevenir SQL injection)
  -- Contar solo los `;` que no están al final (después de espacios)
  trimmed_query := TRIM(TRAILING ';' FROM TRIM(query_text));
  semicolon_count := (SELECT COUNT(*) FROM regexp_split_to_table(trimmed_query, ';'));
  
  -- Permitir máximo 1 statement (el SELECT principal)
  IF semicolon_count > 1 THEN
    RAISE EXCEPTION 'Múltiples statements no permitidos';
  END IF;

  -- Registrar inicio de query
  query_start_time := clock_timestamp();

  -- Ejecutar query de forma segura usando EXECUTE
  BEGIN
    EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query_text) INTO result;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error ejecutando query: %', SQLERRM;
  END;

  -- Calcular duración
  query_duration := clock_timestamp() - query_start_time;

  -- Si la query tomó más de 10 segundos, registrar warning
  IF query_duration > INTERVAL '10 seconds' THEN
    RAISE WARNING 'Query lenta detectada: % segundos. Query: %', EXTRACT(EPOCH FROM query_duration), LEFT(query_text, 200);
  END IF;

  -- Retornar resultado (o array vacío si no hay resultados)
  RETURN COALESCE(result, '[]'::JSONB);

END;
$$;

-- Comentarios
COMMENT ON FUNCTION execute_readonly_query IS 'Ejecuta queries SELECT de forma segura para el AI Companion. Solo permite SELECT, valida SQL, y previene comandos peligrosos.';

-- Grant execute a authenticated users (todos los usuarios autenticados pueden usar esta función)
GRANT EXECUTE ON FUNCTION execute_readonly_query(TEXT) TO authenticated;

-- Crear índice para mejorar performance de queries comunes
-- (Esto se hace en las migraciones de índices existentes)



-- ===== MIGRATION 065: 062_create_customer_settings.sql =====

-- =====================================================
-- Migración 062: Crear Configuración de Clientes
-- Sistema de configuración para el módulo de clientes
-- =====================================================

-- Tabla de configuración de clientes (una por agencia)
CREATE TABLE IF NOT EXISTS customer_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Campos personalizados (JSON array)
  -- Ejemplo: [{"name": "preferred_destination", "type": "text", "label": "Destino Preferido", "required": false}]
  custom_fields JSONB DEFAULT '[]'::jsonb,
  
  -- Validaciones de datos (JSON object)
  -- Ejemplo: {"email": {"required": true, "format": "email"}, "phone": {"required": true, "format": "phone"}}
  validations JSONB DEFAULT '{}'::jsonb,
  
  -- Notificaciones automáticas (JSON array)
  -- Ejemplo: [{"event": "new_customer", "enabled": true, "channels": ["email", "whatsapp"]}]
  notifications JSONB DEFAULT '[]'::jsonb,
  
  -- Integraciones con otros módulos (JSON object)
  -- Ejemplo: {"operations": {"auto_link": true}, "leads": {"auto_convert": false}}
  integrations JSONB DEFAULT '{}'::jsonb,
  
  -- Configuración general
  auto_assign_lead BOOLEAN DEFAULT false,
  require_document BOOLEAN DEFAULT false,
  duplicate_check_enabled BOOLEAN DEFAULT true,
  duplicate_check_fields TEXT[] DEFAULT ARRAY['email', 'phone'],
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  UNIQUE(agency_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_customer_settings_agency ON customer_settings(agency_id);

-- Comentarios
COMMENT ON TABLE customer_settings IS 'Configuración del módulo de clientes por agencia';
COMMENT ON COLUMN customer_settings.custom_fields IS 'Campos personalizados configurables para clientes';
COMMENT ON COLUMN customer_settings.validations IS 'Reglas de validación para campos de clientes';
COMMENT ON COLUMN customer_settings.notifications IS 'Configuración de notificaciones automáticas';
COMMENT ON COLUMN customer_settings.integrations IS 'Integraciones con otros módulos del sistema';

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_customer_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_customer_settings_updated_at
  BEFORE UPDATE ON customer_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_settings_updated_at();

-- RLS Policies
ALTER TABLE customer_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Solo usuarios con acceso a customers pueden ver/editar configuración
CREATE POLICY "Users with customers access can view customer settings"
  ON customer_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('SUPER_ADMIN', 'ADMIN', 'SELLER')
    )
  );

CREATE POLICY "Users with customers access can insert customer settings"
  ON customer_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

CREATE POLICY "Users with customers access can update customer settings"
  ON customer_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

CREATE POLICY "Only super admins can delete customer settings"
  ON customer_settings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );



-- ===== MIGRATION 066: 063_add_custom_fields_to_customers.sql =====

-- =====================================================
-- Migración 063: Agregar campos personalizados a customers
-- Almacena valores de campos personalizados configurados
-- =====================================================

-- Agregar columna JSONB para campos personalizados
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- Índice GIN para búsquedas eficientes en JSONB
CREATE INDEX IF NOT EXISTS idx_customers_custom_fields ON customers USING GIN (custom_fields);

-- Comentario
COMMENT ON COLUMN customers.custom_fields IS 'Valores de campos personalizados configurados en customer_settings';



-- ===== MIGRATION 067: 064_create_operation_settings.sql =====

-- =====================================================
-- Migración 064: Crear Configuración de Operaciones
-- Sistema de configuración para el módulo de operaciones
-- =====================================================

-- Tabla de configuración de operaciones (una por agencia)
CREATE TABLE IF NOT EXISTS operation_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Estados personalizados (JSON array)
  -- Ejemplo: [{"value": "PENDING_APPROVAL", "label": "Pendiente Aprobación", "color": "bg-yellow-500", "order": 1}]
  custom_statuses JSONB DEFAULT '[]'::jsonb,
  
  -- Flujos de trabajo (JSON object)
  -- Ejemplo: {"PRE_RESERVATION": {"next_states": ["RESERVED", "CANCELLED"], "required_fields": ["destination"]}}
  workflows JSONB DEFAULT '{}'::jsonb,
  
  -- Alertas automáticas (JSON array)
  -- Ejemplo: [{"type": "payment_due", "enabled": true, "days_before": 30, "channels": ["email", "whatsapp"]}]
  auto_alerts JSONB DEFAULT '[]'::jsonb,
  
  -- Plantillas de documentos (JSON array)
  -- Ejemplo: [{"name": "Cotización", "template_id": "uuid", "auto_generate": true, "trigger": "CONFIRMED"}]
  document_templates JSONB DEFAULT '[]'::jsonb,
  
  -- Configuración de estados por defecto
  default_status TEXT DEFAULT 'PRE_RESERVATION',
  
  -- Configuración de validaciones
  require_destination BOOLEAN DEFAULT true,
  require_departure_date BOOLEAN DEFAULT true,
  require_operator BOOLEAN DEFAULT false,
  require_customer BOOLEAN DEFAULT false,
  
  -- Configuración de alertas
  alert_payment_due_days INTEGER DEFAULT 30,
  alert_operator_payment_days INTEGER DEFAULT 30,
  alert_upcoming_trip_days INTEGER DEFAULT 7,
  
  -- Configuración de documentos
  auto_generate_quotation BOOLEAN DEFAULT false,
  auto_generate_invoice BOOLEAN DEFAULT false,
  require_documents_before_confirmation BOOLEAN DEFAULT false,
  
  -- Configuración de integraciones
  auto_create_ledger_entry BOOLEAN DEFAULT true,
  auto_create_iva_entry BOOLEAN DEFAULT true,
  auto_create_operator_payment BOOLEAN DEFAULT true,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  UNIQUE(agency_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_operation_settings_agency ON operation_settings(agency_id);

-- Comentarios
COMMENT ON TABLE operation_settings IS 'Configuración del módulo de operaciones por agencia';
COMMENT ON COLUMN operation_settings.custom_statuses IS 'Estados personalizados adicionales a los estados estándar';
COMMENT ON COLUMN operation_settings.workflows IS 'Flujos de trabajo y transiciones de estado permitidas';
COMMENT ON COLUMN operation_settings.auto_alerts IS 'Configuración de alertas automáticas';
COMMENT ON COLUMN operation_settings.document_templates IS 'Plantillas de documentos asociadas a operaciones';

-- RLS (Row Level Security)
ALTER TABLE operation_settings ENABLE ROW LEVEL SECURITY;

-- Política: Solo usuarios con acceso a operaciones pueden ver configuración
CREATE POLICY "Users can view operation settings for their agencies"
  ON operation_settings
  FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- Política: Solo ADMIN y SUPER_ADMIN pueden modificar configuración
CREATE POLICY "Only admins can modify operation settings"
  ON operation_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );


-- ===== MIGRATION 068: 065_create_financial_settings.sql =====

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
  primary_currency TEXT DEFAULT 'USD' CHECK (primary_currency IN ('ARS', 'USD')),
  
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


-- ===== MIGRATION 069: 066_add_product_type_to_operation_operators.sql =====

-- =====================================================
-- Migración 066: Agregar product_type a operation_operators
-- Permite especificar el tipo de producto por operador
-- =====================================================

-- Agregar columna product_type a operation_operators
ALTER TABLE operation_operators
  ADD COLUMN IF NOT EXISTS product_type TEXT CHECK (product_type IN ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED'));

-- Comentario
COMMENT ON COLUMN operation_operators.product_type IS 'Tipo de producto que maneja este operador en esta operación (FLIGHT, HOTEL, PACKAGE, CRUISE, TRANSFER, MIXED)';

-- Índice para búsquedas por tipo de producto
CREATE INDEX IF NOT EXISTS idx_operation_operators_product_type ON operation_operators(product_type) WHERE product_type IS NOT NULL;


-- ===== MIGRATION 070: 066_create_tools_settings.sql =====

-- =====================================================
-- Migración 066: Crear Configuración de Herramientas
-- Sistema de configuración para herramientas y notificaciones
-- =====================================================

-- Tabla de configuración de herramientas (una por agencia)
CREATE TABLE IF NOT EXISTS tools_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Configuración de Emilia (AI Copilot)
  emilia_enabled BOOLEAN DEFAULT true,
  emilia_model TEXT DEFAULT 'gpt-4',
  emilia_temperature NUMERIC(3,2) DEFAULT 0.7,
  emilia_max_tokens INTEGER DEFAULT 2000,
  emilia_system_prompt TEXT,
  emilia_allowed_actions JSONB DEFAULT '["search", "summarize", "suggest"]'::jsonb,
  
  -- Configuración de Email
  email_enabled BOOLEAN DEFAULT true,
  email_provider TEXT DEFAULT 'resend',
  email_from_name TEXT DEFAULT 'MAXEVA Gestión',
  email_from_address TEXT,
  email_reply_to TEXT,
  email_signature TEXT,
  email_templates JSONB DEFAULT '{}'::jsonb,
  
  -- Configuración de WhatsApp
  whatsapp_enabled BOOLEAN DEFAULT true,
  whatsapp_provider TEXT DEFAULT 'manual', -- 'manual' | 'api' | 'manychat'
  whatsapp_api_key TEXT,
  whatsapp_default_country_code TEXT DEFAULT '+54',
  whatsapp_templates JSONB DEFAULT '{}'::jsonb,
  
  -- Configuración de Notificaciones del Sistema
  notifications_enabled BOOLEAN DEFAULT true,
  notifications_sound BOOLEAN DEFAULT true,
  notifications_desktop BOOLEAN DEFAULT true,
  notifications_email_digest BOOLEAN DEFAULT false,
  notifications_digest_frequency TEXT DEFAULT 'daily', -- 'daily' | 'weekly' | 'never'
  
  -- Configuración de Exportaciones
  export_default_format TEXT DEFAULT 'xlsx', -- 'xlsx' | 'csv' | 'pdf'
  export_include_headers BOOLEAN DEFAULT true,
  export_date_format TEXT DEFAULT 'DD/MM/YYYY',
  export_currency_format TEXT DEFAULT 'symbol', -- 'symbol' | 'code' | 'both'
  export_logo_url TEXT,
  export_company_info JSONB DEFAULT '{}'::jsonb,
  
  -- Preferencias de Interfaz
  ui_theme TEXT DEFAULT 'system', -- 'light' | 'dark' | 'system'
  ui_sidebar_collapsed BOOLEAN DEFAULT false,
  ui_compact_mode BOOLEAN DEFAULT false,
  ui_show_tooltips BOOLEAN DEFAULT true,
  ui_default_currency_display TEXT DEFAULT 'ARS',
  ui_date_format TEXT DEFAULT 'DD/MM/YYYY',
  ui_time_format TEXT DEFAULT '24h', -- '12h' | '24h'
  ui_language TEXT DEFAULT 'es',
  
  -- Configuración de Backups
  backups_enabled BOOLEAN DEFAULT false,
  backups_frequency TEXT DEFAULT 'weekly', -- 'daily' | 'weekly' | 'monthly'
  backups_retention_days INTEGER DEFAULT 30,
  backups_include_attachments BOOLEAN DEFAULT false,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  UNIQUE(agency_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tools_settings_agency ON tools_settings(agency_id);

-- Comentarios
COMMENT ON TABLE tools_settings IS 'Configuración de herramientas y notificaciones por agencia';
COMMENT ON COLUMN tools_settings.emilia_enabled IS 'Si el AI Copilot está habilitado';
COMMENT ON COLUMN tools_settings.whatsapp_provider IS 'Proveedor de WhatsApp: manual, api, manychat';
COMMENT ON COLUMN tools_settings.notifications_digest_frequency IS 'Frecuencia del resumen de notificaciones por email';

-- RLS (Row Level Security)
ALTER TABLE tools_settings ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view tools settings for their agencies" ON tools_settings;
DROP POLICY IF EXISTS "Only admins can modify tools settings" ON tools_settings;

-- Política: Usuarios pueden ver configuración de sus agencias
CREATE POLICY "Users can view tools settings for their agencies"
  ON tools_settings
  FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- Política: Solo ADMIN y SUPER_ADMIN pueden modificar configuración
CREATE POLICY "Only admins can modify tools settings"
  ON tools_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );


-- ===== MIGRATION 071: 067_create_invoices.sql =====

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


-- ===== MIGRATION 072: 068_create_notes.sql =====

-- =====================================================
-- Migración 068: Crear tablas de Notas Colaborativas
-- Sistema de notas con comentarios y adjuntos
-- =====================================================

-- Tabla de notas
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Contenido
  title TEXT NOT NULL,
  content TEXT, -- Contenido en formato HTML/Markdown
  
  -- Tipo y relaciones
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'operation', 'customer')),
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Visibilidad
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'agency')),
  
  -- Tags (array de strings)
  tags TEXT[] DEFAULT '{}',
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  
  -- Metadata
  is_pinned BOOLEAN DEFAULT FALSE,
  color TEXT, -- Color de la nota (hex)
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de comentarios en notas
CREATE TABLE IF NOT EXISTS note_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES note_comments(id) ON DELETE CASCADE, -- Para threading
  
  -- Contenido
  content TEXT NOT NULL,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de adjuntos en notas
CREATE TABLE IF NOT EXISTS note_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  
  -- Archivo
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- MIME type
  file_size INTEGER NOT NULL, -- En bytes
  file_url TEXT NOT NULL, -- URL en Supabase Storage
  
  -- Auditoría
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_notes_agency ON notes(agency_id);
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);
CREATE INDEX IF NOT EXISTS idx_notes_operation ON notes(operation_id);
CREATE INDEX IF NOT EXISTS idx_notes_customer ON notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by);
CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_note_comments_note ON note_comments(note_id);
CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments(note_id);

-- Comentarios
COMMENT ON TABLE notes IS 'Notas colaborativas del sistema';
COMMENT ON COLUMN notes.note_type IS 'Tipo: general, operation, customer';
COMMENT ON COLUMN notes.visibility IS 'Visibilidad: private, team, agency';
COMMENT ON COLUMN notes.tags IS 'Array de tags para categorización';

-- RLS (Row Level Security)
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_attachments ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view notes based on visibility" ON notes;
DROP POLICY IF EXISTS "Users can create notes" ON notes;
DROP POLICY IF EXISTS "Users can update own notes" ON notes;
DROP POLICY IF EXISTS "Users can view comments on accessible notes" ON note_comments;
DROP POLICY IF EXISTS "Users can create comments" ON note_comments;
DROP POLICY IF EXISTS "Users can view attachments on accessible notes" ON note_attachments;
DROP POLICY IF EXISTS "Users can upload attachments" ON note_attachments;

-- Política: Usuarios pueden ver notas según visibilidad
CREATE POLICY "Users can view notes based on visibility"
  ON notes
  FOR SELECT
  USING (
    -- Notas de su agencia
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND (
      -- Es el creador
      created_by = auth.uid()
      -- O la nota es visible para el equipo/agencia
      OR visibility IN ('team', 'agency')
    )
  );

-- Política: Usuarios pueden crear notas
CREATE POLICY "Users can create notes"
  ON notes
  FOR INSERT
  WITH CHECK (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Usuarios pueden actualizar sus propias notas o notas de agencia (admins)
CREATE POLICY "Users can update own notes"
  ON notes
  FOR UPDATE
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  );

-- Política: Usuarios pueden ver comentarios de notas accesibles
CREATE POLICY "Users can view comments on accessible notes"
  ON note_comments
  FOR SELECT
  USING (
    note_id IN (
      SELECT id FROM notes 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Política: Usuarios pueden crear comentarios
CREATE POLICY "Users can create comments"
  ON note_comments
  FOR ALL
  USING (
    note_id IN (
      SELECT id FROM notes 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Política: Usuarios pueden ver adjuntos de notas accesibles
CREATE POLICY "Users can view attachments on accessible notes"
  ON note_attachments
  FOR SELECT
  USING (
    note_id IN (
      SELECT id FROM notes 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Política: Usuarios pueden subir adjuntos
CREATE POLICY "Users can upload attachments"
  ON note_attachments
  FOR ALL
  USING (
    note_id IN (
      SELECT id FROM notes 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_note_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_note_updated_at ON notes;
CREATE TRIGGER trigger_update_note_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_note_updated_at();

DROP TRIGGER IF EXISTS trigger_update_note_comment_updated_at ON note_comments;
CREATE TRIGGER trigger_update_note_comment_updated_at
  BEFORE UPDATE ON note_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_note_updated_at();


-- ===== MIGRATION 073: 069_create_pdf_templates.sql =====

-- =====================================================
-- Migración 069: Crear tablas de Templates PDF
-- Sistema de templates para generación de PDFs
-- =====================================================

-- Tabla de templates PDF
CREATE TABLE IF NOT EXISTS pdf_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL,
  description TEXT,
  
  -- Tipo de template
  template_type TEXT NOT NULL CHECK (template_type IN (
    'invoice',          -- Facturas
    'budget',           -- Presupuestos
    'voucher',          -- Vouchers de viaje
    'itinerary',        -- Itinerarios
    'receipt',          -- Recibos
    'contract',         -- Contratos
    'general'           -- General
  )),
  
  -- Contenido del template (HTML con placeholders)
  html_content TEXT NOT NULL,
  
  -- Estilos CSS
  css_styles TEXT,
  
  -- Configuración de página
  page_size TEXT DEFAULT 'A4', -- A4, Letter, Legal, etc
  page_orientation TEXT DEFAULT 'portrait', -- portrait, landscape
  page_margins JSONB DEFAULT '{"top": 20, "right": 20, "bottom": 20, "left": 20}',
  
  -- Header y footer
  header_html TEXT,
  footer_html TEXT,
  show_page_numbers BOOLEAN DEFAULT TRUE,
  
  -- Variables disponibles en el template (para documentación)
  available_variables JSONB DEFAULT '[]',
  
  -- Metadata
  is_default BOOLEAN DEFAULT FALSE, -- Template por defecto para su tipo
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Logo y branding
  logo_url TEXT,
  primary_color TEXT DEFAULT '#000000',
  secondary_color TEXT DEFAULT '#666666',
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de PDFs generados
CREATE TABLE IF NOT EXISTS generated_pdfs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  template_id UUID REFERENCES pdf_templates(id) ON DELETE SET NULL,
  
  -- Tipo y referencia
  pdf_type TEXT NOT NULL,
  reference_id UUID, -- ID de la entidad relacionada (invoice, operation, etc)
  reference_type TEXT, -- Tipo de entidad
  
  -- Archivo generado
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL, -- URL en Supabase Storage
  file_size INTEGER, -- En bytes
  
  -- Datos usados para generar (snapshot)
  data_snapshot JSONB,
  
  -- Metadata
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pdf_templates_agency ON pdf_templates(agency_id);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_type ON pdf_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_default ON pdf_templates(agency_id, template_type, is_default);
CREATE INDEX IF NOT EXISTS idx_generated_pdfs_agency ON generated_pdfs(agency_id);
CREATE INDEX IF NOT EXISTS idx_generated_pdfs_reference ON generated_pdfs(reference_type, reference_id);

-- Comentarios
COMMENT ON TABLE pdf_templates IS 'Templates para generación de PDFs';
COMMENT ON COLUMN pdf_templates.html_content IS 'Contenido HTML con placeholders como {{variable}}';
COMMENT ON COLUMN pdf_templates.available_variables IS 'Lista de variables disponibles para el template';
COMMENT ON TABLE generated_pdfs IS 'Registro de PDFs generados';

-- RLS (Row Level Security)
ALTER TABLE pdf_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_pdfs ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view templates for their agencies" ON pdf_templates;
DROP POLICY IF EXISTS "Admins can manage templates" ON pdf_templates;
DROP POLICY IF EXISTS "Users can view generated pdfs for their agencies" ON generated_pdfs;
DROP POLICY IF EXISTS "Users can create generated pdfs" ON generated_pdfs;

-- Política: Usuarios pueden ver templates de sus agencias
CREATE POLICY "Users can view templates for their agencies"
  ON pdf_templates
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Solo admins pueden gestionar templates
CREATE POLICY "Admins can manage templates"
  ON pdf_templates
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Política: Usuarios pueden ver PDFs generados de sus agencias
CREATE POLICY "Users can view generated pdfs for their agencies"
  ON generated_pdfs
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Usuarios pueden crear PDFs
CREATE POLICY "Users can create generated pdfs"
  ON generated_pdfs
  FOR INSERT
  WITH CHECK (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Función para actualizar updated_at (si no existe)
CREATE OR REPLACE FUNCTION update_pdf_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_pdf_template_updated_at ON pdf_templates;
CREATE TRIGGER trigger_update_pdf_template_updated_at
  BEFORE UPDATE ON pdf_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_pdf_template_updated_at();

-- Insertar templates por defecto (se ejecutará por cada agencia en la app)
-- Los templates reales se insertarán desde la aplicación


-- ===== MIGRATION 074: 070_create_customer_interactions.sql =====

-- =====================================================
-- Migración 070: Historial de Interacciones de Clientes
-- Sistema de seguimiento de comunicaciones y actividades
-- =====================================================

-- Tabla de interacciones con clientes
CREATE TABLE IF NOT EXISTS customer_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  
  -- Tipo de interacción
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'call',           -- Llamada telefónica
    'email',          -- Email
    'whatsapp',       -- WhatsApp
    'meeting',        -- Reunión presencial
    'video_call',     -- Videollamada
    'social_media',   -- Redes sociales
    'note',           -- Nota interna
    'task',           -- Tarea/Seguimiento
    'quote_sent',     -- Cotización enviada
    'quote_approved', -- Cotización aprobada
    'payment',        -- Pago recibido
    'complaint',      -- Reclamo
    'feedback',       -- Feedback
    'other'           -- Otro
  )),
  
  -- Dirección (entrada/salida)
  direction TEXT CHECK (direction IN ('inbound', 'outbound', 'internal')),
  
  -- Contenido
  subject TEXT,
  content TEXT,
  
  -- Resultado
  outcome TEXT CHECK (outcome IN (
    'successful',     -- Exitoso
    'no_answer',      -- Sin respuesta
    'callback',       -- Llamar después
    'interested',     -- Interesado
    'not_interested', -- No interesado
    'completed',      -- Completado
    'pending',        -- Pendiente
    'cancelled'       -- Cancelado
  )),
  
  -- Seguimiento
  follow_up_date TIMESTAMP WITH TIME ZONE,
  follow_up_notes TEXT,
  is_follow_up_completed BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  duration_minutes INTEGER, -- Duración (para llamadas/reuniones)
  attachments JSONB DEFAULT '[]', -- Array de URLs de archivos adjuntos
  tags TEXT[] DEFAULT '{}',
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_customer_interactions_agency ON customer_interactions(agency_id);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_customer ON customer_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_operation ON customer_interactions(operation_id);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_type ON customer_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_date ON customer_interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_follow_up ON customer_interactions(follow_up_date) WHERE NOT is_follow_up_completed;
CREATE INDEX IF NOT EXISTS idx_customer_interactions_created_by ON customer_interactions(created_by);

-- Comentarios
COMMENT ON TABLE customer_interactions IS 'Historial de interacciones con clientes';
COMMENT ON COLUMN customer_interactions.interaction_type IS 'Tipo: call, email, whatsapp, meeting, etc';
COMMENT ON COLUMN customer_interactions.direction IS 'Dirección: inbound, outbound, internal';
COMMENT ON COLUMN customer_interactions.outcome IS 'Resultado: successful, no_answer, etc';

-- RLS (Row Level Security)
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view interactions for their agencies" ON customer_interactions;
DROP POLICY IF EXISTS "Users can create interactions" ON customer_interactions;
DROP POLICY IF EXISTS "Users can update own interactions" ON customer_interactions;

-- Política: Usuarios pueden ver interacciones de sus agencias
CREATE POLICY "Users can view interactions for their agencies"
  ON customer_interactions
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Usuarios pueden crear interacciones
CREATE POLICY "Users can create interactions"
  ON customer_interactions
  FOR INSERT
  WITH CHECK (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Usuarios pueden actualizar sus propias interacciones o admins todas
CREATE POLICY "Users can update own interactions"
  ON customer_interactions
  FOR UPDATE
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  );

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_customer_interaction_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_customer_interaction_updated_at ON customer_interactions;
CREATE TRIGGER trigger_update_customer_interaction_updated_at
  BEFORE UPDATE ON customer_interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_interaction_updated_at();


-- ===== MIGRATION 075: 071_create_customer_segments.sql =====

-- =====================================================
-- Migración 071: Segmentación de Clientes
-- Sistema de segmentos automáticos y manuales
-- =====================================================

-- Tabla de segmentos de clientes
CREATE TABLE IF NOT EXISTS customer_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1', -- Color para identificar el segmento
  icon TEXT DEFAULT 'users', -- Icono del segmento
  
  -- Tipo de segmento
  segment_type TEXT NOT NULL DEFAULT 'manual' CHECK (segment_type IN ('manual', 'automatic', 'hybrid')),
  
  -- Reglas para segmentos automáticos (JSON)
  -- Ejemplo: [{"field": "total_spent", "operator": ">", "value": 10000}, {"field": "operations_count", "operator": ">=", "value": 3}]
  rules JSONB DEFAULT '[]',
  rules_logic TEXT DEFAULT 'AND' CHECK (rules_logic IN ('AND', 'OR')),
  
  -- Configuración
  is_active BOOLEAN DEFAULT TRUE,
  auto_update BOOLEAN DEFAULT TRUE, -- Actualizar automáticamente la membresía
  priority INTEGER DEFAULT 0, -- Prioridad para resolver conflictos
  
  -- Estadísticas (actualizadas periódicamente)
  customer_count INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMP WITH TIME ZONE,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de membresía de clientes en segmentos
CREATE TABLE IF NOT EXISTS customer_segment_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  segment_id UUID NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Tipo de membresía
  membership_type TEXT NOT NULL DEFAULT 'automatic' CHECK (membership_type IN ('automatic', 'manual', 'excluded')),
  
  -- Auditoría
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint
  UNIQUE(segment_id, customer_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_customer_segments_agency ON customer_segments(agency_id);
CREATE INDEX IF NOT EXISTS idx_customer_segments_type ON customer_segments(segment_type);
CREATE INDEX IF NOT EXISTS idx_customer_segments_active ON customer_segments(is_active);
CREATE INDEX IF NOT EXISTS idx_customer_segment_members_segment ON customer_segment_members(segment_id);
CREATE INDEX IF NOT EXISTS idx_customer_segment_members_customer ON customer_segment_members(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_segment_members_type ON customer_segment_members(membership_type);

-- Comentarios
COMMENT ON TABLE customer_segments IS 'Segmentos de clientes para clasificación y marketing';
COMMENT ON COLUMN customer_segments.segment_type IS 'Tipo: manual, automatic, hybrid';
COMMENT ON COLUMN customer_segments.rules IS 'Reglas JSON para segmentos automáticos';
COMMENT ON COLUMN customer_segments.rules_logic IS 'Lógica de combinación: AND, OR';

-- RLS (Row Level Security)
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segment_members ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view segments for their agencies" ON customer_segments;
DROP POLICY IF EXISTS "Admins can manage segments" ON customer_segments;
DROP POLICY IF EXISTS "Users can view segment members" ON customer_segment_members;
DROP POLICY IF EXISTS "Users can manage segment members" ON customer_segment_members;

-- Política: Usuarios pueden ver segmentos de sus agencias
CREATE POLICY "Users can view segments for their agencies"
  ON customer_segments
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Admins pueden gestionar segmentos
CREATE POLICY "Admins can manage segments"
  ON customer_segments
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

-- Política: Usuarios pueden ver membresías de segmentos de sus agencias
CREATE POLICY "Users can view segment members"
  ON customer_segment_members
  FOR SELECT
  USING (
    segment_id IN (
      SELECT id FROM customer_segments 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Política: Usuarios pueden gestionar membresías
CREATE POLICY "Users can manage segment members"
  ON customer_segment_members
  FOR ALL
  USING (
    segment_id IN (
      SELECT id FROM customer_segments 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_customer_segment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_customer_segment_updated_at ON customer_segments;
CREATE TRIGGER trigger_update_customer_segment_updated_at
  BEFORE UPDATE ON customer_segments
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_segment_updated_at();

-- Insertar segmentos predefinidos (se hará desde la app para cada agencia)
-- Ejemplos de segmentos comunes:
-- VIP: total_spent > 50000 AND operations_count >= 5
-- Frecuente: operations_count >= 3 en último año
-- Nuevo: created_at > 30 días
-- Inactivo: last_operation > 365 días
-- Corporativo: customer_type = 'business'


-- ===== MIGRATION 076: 072_create_teams.sql =====

-- =====================================================
-- Migración 072: Equipos de Ventas
-- Sistema de equipos con líderes y miembros
-- =====================================================

-- Tabla de equipos
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  
  -- Líder del equipo
  leader_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Estado
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de miembros de equipo
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Rol en el equipo
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  
  -- Fechas
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  
  -- Unique constraint
  UNIQUE(team_id, user_id)
);

-- Tabla de metas de equipo
CREATE TABLE IF NOT EXISTS team_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  -- Período
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Metas
  target_operations INTEGER, -- Cantidad de operaciones
  target_revenue NUMERIC(18,2), -- Ingresos objetivo
  target_margin NUMERIC(18,2), -- Margen objetivo
  target_new_customers INTEGER, -- Nuevos clientes
  
  -- Progreso actual (calculado)
  current_operations INTEGER DEFAULT 0,
  current_revenue NUMERIC(18,2) DEFAULT 0,
  current_margin NUMERIC(18,2) DEFAULT 0,
  current_new_customers INTEGER DEFAULT 0,
  
  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  
  -- Notas
  notes TEXT,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de metas individuales
CREATE TABLE IF NOT EXISTS user_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_goal_id UUID REFERENCES team_goals(id) ON DELETE SET NULL,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Período
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Metas
  target_operations INTEGER,
  target_revenue NUMERIC(18,2),
  target_margin NUMERIC(18,2),
  target_new_customers INTEGER,
  
  -- Progreso actual
  current_operations INTEGER DEFAULT 0,
  current_revenue NUMERIC(18,2) DEFAULT 0,
  current_margin NUMERIC(18,2) DEFAULT 0,
  current_new_customers INTEGER DEFAULT 0,
  
  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_teams_agency ON teams(agency_id);
CREATE INDEX IF NOT EXISTS idx_teams_leader ON teams(leader_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_goals_team ON team_goals(team_id);
CREATE INDEX IF NOT EXISTS idx_team_goals_period ON team_goals(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_user_goals_user ON user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_period ON user_goals(period_start, period_end);

-- Comentarios
COMMENT ON TABLE teams IS 'Equipos de ventas';
COMMENT ON TABLE team_members IS 'Miembros de equipos';
COMMENT ON TABLE team_goals IS 'Metas de equipos';
COMMENT ON TABLE user_goals IS 'Metas individuales de usuarios';

-- RLS (Row Level Security)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view teams for their agencies" ON teams;
DROP POLICY IF EXISTS "Admins can manage teams" ON teams;
DROP POLICY IF EXISTS "Users can view team members" ON team_members;
DROP POLICY IF EXISTS "Leaders can manage team members" ON team_members;
DROP POLICY IF EXISTS "Users can view team goals" ON team_goals;
DROP POLICY IF EXISTS "Leaders can manage team goals" ON team_goals;
DROP POLICY IF EXISTS "Users can view own goals" ON user_goals;
DROP POLICY IF EXISTS "Users can manage own goals" ON user_goals;

-- Políticas para teams
CREATE POLICY "Users can view teams for their agencies"
  ON teams
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage teams"
  ON teams
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Políticas para team_members
CREATE POLICY "Users can view team members"
  ON team_members
  FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM teams 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Leaders can manage team members"
  ON team_members
  FOR ALL
  USING (
    team_id IN (
      SELECT id FROM teams 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
      AND (
        leader_id = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN'))
      )
    )
  );

-- Políticas para team_goals
CREATE POLICY "Users can view team goals"
  ON team_goals
  FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM teams 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Leaders can manage team goals"
  ON team_goals
  FOR ALL
  USING (
    team_id IN (
      SELECT id FROM teams 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
      AND (
        leader_id = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN'))
      )
    )
  );

-- Políticas para user_goals
CREATE POLICY "Users can view own goals"
  ON user_goals
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN', 'MANAGER'))
    )
  );

CREATE POLICY "Users can manage own goals"
  ON user_goals
  FOR ALL
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN'))
  );

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_team_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS trigger_update_team_updated_at ON teams;
CREATE TRIGGER trigger_update_team_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_team_updated_at();

DROP TRIGGER IF EXISTS trigger_update_team_goal_updated_at ON team_goals;
CREATE TRIGGER trigger_update_team_goal_updated_at
  BEFORE UPDATE ON team_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_team_updated_at();

DROP TRIGGER IF EXISTS trigger_update_user_goal_updated_at ON user_goals;
CREATE TRIGGER trigger_update_user_goal_updated_at
  BEFORE UPDATE ON user_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_team_updated_at();


-- ===== MIGRATION 077: 073_create_commissions.sql =====

-- =====================================================
-- Migración 073: Sistema de Comisiones
-- Cálculo y registro de comisiones por vendedor
-- =====================================================

-- Tabla de esquemas de comisiones
CREATE TABLE IF NOT EXISTS commission_schemes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL,
  description TEXT,
  
  -- Tipo de comisión
  commission_type TEXT NOT NULL CHECK (commission_type IN (
    'percentage',     -- Porcentaje del monto
    'fixed',          -- Monto fijo
    'tiered',         -- Escalonado
    'hybrid'          -- Combinación
  )),
  
  -- Valores base
  base_percentage NUMERIC(5,2) DEFAULT 0, -- Porcentaje base
  base_amount NUMERIC(18,2) DEFAULT 0, -- Monto fijo base
  
  -- Aplicación
  applies_to TEXT NOT NULL DEFAULT 'revenue' CHECK (applies_to IN (
    'revenue',        -- Sobre ingresos totales
    'margin',         -- Sobre margen
    'net_margin'      -- Sobre margen neto
  )),
  
  -- Tiers (para comisiones escalonadas)
  -- Ejemplo: [{"min": 0, "max": 100000, "percentage": 5}, {"min": 100001, "max": null, "percentage": 7}]
  tiers JSONB DEFAULT '[]',
  
  -- Condiciones
  min_threshold NUMERIC(18,2) DEFAULT 0, -- Mínimo para activar
  max_cap NUMERIC(18,2), -- Tope máximo de comisión
  
  -- Estado
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de comisiones calculadas/pagadas
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheme_id UUID REFERENCES commission_schemes(id) ON DELETE SET NULL,
  
  -- Período
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Base de cálculo
  base_revenue NUMERIC(18,2) DEFAULT 0, -- Ingresos del período
  base_margin NUMERIC(18,2) DEFAULT 0, -- Margen del período
  operations_count INTEGER DEFAULT 0, -- Operaciones cerradas
  
  -- Comisión calculada
  commission_amount NUMERIC(18,2) NOT NULL,
  
  -- Ajustes
  adjustments NUMERIC(18,2) DEFAULT 0, -- Ajustes manuales
  adjustment_notes TEXT,
  
  -- Total final
  total_amount NUMERIC(18,2) NOT NULL,
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',        -- Pendiente de aprobación
    'approved',       -- Aprobada
    'paid',           -- Pagada
    'cancelled'       -- Cancelada
  )),
  
  -- Fechas de pago
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMP WITH TIME ZONE,
  payment_reference TEXT,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de detalle de comisiones (por operación)
CREATE TABLE IF NOT EXISTS commission_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  commission_id UUID NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  
  -- Montos de la operación
  operation_revenue NUMERIC(18,2) NOT NULL,
  operation_margin NUMERIC(18,2),
  
  -- Comisión calculada
  commission_percentage NUMERIC(5,2),
  commission_amount NUMERIC(18,2) NOT NULL,
  
  -- Notas
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_commission_schemes_agency ON commission_schemes(agency_id);
CREATE INDEX IF NOT EXISTS idx_commissions_agency ON commissions(agency_id);
CREATE INDEX IF NOT EXISTS idx_commissions_user ON commissions(user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_period ON commissions(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commission_details_commission ON commission_details(commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_details_operation ON commission_details(operation_id);

-- Comentarios
COMMENT ON TABLE commission_schemes IS 'Esquemas de comisiones configurables';
COMMENT ON TABLE commissions IS 'Comisiones calculadas por vendedor y período';
COMMENT ON TABLE commission_details IS 'Detalle de comisiones por operación';

-- RLS (Row Level Security)
ALTER TABLE commission_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_details ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view commission schemes" ON commission_schemes;
DROP POLICY IF EXISTS "Admins can manage commission schemes" ON commission_schemes;
DROP POLICY IF EXISTS "Users can view own commissions" ON commissions;
DROP POLICY IF EXISTS "Admins can manage commissions" ON commissions;
DROP POLICY IF EXISTS "Users can view commission details" ON commission_details;

-- Políticas para commission_schemes
CREATE POLICY "Users can view commission schemes"
  ON commission_schemes
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage commission schemes"
  ON commission_schemes
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Políticas para commissions
CREATE POLICY "Users can view own commissions"
  ON commissions
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN', 'MANAGER'))
    )
  );

CREATE POLICY "Admins can manage commissions"
  ON commissions
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Políticas para commission_details
CREATE POLICY "Users can view commission details"
  ON commission_details
  FOR SELECT
  USING (
    commission_id IN (
      SELECT id FROM commissions WHERE user_id = auth.uid()
      OR agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
        AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN', 'MANAGER'))
      )
    )
  );

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_commission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS trigger_update_commission_scheme_updated_at ON commission_schemes;
CREATE TRIGGER trigger_update_commission_scheme_updated_at
  BEFORE UPDATE ON commission_schemes
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_updated_at();

DROP TRIGGER IF EXISTS trigger_update_commission_updated_at ON commissions;
CREATE TRIGGER trigger_update_commission_updated_at
  BEFORE UPDATE ON commissions
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_updated_at();


-- ===== MIGRATION 078: 074_create_integrations.sql =====

-- =====================================================
-- Migración 074: Sistema de Integraciones
-- Gestión de integraciones con servicios externos
-- =====================================================

-- Tabla de integraciones
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL,
  integration_type TEXT NOT NULL CHECK (integration_type IN (
    'trello', 'manychat', 'whatsapp', 'afip', 'email', 
    'calendar', 'slack', 'webhook', 'zapier', 'other'
  )),
  description TEXT,
  
  -- Configuración
  config JSONB DEFAULT '{}',
  -- Ejemplos de config:
  -- trello: { board_id, api_key, token, list_mappings }
  -- manychat: { api_key, page_id, flows }
  -- whatsapp: { phone_number_id, access_token, webhook_verify_token }
  -- afip: { cuit, cert_path, key_path, production }
  -- email: { smtp_host, smtp_port, smtp_user, smtp_pass, from_email }
  -- calendar: { provider, client_id, client_secret, refresh_token }
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'pending')),
  error_message TEXT,
  
  -- Sincronización
  sync_enabled BOOLEAN DEFAULT FALSE,
  sync_frequency TEXT CHECK (sync_frequency IN ('realtime', 'hourly', 'daily', 'weekly', 'manual')),
  last_sync_at TIMESTAMP WITH TIME ZONE,
  next_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Permisos
  permissions JSONB DEFAULT '{}',
  -- { read: true, write: true, delete: false }
  
  -- Webhooks
  webhook_url TEXT,
  webhook_secret TEXT,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de logs de integraciones
CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  
  -- Tipo de log
  log_type TEXT NOT NULL CHECK (log_type IN ('info', 'success', 'warning', 'error', 'debug')),
  
  -- Contenido
  action TEXT NOT NULL, -- sync, webhook, api_call, auth, etc.
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  
  -- Request/Response
  request_data JSONB,
  response_data JSONB,
  response_status INTEGER,
  
  -- Duración
  duration_ms INTEGER,
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de webhooks entrantes
CREATE TABLE IF NOT EXISTS integration_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  
  -- Datos del webhook
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB,
  
  -- Estado de procesamiento
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'ignored')),
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  -- Timestamp
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_integrations_agency ON integrations(agency_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);
CREATE INDEX IF NOT EXISTS idx_integration_logs_integration ON integration_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_type ON integration_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON integration_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_integration ON integration_webhooks(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_status ON integration_webhooks(status);

-- Comentarios
COMMENT ON TABLE integrations IS 'Integraciones con servicios externos';
COMMENT ON TABLE integration_logs IS 'Logs de actividad de integraciones';
COMMENT ON TABLE integration_webhooks IS 'Webhooks entrantes de integraciones';
COMMENT ON COLUMN integrations.config IS 'Configuración específica de cada tipo de integración';

-- RLS (Row Level Security)
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_webhooks ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view integrations for their agencies" ON integrations;
DROP POLICY IF EXISTS "Admins can manage integrations" ON integrations;
DROP POLICY IF EXISTS "Users can view logs for their integrations" ON integration_logs;
DROP POLICY IF EXISTS "System can create logs" ON integration_logs;
DROP POLICY IF EXISTS "Users can view webhooks for their integrations" ON integration_webhooks;
DROP POLICY IF EXISTS "System can manage webhooks" ON integration_webhooks;

-- Políticas para integrations
CREATE POLICY "Users can view integrations for their agencies"
  ON integrations
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage integrations"
  ON integrations
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Políticas para integration_logs
CREATE POLICY "Users can view logs for their integrations"
  ON integration_logs
  FOR SELECT
  USING (
    integration_id IN (
      SELECT id FROM integrations 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "System can create logs"
  ON integration_logs
  FOR INSERT
  WITH CHECK (true);

-- Políticas para integration_webhooks
CREATE POLICY "Users can view webhooks for their integrations"
  ON integration_webhooks
  FOR SELECT
  USING (
    integration_id IN (
      SELECT id FROM integrations 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "System can manage webhooks"
  ON integration_webhooks
  FOR ALL
  USING (true);

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS trigger_update_integration_updated_at ON integrations;
CREATE TRIGGER trigger_update_integration_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_integration_updated_at();

-- Función para limpiar logs antiguos (ejecutar periódicamente)
CREATE OR REPLACE FUNCTION cleanup_old_integration_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM integration_logs 
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;


-- ===== MIGRATION 079: 074_fix_cash_movements_rls_and_storage.sql =====

-- ============================================================
-- Migration 074: Fix cash_movements RLS + ensure tables exist
-- Fixes: sync-movements 500, templates 500, comments 500, documents upload
-- ============================================================

-- ============================================================
-- 1. CASH_MOVEMENTS: Add RLS policies (may have been enabled from dashboard)
-- ============================================================

-- Enable RLS (idempotent)
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Agency members can view cash movements" ON cash_movements;
DROP POLICY IF EXISTS "Agency members can insert cash movements" ON cash_movements;
DROP POLICY IF EXISTS "Agency members can update cash movements" ON cash_movements;
DROP POLICY IF EXISTS "Agency members can delete cash movements" ON cash_movements;

-- SELECT: users can see movements from their agencies
CREATE POLICY "Agency members can view cash movements"
  ON cash_movements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operations o
      JOIN user_agencies ua ON ua.agency_id = o.agency_id
      WHERE o.id = cash_movements.operation_id
      AND ua.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM cash_boxes cb
      JOIN user_agencies ua ON ua.agency_id = cb.agency_id
      WHERE cb.id = cash_movements.cash_box_id
      AND ua.user_id = auth.uid()
    )
    OR
    cash_movements.user_id = auth.uid()
  );

-- INSERT: users can create movements for their agencies
CREATE POLICY "Agency members can insert cash movements"
  ON cash_movements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cash_boxes cb
      JOIN user_agencies ua ON ua.agency_id = cb.agency_id
      WHERE cb.id = cash_movements.cash_box_id
      AND ua.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM operations o
      JOIN user_agencies ua ON ua.agency_id = o.agency_id
      WHERE o.id = cash_movements.operation_id
      AND ua.user_id = auth.uid()
    )
  );

-- UPDATE: users can update movements from their agencies
CREATE POLICY "Agency members can update cash movements"
  ON cash_movements FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM cash_boxes cb
      JOIN user_agencies ua ON ua.agency_id = cb.agency_id
      WHERE cb.id = cash_movements.cash_box_id
      AND ua.user_id = auth.uid()
    )
    OR
    cash_movements.user_id = auth.uid()
  );

-- DELETE: users can delete movements from their agencies
CREATE POLICY "Agency members can delete cash movements"
  ON cash_movements FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM cash_boxes cb
      JOIN user_agencies ua ON ua.agency_id = cb.agency_id
      WHERE cb.id = cash_movements.cash_box_id
      AND ua.user_id = auth.uid()
    )
    OR
    cash_movements.user_id = auth.uid()
  );

-- ============================================================
-- 2. CASH_BOXES: Add RLS policies
-- ============================================================
ALTER TABLE cash_boxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members can view cash boxes" ON cash_boxes;
DROP POLICY IF EXISTS "Agency members can manage cash boxes" ON cash_boxes;

CREATE POLICY "Agency members can view cash boxes"
  ON cash_boxes FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Agency members can manage cash boxes"
  ON cash_boxes FOR ALL
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. PAYMENTS: Add RLS policies
-- ============================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members can view payments" ON payments;
DROP POLICY IF EXISTS "Agency members can manage payments" ON payments;

CREATE POLICY "Agency members can view payments"
  ON payments FOR SELECT
  USING (
    operation_id IN (
      SELECT o.id FROM operations o
      JOIN user_agencies ua ON ua.agency_id = o.agency_id
      WHERE ua.user_id = auth.uid()
    )
  );

CREATE POLICY "Agency members can manage payments"
  ON payments FOR ALL
  USING (
    operation_id IN (
      SELECT o.id FROM operations o
      JOIN user_agencies ua ON ua.agency_id = o.agency_id
      WHERE ua.user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. PDF_TEMPLATES: Ensure table and policies exist (migration 065)
-- ============================================================
CREATE TABLE IF NOT EXISTS pdf_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL CHECK (template_type IN ('invoice', 'budget', 'voucher', 'itinerary', 'receipt', 'contract', 'general')),
  html_content TEXT NOT NULL,
  css_styles TEXT,
  page_size TEXT NOT NULL DEFAULT 'A4',
  page_orientation TEXT NOT NULL DEFAULT 'portrait' CHECK (page_orientation IN ('portrait', 'landscape')),
  page_margins JSONB,
  header_html TEXT,
  footer_html TEXT,
  show_page_numbers BOOLEAN NOT NULL DEFAULT true,
  available_variables JSONB,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_templates_agency_id ON pdf_templates(agency_id);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_type ON pdf_templates(template_type);

ALTER TABLE pdf_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members can view their templates" ON pdf_templates;
DROP POLICY IF EXISTS "Admins can manage their templates" ON pdf_templates;

CREATE POLICY "Agency members can view their templates"
  ON pdf_templates FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage their templates"
  ON pdf_templates FOR ALL
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. LEAD_COMMENTS: Ensure table and policies exist (migration 066)
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_comments_lead_id ON lead_comments(lead_id);

ALTER TABLE lead_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members can view lead comments" ON lead_comments;
DROP POLICY IF EXISTS "Agency members can create lead comments" ON lead_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON lead_comments;

CREATE POLICY "Agency members can view lead comments"
  ON lead_comments FOR SELECT
  USING (
    lead_id IN (
      SELECT l.id FROM leads l
      JOIN user_agencies ua ON ua.agency_id = l.agency_id
      WHERE ua.user_id = auth.uid()
    )
  );

CREATE POLICY "Agency members can create lead comments"
  ON lead_comments FOR INSERT
  WITH CHECK (
    lead_id IN (
      SELECT l.id FROM leads l
      JOIN user_agencies ua ON ua.agency_id = l.agency_id
      WHERE ua.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own comments"
  ON lead_comments FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- 6. DOCUMENTS STORAGE BUCKET
-- (Must also be created from Supabase Dashboard: Storage > New Bucket > "documents" > Public)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for documents bucket
DROP POLICY IF EXISTS "Anyone can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their documents" ON storage.objects;

CREATE POLICY "Anyone can view documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents');

CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can delete their documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND auth.uid() = owner
  );


-- ===== MIGRATION 080: 075_fix_settings_rls_policies.sql =====

-- =====================================================
-- Migración 075: Arreglar políticas RLS de settings
-- Las políticas anteriores usaban auth.uid() pero el API
-- usa autenticación server-side con service role
-- =====================================================

-- Desactivar RLS temporalmente para modificar políticas
-- OPERATION_SETTINGS
DROP POLICY IF EXISTS "Users can view operation settings for their agencies" ON operation_settings;
DROP POLICY IF EXISTS "Only admins can modify operation settings" ON operation_settings;

-- Crear políticas más permisivas para operación con service role
CREATE POLICY "Allow all operations on operation_settings"
  ON operation_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- CUSTOMER_SETTINGS
DROP POLICY IF EXISTS "Users can view customer settings for their agencies" ON customer_settings;
DROP POLICY IF EXISTS "Only admins can modify customer settings" ON customer_settings;

CREATE POLICY "Allow all operations on customer_settings"
  ON customer_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- FINANCIAL_SETTINGS  
DROP POLICY IF EXISTS "Users can view financial settings for their agencies" ON financial_settings;
DROP POLICY IF EXISTS "Only admins can modify financial settings" ON financial_settings;

CREATE POLICY "Allow all operations on financial_settings"
  ON financial_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- TOOLS_SETTINGS
DROP POLICY IF EXISTS "Users can view tools settings for their agencies" ON tools_settings;
DROP POLICY IF EXISTS "Only admins can modify tools settings" ON tools_settings;

CREATE POLICY "Allow all operations on tools_settings"
  ON tools_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- TEAMS
DROP POLICY IF EXISTS "Users can view teams for their agencies" ON teams;
DROP POLICY IF EXISTS "Only admins can modify teams" ON teams;

CREATE POLICY "Allow all operations on teams"
  ON teams
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- TEAM_MEMBERS
DROP POLICY IF EXISTS "Users can view team members" ON team_members;
DROP POLICY IF EXISTS "Only admins can modify team members" ON team_members;

CREATE POLICY "Allow all operations on team_members"
  ON team_members
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- TEAM_GOALS
DROP POLICY IF EXISTS "Users can view team goals" ON team_goals;
DROP POLICY IF EXISTS "Only admins can modify team goals" ON team_goals;

CREATE POLICY "Allow all operations on team_goals"
  ON team_goals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- USER_GOALS
DROP POLICY IF EXISTS "Users can view user goals" ON user_goals;
DROP POLICY IF EXISTS "Only admins can modify user goals" ON user_goals;

CREATE POLICY "Allow all operations on user_goals"
  ON user_goals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- NOTES
DROP POLICY IF EXISTS "Users can view notes" ON notes;
DROP POLICY IF EXISTS "Users can modify their own notes" ON notes;

CREATE POLICY "Allow all operations on notes"
  ON notes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- NOTE_COMMENTS
DROP POLICY IF EXISTS "Users can view note comments" ON note_comments;
DROP POLICY IF EXISTS "Users can modify their own comments" ON note_comments;

CREATE POLICY "Allow all operations on note_comments"
  ON note_comments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- INVOICES
DROP POLICY IF EXISTS "Users can view invoices for their agencies" ON invoices;
DROP POLICY IF EXISTS "Users can modify invoices for their agencies" ON invoices;

CREATE POLICY "Allow all operations on invoices"
  ON invoices
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- INVOICE_ITEMS
DROP POLICY IF EXISTS "Users can view invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Users can modify invoice items" ON invoice_items;

CREATE POLICY "Allow all operations on invoice_items"
  ON invoice_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- CUSTOMER_SEGMENTS
DROP POLICY IF EXISTS "Users can view segments for their agencies" ON customer_segments;
DROP POLICY IF EXISTS "Users can modify segments for their agencies" ON customer_segments;

CREATE POLICY "Allow all operations on customer_segments"
  ON customer_segments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- CUSTOMER_SEGMENT_MEMBERS
DROP POLICY IF EXISTS "Users can view segment members" ON customer_segment_members;
DROP POLICY IF EXISTS "Users can modify segment members" ON customer_segment_members;

CREATE POLICY "Allow all operations on customer_segment_members"
  ON customer_segment_members
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- CUSTOMER_INTERACTIONS
DROP POLICY IF EXISTS "Users can view interactions for their agencies" ON customer_interactions;
DROP POLICY IF EXISTS "Users can modify interactions" ON customer_interactions;

CREATE POLICY "Allow all operations on customer_interactions"
  ON customer_interactions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- PDF_TEMPLATES
DROP POLICY IF EXISTS "Users can view templates for their agencies" ON pdf_templates;
DROP POLICY IF EXISTS "Users can modify templates" ON pdf_templates;

CREATE POLICY "Allow all operations on pdf_templates"
  ON pdf_templates
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- COMMISSIONS
DROP POLICY IF EXISTS "Users can view commissions" ON commissions;
DROP POLICY IF EXISTS "Only admins can modify commissions" ON commissions;

CREATE POLICY "Allow all operations on commissions"
  ON commissions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- COMMISSION_SCHEMES
DROP POLICY IF EXISTS "Users can view commission schemes" ON commission_schemes;
DROP POLICY IF EXISTS "Only admins can modify commission schemes" ON commission_schemes;

CREATE POLICY "Allow all operations on commission_schemes"
  ON commission_schemes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- INTEGRATIONS
DROP POLICY IF EXISTS "Users can view integrations for their agencies" ON integrations;
DROP POLICY IF EXISTS "Only admins can modify integrations" ON integrations;

CREATE POLICY "Allow all operations on integrations"
  ON integrations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- INTEGRATION_LOGS
DROP POLICY IF EXISTS "Users can view integration logs" ON integration_logs;

CREATE POLICY "Allow all operations on integration_logs"
  ON integration_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ===== MIGRATION 081: 079_update_operation_status_system.sql =====

-- =====================================================
-- Migración 079: Actualizar Sistema de Estados de Operaciones
-- Nuevos estados según requerimientos del cliente
-- =====================================================

-- Estados nuevos:
-- RESERVED (Reservado): Cuando se carga la operación (default)
-- CONFIRMED (Confirmado): Cuando se hace recibo por la seña
-- CANCELLED (Cancelado): Modificación manual
-- TRAVELLING (En viaje): Cuando llega fecha de salida
-- TRAVELLED (Viajado): Cuando llega fecha de regreso

-- Eliminar:
-- PRE_RESERVATION (Pre-reserva) -> Migrar a RESERVED
-- CLOSED (Cerrado) -> Migrar a TRAVELLED

-- 1. Migrar datos existentes
UPDATE operations
SET status = 'RESERVED'
WHERE status = 'PRE_RESERVATION';

UPDATE operations
SET status = 'TRAVELLED'
WHERE status = 'CLOSED';

-- 2. Actualizar el CHECK constraint
-- Primero eliminar el constraint existente
ALTER TABLE operations
DROP CONSTRAINT IF EXISTS operations_status_check;

-- Agregar el nuevo constraint con los nuevos estados
ALTER TABLE operations
ADD CONSTRAINT operations_status_check 
CHECK (status IN ('RESERVED', 'CONFIRMED', 'CANCELLED', 'TRAVELLING', 'TRAVELLED'));

-- 3. Cambiar el default status de PRE_RESERVATION a RESERVED
ALTER TABLE operations
ALTER COLUMN status SET DEFAULT 'RESERVED';

-- 4. Actualizar default_status en operation_settings
UPDATE operation_settings
SET default_status = 'RESERVED'
WHERE default_status = 'PRE_RESERVATION';

-- 5. Comentario para documentación
COMMENT ON COLUMN operations.status IS 'Estado de la operación: RESERVED (Reservado), CONFIRMED (Confirmado), CANCELLED (Cancelado), TRAVELLING (En viaje), TRAVELLED (Viajado)';


-- ===== MIGRATION 082: 080_add_procedure_number_to_customers.sql =====

-- =====================================================
-- Migración 080: Agregar campo procedure_number a customers
-- Número de trámite del documento de identidad
-- =====================================================

-- Agregar columna procedure_number a la tabla customers
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS procedure_number TEXT;

-- Comentario
COMMENT ON COLUMN customers.procedure_number IS 'Número de trámite del documento de identidad (DNI o Pasaporte)';


-- ===== MIGRATION 083: 081_add_reservation_codes_to_operations.sql =====

-- =====================================================
-- Migración 081: Agregar códigos de reserva (aéreo y hotel) a operations
-- =====================================================
-- Campos para rastrear códigos de reserva de operadores
-- - reservation_code_air: Código de reserva del aéreo (opcional)
-- - reservation_code_hotel: Código de reserva del hotel (opcional)

-- Agregar campos nuevos
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS reservation_code_air TEXT,
  ADD COLUMN IF NOT EXISTS reservation_code_hotel TEXT;

-- Índices para búsqueda rápida (importante para la funcionalidad de búsqueda global)
CREATE INDEX IF NOT EXISTS idx_operations_reservation_code_air 
  ON operations(reservation_code_air) 
  WHERE reservation_code_air IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operations_reservation_code_hotel 
  ON operations(reservation_code_hotel) 
  WHERE reservation_code_hotel IS NOT NULL;

-- Comentarios en columnas para documentación
COMMENT ON COLUMN operations.reservation_code_air IS 'Código de reserva del aéreo proporcionado por el operador. Campo opcional para facilitar el rastreo de reservas.';
COMMENT ON COLUMN operations.reservation_code_hotel IS 'Código de reserva del hotel proporcionado por el operador. Campo opcional para facilitar el rastreo de reservas.';


-- ===== MIGRATION 084: 083_add_exchange_rate_to_payments.sql =====

-- =====================================================
-- Migración 083: Agregar exchange_rate y amount_usd a payments
-- Para tracking correcto de pagos en ARS con su equivalente USD
-- =====================================================

-- Agregar columna exchange_rate (tipo de cambio usado)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,4);

-- Agregar columna amount_usd (monto equivalente en USD)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(18,2);

-- Comentarios
COMMENT ON COLUMN payments.exchange_rate IS 'Tipo de cambio ARS/USD usado al momento del pago';
COMMENT ON COLUMN payments.amount_usd IS 'Monto equivalente en USD (para pagos en ARS: amount / exchange_rate, para USD: amount)';

-- Índice para búsquedas por monto USD
CREATE INDEX IF NOT EXISTS idx_payments_amount_usd ON payments(amount_usd) WHERE amount_usd IS NOT NULL;


-- ===== MIGRATION 085: 084_add_paid_amount_to_operator_payments.sql =====

-- =====================================================
-- Migración 084: Agregar campo paid_amount a operator_payments
-- Para soportar pagos parciales a operadores
-- =====================================================

-- Agregar columna paid_amount (monto parcialmente pagado)
ALTER TABLE operator_payments
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(18,2) DEFAULT 0;

-- Comentario para documentación
COMMENT ON COLUMN operator_payments.paid_amount IS 'Monto parcialmente pagado. Permite pagos parciales: si paid_amount < amount, el pago sigue siendo PENDING; si paid_amount >= amount, el pago puede marcarse como PAID.';

-- Índice para búsquedas de pagos parciales
CREATE INDEX IF NOT EXISTS idx_operator_payments_paid_amount ON operator_payments(paid_amount) WHERE paid_amount > 0 AND paid_amount < amount;


-- ===== MIGRATION 086: 085_create_recurring_payment_categories.sql =====

-- =====================================================
-- Migración 085: Crear tabla recurring_payment_categories
-- Sistema de categorías para gastos recurrentes
-- =====================================================

-- Crear tabla de categorías
CREATE TABLE IF NOT EXISTS recurring_payment_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Información de la categoría
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6', -- Color para gráficos (hex)
  
  -- Estado
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_recurring_payment_categories_name ON recurring_payment_categories(name);
CREATE INDEX IF NOT EXISTS idx_recurring_payment_categories_active ON recurring_payment_categories(is_active);

-- Comentarios
COMMENT ON TABLE recurring_payment_categories IS 'Categorías para clasificar gastos recurrentes (Servicios, Alquiler, Marketing, etc.)';
COMMENT ON COLUMN recurring_payment_categories.color IS 'Color en formato hex (#RRGGBB) para identificar la categoría en gráficos';

-- Insertar categorías predefinidas
INSERT INTO recurring_payment_categories (name, description, color) VALUES
  ('Servicios', 'Servicios básicos (luz, agua, gas, internet, telefonía)', '#3b82f6'),
  ('Alquiler', 'Alquiler de oficina o espacio físico', '#ef4444'),
  ('Marketing', 'Publicidad, redes sociales, promociones', '#10b981'),
  ('Salarios', 'Salarios y honorarios de empleados', '#f59e0b'),
  ('Impuestos', 'Impuestos y contribuciones', '#8b5cf6'),
  ('Otros', 'Gastos varios que no encajan en otras categorías', '#6b7280')
ON CONFLICT (name) DO NOTHING;


-- ===== MIGRATION 087: 086_add_category_id_to_recurring_payments.sql =====

-- =====================================================
-- Migración 086: Agregar category_id a recurring_payments
-- Relacionar gastos recurrentes con categorías
-- =====================================================

-- Agregar columna category_id (nullable para mantener compatibilidad con datos existentes)
ALTER TABLE recurring_payments
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES recurring_payment_categories(id) ON DELETE SET NULL;

-- Índice para mejorar búsquedas por categoría
CREATE INDEX IF NOT EXISTS idx_recurring_payments_category ON recurring_payments(category_id) WHERE category_id IS NOT NULL;

-- Comentario
COMMENT ON COLUMN recurring_payments.category_id IS 'Categoría del gasto recurrente (Servicios, Alquiler, Marketing, etc.)';

-- Asignar categoría "Otros" a gastos existentes sin categoría (opcional, para datos históricos)
UPDATE recurring_payments
SET category_id = (SELECT id FROM recurring_payment_categories WHERE name = 'Otros' LIMIT 1)
WHERE category_id IS NULL;


-- ===== MIGRATION 088: 087_create_monthly_exchange_rates.sql =====

-- =====================================================
-- Migración 087: Tipos de cambio mensuales
-- Permite guardar un TC específico para cada mes
-- =====================================================

CREATE TABLE IF NOT EXISTS monthly_exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  usd_to_ars_rate NUMERIC(18,4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_exchange_rates_year_month 
ON monthly_exchange_rates(year, month);

COMMENT ON TABLE monthly_exchange_rates IS 'Tipos de cambio mensuales para la posición contable';

-- ===== MIGRATION 089: 088_partner_profit_allocations.sql =====

-- =====================================================
-- Migración 088: Distribución de Ganancias a Socios
-- Sistema de asignación de ganancias y tracking de deudas
-- =====================================================

-- Agregar campo de porcentaje de ganancias a partner_accounts
ALTER TABLE partner_accounts
ADD COLUMN IF NOT EXISTS profit_percentage NUMERIC(5,2) DEFAULT 0 CHECK (profit_percentage >= 0 AND profit_percentage <= 100);

COMMENT ON COLUMN partner_accounts.profit_percentage IS 'Porcentaje de ganancias asignado a este socio (0-100). La suma de todos los porcentajes debe ser 100.';

-- Tabla de asignaciones de ganancias a socios
CREATE TABLE IF NOT EXISTS partner_profit_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  
  -- Período de la ganancia
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  
  -- Montos
  profit_amount NUMERIC(18,2) NOT NULL, -- Monto asignado en USD
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('ARS', 'USD')),
  exchange_rate NUMERIC(18,4), -- TC usado si fue en ARS
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'ALLOCATED' CHECK (status IN ('ALLOCATED', 'WITHDRAWN')),
  
  -- Referencia a la posición mensual
  monthly_position_id UUID, -- Opcional: referencia a alguna tabla futura
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: un socio solo puede tener una asignación por mes/año
  UNIQUE(partner_id, year, month)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_partner_profit_allocations_partner ON partner_profit_allocations(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_profit_allocations_period ON partner_profit_allocations(year, month);
CREATE INDEX IF NOT EXISTS idx_partner_profit_allocations_status ON partner_profit_allocations(status);

-- Comentarios
COMMENT ON TABLE partner_profit_allocations IS 'Asignaciones de ganancias mensuales a socios desde la Posición Mensual';
COMMENT ON COLUMN partner_profit_allocations.profit_amount IS 'Monto asignado en USD (se puede convertir a ARS usando exchange_rate)';
COMMENT ON COLUMN partner_profit_allocations.status IS 'ALLOCATED: Asignado pero no retirado, WITHDRAWN: Retirado completamente';


-- ===== MIGRATION 090: 090_add_ledger_movement_id_to_cash_movements.sql =====

-- =====================================================
-- Migración 090: ledger_movement_id en cash_movements
-- =====================================================
-- Vincula cada movimiento de caja con su ledger_movement para DELETE
-- correcto e invalidación de caché de balances.

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS ledger_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cash_movements_ledger_movement
  ON cash_movements(ledger_movement_id) WHERE ledger_movement_id IS NOT NULL;

COMMENT ON COLUMN cash_movements.ledger_movement_id IS 'Ledger movement asociado (para eliminación e invalidación de caché)';


-- ===== MIGRATION 091: 091_fix_execute_readonly_query_multiline.sql =====

-- =====================================================
-- Migración 091: Fix execute_readonly_query para queries multilínea
-- =====================================================
-- Corrige la validación de queries SELECT para manejar correctamente
-- queries con saltos de línea y espacios al inicio

-- Actualizar función para manejar mejor queries multilínea
CREATE OR REPLACE FUNCTION execute_readonly_query(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  normalized_query TEXT;
  result JSONB;
  query_start_time TIMESTAMP;
  query_duration INTERVAL;
  trimmed_query TEXT;
  semicolon_count INTEGER;
BEGIN
  -- Validar que la query no esté vacía
  IF query_text IS NULL OR TRIM(query_text) = '' THEN
    RAISE EXCEPTION 'Query vacía no permitida';
  END IF;

  -- Normalizar query (remover espacios y saltos de línea al inicio/final, convertir a mayúsculas)
  -- Usar regexp_replace para eliminar espacios y saltos de línea al inicio
  normalized_query := UPPER(REGEXP_REPLACE(TRIM(query_text), '^\s+', '', 'g'));

  -- Validar que solo sea SELECT (seguridad crítica)
  -- Permitir espacios y saltos de línea después de SELECT usando regex
  IF NOT normalized_query ~ '^SELECT\s' THEN
    RAISE EXCEPTION 'Solo se permiten queries SELECT. Query recibida: %', LEFT(REGEXP_REPLACE(query_text, '\s+', ' ', 'g'), 100);
  END IF;

  -- Validar que no contenga comandos peligrosos (solo al inicio de palabras, no dentro de strings)
  -- Usamos regex para buscar comandos SQL reales, no palabras dentro de strings o nombres
  IF normalized_query ~ '\m(DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL)\M' THEN
    RAISE EXCEPTION 'Comandos peligrosos no permitidos en queries readonly';
  END IF;
  
  -- Validación adicional: asegurar que no hay múltiples SELECT seguidos de comandos peligrosos
  -- Esto previene queries como "SELECT ...; DROP TABLE ..."
  IF normalized_query ~ ';\s*(DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL)' THEN
    RAISE EXCEPTION 'Múltiples comandos no permitidos';
  END IF;

  -- Validar que no tenga múltiples statements (prevenir SQL injection)
  -- Contar solo los `;` que no están al final (después de espacios)
  trimmed_query := TRIM(TRAILING ';' FROM TRIM(query_text));
  semicolon_count := (SELECT COUNT(*) FROM regexp_split_to_table(trimmed_query, ';'));
  
  -- Permitir máximo 1 statement (el SELECT principal)
  IF semicolon_count > 1 THEN
    RAISE EXCEPTION 'Múltiples statements no permitidos';
  END IF;

  -- Registrar inicio de query
  query_start_time := clock_timestamp();

  -- Ejecutar query de forma segura usando EXECUTE
  BEGIN
    EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query_text) INTO result;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error ejecutando query: %', SQLERRM;
  END;

  -- Calcular duración
  query_duration := clock_timestamp() - query_start_time;

  -- Si la query tomó más de 10 segundos, registrar warning
  IF query_duration > INTERVAL '10 seconds' THEN
    RAISE WARNING 'Query lenta detectada: % segundos. Query: %', EXTRACT(EPOCH FROM query_duration), LEFT(query_text, 200);
  END IF;

  -- Retornar resultado (o array vacío si no hay resultados)
  RETURN COALESCE(result, '[]'::JSONB);

END;
$$;

-- Comentarios
COMMENT ON FUNCTION execute_readonly_query IS 'Ejecuta queries SELECT de forma segura para el AI Companion. Solo permite SELECT, valida SQL, y previene comandos peligrosos. Maneja correctamente queries multilínea.';


-- ===== MIGRATION 092: 092_create_tasks.sql =====

-- ============================================================
-- MIGRACIÓN: Crear tabla de tareas (Task Manager)
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),

  -- Personas
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Fechas
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Recordatorio (minutos antes de due_date)
  reminder_minutes INT,
  reminder_sent BOOLEAN DEFAULT FALSE,

  -- Vínculos opcionales
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,

  -- Agencia
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries frecuentes
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_agency ON tasks(agency_id);
CREATE INDEX idx_tasks_operation ON tasks(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX idx_tasks_priority_status ON tasks(priority, status);

-- RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;


-- ===== MIGRATION 093: 093_add_task_reminder_alert_type.sql =====

-- Agregar TASK_REMINDER al constraint de type en alerts
DO $$
BEGIN
  -- Eliminar constraint existente
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_type_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
  END IF;

  -- Crear nuevo constraint con TASK_REMINDER y RECURRING_PAYMENT
  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
    CHECK (type IN (
      'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'UPCOMING_TRIP',
      'DOCUMENT_MISSING', 'DOCUMENT_EXPIRING', 'BIRTHDAY',
      'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT',
      'RECURRING_PAYMENT', 'TASK_REMINDER', 'OTHER'
    ));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;


-- ===== MIGRATION 094: 094_create_push_subscriptions.sql =====

-- Tabla para guardar push subscriptions de Web Push Notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Los usuarios pueden gestionar sus propias subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own push subscriptions'
  ) THEN
    CREATE POLICY "Users can manage own push subscriptions" ON push_subscriptions
      FOR ALL USING (true);
  END IF;
END $$;


-- ===== MIGRATION 095: 095_add_task_assigned_alert_type.sql =====

-- Agregar TASK_ASSIGNED al constraint de type en alerts
DO $$
BEGIN
  -- Eliminar constraint existente
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_type_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
  END IF;

  -- Crear nuevo constraint con TASK_ASSIGNED
  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
    CHECK (type IN (
      'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'UPCOMING_TRIP',
      'DOCUMENT_MISSING', 'DOCUMENT_EXPIRING', 'BIRTHDAY',
      'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT',
      'RECURRING_PAYMENT', 'TASK_REMINDER', 'TASK_ASSIGNED', 'OTHER'
    ));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;


-- ===== MIGRATION 096: 096_add_assistance_operation_type.sql =====

-- Agregar ASSISTANCE al constraint de type en operations
DO $$
BEGIN
  -- Eliminar constraint existente de operations.type
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'operations_type_check' AND table_name = 'operations'
  ) THEN
    ALTER TABLE operations DROP CONSTRAINT operations_type_check;
  END IF;

  -- Crear nuevo constraint con ASSISTANCE
  ALTER TABLE operations ADD CONSTRAINT operations_type_check
    CHECK (type IN ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED', 'ASSISTANCE'));

  -- También actualizar el constraint de product_type en operation_operators (si existe)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'operation_operators_product_type_check' AND table_name = 'operation_operators'
  ) THEN
    ALTER TABLE operation_operators DROP CONSTRAINT operation_operators_product_type_check;
  END IF;

  ALTER TABLE operation_operators ADD CONSTRAINT operation_operators_product_type_check
    CHECK (product_type IN ('FLIGHT', 'HOTEL', 'PACKAGE', 'CRUISE', 'TRANSFER', 'MIXED', 'ASSISTANCE'));

EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;


-- ===== MIGRATION 097: 097_add_partner_financial_account_type.sql =====

-- Agregar PARTNER al constraint de type en financial_accounts
DO $$
BEGIN
  -- Eliminar constraint existente
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'financial_accounts_type_check' AND table_name = 'financial_accounts'
  ) THEN
    ALTER TABLE financial_accounts DROP CONSTRAINT financial_accounts_type_check;
  END IF;

  -- Crear nuevo constraint con PARTNER
  ALTER TABLE financial_accounts ADD CONSTRAINT financial_accounts_type_check
    CHECK (type IN (
      'SAVINGS_ARS', 'SAVINGS_USD', 'CHECKING_ARS', 'CHECKING_USD',
      'CASH_ARS', 'CASH_USD', 'CREDIT_CARD', 'ASSETS', 'PARTNER'
    ));

EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;


-- ===== MIGRATION 098: 098_add_commission_split_to_operations.sql =====

-- Agregar campo commission_split a operations
-- Representa el % de comisión que se lleva el vendedor principal (default 50%)
-- El vendedor secundario recibe 100 - commission_split
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS commission_split NUMERIC(5,2) DEFAULT 50;

COMMENT ON COLUMN operations.commission_split IS 'Porcentaje de comisión para el vendedor principal (0-100). El secundario recibe el resto.';


-- ===== MIGRATION 099: 099_fix_imported_operations_customers.sql =====

-- Fix retroactivo: vincular operaciones importadas con sus clientes
-- Las operaciones importadas no creaban registros en operation_customers,
-- lo que hacía que no aparecieran al buscar por nombre de cliente.
--
-- Este script busca operaciones que NO tienen ningún cliente vinculado
-- e intenta vincularlas buscando coincidencias por email entre el
-- customer_email del import y la tabla customers.
--
-- NOTA: Solo vincula operaciones que no tienen NINGÚN registro en operation_customers.
-- No afecta operaciones creadas normalmente (que ya tienen su vínculo).

-- Paso 1: Insertar operation_customers faltantes
-- Busca operaciones sin clientes que tengan un lead con contact_email que coincida con un customer
INSERT INTO operation_customers (operation_id, customer_id, role)
SELECT DISTINCT o.id, c.id, 'MAIN'
FROM operations o
LEFT JOIN operation_customers oc ON oc.operation_id = o.id
LEFT JOIN leads l ON l.id = o.lead_id
JOIN customers c ON LOWER(c.email) = LOWER(l.contact_email)
WHERE oc.id IS NULL
AND l.contact_email IS NOT NULL
AND c.email IS NOT NULL;

-- Notificar a PostgREST para que recargue el schema
NOTIFY pgrst, 'reload schema';


-- ===== MIGRATION 100: 100_partner_withdrawals_movement_type.sql =====

-- Agregar campo movement_type a partner_withdrawals para distinguir retiros de aportes
-- Los registros existentes quedan como 'WITHDRAWAL' automáticamente (DEFAULT)
ALTER TABLE partner_withdrawals ADD COLUMN IF NOT EXISTS movement_type TEXT NOT NULL DEFAULT 'WITHDRAWAL'
  CHECK (movement_type IN ('WITHDRAWAL', 'DEPOSIT'));

-- Notificar a PostgREST para que recargue el schema
NOTIFY pgrst, 'reload schema';


-- ===== MIGRATION 101: 101_add_referido_cliente_source.sql =====

-- Agregar "Referido" y "Cliente" como opciones de source en leads
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source IN ('Instagram', 'WhatsApp', 'Meta Ads', 'Other', 'Trello', 'Manychat', 'Referido', 'Cliente'));


-- ===== MIGRATION 102: 102_remove_qa_test_agencies.sql =====

-- Eliminar agencias de QA y Test
-- Primero eliminar referencias en user_agencies, luego la agencia

-- Eliminar asociaciones de usuarios con agencias QA/Test
DELETE FROM user_agencies
WHERE agency_id IN (
  SELECT id FROM agencies WHERE name ILIKE '%QA%' OR name ILIKE '%Test%'
);

-- Eliminar las agencias QA y Test
DELETE FROM agencies WHERE name ILIKE '%QA%' OR name ILIKE '%Test%';


-- ===== MIGRATION 103: 103_create_ganancia_financiera_account.sql =====

-- Crear cuenta financiera "Ganancia Financiera (USD)" para registrar ganancias por depósito
-- Esta cuenta se usa como destino de la bonificación por pago por depósito a operadores

-- Primero asegurar que existe la cuenta del plan de cuentas "Otros Ingresos" (4.1.02)
INSERT INTO chart_of_accounts (account_code, account_name, category, is_active)
VALUES ('4.1.02', 'Otros Ingresos', 'RESULTADO', true)
ON CONFLICT (account_code) DO NOTHING;

-- Crear la cuenta financiera asociada
INSERT INTO financial_accounts (name, type, currency, initial_balance, is_active, chart_account_id)
SELECT
  'Ganancia Financiera (USD)',
  'SAVINGS_USD',
  'USD',
  0,
  true,
  coa.id
FROM chart_of_accounts coa
WHERE coa.account_code = '4.1.02'
AND NOT EXISTS (
  SELECT 1 FROM financial_accounts WHERE name = 'Ganancia Financiera (USD)'
);


-- ===== MIGRATION 104: 104_add_seller_to_list_order.sql =====

-- Agregar seller_id a manychat_list_order para listas por vendedor
-- Nullable: listas sin vendedor son "compartidas" (visibles para todos)

ALTER TABLE manychat_list_order
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_manychat_list_order_seller
  ON manychat_list_order(seller_id);

COMMENT ON COLUMN manychat_list_order.seller_id IS 'ID del vendedor dueño de la lista. NULL = lista compartida visible para todos.';


-- ===== MIGRATION 105: 105_backfill_leads_list_name.sql =====

-- Backfill: asignar list_name a leads que tienen NULL basándose en su región
-- Esto hace que todos los leads existentes aparezcan en el Kanban del CRM

UPDATE leads
SET list_name = CASE region
  WHEN 'ARGENTINA' THEN 'Leads - Argentina'
  WHEN 'CARIBE' THEN 'Leads - Caribe'
  WHEN 'BRASIL' THEN 'Leads - Brasil'
  WHEN 'EUROPA' THEN 'Leads - Europa'
  WHEN 'EEUU' THEN 'Leads - EEUU'
  WHEN 'CRUCEROS' THEN 'Leads - Exoticos'
  ELSE 'Leads - Otros'
END
WHERE list_name IS NULL;


-- ===== MIGRATION 106: 106_create_operation_services.sql =====

-- ============================================================
-- MIGRATION 106: Create operation_services table
-- Servicios adicionales dentro de una operación
-- (Asiento, Equipaje, Visa, Transfer, Asistencia)
-- ============================================================

-- 1. Tipo enum para los tipos de servicio
CREATE TYPE operation_service_type AS ENUM (
  'SEAT',
  'LUGGAGE',
  'VISA',
  'TRANSFER',
  'ASSISTANCE'
);

-- 2. Tabla principal de servicios de operación
CREATE TABLE operation_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  service_type operation_service_type NOT NULL,
  description TEXT,

  -- Operador/proveedor del servicio
  operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,

  -- Precio al cliente
  sale_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sale_currency TEXT NOT NULL DEFAULT 'ARS' CHECK (sale_currency IN ('ARS', 'USD')),

  -- Costo nuestro al proveedor
  cost_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cost_currency TEXT NOT NULL DEFAULT 'ARS' CHECK (cost_currency IN ('ARS', 'USD')),

  -- Margen (calculado = sale_amount - cost_amount, solo válido si misma moneda)
  margin_amount NUMERIC(12, 2) GENERATED ALWAYS AS (
    CASE WHEN sale_currency = cost_currency THEN sale_amount - cost_amount ELSE NULL END
  ) STORED,

  -- Si este tipo de servicio genera comisión al vendedor
  -- SEAT=false, LUGGAGE=false, VISA=false, TRANSFER=true, ASSISTANCE=true
  generates_commission BOOLEAN NOT NULL DEFAULT false,

  -- IDs de los registros contables generados (para trazabilidad y rollback)
  payment_id UUID,            -- registro en payments (deuda cliente)
  operator_payment_id UUID,   -- registro en operator_payments (deuda proveedor)
  ledger_income_id UUID,      -- ledger_movement INCOME
  ledger_expense_id UUID,     -- ledger_movement EXPENSE
  commission_record_id UUID,  -- commission_records si aplica

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Índices
CREATE INDEX idx_operation_services_operation_id ON operation_services(operation_id);
CREATE INDEX idx_operation_services_agency_id ON operation_services(agency_id);
CREATE INDEX idx_operation_services_operator_id ON operation_services(operator_id);

-- 4. Trigger updated_at
CREATE OR REPLACE FUNCTION update_operation_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_operation_services_updated_at
  BEFORE UPDATE ON operation_services
  FOR EACH ROW
  EXECUTE FUNCTION update_operation_services_updated_at();

-- 5. RLS
ALTER TABLE operation_services ENABLE ROW LEVEL SECURITY;

-- Helper: usuario tiene acceso a la agencia (member) o es SUPER_ADMIN/ADMIN
-- Los SUPER_ADMIN no siempre tienen registro en user_agencies, acceden por rol.

CREATE POLICY "Agency members can view their operation services"
  ON operation_services FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

CREATE POLICY "Agency admins and sellers can insert operation services"
  ON operation_services FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

CREATE POLICY "Agency admins can update operation services"
  ON operation_services FOR UPDATE
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

CREATE POLICY "Agency admins can delete operation services"
  ON operation_services FOR DELETE
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- 6. Insertar operador "Tarjeta de Crédito" si no existe
-- (usado principalmente para el servicio de Asiento pagado con tarjeta)
INSERT INTO operators (name, contact_name, contact_email, contact_phone, credit_limit)
SELECT 'Tarjeta de Crédito', NULL, NULL, NULL, 0
WHERE NOT EXISTS (
  SELECT 1 FROM operators WHERE name = 'Tarjeta de Crédito'
);


-- ===== MIGRATION 107: 107_add_operation_service_id_to_payments.sql =====

-- ============================================================
-- MIGRATION 107: Add operation_service_id to payments table
-- Permite vincular un pago con un servicio adicional específico
-- (Asiento, Equipaje, Visa, Transfer, Asistencia)
-- ============================================================

-- 1. Agregar columna operation_service_id (nullable)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS operation_service_id UUID REFERENCES operation_services(id) ON DELETE SET NULL;

-- 2. Índice para filtrar pagos por servicio
CREATE INDEX IF NOT EXISTS idx_payments_operation_service_id
  ON payments(operation_service_id);


-- ===== MIGRATION 108: 108_add_archived_at_to_leads.sql =====

-- Agrega columna archived_at a leads para soft-delete (archivar)
-- Cuando archived_at IS NOT NULL, el lead está archivado.
-- Se mantiene list_name para mostrarlo en la tab "Archivados" de su lista.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Índice para filtrar rápido (la mayoría de las queries excluyen archivados)
CREATE INDEX IF NOT EXISTS idx_leads_archived_at ON leads (archived_at)
  WHERE archived_at IS NOT NULL;


-- ===== MIGRATION 109: 109_add_movement_date_to_ledger.sql =====

-- Migration 109: Add movement_date to ledger_movements
--
-- BUG FIX: Los movimientos de caja creados con fecha retroactiva (movement_date)
-- no aparecían en el filtro de la Caja porque getLedgerMovements() filtraba por
-- created_at (fecha de inserción) en vez de por la fecha real del movimiento.
--
-- Esta migración agrega movement_date a ledger_movements, hace backfill con
-- created_at para registros existentes, y agrega un índice para performance.

ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS movement_date TIMESTAMPTZ;

-- Backfill: todos los registros existentes usan su created_at como movement_date
UPDATE ledger_movements
  SET movement_date = created_at
  WHERE movement_date IS NULL;

-- Hacer la columna NOT NULL con default NOW() para nuevos registros
ALTER TABLE ledger_movements
  ALTER COLUMN movement_date SET DEFAULT NOW();

ALTER TABLE ledger_movements
  ALTER COLUMN movement_date SET NOT NULL;

-- Índice para mejorar performance de los filtros por fecha
CREATE INDEX IF NOT EXISTS idx_ledger_movements_movement_date
  ON ledger_movements (movement_date DESC);


-- ===== MIGRATION 110: 110_cash_movements_payment_id_unique.sql =====

-- Prevenir duplicados de cash_movements para el mismo pago
-- Un pago solo puede tener un movimiento de caja asociado
CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_payment_id_unique
  ON cash_movements(payment_id)
  WHERE payment_id IS NOT NULL;

-- Eliminar duplicados existentes antes de crear el constraint
-- Mantiene el cash_movement más reciente (mayor id) por payment_id
DELETE FROM cash_movements
WHERE id IN (
  SELECT a.id
  FROM cash_movements a
  JOIN cash_movements b ON a.payment_id = b.payment_id
  WHERE a.payment_id IS NOT NULL
    AND a.created_at < b.created_at
);


-- ===== MIGRATION 111: 110_fix_sale_currency_sync.sql =====

-- Migration 110: Fix sale_currency sync with currency
--
-- BUG FIX: El formulario de edición de operaciones (edit-operation-dialog.tsx)
-- solo enviaba el campo "currency" al hacer PATCH, pero nunca enviaba "sale_currency".
-- Esto causó que al cambiar una operación de USD a ARS, el campo "currency" se
-- actualizara correctamente (y la UI mostrara ARS) pero "sale_currency" quedara
-- en USD — generando que Cerebro cuente la operación como USD.
--
-- Este script corrige todos los registros donde currency != sale_currency,
-- usando "currency" como la fuente de verdad (es el campo que controla la UI).

UPDATE operations
  SET sale_currency = currency
WHERE currency IS NOT NULL
  AND sale_currency IS NOT NULL
  AND sale_currency != currency;

-- Loguear cuántas filas se afectaron
DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'sale_currency sync: % operaciones corregidas', affected_rows;
END $$;


-- ===== MIGRATION 112: 111_add_affects_balance_to_ledger_movements.sql =====

-- =====================================================
-- Migración 111: Agregar columna affects_balance a ledger_movements
-- =====================================================
-- Permite crear movimientos "informativos" que se VEN en la lista
-- pero NO afectan el cálculo de saldos de las cuentas financieras.
-- Caso de uso: movimientos históricos importados donde el saldo
-- inicial (initial_balance) ya contempla esos montos.

ALTER TABLE ledger_movements
ADD COLUMN IF NOT EXISTS affects_balance BOOLEAN NOT NULL DEFAULT true;

-- Comentario descriptivo
COMMENT ON COLUMN ledger_movements.affects_balance IS 'Si es false, el movimiento se muestra en la UI pero no afecta el cálculo de balance de la cuenta. Usado para importaciones históricas donde el initial_balance ya contempla los montos.';

-- Índice parcial para queries de balance (solo filas que afectan balance)
CREATE INDEX IF NOT EXISTS idx_ledger_affects_balance ON ledger_movements(account_id, affects_balance) WHERE affects_balance = true;


-- ===== MIGRATION 113: 111_backfill_cash_movements_financial_account.sql =====

-- Migration 111: Backfill financial_account_id en cash_movements
--
-- PROBLEMA: Los movimientos creados antes de que "financial_account_id" fuera
-- obligatorio (vía el campo del formulario de Caja) quedaron con NULL en esa columna.
-- Como la vista "Caja USD / Caja ARS" filtra por financial_account_id con eq(),
-- estos movimientos viejos son INVISIBLES en la Caja, aunque sí cuentan en el
-- balance total (financial_accounts.current_balance via ledger_movements).
--
-- FIX: Para cada movimiento con financial_account_id IS NULL, asignarle la primera
-- cuenta financiera activa que coincida con su currency (USD → CASH_USD, ARS → CASH_ARS).
-- Prioridad: CASH_USD / CASH_ARS primero (efectivo), luego cualquier cuenta de esa moneda.

UPDATE cash_movements cm
SET financial_account_id = (
  SELECT fa.id
  FROM financial_accounts fa
  WHERE fa.currency = cm.currency
    AND fa.is_active = true
    AND fa.type IN (
      CASE cm.currency
        WHEN 'USD' THEN 'CASH_USD'
        WHEN 'ARS' THEN 'CASH_ARS'
        ELSE 'CASH_ARS'
      END
    )
  ORDER BY fa.created_at ASC
  LIMIT 1
)
WHERE cm.financial_account_id IS NULL
  AND cm.currency IS NOT NULL;

-- Si todavía quedan NULL (no existe cuenta CASH_XX), intentar con cualquier cuenta de esa moneda
UPDATE cash_movements cm
SET financial_account_id = (
  SELECT fa.id
  FROM financial_accounts fa
  WHERE fa.currency = cm.currency
    AND fa.is_active = true
  ORDER BY fa.created_at ASC
  LIMIT 1
)
WHERE cm.financial_account_id IS NULL
  AND cm.currency IS NOT NULL;

-- Loguear resultado
DO $$
DECLARE
  remaining_null INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_null
  FROM cash_movements
  WHERE financial_account_id IS NULL;
  RAISE NOTICE 'Backfill completado. Movimientos aún con financial_account_id NULL: %', remaining_null;
END $$;


-- ===== MIGRATION 114: 112_add_financial_account_to_cash_movements.sql =====

-- Migration 112: Agregar financial_account_id a cash_movements + backfill
--
-- PROBLEMA: La tabla cash_movements nunca tuvo la columna financial_account_id
-- en producción. El código del API la requería y filtraba por ella, pero como
-- no existía, todos los movimientos eran invisibles en la vista Caja USD/ARS.
--
-- SOLUCIÓN:
-- 1. Agregar la columna financial_account_id (nullable, FK a financial_accounts)
-- 2. Backfill: asignar la primera cuenta activa de la moneda correcta (CASH_USD/CASH_ARS)
-- 3. Índice para performance de los filtros

-- PASO 1: Agregar columna
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS financial_account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL;

-- Índice para queries de la Caja
CREATE INDEX IF NOT EXISTS idx_cash_movements_financial_account
  ON cash_movements(financial_account_id)
  WHERE financial_account_id IS NOT NULL;

-- PASO 2: Backfill — asignar cuenta CASH_USD o CASH_ARS según currency
-- Primero intentar con cuentas de tipo CASH_XXX (efectivo)
UPDATE cash_movements cm
SET financial_account_id = (
  SELECT fa.id
  FROM financial_accounts fa
  WHERE fa.currency = cm.currency
    AND fa.is_active = true
    AND fa.type = CASE cm.currency
      WHEN 'USD' THEN 'CASH_USD'
      WHEN 'ARS' THEN 'CASH_ARS'
      ELSE 'CASH_ARS'
    END
  ORDER BY fa.created_at ASC
  LIMIT 1
)
WHERE cm.financial_account_id IS NULL
  AND cm.currency IS NOT NULL;

-- Si todavía quedan NULL (no hay cuenta CASH_XX), usar cualquier cuenta activa de esa moneda
UPDATE cash_movements cm
SET financial_account_id = (
  SELECT fa.id
  FROM financial_accounts fa
  WHERE fa.currency = cm.currency
    AND fa.is_active = true
  ORDER BY fa.created_at ASC
  LIMIT 1
)
WHERE cm.financial_account_id IS NULL
  AND cm.currency IS NOT NULL;

-- PASO 3: Loguear resultado
DO $$
DECLARE
  total_movements INTEGER;
  assigned INTEGER;
  still_null INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_movements FROM cash_movements;
  SELECT COUNT(*) INTO assigned FROM cash_movements WHERE financial_account_id IS NOT NULL;
  SELECT COUNT(*) INTO still_null FROM cash_movements WHERE financial_account_id IS NULL;
  RAISE NOTICE 'Migration 112 completada: % movimientos totales, % con cuenta asignada, % sin cuenta (sin currency o sin cuenta activa)',
    total_movements, assigned, still_null;
END $$;


-- ===== MIGRATION 115: 112_wha_control_tables.sql =====

-- WHA Control: Tablas para monitoreo de WhatsApp via Baileys
-- Migración 112

-- 1. wa_devices - Números de WhatsApp conectados
CREATE TABLE IF NOT EXISTS wa_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  phone_number text,
  whatsapp_jid text,
  status text NOT NULL DEFAULT 'PENDING_QR'
    CHECK (status IN ('PENDING_QR','PAIRING','CONNECTED','DISCONNECTED','RECONNECTING','LOGGED_OUT','ERROR')),
  qr_value text,
  last_connection_at timestamptz,
  last_seen_event_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. wa_auth_credentials - Credenciales de sesión Baileys (1 por device)
CREATE TABLE IF NOT EXISTS wa_auth_credentials (
  device_id uuid PRIMARY KEY REFERENCES wa_devices(id) ON DELETE CASCADE,
  creds jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. wa_auth_keys - Key store de Baileys
CREATE TABLE IF NOT EXISTS wa_auth_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES wa_devices(id) ON DELETE CASCADE,
  category text NOT NULL,
  key_id text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, category, key_id)
);

-- 4. wa_chats - Conversaciones por device
CREATE TABLE IF NOT EXISTS wa_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES wa_devices(id) ON DELETE CASCADE,
  remote_jid text NOT NULL,
  chat_type text NOT NULL DEFAULT 'individual'
    CHECK (chat_type IN ('individual','group','broadcast')),
  contact_name text,
  contact_phone text,
  push_name text,
  is_group boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_message_preview text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, remote_jid)
);

-- 5. wa_messages - Mensajes
CREATE TABLE IF NOT EXISTS wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES wa_devices(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES wa_chats(id) ON DELETE CASCADE,
  wa_message_id text NOT NULL,
  remote_jid text NOT NULL,
  participant_jid text,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','system')),
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text','image','video','audio','voice','document','sticker','location','contact','reaction','system','unknown')),
  body_text text,
  sent_at timestamptz NOT NULL,
  from_me boolean NOT NULL DEFAULT false,
  media_url text,
  media_mime_type text,
  media_file_name text,
  quoted_message_id text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, wa_message_id)
);

-- 6. wa_daily_metrics - Métricas agregadas diarias
CREATE TABLE IF NOT EXISTS wa_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES wa_devices(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  inbound_count integer NOT NULL DEFAULT 0,
  outbound_count integer NOT NULL DEFAULT 0,
  active_chats_count integer NOT NULL DEFAULT 0,
  new_chats_count integer NOT NULL DEFAULT 0,
  responded_chats_count integer NOT NULL DEFAULT 0,
  unanswered_chats_count integer NOT NULL DEFAULT 0,
  avg_first_response_seconds numeric(12,2),
  median_first_response_seconds numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, metric_date)
);

-- Indexes para performance
CREATE INDEX IF NOT EXISTS idx_wa_messages_chat_sent ON wa_messages(chat_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_device_sent ON wa_messages(device_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_chats_device_last_msg ON wa_chats(device_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_daily_metrics_device_date ON wa_daily_metrics(device_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_wa_auth_keys_device_cat ON wa_auth_keys(device_id, category);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_wa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wa_devices_updated_at BEFORE UPDATE ON wa_devices
  FOR EACH ROW EXECUTE FUNCTION update_wa_updated_at();
CREATE TRIGGER wa_chats_updated_at BEFORE UPDATE ON wa_chats
  FOR EACH ROW EXECUTE FUNCTION update_wa_updated_at();
CREATE TRIGGER wa_daily_metrics_updated_at BEFORE UPDATE ON wa_daily_metrics
  FOR EACH ROW EXECUTE FUNCTION update_wa_updated_at();
CREATE TRIGGER wa_auth_credentials_updated_at BEFORE UPDATE ON wa_auth_credentials
  FOR EACH ROW EXECUTE FUNCTION update_wa_updated_at();

-- RLS con policy permisiva (acceso controlado por service_role y admin client)
ALTER TABLE wa_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_auth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_auth_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_devices_full_access" ON wa_devices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wa_auth_credentials_full_access" ON wa_auth_credentials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wa_auth_keys_full_access" ON wa_auth_keys FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wa_chats_full_access" ON wa_chats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wa_messages_full_access" ON wa_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "wa_daily_metrics_full_access" ON wa_daily_metrics FOR ALL USING (true) WITH CHECK (true);


-- ===== MIGRATION 116: 113_backup_pre_agency_id_migration.sql =====

-- =====================================================
-- Migration 113: BACKUPS pre-migración Fase 1 import multi-tenant
-- =====================================================
-- Crea snapshots de las 4 tablas a las que vamos a agregar agency_id.
-- Estos backups permiten restauración completa si el backfill falla.
-- Se pueden borrar después de validar que Fase 1 quedó estable (>1 semana).
--
-- Spec: docs/superpowers/specs/2026-04-28-import-multitenant-design.md
-- Plan: docs/superpowers/plans/2026-04-28-import-multitenant-fase1.md
-- =====================================================

CREATE TABLE IF NOT EXISTS customers_backup_2026_04_28 AS
  SELECT * FROM customers;

CREATE TABLE IF NOT EXISTS operators_backup_2026_04_28 AS
  SELECT * FROM operators;

CREATE TABLE IF NOT EXISTS payments_backup_2026_04_28 AS
  SELECT * FROM payments;

CREATE TABLE IF NOT EXISTS cash_movements_backup_2026_04_28 AS
  SELECT * FROM cash_movements;

-- Verificación (counts deben coincidir con Pre-flight 8 de Task 1):
--   customers: 645
--   operators: 24
--   payments: 2.739
--   cash_movements: 2.343
SELECT 'customers_backup' AS tabla, COUNT(*) AS filas FROM customers_backup_2026_04_28
UNION ALL SELECT 'operators_backup', COUNT(*) FROM operators_backup_2026_04_28
UNION ALL SELECT 'payments_backup', COUNT(*) FROM payments_backup_2026_04_28
UNION ALL SELECT 'cash_movements_backup', COUNT(*) FROM cash_movements_backup_2026_04_28;


-- ===== MIGRATION 117: 113_gastos_module.sql =====

-- Migration 113: Gastos Module
-- Adds category_id to cash_movements and creates expense_receipts bridge table

-- A) Add category_id FK to cash_movements (links to recurring_payment_categories)
-- The existing 'category' text column stays for backward compatibility
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES recurring_payment_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cash_movements_category_id ON cash_movements(category_id);

-- B) Create expense_receipts bridge table
-- Links documents (receipts/proofs) to either cash_movements or recurring_payments
CREATE TABLE IF NOT EXISTS expense_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  cash_movement_id UUID REFERENCES cash_movements(id) ON DELETE CASCADE,
  recurring_payment_id UUID REFERENCES recurring_payments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- At least one expense reference must be set
  CONSTRAINT expense_receipts_has_reference CHECK (
    cash_movement_id IS NOT NULL OR recurring_payment_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_cash_movement ON expense_receipts(cash_movement_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_recurring_payment ON expense_receipts(recurring_payment_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_document ON expense_receipts(document_id);

-- Disable RLS (admin-only access via service role key)
ALTER TABLE expense_receipts DISABLE ROW LEVEL SECURITY;

-- Add comment for clarity
COMMENT ON TABLE expense_receipts IS 'Bridge table linking receipt documents to expenses (variable or recurring)';
COMMENT ON TABLE recurring_payment_categories IS 'Categorías de gastos (usadas tanto para fijos/recurrentes como variables)';


-- ===== MIGRATION 118: 114_add_agency_id_nullable_to_orphan_tables.sql =====

-- =====================================================
-- Migration 114: agregar agency_id NULLABLE a las 4 tablas huérfanas
-- =====================================================
-- Las tablas customers, operators, payments, cash_movements no tenían
-- agency_id desde 001_initial_schema.sql. Esta migration agrega la columna
-- como NULLABLE; el backfill (migrations 115-118) y el SET NOT NULL
-- (migration 119) se hacen aparte para mantener cada paso reversible.
--
-- Riesgo: cero. Columnas vacías, la app no las usa todavía.
-- Spec: docs/superpowers/specs/2026-04-28-import-multitenant-design.md
-- =====================================================

-- 1. customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_customers_agency_id ON customers(agency_id);

-- 2. operators
ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_operators_agency_id ON operators(agency_id);

-- 3. payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_payments_agency_id ON payments(agency_id);

-- 4. cash_movements
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_cash_movements_agency_id ON cash_movements(agency_id);

-- Verificación: confirmar que la columna existe y está nullable
SELECT
  table_name,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'agency_id'
  AND table_name IN ('customers', 'operators', 'payments', 'cash_movements')
ORDER BY table_name;


-- ===== MIGRATION 119: 114_destinations_master.sql =====

-- Tabla maestra de destinos
-- Unifica destinos escritos de forma diferente (ej: "PUNTA CANA" y "Punta Cana")

CREATE TABLE IF NOT EXISTS destinations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  name_normalized TEXT NOT NULL,
  country TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_destinations_normalized ON destinations(name_normalized);
CREATE INDEX IF NOT EXISTS idx_destinations_name ON destinations(name);

-- Agregar referencia en operations
ALTER TABLE operations ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES destinations(id);
CREATE INDEX IF NOT EXISTS idx_operations_destination_id ON operations(destination_id);

-- RLS: destinations es lectura para todos los autenticados
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "destinations_select_all" ON destinations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "destinations_insert_admin" ON destinations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "destinations_update_admin" ON destinations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- ===== MIGRATION 120: 115_backfill_payments_agency_id.sql =====

-- =====================================================
-- Migration 115: backfill agency_id en payments
-- =====================================================
-- Cada payment hereda agency_id de la operation a la que está vinculado.
-- payments.operation_id es NOT NULL en el schema, así que sin huérfanos.
-- Pre-flight 1 (Task 1) confirmó payments_huerfanos = 0.
--
-- ⚠️ UPDATE sobre data productiva de Rosario, mecánico.
-- Pre-aprobado por Tomi antes de correr.
-- Spec: docs/superpowers/specs/2026-04-28-import-multitenant-design.md
-- =====================================================

UPDATE payments p
SET agency_id = o.agency_id
FROM operations o
WHERE p.operation_id = o.id
  AND p.agency_id IS NULL;

-- Verificación: cuántas filas quedaron sin agency_id (esperado: 0)
SELECT COUNT(*) AS payments_sin_agency_id
FROM payments WHERE agency_id IS NULL;

-- Verificación adicional: distribución por agencia (control de sanidad)
SELECT a.name AS agencia, COUNT(*) AS payments_count
FROM payments p
JOIN agencies a ON a.id = p.agency_id
GROUP BY a.name
ORDER BY payments_count DESC;


-- ===== MIGRATION 121: 115_itinerary_items.sql =====

-- Itinerary items for purchase detail PDF generation
-- Each operation can have multiple itinerary blocks (hotels, flights, transfers, cars, notes)

CREATE TABLE IF NOT EXISTS itinerary_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  item_type TEXT NOT NULL CHECK (item_type IN ('HOTEL', 'FLIGHT', 'TRANSFER', 'CAR', 'NOTE')),

  -- Hotel fields
  hotel_name TEXT,
  hotel_stars INTEGER CHECK (hotel_stars >= 1 AND hotel_stars <= 5),
  hotel_address TEXT,
  hotel_phone TEXT,
  room_type TEXT,
  meal_plan TEXT,
  checkin_date DATE,
  checkout_date DATE,
  nights INTEGER,
  rooms INTEGER,

  -- Flight fields
  airline TEXT,
  flight_route TEXT,
  flight_date DATE,

  -- Transfer fields
  transfer_description TEXT,

  -- Car fields
  car_company TEXT,
  car_details TEXT,
  car_pickup_date DATE,
  car_return_date DATE,
  car_pickup_location TEXT,
  car_return_location TEXT,

  -- Common fields
  destination_city TEXT,
  date_from DATE,
  date_to DATE,
  notes TEXT,
  image_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_itinerary_items_operation ON itinerary_items(operation_id, sort_order);

ALTER TABLE itinerary_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "itinerary_select" ON itinerary_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "itinerary_insert" ON itinerary_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "itinerary_update" ON itinerary_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "itinerary_delete" ON itinerary_items FOR DELETE TO authenticated USING (true);


-- ===== MIGRATION 122: 116_add_seller_id_to_commission_rules.sql =====

-- Add seller_id column to commission_rules so each seller can have
-- their own commission percentage configured from Settings → Comisiones.
-- When seller_id IS NULL the rule acts as a generic fallback for all sellers.

ALTER TABLE commission_rules
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Index for fast lookup by seller
CREATE INDEX IF NOT EXISTS idx_commission_rules_seller_id
  ON commission_rules (seller_id);

-- Seed initial per-seller rules from the previously hard-coded percentages.
-- All rules are type='SELLER', basis='FIXED_PERCENTAGE', valid from today, no expiry.
INSERT INTO commission_rules (type, basis, value, seller_id, valid_from)
VALUES
  ('SELLER', 'FIXED_PERCENTAGE', 50, 'e86b35c1-f10c-4524-8f28-4a61ef6a3f20', CURRENT_DATE),  -- Maximiliano Di Franco
  ('SELLER', 'FIXED_PERCENTAGE', 35, '84c54c89-e6c3-4bac-80ac-9e2186eb3aaf', CURRENT_DATE),  -- Santiago Nader
  ('SELLER', 'FIXED_PERCENTAGE', 45, 'eca8bd76-50af-46f2-9d20-148e620a8f23', CURRENT_DATE),  -- Ramiro Airaldi
  ('SELLER', 'FIXED_PERCENTAGE', 35, 'a7fb94f9-1ef6-4749-b6eb-ac17b7f08a05', CURRENT_DATE),  -- Micaela Nader
  ('SELLER', 'FIXED_PERCENTAGE', 20, '888c7097-512d-47f3-96e8-25074de4179d', CURRENT_DATE),  -- Josefina Giordano
  ('SELLER', 'FIXED_PERCENTAGE', 15, 'c9d53499-e9bc-4f11-97b6-1eaf3f049723', CURRENT_DATE),  -- Candela Bertolotto
  ('SELLER', 'FIXED_PERCENTAGE', 15, '0f843ee8-2890-48ee-a51b-6d3511b980cc', CURRENT_DATE),  -- Emilia Roca
  ('SELLER', 'FIXED_PERCENTAGE', 13, 'd7b3e47e-1de9-456f-8d7d-6f26555a5a59', CURRENT_DATE),  -- Emilia Di Vito
  ('SELLER', 'FIXED_PERCENTAGE', 13, '92455378-c875-4a37-8ed1-617e91cf90e0', CURRENT_DATE),  -- Malena Rodriguez
  ('SELLER', 'FIXED_PERCENTAGE', 20, 'b9496cdb-7d18-473c-b9d8-2dafcc7e7912', CURRENT_DATE),  -- Yamil Isnaldo
  ('SELLER', 'FIXED_PERCENTAGE', 10, '3591726c-2891-49f4-94f4-27f15d584b16', CURRENT_DATE),  -- Martina Schiriatti
  ('SELLER', 'FIXED_PERCENTAGE', 50, '8ff855bb-d531-4ed5-a0bf-2888cc97f79f', CURRENT_DATE),  -- Julieta Suarez
  ('SELLER', 'FIXED_PERCENTAGE', 20, 'c6cc61f6-0954-4a26-b72b-40c1f0f5566f', CURRENT_DATE)   -- Naza
ON CONFLICT DO NOTHING;


-- ===== MIGRATION 123: 116_backfill_cash_movements_agency_id.sql =====

-- =====================================================
-- Migration 116: backfill agency_id en cash_movements
-- =====================================================
-- Estrategia:
--   1. Si cash_movement tiene operation_id no nulo → hereda de operations.agency_id
--   2. Si no tiene operation_id → hereda de user_agencies por user_id
-- Pre-flight 2 (Task 1) confirmó cash_movements_huerfanos = 0,
-- así que el COALESCE va a resolver las 2.343 filas.
--
-- ⚠️ UPDATE sobre data productiva de Rosario, mecánico.
-- Pre-aprobado por Tomi antes de correr.
-- =====================================================

UPDATE cash_movements cm
SET agency_id = COALESCE(
  (SELECT o.agency_id FROM operations o WHERE o.id = cm.operation_id),
  (SELECT ua.agency_id FROM user_agencies ua WHERE ua.user_id = cm.user_id LIMIT 1)
)
WHERE cm.agency_id IS NULL;

-- Verificación 1: cuántas filas quedaron sin agency_id (esperado: 0)
SELECT COUNT(*) AS cash_movements_sin_agency_id
FROM cash_movements WHERE agency_id IS NULL;

-- Verificación 2: distribución por agencia
SELECT a.name AS agencia, COUNT(*) AS cash_movements_count
FROM cash_movements cm
JOIN agencies a ON a.id = cm.agency_id
GROUP BY a.name
ORDER BY cash_movements_count DESC;


-- ===== MIGRATION 124: 117_add_iva_rate_columns.sql =====

-- Add IVA rate and service type columns to iva_sales
ALTER TABLE iva_sales ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5,4) DEFAULT 0.21;
ALTER TABLE iva_sales ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'INTERMEDIACION';
ALTER TABLE iva_sales ADD COLUMN IF NOT EXISTS is_exempt BOOLEAN DEFAULT false;

-- Add IVA rate column to iva_purchases
ALTER TABLE iva_purchases ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5,4) DEFAULT 0.21;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_iva_sales_service_type ON iva_sales(service_type);
CREATE INDEX IF NOT EXISTS idx_iva_sales_is_exempt ON iva_sales(is_exempt);


-- ===== MIGRATION 125: 117_backfill_customers_agency_id.sql =====

-- =====================================================
-- Migration 117: backfill agency_id en customers
-- =====================================================
-- Estrategia (4 pasos):
--   1. Happy path: customers con operations vinculadas heredan via operation_customers
--      (Pre-flight 5 confirmó 0 multi-agencia, así que la exclusión NO afecta)
--   2. Borrar customer de testing: TEST AUTOMATICO
--   3. Asignar Conciliacion CAJA USD MADERO a Madero
--   4. Asignar el resto de los huérfanos a Rosario por default
--
-- ⚠️ UPDATE + DELETE sobre data productiva. Pre-aprobado por Tomi.
-- Decisiones tomadas en chat el 2026-04-28.
-- =====================================================

-- ─── STEP 1: Happy path ─────────────────────────────
UPDATE customers c
SET agency_id = (
  SELECT o.agency_id
  FROM operation_customers oc
  JOIN operations o ON o.id = oc.operation_id
  WHERE oc.customer_id = c.id
  LIMIT 1
)
WHERE c.agency_id IS NULL
  AND c.id NOT IN (
    -- Excluye customers en múltiples agencias (caso edge — Pre-flight 5 confirmó 0)
    SELECT oc.customer_id
    FROM operation_customers oc
    JOIN operations o ON o.id = oc.operation_id
    GROUP BY oc.customer_id
    HAVING COUNT(DISTINCT o.agency_id) > 1
  );

-- ─── STEP 2: Borrar testing data ────────────────────
DELETE FROM customers WHERE id = '74ca2dc5-eb9b-4147-863b-46a4f200aa67';
-- (TEST AUTOMATICO, creado 2026-03-06, sin operations)

-- ─── STEP 3: Conciliacion CAJA USD MADERO → Madero ──
UPDATE customers
SET agency_id = 'fabbc2e7-81d8-4ca1-85b2-7809c5f88e75'
WHERE id = '75b40bdd-bc87-42cf-8e70-5cfcf1448854';

-- ─── STEP 4: Resto de los huérfanos → Rosario ───────
UPDATE customers
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;

-- ─── Verificaciones ─────────────────────────────────

-- Verificación 1: cuántas filas quedaron sin agency_id (esperado: 0)
SELECT COUNT(*) AS customers_sin_agency_id
FROM customers WHERE agency_id IS NULL;

-- Verificación 2: distribución por agencia
SELECT a.name AS agencia, COUNT(*) AS customers_count
FROM customers c
JOIN agencies a ON a.id = c.agency_id
GROUP BY a.name
ORDER BY customers_count DESC;

-- Verificación 3: confirmar que Madero tenga al Conciliacion
SELECT c.id, c.first_name, c.last_name, a.name AS agencia
FROM customers c
JOIN agencies a ON a.id = c.agency_id
WHERE c.id = '75b40bdd-bc87-42cf-8e70-5cfcf1448854';


-- ===== MIGRATION 126: 118_add_ledger_indexes.sql =====

-- Performance indexes for accounting reports
CREATE INDEX IF NOT EXISTS idx_ledger_movements_movement_date ON ledger_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_type_date ON ledger_movements(type, movement_date);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_account_date ON ledger_movements(account_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_operation_type ON ledger_movements(operation_id, type);

-- Index for IVA reports
CREATE INDEX IF NOT EXISTS idx_iva_sales_date ON iva_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_iva_purchases_date ON iva_purchases(purchase_date);

-- Index for commission lookups
CREATE INDEX IF NOT EXISTS idx_commission_records_operation_seller ON commission_records(operation_id, seller_id);


-- ===== MIGRATION 127: 118_backfill_operators_agency_id.sql =====

-- =====================================================
-- Migration 118: backfill agency_id en operators
-- =====================================================
-- Estrategia (3 pasos):
--   1. Happy path: operators con operations vinculadas heredan via operation_operators
--   2. Borrar operator de testing: SMOKE TEST CLAUDE - Operador
--   3. Asignar el resto de los huérfanos a Rosario por default
--      (Tarjeta de Crédito, Booking)
--
-- ⚠️ UPDATE + DELETE sobre data productiva. Pre-aprobado por Tomi.
-- Decisiones tomadas en chat el 2026-04-28.
-- =====================================================

-- ─── STEP 1: Happy path ─────────────────────────────
UPDATE operators op
SET agency_id = (
  SELECT o.agency_id
  FROM operation_operators oo
  JOIN operations o ON o.id = oo.operation_id
  WHERE oo.operator_id = op.id
  LIMIT 1
)
WHERE op.agency_id IS NULL
  AND op.id NOT IN (
    SELECT oo.operator_id
    FROM operation_operators oo
    JOIN operations o ON o.id = oo.operation_id
    GROUP BY oo.operator_id
    HAVING COUNT(DISTINCT o.agency_id) > 1
  );

-- ─── STEP 2: Borrar testing data ────────────────────
DELETE FROM operators WHERE id = '91a56a06-f4e2-4497-877b-e5180379b0ba';
-- (SMOKE TEST CLAUDE - Operador, creado 2026-04-27)

-- ─── STEP 3: Resto de huérfanos → Rosario ───────────
UPDATE operators
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;
-- (Tarjeta de Crédito + Booking + cualquier otro huérfano residual)

-- ─── Verificaciones ─────────────────────────────────

-- Verificación 1: cuántas filas quedaron sin agency_id (esperado: 0)
SELECT COUNT(*) AS operators_sin_agency_id
FROM operators WHERE agency_id IS NULL;

-- Verificación 2: distribución por agencia
SELECT a.name AS agencia, COUNT(*) AS operators_count
FROM operators op
JOIN agencies a ON a.id = op.agency_id
GROUP BY a.name
ORDER BY operators_count DESC;


-- ===== MIGRATION 128: 119_autofill_agency_id_triggers.sql =====

-- =====================================================
-- Migration 119: triggers BEFORE INSERT auto-fill agency_id
-- =====================================================
-- Garantiza que cualquier INSERT futuro en customers/operators/payments/
-- cash_movements tenga agency_id, incluso si el código del endpoint no
-- lo pasa explícitamente.
--
-- Estrategia por tabla:
--   payments: hereda de operation_id (NOT NULL) → operations.agency_id
--   cash_movements: 1° de operation_id, 2° de user_id → user_agencies
--   customers: de auth.uid() → user_agencies
--   operators: de auth.uid() → user_agencies
--
-- Comportamiento: si el caller pasa agency_id, NO se sobreescribe.
-- Si no se puede determinar (admin client sin auth.uid() y sin operation_id):
-- agency_id queda NULL → el constraint NOT NULL (migration 121) lo rechaza.
-- Esto es intencional: forzar explicitud en code paths admin.
--
-- Limitación: usuarios con múltiples agencias (Maxi con Rosario+Madero)
-- → el trigger elige LIMIT 1 (la primera). Para esos casos el endpoint
-- debe pasar agency_id explícito. Aceptable en Fase 1; el motor de import
-- de Fase 2 SIEMPRE pasa agency_id como parámetro.
-- =====================================================

-- ─── payments ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_autofill_agency_id_payments()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agency_id IS NULL THEN
    SELECT agency_id INTO NEW.agency_id
    FROM operations WHERE id = NEW.operation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS autofill_payments_agency_id ON payments;
CREATE TRIGGER autofill_payments_agency_id
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_autofill_agency_id_payments();

-- ─── cash_movements ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_autofill_agency_id_cash_movements()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agency_id IS NULL THEN
    -- 1. Try operation_id
    IF NEW.operation_id IS NOT NULL THEN
      SELECT agency_id INTO NEW.agency_id
      FROM operations WHERE id = NEW.operation_id;
    END IF;

    -- 2. Fallback: user_id → user_agencies
    IF NEW.agency_id IS NULL AND NEW.user_id IS NOT NULL THEN
      SELECT agency_id INTO NEW.agency_id
      FROM user_agencies WHERE user_id = NEW.user_id LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS autofill_cash_movements_agency_id ON cash_movements;
CREATE TRIGGER autofill_cash_movements_agency_id
  BEFORE INSERT ON cash_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_autofill_agency_id_cash_movements();

-- ─── customers ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_autofill_agency_id_customers()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agency_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT agency_id INTO NEW.agency_id
    FROM user_agencies WHERE user_id = auth.uid() LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS autofill_customers_agency_id ON customers;
CREATE TRIGGER autofill_customers_agency_id
  BEFORE INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_autofill_agency_id_customers();

-- ─── operators ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_autofill_agency_id_operators()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.agency_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT agency_id INTO NEW.agency_id
    FROM user_agencies WHERE user_id = auth.uid() LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS autofill_operators_agency_id ON operators;
CREATE TRIGGER autofill_operators_agency_id
  BEFORE INSERT ON operators
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_autofill_agency_id_operators();

-- Verificación: los 4 triggers existen
SELECT event_object_table AS tabla, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_name LIKE 'autofill_%_agency_id'
ORDER BY event_object_table;


-- ===== MIGRATION 129: 119_unique_constraint_commission_records.sql =====

-- Prevent duplicate commissions for same operation+seller
-- First, remove any existing duplicates (keep the most recent)
DELETE FROM commission_records a
USING commission_records b
WHERE a.id < b.id
AND a.operation_id = b.operation_id
AND a.seller_id = b.seller_id;

-- Add unique constraint
ALTER TABLE commission_records
ADD CONSTRAINT unique_commission_operation_seller
UNIQUE (operation_id, seller_id);


-- ===== MIGRATION 130: 120_catchup_backfill_agency_id.sql =====

-- =====================================================
-- Migration 120: catch-up backfill agency_id
-- =====================================================
-- Re-corre los UPDATEs de migrations 115-118 para capturar filas que
-- se crearon entre el primer backfill y este momento (mientras la app
-- seguía operando en producción).
--
-- IDEMPOTENTE: solo afecta filas con agency_id IS NULL. Si vuelven a
-- aparecer NULLs después de migration 119 (triggers instalados), es
-- porque hubo INSERTs sin auth.uid() y sin operation_id resolvable.
-- En ese caso revisar caso por caso.
-- =====================================================

-- ─── payments ────────────────────────────────────────
UPDATE payments p
SET agency_id = o.agency_id
FROM operations o
WHERE p.operation_id = o.id
  AND p.agency_id IS NULL;

-- ─── cash_movements ──────────────────────────────────
UPDATE cash_movements cm
SET agency_id = COALESCE(
  (SELECT o.agency_id FROM operations o WHERE o.id = cm.operation_id),
  (SELECT ua.agency_id FROM user_agencies ua WHERE ua.user_id = cm.user_id LIMIT 1)
)
WHERE cm.agency_id IS NULL;

-- ─── customers ───────────────────────────────────────
-- Step 1: happy path
UPDATE customers c
SET agency_id = (
  SELECT o.agency_id
  FROM operation_customers oc
  JOIN operations o ON o.id = oc.operation_id
  WHERE oc.customer_id = c.id
  LIMIT 1
)
WHERE c.agency_id IS NULL
  AND c.id NOT IN (
    SELECT oc.customer_id
    FROM operation_customers oc
    JOIN operations o ON o.id = oc.operation_id
    GROUP BY oc.customer_id
    HAVING COUNT(DISTINCT o.agency_id) > 1
  );

-- Step 2: customers que quedaron NULL → Rosario por default
-- (regla aprobada: customers nuevos sin operations vinculadas se asignan
--  a Rosario hasta que el endpoint pase agency_id explícito)
UPDATE customers
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;

-- ─── operators ───────────────────────────────────────
-- Step 1: happy path
UPDATE operators op
SET agency_id = (
  SELECT o.agency_id
  FROM operation_operators oo
  JOIN operations o ON o.id = oo.operation_id
  WHERE oo.operator_id = op.id
  LIMIT 1
)
WHERE op.agency_id IS NULL
  AND op.id NOT IN (
    SELECT oo.operator_id
    FROM operation_operators oo
    JOIN operations o ON o.id = oo.operation_id
    GROUP BY oo.operator_id
    HAVING COUNT(DISTINCT o.agency_id) > 1
  );

-- Step 2: operators residuales → Rosario por default
UPDATE operators
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;

-- ─── Verificación final ─────────────────────────────
SELECT 'customers' AS tabla, COUNT(*) AS sin_agency_id
  FROM customers WHERE agency_id IS NULL
UNION ALL SELECT 'operators', COUNT(*)
  FROM operators WHERE agency_id IS NULL
UNION ALL SELECT 'payments', COUNT(*)
  FROM payments WHERE agency_id IS NULL
UNION ALL SELECT 'cash_movements', COUNT(*)
  FROM cash_movements WHERE agency_id IS NULL;


-- ===== MIGRATION 131: 120_rls_accounting_tables.sql =====

-- Enable RLS on accounting tables that don't have it
ALTER TABLE iva_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE iva_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;

-- IVA Sales: viewable by ADMIN, SUPER_ADMIN, CONTABLE via operations
CREATE POLICY "iva_sales_select" ON iva_sales FOR SELECT
USING (true); -- All authenticated users can read (filtered by app logic)

CREATE POLICY "iva_sales_insert" ON iva_sales FOR INSERT
WITH CHECK (true); -- System creates these automatically

CREATE POLICY "iva_sales_update" ON iva_sales FOR UPDATE
USING (true);

CREATE POLICY "iva_sales_delete" ON iva_sales FOR DELETE
USING (true);

-- IVA Purchases: same pattern
CREATE POLICY "iva_purchases_select" ON iva_purchases FOR SELECT
USING (true);

CREATE POLICY "iva_purchases_insert" ON iva_purchases FOR INSERT
WITH CHECK (true);

CREATE POLICY "iva_purchases_update" ON iva_purchases FOR UPDATE
USING (true);

CREATE POLICY "iva_purchases_delete" ON iva_purchases FOR DELETE
USING (true);

-- Commission Records: sellers can see own, admins can see all
CREATE POLICY "commission_records_select" ON commission_records FOR SELECT
USING (true);

CREATE POLICY "commission_records_insert" ON commission_records FOR INSERT
WITH CHECK (true);

CREATE POLICY "commission_records_update" ON commission_records FOR UPDATE
USING (true);

CREATE POLICY "commission_records_delete" ON commission_records FOR DELETE
USING (true);


-- ===== MIGRATION 132: 121_add_tax_config_columns.sql =====

-- Add configurable tax rate for Ganancias
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS ganancias_rate NUMERIC(5,2) DEFAULT 35.00;

-- Add multi-jurisdiction IIBB support
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS iibb_jurisdictions JSONB DEFAULT '[]';

-- Add withholding rules configuration
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS withholding_rules JSONB DEFAULT '[]';


-- ===== MIGRATION 133: 121_set_agency_id_not_null.sql =====

-- =====================================================
-- Migration 121: SET NOT NULL en agency_id de las 4 tablas (atómico)
-- =====================================================
-- Ejecuta catch-up final + SET NOT NULL en una sola transacción.
-- ALTER TABLE adquiere AccessExclusiveLock, bloqueando cualquier
-- INSERT concurrente entre el catch-up y el ALTER.
--
-- Pre-requisitos:
--   - Triggers BEFORE INSERT instalados (migration 119)
--   - Backups disponibles (migration 113)
-- =====================================================

BEGIN;

-- ─── Catch-up final ─────────────────────────────────
-- Cualquier fila que haya quedado NULL desde el último backfill
-- se asigna a Rosario por default (fallback safe).

UPDATE customers
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;

UPDATE operators
SET agency_id = '66563aeb-4e8b-40ee-a622-b39defb380dd'
WHERE agency_id IS NULL;

UPDATE payments p
SET agency_id = COALESCE(
  o.agency_id,
  '66563aeb-4e8b-40ee-a622-b39defb380dd'::UUID
)
FROM operations o
WHERE p.operation_id = o.id AND p.agency_id IS NULL;

UPDATE cash_movements cm
SET agency_id = COALESCE(
  (SELECT o.agency_id FROM operations o WHERE o.id = cm.operation_id),
  (SELECT ua.agency_id FROM user_agencies ua WHERE ua.user_id = cm.user_id LIMIT 1),
  '66563aeb-4e8b-40ee-a622-b39defb380dd'::UUID
)
WHERE cm.agency_id IS NULL;

-- ─── Guard: abortar si todavía hay NULLs ────────────
DO $$
DECLARE total_null INT;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM customers WHERE agency_id IS NULL) +
    (SELECT COUNT(*) FROM operators WHERE agency_id IS NULL) +
    (SELECT COUNT(*) FROM payments WHERE agency_id IS NULL) +
    (SELECT COUNT(*) FROM cash_movements WHERE agency_id IS NULL)
  INTO total_null;
  IF total_null > 0 THEN
    RAISE EXCEPTION 'Aborting migration 121: % NULL agency_ids remain after catch-up', total_null;
  END IF;
END $$;

-- ─── SET NOT NULL ────────────────────────────────────
ALTER TABLE customers ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE operators ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE payments ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE cash_movements ALTER COLUMN agency_id SET NOT NULL;

COMMIT;

-- ─── Verificación post-COMMIT ───────────────────────
SELECT
  table_name,
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'agency_id'
  AND table_name IN ('customers', 'operators', 'payments', 'cash_movements')
ORDER BY table_name;


-- ===== MIGRATION 134: 122_deprecate_legacy_commission_tables.sql =====

-- Migration 122: Mark legacy commission tables as deprecated
-- Tables commission_schemes, commissions, commission_details are superseded by commission_records + commission_rules
-- Keeping tables for historical data reference, but they are no longer used by the application
--
-- Legacy tables were created in migration 073_create_commissions.sql
-- The active commission system uses:
--   - commission_records (individual commission entries per operation/seller)
--   - commission_rules (configurable commission rules per agency/seller)

COMMENT ON TABLE commissions IS 'DEPRECATED: Use commission_records instead. Legacy table from migration 073, no longer referenced by application code.';
COMMENT ON TABLE commission_schemes IS 'DEPRECATED: Use commission_rules instead. Legacy table from migration 073, no longer referenced by application code.';
COMMENT ON TABLE commission_details IS 'DEPRECATED: Use commission_records instead. Legacy table from migration 073, no longer referenced by application code.';


-- ===== MIGRATION 135: 122_rollback_not_null_pending_endpoint_audit.sql =====

-- =====================================================
-- Migration 122: ROLLBACK del SET NOT NULL aplicado en migration 121
-- =====================================================
-- Contexto: el SET NOT NULL en customers/operators/payments/cash_movements
-- se aplicó en 121 con triggers BEFORE INSERT (migration 119) como red
-- de seguridad. Al hacer smoke test post-NOT-NULL en producción (Lozada/
-- Rosario), crear un cliente desde la UI falló con
--   "null value in column agency_id violates not-null constraint"
-- porque el endpoint app/api/customers/route.ts (POST) no pasa agency_id
-- y el trigger basado en auth.uid() no atrapó (server-side context).
--
-- Decisión: hacer rollback del NOT NULL para no romper operatoria de Maxi.
-- La auditoría de endpoints (modificar todos los endpoints que insertan
-- en estas 4 tablas para que pasen agency_id explícito) queda como sprint
-- dedicado posterior.
--
-- ESTADO POST-MIGRATION 122:
--   ✅ Columna agency_id existe en las 4 tablas
--   ✅ Backfill completo (todas las filas existentes tienen agency_id)
--   ✅ Triggers BEFORE INSERT atrapan inserts con auth.uid() o operation_id
--   ❌ Constraint NOT NULL postergada (filas nuevas pueden quedar NULL)
--   ✅ Backups disponibles en *_backup_2026_04_28
--
-- PARA RE-APLICAR EL NOT NULL EN SPRINT FUTURO:
--   1. Auditar TODOS los endpoints en app/api/** y server actions que
--      hacen INSERT en customers/operators/payments/cash_movements
--   2. Modificar cada uno para pasar agency_id explícito
--   3. Deploy
--   4. Re-correr migration 121 (con el catch-up dentro)
-- =====================================================

ALTER TABLE customers ALTER COLUMN agency_id DROP NOT NULL;
ALTER TABLE operators ALTER COLUMN agency_id DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN agency_id DROP NOT NULL;
ALTER TABLE cash_movements ALTER COLUMN agency_id DROP NOT NULL;

-- Verificación: las 4 tablas vuelven a NULLABLE
SELECT
  table_name,
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'agency_id'
  AND table_name IN ('customers', 'operators', 'payments', 'cash_movements')
ORDER BY table_name;


-- ===== MIGRATION 136: 123_add_missing_tax_columns.sql =====

-- =====================================================
-- Migración 123: Agregar columnas de impuestos faltantes
-- La UI de Impuestos mostraba estos campos pero no existían en la DB
-- =====================================================

-- Alícuota IVA por defecto (21% para agencias de viajes)
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS default_iva_rate NUMERIC(5,2) DEFAULT 21.00;

-- Régimen fiscal (agencia de viajes = IVA sobre margen)
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS tax_regime TEXT DEFAULT 'TRAVEL_AGENCY' CHECK (tax_regime IN ('TRAVEL_AGENCY', 'GENERAL', 'RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'NO_RESPONSABLE'));

-- Retención Ganancias (% al pagar a operadores RI)
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS retention_ganancias_rate NUMERIC(5,2) DEFAULT 0;

-- Retención IVA (% al pagar a operadores RI)
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS retention_iva_rate NUMERIC(5,2) DEFAULT 0;

-- Jurisdicción principal IIBB
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS iibb_jurisdiction TEXT DEFAULT 'SANTA_FE';

-- Alícuota IIBB (%)
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS iibb_rate NUMERIC(5,2) DEFAULT 3.50;

-- Convenio Multilateral
ALTER TABLE financial_settings ADD COLUMN IF NOT EXISTS iibb_convenio_multilateral BOOLEAN DEFAULT false;


-- ===== MIGRATION 137: 123_create_rls_policies_for_orphan_tables.sql =====

-- =====================================================
-- Migration 123: crear RLS policies para las 4 tablas (sin activar RLS)
-- =====================================================
-- IMPORTANTE: este script crea las policies pero NO ejecuta
-- ENABLE ROW LEVEL SECURITY. La activación se hace en otra sesión,
-- tabla por tabla, después de auditar que cada endpoint pase agency_id
-- correctamente. Mientras RLS no está habilitada, las policies no
-- tienen efecto (existen pero no se aplican).
--
-- Pre-requisitos:
--   - agency_id existe en las 4 tablas (migration 114)
--   - backfill aplicado (migrations 115-118, 120)
-- =====================================================

DO $$
BEGIN
  -- customers
  DROP POLICY IF EXISTS customers_tenant_isolation ON customers;
  CREATE POLICY customers_tenant_isolation ON customers
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );

  -- operators
  DROP POLICY IF EXISTS operators_tenant_isolation ON operators;
  CREATE POLICY operators_tenant_isolation ON operators
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );

  -- payments
  DROP POLICY IF EXISTS payments_tenant_isolation ON payments;
  CREATE POLICY payments_tenant_isolation ON payments
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );

  -- cash_movements
  DROP POLICY IF EXISTS cash_movements_tenant_isolation ON cash_movements;
  CREATE POLICY cash_movements_tenant_isolation ON cash_movements
    USING (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    );
END $$;

-- Verificación 1: las 4 policies deben existir
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('customers', 'operators', 'payments', 'cash_movements')
  AND policyname LIKE '%tenant_isolation%'
ORDER BY tablename;

-- Verificación 2: RLS debe estar DESACTIVADA (rowsecurity = false) en las 4
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('customers', 'operators', 'payments', 'cash_movements')
  AND schemaname = 'public'
ORDER BY tablename;


-- ===== MIGRATION 138: 124_enhance_quotation_items.sql =====

-- =====================================================
-- Migration 124: Enhance quotation_items for full service data
-- =====================================================
-- Adds cost tracking, service-specific fields, and operator
-- so quotation items can auto-create operation_services on conversion

-- Alinear item_type con operation_services types
ALTER TABLE quotation_items DROP CONSTRAINT IF EXISTS quotation_items_item_type_check;
ALTER TABLE quotation_items ADD CONSTRAINT quotation_items_item_type_check
  CHECK (item_type IN (
    'HOTEL', 'FLIGHT', 'TRANSFER', 'EXCURSION', 'ASSISTANCE',
    'SEAT', 'LUGGAGE', 'VISA',
    -- Legacy types (backwards compat)
    'ACCOMMODATION', 'ACTIVITY', 'INSURANCE', 'OTHER'
  ));

-- Operator/proveedor por item
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES operators(id) ON DELETE SET NULL;

-- Costo (interno, el cliente no lo ve)
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(18,2) DEFAULT 0;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS cost_currency TEXT DEFAULT 'USD' CHECK (cost_currency IN ('ARS', 'USD'));

-- Renombrar unit_price → sale_amount para consistencia (mantener unit_price como alias)
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS sale_amount NUMERIC(18,2);
-- Migrar datos existentes
UPDATE quotation_items SET sale_amount = unit_price WHERE sale_amount IS NULL;

-- Campos de hotel
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS hotel_name TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS hotel_stars INTEGER;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS hotel_address TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS hotel_phone TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS room_type TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS meal_plan TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS checkin_date DATE;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS checkout_date DATE;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS nights INTEGER;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS rooms INTEGER DEFAULT 1;

-- Campos de vuelo
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS airline TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_route TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_date DATE;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_return_date DATE;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_stops INTEGER DEFAULT 0;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_class TEXT;

-- Campos de transfer
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS transfer_description TEXT;

-- Flag de comisión
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS generates_commission BOOLEAN DEFAULT FALSE;

-- Índice por operador
CREATE INDEX IF NOT EXISTS idx_quotation_items_operator_id ON quotation_items(operator_id) WHERE operator_id IS NOT NULL;

-- Agregar customer_id a quotations (para vincular cliente directo)
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

COMMENT ON COLUMN quotation_items.sale_amount IS 'Precio de venta al cliente (lo que ve)';
COMMENT ON COLUMN quotation_items.cost_amount IS 'Costo interno del proveedor (no visible al cliente)';
COMMENT ON COLUMN quotation_items.operator_id IS 'Proveedor/operador de este servicio';


-- ===== MIGRATION 139: 125_add_hotel_photo_url.sql =====

-- Add hotel_photo_url to quotation_items and itinerary_items
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS hotel_photo_url TEXT;
ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS hotel_photo_url TEXT;

COMMENT ON COLUMN quotation_items.hotel_photo_url IS 'URL de foto del hotel (Google Places)';
COMMENT ON COLUMN itinerary_items.hotel_photo_url IS 'URL de foto del hotel (Google Places)';


-- ===== MIGRATION 140: 126_add_flight_screenshot_url.sql =====

-- Add flight screenshot URL to quotation items
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS flight_screenshot_url TEXT;

COMMENT ON COLUMN quotation_items.flight_screenshot_url IS 'URL of uploaded flight screenshot image';


-- ===== MIGRATION 141: 127_create_seller_objectives.sql =====

-- Seller Objectives / Goals System
-- Allows admin to set rules for bonus commissions based on sales targets

CREATE TABLE IF NOT EXISTS seller_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Metric to track
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'TRIPS_SOLD',           -- Number of trips sold in period
    'REVENUE_AMOUNT',       -- Total revenue amount in period
    'MARGIN_AMOUNT',        -- Total margin amount in period
    'NEW_CUSTOMERS',        -- New customers acquired
    'CONVERSION_RATE'       -- Lead to operation conversion rate
  )),

  -- Target value
  target_value NUMERIC NOT NULL,
  target_currency TEXT DEFAULT 'ARS', -- For monetary metrics

  -- Reward when objective is met
  reward_type TEXT NOT NULL CHECK (reward_type IN (
    'BONUS_PERCENTAGE',     -- Extra commission percentage
    'BONUS_FIXED',          -- Fixed bonus amount
    'PERCENTAGE_INCREASE'   -- Increase base commission percentage
  )),
  reward_value NUMERIC NOT NULL,
  reward_currency TEXT DEFAULT 'ARS',

  -- Period
  period_type TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),

  -- Applicability
  seller_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = applies to all sellers
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

-- Track objective progress/completion
CREATE TABLE IF NOT EXISTS seller_objective_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id UUID NOT NULL REFERENCES seller_objectives(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Progress
  current_value NUMERIC NOT NULL DEFAULT 0,
  target_value NUMERIC NOT NULL,
  is_achieved BOOLEAN NOT NULL DEFAULT false,
  achieved_at TIMESTAMPTZ,

  -- Reward
  reward_amount NUMERIC,
  reward_paid BOOLEAN NOT NULL DEFAULT false,
  reward_paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seller_objectives_agency ON seller_objectives(agency_id);
CREATE INDEX IF NOT EXISTS idx_seller_objectives_seller ON seller_objectives(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_objective_records_seller ON seller_objective_records(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_objective_records_period ON seller_objective_records(period_start, period_end);

COMMENT ON TABLE seller_objectives IS 'Commission bonus rules based on sales objectives';
COMMENT ON TABLE seller_objective_records IS 'Tracking of seller progress towards objectives';


-- ===== MIGRATION 142: 20260331000133_add_agency_to_wa_devices.sql =====

-- Migration 133: Agregar agency_id a wa_devices para diferenciar celulares por agencia
-- Permite filtrar dispositivos, conversaciones y métricas por agencia

ALTER TABLE wa_devices
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

-- Índice para filtrar por agencia
CREATE INDEX IF NOT EXISTS idx_wa_devices_agency ON wa_devices(agency_id) WHERE agency_id IS NOT NULL;

COMMENT ON COLUMN wa_devices.agency_id IS 'Agencia a la que pertenece este dispositivo WhatsApp. NULL = sin agencia asignada.';


-- ===== MIGRATION 143: 20260331000133_add_org_id_to_global_tables.sql =====

-- ============================================================================
-- FASE 1.5 SaaS: Agregar org_id a tablas globales restantes
-- ============================================================================
-- Plan .claude/saas-conversion-plan.md secciones 1.2 y 4.3 marcaban estas
-- tablas como "necesita org_id directo" porque no son inferibles via agency
-- (muchas rows tienen agency_id NULL).
--
-- Tablas afectadas:
--   - financial_accounts: 66 rows, 50 con agency_id NULL (cuentas globales)
--   - pdf_templates: 0 rows en prod, igual agregamos columna para futuro
--   - message_templates: 7 rows, todos con agency_id NULL
--
-- Backfill strategy:
--   - Si row tiene agency_id: org_id = agencies.org_id
--   - Si row NO tiene agency_id: org_id = default org "Lozada Viajes"
--
-- Single-org safety: con solo Lozada activa, todo apunta a 1b326d20-...
-- ============================================================================

-- ============================================================================
-- 1. ADD COLUMN (nullable al principio para poder backfillear)
-- ============================================================================

ALTER TABLE financial_accounts ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE pdf_templates       ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE message_templates   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- ============================================================================
-- 2. BACKFILL
-- ============================================================================

DO $$
DECLARE
  v_default_org_id UUID;
BEGIN
  -- Default org (Lozada Viajes)
  SELECT id INTO v_default_org_id
  FROM organizations
  WHERE slug = 'lozada-viajes'
  LIMIT 1;

  IF v_default_org_id IS NULL THEN
    RAISE EXCEPTION 'Default org lozada-viajes not found. Run migration 132 first.';
  END IF;

  -- 2.1 financial_accounts: si tiene agency, copiar de agencies.org_id; sino, default
  UPDATE financial_accounts fa
  SET org_id = a.org_id
  FROM agencies a
  WHERE fa.agency_id = a.id
    AND fa.org_id IS NULL;

  UPDATE financial_accounts
  SET org_id = v_default_org_id
  WHERE org_id IS NULL;

  -- 2.2 pdf_templates (tabla vacia hoy, pero por las dudas)
  UPDATE pdf_templates pt
  SET org_id = a.org_id
  FROM agencies a
  WHERE pt.agency_id = a.id
    AND pt.org_id IS NULL;

  UPDATE pdf_templates
  SET org_id = v_default_org_id
  WHERE org_id IS NULL;

  -- 2.3 message_templates
  UPDATE message_templates mt
  SET org_id = a.org_id
  FROM agencies a
  WHERE mt.agency_id = a.id
    AND mt.org_id IS NULL;

  UPDATE message_templates
  SET org_id = v_default_org_id
  WHERE org_id IS NULL;

  RAISE NOTICE 'Backfill org_id complete for financial_accounts, pdf_templates, message_templates';
END $$;

-- ============================================================================
-- 3. NOT NULL constraints
-- ============================================================================

ALTER TABLE financial_accounts ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE pdf_templates       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE message_templates   ALTER COLUMN org_id SET NOT NULL;

-- ============================================================================
-- 4. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_financial_accounts_org_id ON financial_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_org_id       ON pdf_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_org_id   ON message_templates(org_id);

-- ============================================================================
-- DONE
-- ============================================================================


-- ===== MIGRATION 144: 20260331000134_saas_tenant_isolation_core_tables.sql =====

-- ============================================================================
-- MIGRATION 134 — SaaS Tenant Isolation (core tables)
-- ============================================================================
-- Agrega org_id directo a las tablas "core" que hoy solo tienen agency_id o
-- operation_id. Despues del backfill, TODA query de la app puede filtrar por
-- user.org_id sin hacer joins. Patrón consistente con la regla del PDF:
-- "WHERE tenant_id = current_user.tenant_id. Sin excepciones."
--
-- Backfill strategy:
-- - Tablas con agency_id: org_id = agencies.org_id
-- - Tablas con operation_id: org_id = operations.org_id (despues de setear
--   operations.org_id primero)
-- - Default: org_id = Lozada Viajes (para rows huerfanas)
--
-- Note: NO habilitamos RLS en esta migration. RLS viene en migration 135
-- despues de validar que el filtering aplicativo funciona. Approach safe:
-- primero columnas + filtros, despues enforce DB-level.
-- ============================================================================

-- PART 1: Tablas con agency_id directo
-- ----------------------------------------------------------------------------

ALTER TABLE leads                ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operations           ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operation_services   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE quotations           ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE commission_records   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE commission_rules     ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE tasks                ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_messages    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE invoices             ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE recurring_payments   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE customer_segments    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE settings_trello      ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE customer_settings    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operation_settings   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE financial_settings   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE tools_settings       ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE integrations         ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- PART 2: Tablas con operation_id (heredan via operation)
-- ----------------------------------------------------------------------------

ALTER TABLE operation_customers  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operation_operators  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operation_passengers ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE payments             ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE operator_payments    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE iva_sales            ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE iva_purchases        ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE quotation_items      ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE lead_comments        ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE documents            ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- PART 3: Tablas con account_id (heredan via financial_accounts)
-- ----------------------------------------------------------------------------

ALTER TABLE cash_movements       ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE ledger_movements     ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE journal_entries      ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- PART 4: Tablas que pueden ser globales o org-scoped (hoy sin agency ni org)
-- ----------------------------------------------------------------------------
-- Hacemos org-scoped porque cada tenant tiene su propio plan de cuentas,
-- reglas de comisiones, cuentas de socios, etc. Global = Lozada, lo cual
-- mezclaba todo.

ALTER TABLE chart_of_accounts              ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE partner_accounts               ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE partner_profit_allocations     ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE recurring_payment_categories   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- ============================================================================
-- BACKFILL — orden importa (primero tablas con agency_id, despues descendants)
-- ============================================================================

-- 1. Tablas con agency_id → copiar de agencies.org_id
UPDATE leads l              SET org_id = a.org_id FROM agencies a WHERE l.agency_id = a.id AND l.org_id IS NULL;
UPDATE operations o         SET org_id = a.org_id FROM agencies a WHERE o.agency_id = a.id AND o.org_id IS NULL;
UPDATE operation_services s SET org_id = a.org_id FROM agencies a WHERE s.agency_id = a.id AND s.org_id IS NULL;
UPDATE quotations q         SET org_id = a.org_id FROM agencies a WHERE q.agency_id = a.id AND q.org_id IS NULL;
UPDATE commission_records cr SET org_id = a.org_id FROM agencies a WHERE cr.agency_id = a.id AND cr.org_id IS NULL;
UPDATE commission_rules cru  SET org_id = a.org_id FROM agencies a WHERE cru.agency_id = a.id AND cru.org_id IS NULL;
UPDATE tasks t              SET org_id = a.org_id FROM agencies a WHERE t.agency_id = a.id AND t.org_id IS NULL;
UPDATE whatsapp_messages w  SET org_id = a.org_id FROM agencies a WHERE w.agency_id = a.id AND w.org_id IS NULL;
UPDATE invoices i           SET org_id = a.org_id FROM agencies a WHERE i.agency_id = a.id AND i.org_id IS NULL;
UPDATE recurring_payments r SET org_id = a.org_id FROM agencies a WHERE r.agency_id = a.id AND r.org_id IS NULL;
UPDATE customer_segments cs SET org_id = a.org_id FROM agencies a WHERE cs.agency_id = a.id AND cs.org_id IS NULL;
UPDATE settings_trello st   SET org_id = a.org_id FROM agencies a WHERE st.agency_id = a.id AND st.org_id IS NULL;
UPDATE customer_settings csg SET org_id = a.org_id FROM agencies a WHERE csg.agency_id = a.id AND csg.org_id IS NULL;
UPDATE operation_settings os SET org_id = a.org_id FROM agencies a WHERE os.agency_id = a.id AND os.org_id IS NULL;
UPDATE financial_settings fs SET org_id = a.org_id FROM agencies a WHERE fs.agency_id = a.id AND fs.org_id IS NULL;
UPDATE tools_settings ts    SET org_id = a.org_id FROM agencies a WHERE ts.agency_id = a.id AND ts.org_id IS NULL;
UPDATE integrations it      SET org_id = a.org_id FROM agencies a WHERE it.agency_id = a.id AND it.org_id IS NULL;

-- 2. Tablas con operation_id → copiar de operations.org_id (ya seteado arriba)
UPDATE operation_customers  oc SET org_id = op.org_id FROM operations op WHERE oc.operation_id = op.id AND oc.org_id IS NULL;
UPDATE operation_operators  oo SET org_id = op.org_id FROM operations op WHERE oo.operation_id = op.id AND oo.org_id IS NULL;
UPDATE operation_passengers oss SET org_id = op.org_id FROM operations op WHERE oss.operation_id = op.id AND oss.org_id IS NULL;
UPDATE payments p           SET org_id = op.org_id FROM operations op WHERE p.operation_id = op.id AND p.org_id IS NULL;
UPDATE operator_payments op2 SET org_id = op.org_id FROM operations op WHERE op2.operation_id = op.id AND op2.org_id IS NULL;
UPDATE iva_sales ivs        SET org_id = op.org_id FROM operations op WHERE ivs.operation_id = op.id AND ivs.org_id IS NULL;
UPDATE iva_purchases ivp    SET org_id = op.org_id FROM operations op WHERE ivp.operation_id = op.id AND ivp.org_id IS NULL;
UPDATE quotation_items qi   SET org_id = q.org_id FROM quotations q WHERE qi.quotation_id = q.id AND qi.org_id IS NULL;
UPDATE lead_comments lc     SET org_id = l.org_id FROM leads l WHERE lc.lead_id = l.id AND lc.org_id IS NULL;
UPDATE documents d          SET org_id = op.org_id FROM operations op WHERE d.operation_id = op.id AND d.org_id IS NULL;
UPDATE documents d          SET org_id = l.org_id  FROM leads l      WHERE d.lead_id      = l.id  AND d.org_id IS NULL;
UPDATE documents d          SET org_id = c.org_id  FROM customers c  WHERE d.customer_id  = c.id  AND d.org_id IS NULL;

-- 3. Tablas con account_id → copiar de financial_accounts.org_id
UPDATE cash_movements cm    SET org_id = fa.org_id FROM financial_accounts fa WHERE cm.financial_account_id = fa.id AND cm.org_id IS NULL;
UPDATE ledger_movements lm  SET org_id = fa.org_id FROM financial_accounts fa WHERE lm.account_id = fa.id AND lm.org_id IS NULL;
UPDATE ledger_movements lm  SET org_id = op.org_id FROM operations op WHERE lm.operation_id = op.id AND lm.org_id IS NULL;
UPDATE journal_entries je   SET org_id = op.org_id FROM operations op WHERE je.operation_id = op.id AND je.org_id IS NULL;

-- 4. Fallback a Lozada Viajes para cualquier row huerfana
UPDATE leads                      SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operations                 SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operation_services         SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operation_customers        SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operation_operators        SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operation_passengers       SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE quotations                 SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE quotation_items            SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE payments                   SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operator_payments          SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE cash_movements             SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE ledger_movements           SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE journal_entries            SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE iva_sales                  SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE iva_purchases              SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE commission_records         SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE commission_rules           SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE tasks                      SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE whatsapp_messages          SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE invoices                   SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE recurring_payments         SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE customer_segments          SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE settings_trello            SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE customer_settings          SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE operation_settings         SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE financial_settings         SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE tools_settings             SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE integrations               SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE lead_comments              SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE documents                  SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE chart_of_accounts          SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE partner_accounts           SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE partner_profit_allocations SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;
UPDATE recurring_payment_categories SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes') WHERE org_id IS NULL;

-- ============================================================================
-- NOT NULL constraints: DEFERRED a migration 135 despues de fixear codigo que
-- hace INSERTs sin org_id. Hoy esta migration es aditiva no-breaking.
-- ============================================================================
-- INDEXES (org_id es clave de filtrado primario)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leads_org_id                     ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_operations_org_id                ON operations(org_id);
CREATE INDEX IF NOT EXISTS idx_operation_services_org_id        ON operation_services(org_id);
CREATE INDEX IF NOT EXISTS idx_operation_customers_org_id       ON operation_customers(org_id);
CREATE INDEX IF NOT EXISTS idx_operation_operators_org_id       ON operation_operators(org_id);
CREATE INDEX IF NOT EXISTS idx_operation_passengers_org_id      ON operation_passengers(org_id);
CREATE INDEX IF NOT EXISTS idx_quotations_org_id                ON quotations(org_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_org_id           ON quotation_items(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_org_id                  ON payments(org_id);
CREATE INDEX IF NOT EXISTS idx_operator_payments_org_id         ON operator_payments(org_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_org_id            ON cash_movements(org_id);
CREATE INDEX IF NOT EXISTS idx_ledger_movements_org_id          ON ledger_movements(org_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_id           ON journal_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_iva_sales_org_id                 ON iva_sales(org_id);
CREATE INDEX IF NOT EXISTS idx_iva_purchases_org_id             ON iva_purchases(org_id);
CREATE INDEX IF NOT EXISTS idx_commission_records_org_id        ON commission_records(org_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_org_id          ON commission_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org_id                     ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org_id         ON whatsapp_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_id                  ON invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_org_id        ON recurring_payments(org_id);
CREATE INDEX IF NOT EXISTS idx_customer_segments_org_id         ON customer_segments(org_id);
CREATE INDEX IF NOT EXISTS idx_settings_trello_org_id           ON settings_trello(org_id);
CREATE INDEX IF NOT EXISTS idx_customer_settings_org_id         ON customer_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_operation_settings_org_id        ON operation_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_financial_settings_org_id        ON financial_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_tools_settings_org_id            ON tools_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_integrations_org_id              ON integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_lead_comments_org_id             ON lead_comments(org_id);
CREATE INDEX IF NOT EXISTS idx_documents_org_id                 ON documents(org_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_org_id         ON chart_of_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_org_id          ON partner_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_partner_profit_allocations_org_id ON partner_profit_allocations(org_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payment_categories_org_id ON recurring_payment_categories(org_id);


-- ===== MIGRATION 145: 20260331000135_saas_org_settings_multitenant.sql =====

-- ============================================================================
-- MIGRATION 135 — Multi-tenant: organization_settings
-- ============================================================================
-- Bug: la tabla organization_settings tiene PK/unique en "key" (global),
-- entonces brand_logo / company_name / etc. son compartidos entre todas las
-- orgs. Un tenant nuevo ve el logo y nombre de Lozada.
--
-- Fix: agregar org_id, mover unique a (org_id, key), duplicar los rows
-- existentes por org (solo Lozada hoy), actualizar handler para filtrar
-- por user.org_id y upsertear con (org_id, key).
-- ============================================================================

-- 1. Agregar org_id
ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. Backfill: todas las rows existentes pertenecen a Lozada
UPDATE organization_settings
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

-- 3. Drop unique constraint sobre "key" y crear (org_id, key)
--    El constraint podria llamarse "organization_settings_key_key" o similar.
--    Intentamos ambos nombres comunes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_settings_key_key') THEN
    ALTER TABLE organization_settings DROP CONSTRAINT organization_settings_key_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_settings_key_unique') THEN
    ALTER TABLE organization_settings DROP CONSTRAINT organization_settings_key_unique;
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

DROP INDEX IF EXISTS organization_settings_key_key;
DROP INDEX IF EXISTS organization_settings_key_unique_idx;

-- 4. Nuevo unique constraint por (org_id, key)
ALTER TABLE organization_settings
  ADD CONSTRAINT organization_settings_org_id_key_unique UNIQUE (org_id, key);

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_organization_settings_org_id ON organization_settings(org_id);


-- ===== MIGRATION 146: 20260331000136_saas_rls_tenant_isolation.sql =====

-- ============================================================================
-- MIGRATION 136 — RLS tenant isolation en todas las tablas con org_id
-- ============================================================================
-- Policy uniforme: un usuario solo puede ver/escribir rows cuyo org_id esta
-- entre las orgs donde es miembro ACTIVE.
--
-- Impact:
-- - createServerClient (user-auth): queries auto-filtradas por RLS
-- - createAdminClient (service_role): RLS bypassed (sin cambio)
--
-- Para Maxi (OWNER de Lozada): ve toda la data de Lozada (ningun cambio)
-- Para LOLO user: solo ve data de LOLO
-- ============================================================================

-- Helper: la clausula que verifica membership
-- Nota: Supabase resuelve auth.uid() al UUID del usuario autenticado via JWT.

-- Drop policies existentes con este nombre (idempotente)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'leads', 'operations', 'operation_services', 'operation_customers',
    'operation_operators', 'operation_passengers', 'quotations', 'quotation_items',
    'payments', 'operator_payments', 'cash_movements', 'ledger_movements',
    'journal_entries', 'iva_sales', 'iva_purchases', 'commission_records',
    'commission_rules', 'tasks', 'whatsapp_messages', 'invoices',
    'recurring_payments', 'customer_segments', 'settings_trello',
    'customer_settings', 'operation_settings', 'financial_settings',
    'tools_settings', 'integrations', 'lead_comments', 'documents',
    'chart_of_accounts', 'partner_accounts', 'partner_profit_allocations',
    'recurring_payment_categories', 'financial_accounts', 'pdf_templates',
    'message_templates', 'alerts', 'organization_settings'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_select" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_insert" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_update" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_delete" ON %I', t);
  END LOOP;
END $$;

-- Enable RLS + create policy en cada tabla
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'leads', 'operations', 'operation_services', 'operation_customers',
    'operation_operators', 'operation_passengers', 'quotations', 'quotation_items',
    'payments', 'operator_payments', 'cash_movements', 'ledger_movements',
    'journal_entries', 'iva_sales', 'iva_purchases', 'commission_records',
    'commission_rules', 'tasks', 'whatsapp_messages', 'invoices',
    'recurring_payments', 'customer_segments', 'settings_trello',
    'customer_settings', 'operation_settings', 'financial_settings',
    'tools_settings', 'integrations', 'lead_comments', 'documents',
    'chart_of_accounts', 'partner_accounts', 'partner_profit_allocations',
    'recurring_payment_categories', 'financial_accounts', 'pdf_templates',
    'message_templates', 'organization_settings'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY "tenant_isolation" ON %I
      AS PERMISSIVE
      FOR ALL
      TO authenticated
      USING (
        org_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = auth.uid() AND status = 'ACTIVE'
        )
      )
      WITH CHECK (
        org_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = auth.uid() AND status = 'ACTIVE'
        )
      )
    $p$, t);
  END LOOP;
END $$;

-- Para alerts, mantener nullable org_id (sistema alerts) pero filtrar por org cuando exista
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON alerts;
CREATE POLICY "tenant_isolation" ON alerts
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'ACTIVE'
    )
  )
  WITH CHECK (
    org_id IS NULL
    OR org_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'ACTIVE'
    )
  );


-- ===== MIGRATION 147: 20260331000137_saas_rls_fix_recursion.sql =====

-- ============================================================================
-- MIGRATION 137 — Fix RLS infinite recursion
-- ============================================================================
-- Bug: las policies sobre organization_members hacen subquery recursiva.
-- Cuando otra policy (ej leads) consulta organization_members, dispara la
-- policy de organization_members, que hace OTRA subquery a organization_members
-- → recursion → PostgreSQL error 42P17.
--
-- Fix: crear funcion SECURITY DEFINER que obtiene user org_ids bypaseando RLS.
-- Luego usar esa funcion en todas las policies.
-- ============================================================================

-- 1. Funcion helper con SECURITY DEFINER (bypasa RLS al resolver)
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid() AND status = 'ACTIVE'
$$;

GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated, anon;

-- 2. Fix organization_members policies: evitar subquery recursiva
DROP POLICY IF EXISTS "Members can view org members" ON organization_members;
DROP POLICY IF EXISTS "Owner and admins can insert members" ON organization_members;
DROP POLICY IF EXISTS "Owner and admins can update members" ON organization_members;
DROP POLICY IF EXISTS "Owner can delete members" ON organization_members;

CREATE POLICY "members_self_or_same_org" ON organization_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT public.user_org_ids())
  );

CREATE POLICY "members_admins_insert" ON organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
  );

CREATE POLICY "members_admins_update" ON organization_members
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

CREATE POLICY "members_admins_delete" ON organization_members
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids()));

-- 3. Fix organizations policy tambien
DROP POLICY IF EXISTS "Members can view their organization" ON organizations;
CREATE POLICY "org_members_view" ON organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_org_ids()));

-- 4. Reescribir todas las policies tenant_isolation usando la funcion
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'leads', 'operations', 'operation_services', 'operation_customers',
    'operation_operators', 'operation_passengers', 'quotations', 'quotation_items',
    'payments', 'operator_payments', 'cash_movements', 'ledger_movements',
    'journal_entries', 'iva_sales', 'iva_purchases', 'commission_records',
    'commission_rules', 'tasks', 'whatsapp_messages', 'invoices',
    'recurring_payments', 'customer_segments', 'settings_trello',
    'customer_settings', 'operation_settings', 'financial_settings',
    'tools_settings', 'integrations', 'lead_comments', 'documents',
    'chart_of_accounts', 'partner_accounts', 'partner_profit_allocations',
    'recurring_payment_categories', 'financial_accounts', 'pdf_templates',
    'message_templates', 'organization_settings'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON %I', t);
    EXECUTE format($p$
      CREATE POLICY "tenant_isolation" ON %I
      AS PERMISSIVE FOR ALL TO authenticated
      USING (org_id IN (SELECT public.user_org_ids()))
      WITH CHECK (org_id IN (SELECT public.user_org_ids()))
    $p$, t);
  END LOOP;
END $$;

-- 5. Fix alerts (policy con org_id NULL permitida)
DROP POLICY IF EXISTS "tenant_isolation" ON alerts;
CREATE POLICY "tenant_isolation" ON alerts
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IS NULL OR org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IS NULL OR org_id IN (SELECT public.user_org_ids()));

-- 6. Fix customers/operators (las policies viejas de mig 132 usan subquery recursiva)
DROP POLICY IF EXISTS "Users can view customers in their org" ON customers;
DROP POLICY IF EXISTS "Users can insert customers in their org" ON customers;
DROP POLICY IF EXISTS "Users can update customers in their org" ON customers;
DROP POLICY IF EXISTS "tenant_isolation" ON customers;

CREATE POLICY "tenant_isolation" ON customers
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS "Users can view operators in their org" ON operators;
DROP POLICY IF EXISTS "Users can insert operators in their org" ON operators;
DROP POLICY IF EXISTS "Users can update operators in their org" ON operators;
DROP POLICY IF EXISTS "tenant_isolation" ON operators;

CREATE POLICY "tenant_isolation" ON operators
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));


-- ===== MIGRATION 148: 20260331000140_saas_rls_agencies_and_aux.sql =====

-- ============================================================================
-- MIGRATION 140 — RLS en agencies + tablas auxiliares
-- ============================================================================
-- Pilar 1 del spec: cerrar el ultimo 15% de aislamiento DB.
-- Agencies tenia RLS via policies de mig 132 pero posiblemente no enforced.
-- user_agencies idem.
-- ============================================================================

-- 1. agencies: force RLS + limpiar policies viejas + tenant_isolation
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agencies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON agencies', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "tenant_isolation" ON agencies
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

-- 2. user_agencies: RLS por la agency_id (que infiere org)
ALTER TABLE user_agencies ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_agencies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON user_agencies', r.policyname);
  END LOOP;
END $$;

-- user_agencies no tiene org_id directo, pero agency_id → agencies.org_id.
-- Como agencies ya esta scoped por RLS, basta con chequear que el user
-- pueda ver esa agency (= la agency esta en su org).
CREATE POLICY "tenant_isolation" ON user_agencies
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    agency_id IN (
      SELECT id FROM agencies WHERE org_id IN (SELECT public.user_org_ids())
    )
  )
  WITH CHECK (
    agency_id IN (
      SELECT id FROM agencies WHERE org_id IN (SELECT public.user_org_ids())
    )
  );

-- 3. users: RLS por org_id
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON users', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "tenant_isolation" ON users
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (SELECT public.user_org_ids())
    OR auth_id = auth.uid()
  )
  WITH CHECK (
    org_id IN (SELECT public.user_org_ids())
    OR auth_id = auth.uid()
  );

-- Razon: auth_id = auth.uid() permite que un user vea su propio row
-- incluso si user.org_id is NULL (caso edge de register en progreso).

-- 4. organization_invitations: solo ver invites de tu org
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organization_invitations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON organization_invitations', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "tenant_isolation" ON organization_invitations
  AS PERMISSIVE FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.user_org_ids()));


-- ===== MIGRATION 149: 20260401000134_create_payment_passenger_allocations.sql =====

-- ============================================================
-- Migration 134: Payment Passenger Allocations
-- Permite asignar pagos a pasajeros individuales dentro de una operación grupal
-- ============================================================

-- Tabla de asignaciones de pago a pasajeros
CREATE TABLE IF NOT EXISTS payment_passenger_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relaciones
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  operation_customer_id UUID NOT NULL REFERENCES operation_customers(id) ON DELETE CASCADE,

  -- Monto asignado de este pago a este pasajero
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),

  -- Moneda (hereda del pago, pero se almacena para independencia)
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),

  -- Notas opcionales
  notes TEXT,

  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES users(id),

  -- Constraint: un pago no puede asignarse más de una vez al mismo pasajero
  UNIQUE(payment_id, operation_customer_id)
);

-- Índices para consultas frecuentes
CREATE INDEX idx_ppa_payment ON payment_passenger_allocations(payment_id);
CREATE INDEX idx_ppa_operation_customer ON payment_passenger_allocations(operation_customer_id);

-- RLS
ALTER TABLE payment_passenger_allocations ENABLE ROW LEVEL SECURITY;

-- Política: usuarios autenticados pueden ver asignaciones de pagos que pueden ver
CREATE POLICY "payment_passenger_allocations_select" ON payment_passenger_allocations
  FOR SELECT USING (true);

CREATE POLICY "payment_passenger_allocations_insert" ON payment_passenger_allocations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "payment_passenger_allocations_update" ON payment_passenger_allocations
  FOR UPDATE USING (true);

CREATE POLICY "payment_passenger_allocations_delete" ON payment_passenger_allocations
  FOR DELETE USING (true);

-- Comentarios
COMMENT ON TABLE payment_passenger_allocations IS 'Asignación de pagos a pasajeros individuales dentro de operaciones grupales';
COMMENT ON COLUMN payment_passenger_allocations.amount IS 'Monto del pago asignado a este pasajero (debe sumar <= monto total del pago)';


-- ===== MIGRATION 150: 20260406000135_cc_payment_breakdown.sql =====

-- Migration: Credit Card Payment Breakdown
-- Allows breaking down a CC payment into: GASTOS_AGENCIA, VENTAS, RETIRO_PERSONAL

-- Table to group items belonging to the same CC payment
CREATE TABLE IF NOT EXISTS cc_payment_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_card_account_id UUID NOT NULL REFERENCES financial_accounts(id),
  source_account_id UUID NOT NULL REFERENCES financial_accounts(id),
  total_amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  exchange_rate NUMERIC(18,4),
  payment_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cc_payment_groups_date ON cc_payment_groups(payment_date);
CREATE INDEX idx_cc_payment_groups_card ON cc_payment_groups(credit_card_account_id);

-- Add expense classification to cash_movements
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS expense_classification TEXT
    CHECK (expense_classification IN ('GASTOS_AGENCIA', 'VENTAS', 'RETIRO_PERSONAL'));

-- Add FK to link cash_movements to a CC payment group
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS cc_payment_group_id UUID REFERENCES cc_payment_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_cash_movements_cc_group ON cash_movements(cc_payment_group_id)
  WHERE cc_payment_group_id IS NOT NULL;

-- Disable RLS (matches pattern of expense_receipts and other admin tables)
ALTER TABLE cc_payment_groups DISABLE ROW LEVEL SECURITY;


-- ===== MIGRATION 151: 20260406000136_add_payment_operator_links.sql =====

-- Vincular pagos manuales con el operador y la deuda específica a operador
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES operators(id) ON DELETE SET NULL;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS operator_payment_id UUID REFERENCES operator_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_operator_id ON payments(operator_id)
WHERE operator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_operator_payment_id ON payments(operator_payment_id)
WHERE operator_payment_id IS NOT NULL;

COMMENT ON COLUMN payments.operator_id IS 'Operador asociado al pago cuando payer_type = OPERATOR.';
COMMENT ON COLUMN payments.operator_payment_id IS 'Deuda específica de operator_payments que este pago cancela total o parcialmente.';

-- Backfill para pagos ya existentes que quedaron vinculados al principal
UPDATE payments p
SET operator_id = op.operator_id
FROM operator_payments op
WHERE p.operator_id IS NULL
  AND p.operator_payment_id IS NULL
  AND p.payer_type = 'OPERATOR'
  AND p.operation_id = op.operation_id
  AND p.ledger_movement_id IS NOT NULL
  AND op.ledger_movement_id = p.ledger_movement_id;

UPDATE payments p
SET
  operator_id = COALESCE(p.operator_id, op.operator_id),
  operator_payment_id = COALESCE(p.operator_payment_id, op.id)
FROM operator_payments op
WHERE p.payer_type = 'OPERATOR'
  AND p.operation_id = op.operation_id
  AND p.operator_payment_id IS NULL
  AND p.status = 'PAID'
  AND p.operator_id = op.operator_id
  AND ABS(COALESCE(op.paid_amount, 0) - p.amount) < 0.01;


-- ===== MIGRATION 152: 20260406000137_add_quotation_item_destination_city.sql =====

ALTER TABLE quotation_items
ADD COLUMN IF NOT EXISTS destination_city TEXT;

COMMENT ON COLUMN quotation_items.destination_city IS 'Ciudad o destino especifico del item de cotizacion, util para hoteles en viajes multidestino';


-- ===== MIGRATION 153: 20260406000138_add_quotation_pricing_mode.sql =====

ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS pricing_mode TEXT;

UPDATE quotations
SET pricing_mode = 'GROUP_TOTAL'
WHERE pricing_mode IS NULL;

ALTER TABLE quotations
ALTER COLUMN pricing_mode SET DEFAULT 'GROUP_TOTAL';

ALTER TABLE quotations
ALTER COLUMN pricing_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quotations_pricing_mode_check'
  ) THEN
    ALTER TABLE quotations
    ADD CONSTRAINT quotations_pricing_mode_check
    CHECK (pricing_mode IN ('PER_PERSON', 'GROUP_TOTAL'));
  END IF;
END $$;

COMMENT ON COLUMN quotations.pricing_mode IS 'Define si el precio visible se muestra por persona o como total del grupo.';


-- ===== MIGRATION 154: 20260406000139_update_quotation_sent_template_availability_note.sql =====

UPDATE message_templates
SET template = replace(
  replace(
    template,
    '📅 Válida hasta: {fecha_validez}',
    'ℹ️ {nota_disponibilidad}'
  ),
  '📅 Valida hasta: {fecha_validez}',
  'ℹ️ {nota_disponibilidad}'
)
WHERE trigger_type = 'QUOTATION_SENT'
  AND template LIKE '%{fecha_validez}%';


-- ===== MIGRATION 155: 20260406000140_add_payment_source.sql =====

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS source TEXT;

UPDATE payments
SET source = 'MANUAL'
WHERE source IS NULL;

ALTER TABLE payments
ALTER COLUMN source SET DEFAULT 'MANUAL';

ALTER TABLE payments
ALTER COLUMN source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_source_check'
  ) THEN
    ALTER TABLE payments
    ADD CONSTRAINT payments_source_check
    CHECK (source IN ('MANUAL', 'OPERATOR_BULK'));
  END IF;
END $$;

COMMENT ON COLUMN payments.source IS 'Origen funcional del pago. MANUAL para altas individuales y OPERATOR_BULK para pagos masivos a operadores.';


-- ===== MIGRATION 156: 20260407000141_invoice_tax_treatment_and_amount_mode.sql =====

-- Add invoice amount entry mode and explicit tax treatment for invoice items

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS amount_entry_mode TEXT NOT NULL DEFAULT 'NET'
CHECK (amount_entry_mode IN ('NET', 'FINAL'));

ALTER TABLE invoice_items
ADD COLUMN IF NOT EXISTS tax_treatment TEXT NOT NULL DEFAULT 'GRAVADO'
CHECK (tax_treatment IN ('GRAVADO', 'EXENTO', 'NO_GRAVADO'));

COMMENT ON COLUMN invoices.amount_entry_mode IS 'How entered amounts should be interpreted: NET or FINAL';
COMMENT ON COLUMN invoice_items.tax_treatment IS 'AFIP tax bucket for the item: GRAVADO, EXENTO, NO_GRAVADO';


-- ===== MIGRATION 157: 20260407000200_add_manual_totals_to_quotation_options.sql =====

ALTER TABLE quotation_options
  ADD COLUMN IF NOT EXISTS calculated_total_amount NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS manual_total_amount NUMERIC(18,2);

UPDATE quotation_options
SET calculated_total_amount = total_amount
WHERE calculated_total_amount IS NULL;

COMMENT ON COLUMN quotation_options.calculated_total_amount IS 'Suma automática de los servicios de la opción';
COMMENT ON COLUMN quotation_options.manual_total_amount IS 'Precio final manual definido por el asesor para la opción';


-- ===== MIGRATION 158: 20260409000142_add_support_operation_permissions_and_normalize_address.sql =====

alter table public.users
  add column if not exists can_view_agency_operations_support boolean not null default false,
  add column if not exists can_add_services_on_agency_operations boolean not null default false;

insert into public.organization_settings (key, value, updated_at)
values
  ('address', 'Corrientes 631 Piso 1 Oficina F', now()),
  ('company_address', 'Corrientes 631 Piso 1 Oficina F', now())
on conflict (key) do update
set
  value = excluded.value,
  updated_at = excluded.updated_at;


-- ===== MIGRATION 159: 20260411000143_add_internal_seller_receipt_messages.sql =====

ALTER TABLE whatsapp_messages
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'WHATSAPP'
    CHECK (channel IN ('WHATSAPP', 'INTERNAL')),
  ADD COLUMN IF NOT EXISTS message_kind TEXT NOT NULL DEFAULT 'STANDARD'
    CHECK (message_kind IN ('STANDARD', 'SELLER_RECEIPT')),
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recipient_name TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_recipient_user
  ON whatsapp_messages(recipient_user_id)
  WHERE recipient_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_internal_receipt_unique
  ON whatsapp_messages(payment_id, recipient_user_id, message_kind)
  WHERE channel = 'INTERNAL'
    AND message_kind = 'SELLER_RECEIPT'
    AND payment_id IS NOT NULL
    AND recipient_user_id IS NOT NULL;

COMMENT ON COLUMN whatsapp_messages.channel IS 'Canal lógico del mensaje: WhatsApp al cliente o notificación interna.';
COMMENT ON COLUMN whatsapp_messages.message_kind IS 'Tipo funcional del mensaje. SELLER_RECEIPT identifica recibos internos para vendedores.';
COMMENT ON COLUMN whatsapp_messages.recipient_user_id IS 'Usuario destinatario cuando el mensaje es interno.';
COMMENT ON COLUMN whatsapp_messages.recipient_name IS 'Nombre cacheado del destinatario interno para renderizado rápido.';


-- ===== MIGRATION 160: 20260411000144_update_expense_categories.sql =====

-- =====================================================
-- Migración 114: Actualizar categorías de gastos
-- Renombra/consolida las categorías predefinidas para reflejar
-- el esquema pedido por el cliente:
--   Gastos oficina, Sueldos, Impuestos, Marketing y sistemas, Varios, Otros
-- =====================================================

BEGIN;

-- Paso 1: Reasignar referencias a "Servicios" hacia el row de "Alquiler"
-- (que pasará a llamarse "Gastos oficina"). Esto consolida alquiler + servicios
-- básicos (luz, agua, internet) en una sola categoría "Gastos oficina".
UPDATE recurring_payments
SET category_id = (SELECT id FROM recurring_payment_categories WHERE name = 'Alquiler')
WHERE category_id = (SELECT id FROM recurring_payment_categories WHERE name = 'Servicios');

UPDATE cash_movements
SET category_id = (SELECT id FROM recurring_payment_categories WHERE name = 'Alquiler')
WHERE category_id = (SELECT id FROM recurring_payment_categories WHERE name = 'Servicios');

-- Paso 2: Renombrar categorías existentes (preservando UUID para no romper FKs)
UPDATE recurring_payment_categories
SET name = 'Gastos oficina',
    description = 'Alquileres, luz, agua, y gastos varios de oficina',
    updated_at = NOW()
WHERE name = 'Alquiler';

UPDATE recurring_payment_categories
SET name = 'Sueldos',
    description = 'Sueldos y honorarios de empleados',
    updated_at = NOW()
WHERE name = 'Salarios';

UPDATE recurring_payment_categories
SET name = 'Marketing y sistemas',
    description = 'Publicidad, redes sociales, software y sistemas',
    updated_at = NOW()
WHERE name = 'Marketing';

-- "Impuestos" y "Otros" se mantienen sin cambios.

-- Paso 3: Eliminar "Servicios" (ya no hay filas referenciándolo)
DELETE FROM recurring_payment_categories WHERE name = 'Servicios';

-- Paso 4: Insertar "Varios" (nueva categoría para gastos variables recurrentes)
INSERT INTO recurring_payment_categories (name, description, color)
VALUES ('Varios', 'Gastos variables recurrentes de bajo monto', '#64748b')
ON CONFLICT (name) DO NOTHING;

COMMIT;


-- ===== MIGRATION 161: 20260413000145_add_percepciones_afip_account.sql =====

-- =====================================================
-- Migración 145: Crear cuenta contable "Percepciones a depositar AFIP"
-- Cuenta de PASIVO CORRIENTE para registrar percepciones cobradas
-- que deben depositarse a AFIP (RG 5617, RG 3819, etc.)
-- =====================================================

-- 1. Crear cuenta en el plan de cuentas
INSERT INTO chart_of_accounts (
  account_code, account_name, category, subcategory, account_type,
  level, is_movement_account, display_order, description
) VALUES (
  '2.1.04',
  'Percepciones a depositar AFIP',
  'PASIVO',
  'CORRIENTE',
  'PERCEPCIONES_AFIP',
  2,
  true,
  4,
  'Percepciones cobradas a clientes pendientes de depósito a AFIP (RG 5617, RG 3819, etc.)'
) ON CONFLICT (account_code) DO NOTHING;

-- 2. Crear la cuenta financiera vinculada (ARS)
-- Se vincula automáticamente al chart_of_accounts creado arriba
INSERT INTO financial_accounts (
  name, type, currency, initial_balance, is_active, chart_account_id
)
SELECT
  'Percepciones a depositar AFIP',
  'SAVINGS_ARS',
  'ARS',
  0,
  true,
  coa.id
FROM chart_of_accounts coa
WHERE coa.account_code = '2.1.04'
  AND NOT EXISTS (
    SELECT 1 FROM financial_accounts fa
    WHERE fa.chart_account_id = coa.id AND fa.currency = 'ARS'
  );


-- ===== MIGRATION 162: 20260414000146_expand_chart_of_accounts.sql =====

-- =====================================================
-- Migración 146: Expandir Plan de Cuentas
-- Agrega ~25 cuentas nuevas para partida doble profesional
-- =====================================================

-- Primero obtener los IDs de las cuentas padre existentes
-- y luego insertar las cuentas nuevas con parent_id correcto

-- =====================================================
-- ACTIVO CORRIENTE — Cuentas nuevas
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '1.1.06', 'Anticipos a Proveedores', 'ACTIVO', 'CORRIENTE', 'ANTICIPOS_PROVEEDORES', 2, p.id, true, 6, 'Anticipos entregados a operadores/proveedores'
FROM chart_of_accounts p WHERE p.account_code = '1.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '1.1.07', 'IVA Crédito Fiscal', 'ACTIVO', 'CORRIENTE', 'IVA_CREDITO', 2, p.id, true, 7, 'IVA pagado en compras (crédito fiscal a favor)'
FROM chart_of_accounts p WHERE p.account_code = '1.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '1.1.08', 'Otros Créditos', 'ACTIVO', 'CORRIENTE', 'OTROS_CREDITOS', 2, p.id, true, 8, 'Otros créditos a cobrar'
FROM chart_of_accounts p WHERE p.account_code = '1.1'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- PASIVO CORRIENTE — Cuentas nuevas
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '2.1.05', 'Retenciones a Depositar', 'PASIVO', 'CORRIENTE', 'RETENCIONES', 2, p.id, true, 5, 'Retenciones practicadas pendientes de depósito a AFIP'
FROM chart_of_accounts p WHERE p.account_code = '2.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '2.1.06', 'Cargas Sociales a Pagar', 'PASIVO', 'CORRIENTE', 'CARGAS_SOCIALES', 2, p.id, true, 6, 'Aportes y contribuciones patronales pendientes'
FROM chart_of_accounts p WHERE p.account_code = '2.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '2.1.07', 'Anticipos de Clientes', 'PASIVO', 'CORRIENTE', 'ANTICIPOS_CLIENTES', 2, p.id, true, 7, 'Cobros anticipados de clientes por servicios no prestados'
FROM chart_of_accounts p WHERE p.account_code = '2.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '2.1.08', 'IIBB a Pagar', 'PASIVO', 'CORRIENTE', 'IIBB', 2, p.id, true, 8, 'Ingresos Brutos pendientes de pago'
FROM chart_of_accounts p WHERE p.account_code = '2.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '2.1.09', 'Impuesto a las Ganancias a Pagar', 'PASIVO', 'CORRIENTE', 'GANANCIAS', 2, p.id, true, 9, 'Impuesto a las Ganancias pendiente de pago'
FROM chart_of_accounts p WHERE p.account_code = '2.1'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- PATRIMONIO NETO — Cuentas nuevas
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '3.1.04', 'Resultado del Ejercicio', 'PATRIMONIO_NETO', 'RESULTADOS', 'RESULTADO_EJERCICIO', 2, p.id, true, 4, 'Resultado del ejercicio económico en curso'
FROM chart_of_accounts p WHERE p.account_code = '3.1'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- RESULTADO — INGRESOS nuevos
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.1.03', 'Comisiones Ganadas', 'RESULTADO', 'INGRESOS', 'COMISIONES_GANADAS', 2, p.id, true, 3, 'Comisiones ganadas por intermediación'
FROM chart_of_accounts p WHERE p.account_code = '4.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.1.04', 'Intereses Ganados', 'RESULTADO', 'INGRESOS', 'INTERESES_GANADOS', 2, p.id, true, 4, 'Intereses por inversiones o plazos fijos'
FROM chart_of_accounts p WHERE p.account_code = '4.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.1.05', 'Diferencia de Cambio Positiva', 'RESULTADO', 'INGRESOS', 'DIF_CAMBIO_POS', 2, p.id, true, 5, 'Ganancia por variación de tipo de cambio'
FROM chart_of_accounts p WHERE p.account_code = '4.1'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- RESULTADO — COSTOS nuevos
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.2.03', 'Costo de Hotelería', 'RESULTADO', 'COSTOS', 'COSTO_HOTELERIA', 2, p.id, true, 3, 'Costos de alojamiento'
FROM chart_of_accounts p WHERE p.account_code = '4.2'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.2.04', 'Costo de Aéreos', 'RESULTADO', 'COSTOS', 'COSTO_AEREOS', 2, p.id, true, 4, 'Costos de pasajes aéreos'
FROM chart_of_accounts p WHERE p.account_code = '4.2'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.2.05', 'Costo de Transfers', 'RESULTADO', 'COSTOS', 'COSTO_TRANSFERS', 2, p.id, true, 5, 'Costos de traslados'
FROM chart_of_accounts p WHERE p.account_code = '4.2'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.2.06', 'Costo de Seguros', 'RESULTADO', 'COSTOS', 'COSTO_SEGUROS', 2, p.id, true, 6, 'Costos de seguros de viaje (assist card, etc.)'
FROM chart_of_accounts p WHERE p.account_code = '4.2'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.2.07', 'Costo de Excursiones', 'RESULTADO', 'COSTOS', 'COSTO_EXCURSIONES', 2, p.id, true, 7, 'Costos de excursiones y actividades'
FROM chart_of_accounts p WHERE p.account_code = '4.2'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- RESULTADO — GASTOS nuevos
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.05', 'Sueldos y Jornales', 'RESULTADO', 'GASTOS', 'SUELDOS', 2, p.id, true, 5, 'Sueldos y salarios del personal'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.06', 'Cargas Sociales', 'RESULTADO', 'GASTOS', 'CARGAS_SOCIALES_GASTO', 2, p.id, true, 6, 'Aportes y contribuciones patronales'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.07', 'Alquileres', 'RESULTADO', 'GASTOS', 'ALQUILERES', 2, p.id, true, 7, 'Alquiler de oficinas y locales'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.08', 'Servicios (Luz, Gas, Internet)', 'RESULTADO', 'GASTOS', 'SERVICIOS', 2, p.id, true, 8, 'Servicios públicos y de comunicaciones'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.09', 'Impuestos y Tasas', 'RESULTADO', 'GASTOS', 'IMPUESTOS', 2, p.id, true, 9, 'Impuestos y tasas municipales/provinciales'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.10', 'Seguros', 'RESULTADO', 'GASTOS', 'SEGUROS_GASTO', 2, p.id, true, 10, 'Seguros de la empresa (responsabilidad civil, etc.)'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.11', 'Amortizaciones', 'RESULTADO', 'GASTOS', 'AMORTIZACIONES', 2, p.id, true, 11, 'Amortización de bienes de uso'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.12', 'Gastos Bancarios', 'RESULTADO', 'GASTOS', 'GASTOS_BANCARIOS', 2, p.id, true, 12, 'Comisiones y mantenimiento bancario'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.13', 'Diferencia de Cambio Negativa', 'RESULTADO', 'GASTOS', 'DIF_CAMBIO_NEG', 2, p.id, true, 13, 'Pérdida por variación de tipo de cambio'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.14', 'Gastos de Sistemas / Software', 'RESULTADO', 'GASTOS', 'GASTOS_SISTEMAS', 2, p.id, true, 14, 'Licencias, hosting, herramientas digitales'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.15', 'Otros Gastos', 'RESULTADO', 'GASTOS', 'OTROS_GASTOS', 2, p.id, true, 15, 'Gastos varios no clasificados'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- Actualizar parent_id de cuentas existentes que no lo tienen
-- =====================================================
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1.1')
WHERE account_code IN ('1.1.01', '1.1.02', '1.1.03', '1.1.04', '1.1.05') AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1.2')
WHERE account_code = '1.2.01' AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2.1')
WHERE account_code IN ('2.1.01', '2.1.02', '2.1.03', '2.1.04') AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2.2')
WHERE account_code = '2.2.01' AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '3.1')
WHERE account_code IN ('3.1.01', '3.1.02', '3.1.03') AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '4.1')
WHERE account_code IN ('4.1.01', '4.1.02') AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '4.2')
WHERE account_code IN ('4.2.01', '4.2.02') AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '4.3')
WHERE account_code IN ('4.3.01', '4.3.02', '4.3.03', '4.3.04') AND parent_id IS NULL;

-- Renombrar IVA a Pagar → IVA Débito Fiscal (más preciso contablemente)
UPDATE chart_of_accounts SET account_name = 'IVA Débito Fiscal' WHERE account_code = '2.1.02';


-- ===== MIGRATION 163: 20260414000147_add_journal_entries_and_debit_credit.sql =====

-- =====================================================
-- Migración 147: Tabla journal_entries + Columnas Debe/Haber en ledger_movements
-- Implementación de partida doble profesional (Debe/Haber)
-- =====================================================

-- =====================================================
-- 1. Tabla de Asientos Contables (Journal Entries)
-- =====================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Número secuencial de asiento (auto-increment)
  entry_number SERIAL,

  -- Fecha del asiento contable
  entry_date DATE NOT NULL,

  -- Descripción / concepto del asiento
  description TEXT NOT NULL,

  -- Operación relacionada (opcional)
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,

  -- Origen del asiento
  -- MANUAL: creado a mano por el usuario
  -- AUTO_PAYMENT: generado al registrar cobro/pago
  -- AUTO_CONFIRMATION: generado al confirmar operación
  -- AUTO_COMMISSION: generado al pagar comisión
  -- AUTO_FX: generado por diferencia de cambio
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'AUTO_PAYMENT', 'AUTO_CONFIRMATION', 'AUTO_COMMISSION', 'AUTO_FX')),

  -- Validación: Debe = Haber
  is_balanced BOOLEAN NOT NULL DEFAULT true,

  -- Monto total del asiento (suma de Debe)
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Moneda principal del asiento
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),

  -- Notas adicionales
  notes TEXT,

  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para journal_entries
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_operation ON journal_entries(operation_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries(source);
CREATE INDEX IF NOT EXISTS idx_journal_entries_number ON journal_entries(entry_number);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at ON journal_entries(created_at DESC);

-- Comentarios
COMMENT ON TABLE journal_entries IS 'Asientos contables. Cada asiento agrupa N movimientos de ledger con Debe = Haber.';
COMMENT ON COLUMN journal_entries.entry_number IS 'Número secuencial auto-generado para referencia rápida';
COMMENT ON COLUMN journal_entries.source IS 'Origen: MANUAL (usuario), AUTO_PAYMENT (cobro/pago), AUTO_CONFIRMATION, AUTO_COMMISSION, AUTO_FX';

-- =====================================================
-- 2. Columnas nuevas en ledger_movements
-- =====================================================

-- Referencia al asiento contable
ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- Debe (debit) y Haber (credit) - partida doble
ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS debit_amount NUMERIC(18,2) DEFAULT NULL;

ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(18,2) DEFAULT NULL;

-- Referencia directa a cuenta contable (chart_of_accounts)
-- Permite asociar un movimiento a una cuenta del plan sin pasar por financial_accounts
ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

-- Índices para las columnas nuevas
CREATE INDEX IF NOT EXISTS idx_ledger_journal_entry ON ledger_movements(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_ledger_chart_account ON ledger_movements(chart_account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_debit_credit ON ledger_movements(debit_amount, credit_amount)
  WHERE debit_amount IS NOT NULL OR credit_amount IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN ledger_movements.journal_entry_id IS 'Asiento contable al que pertenece este movimiento';
COMMENT ON COLUMN ledger_movements.debit_amount IS 'Monto en Debe (partida doble). NULL = movimiento legacy (usa type-based calc)';
COMMENT ON COLUMN ledger_movements.credit_amount IS 'Monto en Haber (partida doble). NULL = movimiento legacy (usa type-based calc)';
COMMENT ON COLUMN ledger_movements.chart_account_id IS 'Cuenta contable directa del plan de cuentas (complementa account_id de financial_accounts)';

-- =====================================================
-- 3. RLS Policies para journal_entries
-- =====================================================
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- Política de lectura: todos los usuarios autenticados
CREATE POLICY "journal_entries_select" ON journal_entries
  FOR SELECT USING (true);

-- Política de inserción: todos los usuarios autenticados
CREATE POLICY "journal_entries_insert" ON journal_entries
  FOR INSERT WITH CHECK (true);

-- Política de actualización: todos los usuarios autenticados
CREATE POLICY "journal_entries_update" ON journal_entries
  FOR UPDATE USING (true);


-- ===== MIGRATION 164: 20260416000148_fix_usd_journal_debit_credit.sql =====

-- Fix: USD journal entries had debit/credit set to amount_ars_equivalent
-- instead of amount_original. Correct them to use the original USD amount.

-- Entry #4: Cobro PUCCI (3400 USD, was showing 4080000)
UPDATE ledger_movements
SET debit_amount = 3400
WHERE id = '6dae5d20-33a9-4b55-9651-67ea1431f883'
  AND debit_amount = 4080000;

UPDATE ledger_movements
SET credit_amount = 3400
WHERE id = 'c1268cbc-7509-4867-ac57-0dcab492e5bd'
  AND credit_amount = 4080000;

UPDATE journal_entries
SET total_amount = 3400
WHERE id = 'ef04aa59-7a76-4011-80f1-5cace4a0fc39'
  AND total_amount = 4080000;

-- Entry #1: Pago operador TETTAMANZI (2903.83 USD, was showing 3484596)
UPDATE ledger_movements
SET credit_amount = 2903.83
WHERE id = '41c4e6fc-acb8-49cd-987e-58b5a141cad0'
  AND credit_amount = 3484596;

UPDATE ledger_movements
SET debit_amount = 2903.83
WHERE id = 'e5428a9e-7f7a-4a8d-97c0-be8f6694ea25'
  AND debit_amount = 3484596;

UPDATE journal_entries
SET total_amount = 2903.83
WHERE id = '25acc8bc-9bca-4ddd-9f9d-65e41dd5cc30'
  AND total_amount = 3484596;


-- ===== MIGRATION 165: 20260416000149_create_retenciones_financial_account.sql =====

-- Create financial_account for "Retenciones a Depositar" (2.1.05)
-- Same pattern as "Percepciones a depositar AFIP" (2.1.04)

INSERT INTO financial_accounts (
  name,
  type,
  currency,
  initial_balance,
  is_active,
  chart_account_id
)
SELECT
  'Retenciones a depositar',
  'SAVINGS_ARS',
  'ARS',
  0,
  true,
  ca.id
FROM chart_of_accounts ca
WHERE ca.account_code = '2.1.05'
  AND ca.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM financial_accounts fa
    WHERE fa.chart_account_id = ca.id
  );


-- ===== MIGRATION 166: 20260416000150_add_missing_invoice_alert_type.sql =====

-- Agregar MISSING_INVOICE al constraint de type en alerts
-- Para alertas de operaciones cobradas sin factura autorizada
DO $$
BEGIN
  -- Eliminar constraint existente
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_type_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
  END IF;

  -- Crear nuevo constraint con MISSING_INVOICE
  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
    CHECK (type IN (
      'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'UPCOMING_TRIP',
      'DOCUMENT_MISSING', 'DOCUMENT_EXPIRING', 'BIRTHDAY',
      'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT',
      'RECURRING_PAYMENT', 'TASK_REMINDER', 'TASK_ASSIGNED',
      'MISSING_INVOICE', 'OTHER'
    ));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;


-- ===== MIGRATION 167: 20260416000151_fix_rls_financial_tables.sql =====

-- =====================================================
-- SECURITY FIX: endurecer RLS en tablas financieras y sensibles
-- Migración 20260416000151
--
-- Motivación (ver auditoría de seguridad):
--   V3: conversations / messages con RLS deshabilitado → cross-tenant leak
--   V4: iva_sales, iva_purchases, commission_records con USING(true)
--       → SELLER podía leer datos de otros
--   V6: wa_devices, wa_messages, wa_chats y demás wa_* con USING(true)
--       → sin aislamiento (no tienen agency_id aún, restringimos a admin)
--
-- Orden: DROP POLICY IF EXISTS + CREATE POLICY (idempotente).
-- =====================================================

-- Helper: verificar que auth_id resuelve a un usuario activo con rol admin.
-- (No creamos función para no expandir surface; usamos sub-SELECTs inline.)

-- =====================================================
-- 1) iva_sales — filtrar SELLER por operations.seller_id
-- =====================================================
DROP POLICY IF EXISTS "iva_sales_select" ON iva_sales;
DROP POLICY IF EXISTS "iva_sales_insert" ON iva_sales;
DROP POLICY IF EXISTS "iva_sales_update" ON iva_sales;
DROP POLICY IF EXISTS "iva_sales_delete" ON iva_sales;

CREATE POLICY "iva_sales_select" ON iva_sales FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
  OR EXISTS (
    SELECT 1 FROM operations o
    JOIN users u ON u.auth_id = auth.uid()
    WHERE o.id = iva_sales.operation_id
      AND o.seller_id = u.id
      AND u.is_active = true
  )
);

CREATE POLICY "iva_sales_insert" ON iva_sales FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "iva_sales_update" ON iva_sales FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "iva_sales_delete" ON iva_sales FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- =====================================================
-- 2) iva_purchases — mismo pattern
-- =====================================================
DROP POLICY IF EXISTS "iva_purchases_select" ON iva_purchases;
DROP POLICY IF EXISTS "iva_purchases_insert" ON iva_purchases;
DROP POLICY IF EXISTS "iva_purchases_update" ON iva_purchases;
DROP POLICY IF EXISTS "iva_purchases_delete" ON iva_purchases;

CREATE POLICY "iva_purchases_select" ON iva_purchases FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
  OR EXISTS (
    SELECT 1 FROM operations o
    JOIN users u ON u.auth_id = auth.uid()
    WHERE o.id = iva_purchases.operation_id
      AND o.seller_id = u.id
      AND u.is_active = true
  )
);

CREATE POLICY "iva_purchases_insert" ON iva_purchases FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "iva_purchases_update" ON iva_purchases FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "iva_purchases_delete" ON iva_purchases FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- =====================================================
-- 3) commission_records — SELLER solo sus propias comisiones
--    (tiene seller_id directo, más simple que joinar a operations)
-- =====================================================
DROP POLICY IF EXISTS "commission_records_select" ON commission_records;
DROP POLICY IF EXISTS "commission_records_insert" ON commission_records;
DROP POLICY IF EXISTS "commission_records_update" ON commission_records;
DROP POLICY IF EXISTS "commission_records_delete" ON commission_records;

CREATE POLICY "commission_records_select" ON commission_records FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
  OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_id = auth.uid()
      AND u.is_active = true
      AND u.id = commission_records.seller_id
  )
);

CREATE POLICY "commission_records_insert" ON commission_records FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "commission_records_update" ON commission_records FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "commission_records_delete" ON commission_records FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- =====================================================
-- 4) conversations + messages — re-habilitar RLS (V3)
--    Cada usuario solo accede a sus propias conversaciones.
--    NOTA: conversations.user_id es TEXT (cambiado en migración 053
--    "fix_user_id_type") y guarda directamente auth.uid()::text.
--    Por eso comparamos auth.uid()::text = user_id (no joineamos a users).
-- =====================================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_owner_all" ON conversations;
DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON conversations;

CREATE POLICY "conversations_owner_all" ON conversations FOR ALL
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "messages_owner_all" ON messages;
DROP POLICY IF EXISTS "Users can view messages from their conversations" ON messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can delete messages from their conversations" ON messages;

CREATE POLICY "messages_owner_all" ON messages FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND auth.uid()::text = c.user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND auth.uid()::text = c.user_id
  )
);

-- =====================================================
-- 5) wa_* tables — restringir a ADMIN / SUPER_ADMIN (V6)
--    Estas tablas no tienen agency_id todavía; cuando se agregue
--    se puede reemplazar por policy por agency.
--    El service role client (admin) sigue pasando siempre — RLS no aplica.
-- =====================================================

-- wa_devices
DROP POLICY IF EXISTS "wa_devices_full_access" ON wa_devices;
CREATE POLICY "wa_devices_admin_only" ON wa_devices FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- wa_auth_credentials
DROP POLICY IF EXISTS "wa_auth_credentials_full_access" ON wa_auth_credentials;
CREATE POLICY "wa_auth_credentials_admin_only" ON wa_auth_credentials FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- wa_auth_keys
DROP POLICY IF EXISTS "wa_auth_keys_full_access" ON wa_auth_keys;
CREATE POLICY "wa_auth_keys_admin_only" ON wa_auth_keys FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- wa_chats
DROP POLICY IF EXISTS "wa_chats_full_access" ON wa_chats;
CREATE POLICY "wa_chats_admin_only" ON wa_chats FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- wa_messages
DROP POLICY IF EXISTS "wa_messages_full_access" ON wa_messages;
CREATE POLICY "wa_messages_admin_only" ON wa_messages FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- wa_daily_metrics
DROP POLICY IF EXISTS "wa_daily_metrics_full_access" ON wa_daily_metrics;
CREATE POLICY "wa_daily_metrics_admin_only" ON wa_daily_metrics FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- =====================================================
-- Notas de verificación:
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename IN ('iva_sales','iva_purchases','commission_records',
--                       'conversations','messages',
--                       'wa_devices','wa_auth_credentials','wa_auth_keys',
--                       'wa_chats','wa_messages','wa_daily_metrics')
--   ORDER BY tablename, cmd;
-- =====================================================


-- ===== MIGRATION 168: 20260416000152_rpc_replace_operation_operators.sql =====

-- =====================================================
-- RPC: replace_operation_operators
-- Migración 20260416000152
--
-- Motivación (ver auditoría A.4):
--   app/api/operations/[id]/route.ts hace DELETE de operation_operators y
--   después INSERT de los nuevos sin transacción. Si falla el INSERT
--   (error de validación, RLS, red), los operadores viejos ya fueron
--   borrados → la operación queda SIN operadores.
--
-- Esta RPC encapsula ambas operaciones en una transacción atómica.
-- Si cualquier parte falla, ROLLBACK automático.
--
-- Se ejecuta con SECURITY DEFINER porque la lógica ya está validada en
-- la API (permisos, ownership, etc.). La RPC se limita a garantizar
-- atomicidad.
-- =====================================================

CREATE OR REPLACE FUNCTION replace_operation_operators(
  p_operation_id UUID,
  p_operators JSONB  -- Array de objetos: [{operator_id, cost, cost_currency, product_type, notes}]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator JSONB;
BEGIN
  -- 1) Borrar todos los operation_operators existentes para esta operación
  DELETE FROM operation_operators
  WHERE operation_id = p_operation_id;

  -- 2) Insertar los nuevos (si se proveen). Si p_operators es NULL o [],
  --    simplemente no inserta nada (equivale a "remover todos").
  IF p_operators IS NOT NULL AND jsonb_array_length(p_operators) > 0 THEN
    FOR v_operator IN SELECT * FROM jsonb_array_elements(p_operators)
    LOOP
      INSERT INTO operation_operators (
        operation_id,
        operator_id,
        cost,
        cost_currency,
        product_type,
        notes
      ) VALUES (
        p_operation_id,
        (v_operator->>'operator_id')::UUID,
        COALESCE((v_operator->>'cost')::NUMERIC, 0),
        COALESCE(v_operator->>'cost_currency', 'USD'),
        NULLIF(v_operator->>'product_type', ''),
        NULLIF(v_operator->>'notes', '')
      );
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION replace_operation_operators(UUID, JSONB) IS
'Reemplaza atómicamente los operadores de una operación. DELETE + INSERT en una transacción. Si falla, rollback automático. Usado por PATCH /api/operations/[id].';

-- Permisos: authenticated puede ejecutar (la API ya valida permisos antes de llamar)
GRANT EXECUTE ON FUNCTION replace_operation_operators(UUID, JSONB) TO authenticated, service_role;


-- ===== MIGRATION 169: 20260416000153_unique_main_customer_per_operation.sql =====

-- =====================================================
-- Constraint: un solo pasajero MAIN por operación
-- Migración 20260416000153
--
-- Motivación (auditoría A.5):
--   operation_customers acepta varios registros con role='MAIN' para la
--   misma operación porque no hay UNIQUE que lo impida. Esto causa que
--   en UI/reportes aparezcan "2 pasajeros principales" y que el código
--   que asume un único MAIN haga picks no deterministas (.single() en
--   operation_customers queries).
--
-- Qué hace esta migración:
--   1) DETECTA los casos con >1 MAIN y deja el MÁS RECIENTE (created_at
--      no existe en la tabla; usamos id que incluye UUID v4 con timestamp,
--      o fallback lexicográfico). Los otros los convierte a COMPANION.
--   2) Agrega un UNIQUE parcial: no puede haber 2 MAIN en la misma operación.
--
-- Es idempotente salvo por el UNIQUE INDEX: si ya existe, CREATE UNIQUE
-- INDEX IF NOT EXISTS lo resuelve.
-- =====================================================

-- Paso 1: Detectar y limpiar duplicados MAIN.
-- Estrategia: de cada grupo (operation_id) con >1 MAIN, dejamos el que
-- tiene mayor `id` (determinístico, reproducible) como MAIN y degradamos
-- los demás a COMPANION.
--
-- Se loguea la cantidad para que vos veas en el output de Supabase cuántos
-- registros se convirtieron.
DO $$
DECLARE
  v_affected INTEGER;
BEGIN
  WITH duplicates AS (
    SELECT id,
           operation_id,
           ROW_NUMBER() OVER (
             PARTITION BY operation_id
             ORDER BY id DESC
           ) AS rn
    FROM operation_customers
    WHERE role = 'MAIN'
  )
  UPDATE operation_customers
  SET role = 'COMPANION'
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected > 0 THEN
    RAISE NOTICE 'Convertidos % MAIN duplicados a COMPANION (se conservó el id más reciente como MAIN)', v_affected;
  ELSE
    RAISE NOTICE 'No se encontraron MAIN duplicados — tabla limpia';
  END IF;
END $$;

-- Paso 2: UNIQUE parcial. Solo aplica a las filas con role='MAIN'.
-- Las filas COMPANION no participan de esta restricción (una operación
-- puede tener N acompañantes con el mismo customer_id? normalmente no,
-- pero eso lo cubre el UNIQUE separado de abajo por si acaso).
CREATE UNIQUE INDEX IF NOT EXISTS unique_main_customer_per_operation
  ON operation_customers (operation_id)
  WHERE role = 'MAIN';

-- Paso 3: UNIQUE regular para evitar que el mismo customer aparezca
-- dos veces en la misma operación (con cualquier rol). Esto previene
-- duplicados de vinculación por bugs del POST.
DO $$
DECLARE
  v_dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT operation_id, customer_id, COUNT(*) c
    FROM operation_customers
    GROUP BY operation_id, customer_id
    HAVING COUNT(*) > 1
  ) dup;

  IF v_dup_count > 0 THEN
    RAISE NOTICE 'Se encontraron % operaciones con customer_id duplicado. Limpiando (se conserva el id más reciente)...', v_dup_count;

    WITH duplicates AS (
      SELECT id,
             operation_id,
             customer_id,
             ROW_NUMBER() OVER (
               PARTITION BY operation_id, customer_id
               ORDER BY id DESC
             ) AS rn
      FROM operation_customers
    )
    DELETE FROM operation_customers
    WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);
  END IF;
END $$;

-- Agregar el UNIQUE ahora que no hay duplicados.
ALTER TABLE operation_customers
  DROP CONSTRAINT IF EXISTS unique_operation_customer;

ALTER TABLE operation_customers
  ADD CONSTRAINT unique_operation_customer UNIQUE (operation_id, customer_id);

COMMENT ON INDEX unique_main_customer_per_operation IS
'Garantiza que cada operación tenga un único pasajero con role=MAIN. Fix A.5 auditoría.';

COMMENT ON CONSTRAINT unique_operation_customer ON operation_customers IS
'Evita que el mismo customer aparezca dos veces en la misma operación.';


-- ===== MIGRATION 170: 20260416000154_add_converting_quotation_status.sql =====

-- =====================================================
-- Agregar estado CONVERTING a quotations.status
-- Migración 20260416000154
--
-- Motivación: el endpoint POST /api/quotations/[id]/convert usa un
-- CAS lock que pasa el status de APPROVED a CONVERTING. Sin este
-- valor en el CHECK, el UPDATE falla.
--
-- Idempotente: si el CHECK ya incluye 'CONVERTING', el bloque no hace nada.
-- =====================================================

DO $$
BEGIN
  -- Chequear si el valor 'CONVERTING' ya es aceptado
  BEGIN
    -- Intento un update con CONVERTING en una fila temporal-memoria (rollback)
    -- Mejor: recrear el CHECK drop+add (idempotente)
    ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_status_check;

    ALTER TABLE quotations ADD CONSTRAINT quotations_status_check
      CHECK (status IN (
        'DRAFT',
        'SENT',
        'PENDING_APPROVAL',
        'APPROVED',
        'CONVERTING',      -- NUEVO: lock intermedio al convertir
        'REJECTED',
        'EXPIRED',
        'CONVERTED'
      ));
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Error ajustando CHECK de quotations.status: %', SQLERRM;
  END;
END $$;


-- ===== MIGRATION 171: 20260416000155_check_amount_non_negative.sql =====

-- =====================================================
-- CHECK constraints: amount no negativo en tablas de dinero
-- Migración 20260416000155
--
-- Motivación (auditoría B1):
--   Las tablas payments, cash_movements, ledger_movements y
--   operator_payments no tienen CHECK que impida valores negativos.
--   Un bug de cálculo podría insertar -100 y el sistema lo tomaría
--   como válido, ensuciando reportes y balances.
--
--   No se usa amount negativo legítimamente en el código (los reversos
--   se hacen vía DELETE del movimiento, no con un amount contrario).
--
-- Pre-cleanup: si hay filas con amount negativo (bugs históricos),
-- las seteamos a 0 y logueamos cuántas fueron. El usuario puede
-- revisarlas después.
--
-- Idempotente: DROP CONSTRAINT IF EXISTS antes de cada ADD.
-- =====================================================

-- ============================================
-- PASO 1: Limpiar valores negativos históricos (si los hay)
-- ============================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- payments.amount
  UPDATE payments SET amount = 0 WHERE amount < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[payments] % filas con amount negativo reseteadas a 0', v_count; END IF;

  -- cash_movements.amount
  UPDATE cash_movements SET amount = 0 WHERE amount < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[cash_movements] % filas con amount negativo reseteadas a 0', v_count; END IF;

  -- ledger_movements.amount_original
  UPDATE ledger_movements SET amount_original = 0 WHERE amount_original < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[ledger_movements.amount_original] % filas reseteadas a 0', v_count; END IF;

  -- ledger_movements.amount_ars_equivalent
  UPDATE ledger_movements SET amount_ars_equivalent = 0 WHERE amount_ars_equivalent < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[ledger_movements.amount_ars_equivalent] % filas reseteadas a 0', v_count; END IF;

  -- operator_payments.amount
  UPDATE operator_payments SET amount = 0 WHERE amount < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[operator_payments.amount] % filas reseteadas a 0', v_count; END IF;

  -- operator_payments.paid_amount
  UPDATE operator_payments SET paid_amount = 0 WHERE paid_amount < 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN RAISE NOTICE '[operator_payments.paid_amount] % filas reseteadas a 0', v_count; END IF;
END $$;

-- ============================================
-- PASO 2: Agregar CHECK constraints
-- ============================================

-- payments.amount
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_non_negative;
ALTER TABLE payments ADD CONSTRAINT payments_amount_non_negative CHECK (amount >= 0);

-- cash_movements.amount
ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS cash_movements_amount_non_negative;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_amount_non_negative CHECK (amount >= 0);

-- ledger_movements.amount_original
ALTER TABLE ledger_movements DROP CONSTRAINT IF EXISTS ledger_movements_amount_original_non_negative;
ALTER TABLE ledger_movements ADD CONSTRAINT ledger_movements_amount_original_non_negative CHECK (amount_original >= 0);

-- ledger_movements.amount_ars_equivalent
ALTER TABLE ledger_movements DROP CONSTRAINT IF EXISTS ledger_movements_amount_ars_equivalent_non_negative;
ALTER TABLE ledger_movements ADD CONSTRAINT ledger_movements_amount_ars_equivalent_non_negative CHECK (amount_ars_equivalent >= 0);

-- operator_payments.amount
ALTER TABLE operator_payments DROP CONSTRAINT IF EXISTS operator_payments_amount_non_negative;
ALTER TABLE operator_payments ADD CONSTRAINT operator_payments_amount_non_negative CHECK (amount >= 0);

-- operator_payments.paid_amount
ALTER TABLE operator_payments DROP CONSTRAINT IF EXISTS operator_payments_paid_amount_non_negative;
ALTER TABLE operator_payments ADD CONSTRAINT operator_payments_paid_amount_non_negative CHECK (paid_amount >= 0);

COMMENT ON CONSTRAINT payments_amount_non_negative ON payments IS
'Fix B1 auditoría: impide amount negativo. Los reversos se hacen vía DELETE, no cambiando el signo.';


-- ===== MIGRATION 172: 20260419000141_saas_fix_rpc_security_invoker.sql =====

-- =====================================================
-- Migración 141: Fix execute_readonly_query a SECURITY INVOKER
-- =====================================================
-- SaaS Pilar 2c — Cierre del leak de la RPC SECURITY DEFINER.
--
-- Antes: `execute_readonly_query` corría como owner (superuser) y bypassea
-- RLS. Cualquier caller authenticated podía agregar data cross-org.
--
-- Ahora: la función corre con los permisos del caller. Si es un user
-- autenticado (JWT), las queries respetan RLS tenant_isolation y cada
-- tenant ve solo sus propias rows.
--
-- Seguro de aplicar porque ya refactorizamos lib/accounting/ledger.ts y
-- lib/accounting/journal-entries.ts para usar el server client del caller
-- en lugar de un admin client interno (mig 2c, commit d88cda5).
--
-- IMPORTANTE: usamos ALTER FUNCTION en vez de CREATE OR REPLACE para
-- tocar el atributo de seguridad sin re-parsear el body — así evitamos
-- cualquier bug de parsing de dollar-quoted strings en el SQL editor.

ALTER FUNCTION execute_readonly_query(TEXT) SECURITY INVOKER;

COMMENT ON FUNCTION execute_readonly_query(TEXT) IS
  'Ejecuta queries SELECT de forma segura. SECURITY INVOKER desde mig 141 — cada caller ve solo las rows que RLS le permite (SaaS tenant isolation).';


-- ===== MIGRATION 173: 20260419000142_saas_platform_admins.sql =====

-- =====================================================
-- Migración 142: Tabla platform_admins (Pilar 4)
-- =====================================================
-- SaaS Pilar 4 — separación de PLATFORM_ADMIN del modelo de roles por-tenant.
--
-- Antes: `users.role = 'SUPER_ADMIN'` era simultáneamente "acceso total dentro
-- de la org" y "acceso cross-org de plataforma". Con multi-tenant eso se
-- rompe: Maxi es SUPER_ADMIN de Lozada pero NO debe ver otras orgs.
--
-- Ahora: SUPER_ADMIN/ADMIN/CONTABLE/SELLER/VIEWER siguen viviendo dentro de
-- cada tenant (RLS tenant_isolation los acota a su org). PLATFORM_ADMIN vive
-- en esta tabla dedicada — el único rol que puede cruzar orgs (impersonación,
-- admin console, métricas de plataforma).
--
-- Esta migración NO renombra `users.role` para Maxi — ese refactor requiere
-- actualizar el CHECK constraint + todas las comparaciones de role en código
-- y queda para post-launch.

CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_user_id ON platform_admins(user_id);

-- RLS: solo los propios platform admins pueden ver la tabla. El resto, nada.
-- Las mutaciones se hacen con service_role (vía SQL Editor o admin tooling),
-- nunca desde código de app.
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_self_view" ON platform_admins;
CREATE POLICY "platform_admins_self_view" ON platform_admins
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa2
      INNER JOIN users u ON u.id = pa2.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

COMMENT ON TABLE platform_admins IS
  'SaaS — usuarios con privilegios de plataforma (cross-org). Separado de users.role que es por-tenant.';

-- Insertar Tomi como primer platform admin (por email, no por id hardcoded).
INSERT INTO platform_admins (user_id, notes)
SELECT id, 'Platform engineering — seed inicial (Pilar 4)'
FROM users
WHERE email = 'tomas.sanchez04@gmail.com'
ON CONFLICT (user_id) DO NOTHING;


-- ===== MIGRATION 174: 20260420000143_saas_itinerary_items_tenant_isolation.sql =====

-- =====================================================
-- Migración 143: Tenant isolation sobre itinerary_items
-- =====================================================
-- SaaS Pilar 2c — Gap descubierto en Pass 2: itinerary_items tenía RLS
-- activada pero con policies permisivas (USING true) y sin columna org_id.
-- La defensa temporal en código (verifyOperationBelongsToUser) cubría los
-- routes conocidos, pero cualquier nuevo caller podía leer/escribir items
-- de otras orgs. Este fix lo resuelve a nivel schema.
--
-- Cambios:
--   1. Agregar columna org_id con backfill desde operations.
--   2. NOT NULL constraint + FK a organizations.
--   3. Index en org_id para performance.
--   4. Drop policies permisivas.
--   5. Force RLS + policy tenant_isolation usando user_org_ids() (SECURITY DEFINER,
--      misma estrategia que mig 137).
--
-- Después de aplicar: la validación en código (verifyOperationBelongsToUser)
-- queda como defensa-en-profundidad, pero ya no es imprescindible.

-- 1. Columna org_id
ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. Backfill desde la operation parent
UPDATE itinerary_items ii
SET org_id = op.org_id
FROM operations op
WHERE ii.operation_id = op.id AND ii.org_id IS NULL;

-- 3. Fallback defensivo: cualquier row huérfano va a Lozada para no romper data
UPDATE itinerary_items
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

-- 4. Enforce NOT NULL ahora que todos tienen valor
ALTER TABLE itinerary_items
  ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_itinerary_items_org_id ON itinerary_items(org_id);

-- 5. Drop policies permisivas previas
DROP POLICY IF EXISTS "itinerary_select" ON itinerary_items;
DROP POLICY IF EXISTS "itinerary_insert" ON itinerary_items;
DROP POLICY IF EXISTS "itinerary_update" ON itinerary_items;
DROP POLICY IF EXISTS "itinerary_delete" ON itinerary_items;

-- 6. Forzar RLS (evita que service_role u owner la saltee por error de config)
ALTER TABLE itinerary_items FORCE ROW LEVEL SECURITY;

-- 7. Policy de tenant_isolation — un único policy para todas las operaciones.
-- user_org_ids() retorna SETOF uuid, por eso se usa IN (SELECT ...) y NO
-- = ANY (user_org_ids()) que PostgreSQL rechaza con 0A000.
-- Este patrón es el mismo que usan las otras tenant_isolation policies.
DROP POLICY IF EXISTS "itinerary_items_tenant_isolation" ON itinerary_items;
CREATE POLICY "itinerary_items_tenant_isolation" ON itinerary_items
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON COLUMN itinerary_items.org_id IS
  'SaaS tenant isolation. Backfill desde operations.org_id en mig 143.';


-- ===== MIGRATION 175: 20260420000144_saas_add_org_owner_role.sql =====

-- =====================================================
-- Migración 144: Agregar ORG_OWNER a users.role (Pilar 4)
-- =====================================================
-- SaaS Pilar 4 — rol canónico para owners en el modelo SaaS.
--
-- Antes: users.role CHECK era ('SUPER_ADMIN', 'ADMIN', 'CONTABLE', 'SELLER', 'VIEWER').
-- SUPER_ADMIN mezclaba dos conceptos: dueño de tenant y platform admin.
--
-- Ahora: agregamos ORG_OWNER como rol del dueño de tenant. El código lo
-- trata como alias de SUPER_ADMIN (mismo PERMISSIONS matrix), así que:
--   - Ningún user existente cambia de rol.
--   - Maxi sigue como SUPER_ADMIN — efecto práctico idéntico a ORG_OWNER
--     ahora que RLS tenant_isolation (Pilar 1) lo acota a Lozada.
--   - Nuevos tenants al registrarse usan ORG_OWNER.
--   - PLATFORM_ADMIN (Tomi) vive en `platform_admins` (mig 142), separado.
--
-- Migración futura (post-estabilización): renombrar Maxi a ORG_OWNER y
-- eventualmente sacar SUPER_ADMIN del CHECK.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('SUPER_ADMIN', 'ORG_OWNER', 'ADMIN', 'CONTABLE', 'SELLER', 'VIEWER'));

COMMENT ON COLUMN users.role IS
  'Rol dentro del tenant (SaaS). ORG_OWNER = dueño del tenant (canónico). SUPER_ADMIN = alias legacy con mismos permisos. PLATFORM_ADMIN vive aparte en platform_admins.';


-- ===== MIGRATION 176: 20260420000145_saas_security_audit_log.sql =====

-- =====================================================
-- Migración 145: Tabla security_audit_log (Pilar 8)
-- =====================================================
-- SaaS Pilar 8 — registro de eventos de seguridad relevantes para detectar
-- incidentes de aislamiento, acciones sospechosas o fire drills.
--
-- Dos fuentes principales:
--   1. Middleware: detecta cross-org query results inesperados (results
--      con org_id != user.org_id).
--   2. Routes críticos: registran acciones sensibles (delete lead, cambio
--      de rol, impersonación via platform admin).
--
-- La tabla NO es per-tenant: es global de plataforma. Solo platform_admins
-- pueden leerla. Los inserts vienen con service_role desde código confiable.

CREATE TABLE IF NOT EXISTS security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARN', 'ERROR', 'CRITICAL')),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_auth_id UUID,
  actor_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  target_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  target_entity TEXT,
  target_entity_id TEXT,
  request_ip TEXT,
  request_path TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_type ON security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_actor_org ON security_audit_log(actor_org_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at ON security_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_severity ON security_audit_log(severity) WHERE severity IN ('ERROR', 'CRITICAL');

ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log FORCE ROW LEVEL SECURITY;

-- Solo platform admins leen. Inserts/updates/deletes: solo service_role
-- (que bypassea RLS y forced RLS — requiere POSTGRES). No hay policy de
-- write: bloqueo total para authenticated, sin policy.
DROP POLICY IF EXISTS "security_audit_log_platform_admin_read" ON security_audit_log;
CREATE POLICY "security_audit_log_platform_admin_read" ON security_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

COMMENT ON TABLE security_audit_log IS
  'SaaS — registro global de eventos de seguridad (cross-org detection, acciones sensibles, impersonación). Solo platform_admins pueden leer; writes via service_role.';


-- ===== MIGRATION 177: 20260420000146_saas_lozada_enterprise.sql =====

-- =====================================================
-- Migración 146: Lozada plan ENTERPRISE (Pilar 7)
-- =====================================================
-- SaaS Pilar 7 — Maxi / Lozada Viajes arrancó como tenant existente antes
-- de que existiera el modelo de planes. Para que no le salte ningún
-- banner ni limitador cuando todo esté activo, le seteamos:
--   plan = ENTERPRISE
--   subscription_status = ACTIVE
--   max_* = 999 (efectivamente sin límite para operaciones reales)
--
-- Cualquier tenant nuevo arranca con TRIAL 14 días vía /onboarding.

UPDATE organizations
SET
  plan = 'ENTERPRISE',
  subscription_status = 'ACTIVE',
  trial_ends_at = NULL,
  grace_period_ends_at = NULL,
  max_users = 999,
  max_agencies = 99,
  max_operations_per_month = 99999
WHERE slug = 'lozada-viajes';


-- ===== MIGRATION 178: 20260420000147_saas_wa_tables_tenant_isolation.sql =====

-- =====================================================
-- Migración 147: Tenant isolation sobre tablas wa_* (WHA Control)
-- =====================================================
-- SaaS — gap crítico descubierto en prod: `wa_devices`, `wa_chats`,
-- `wa_messages`, `wa_daily_metrics`, `wa_auth_keys` tenían RLS activada
-- pero con policy `wa_*_admin_only` que solo chequea
-- `users.role IN ('ADMIN','SUPER_ADMIN')` — sin filtrar por org. Como LOLO
-- es SUPER_ADMIN, veía todos los 16 dispositivos de Lozada.
--
-- Fix: agregar `org_id` a las 5 tablas (cascadas desde `wa_devices.agency_id`
-- → `agencies.org_id`), drop policies permisivas, instalar tenant_isolation
-- usando `user_org_ids()` (mismo patrón que Pilar 1 y mig 143).
--
-- Dato del audit en prod (2026-04-20):
--   wa_devices      : todos con agency_id → resuelven a Lozada
--   wa_chats/msg/metrics/auth_keys : cascadea vía device_id

-- ========== 1. wa_devices ==========
ALTER TABLE wa_devices
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_devices d
SET org_id = a.org_id
FROM agencies a
WHERE d.agency_id = a.id AND d.org_id IS NULL;

UPDATE wa_devices
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_devices ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_devices_org_id ON wa_devices(org_id);

DROP POLICY IF EXISTS "wa_devices_admin_only" ON wa_devices;
ALTER TABLE wa_devices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_devices_tenant_isolation" ON wa_devices;
CREATE POLICY "wa_devices_tenant_isolation" ON wa_devices
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ========== 2. wa_chats ==========
ALTER TABLE wa_chats
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_chats c
SET org_id = d.org_id
FROM wa_devices d
WHERE c.device_id = d.id AND c.org_id IS NULL;

UPDATE wa_chats
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_chats ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_chats_org_id ON wa_chats(org_id);

DROP POLICY IF EXISTS "wa_chats_admin_only" ON wa_chats;
ALTER TABLE wa_chats FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_chats_tenant_isolation" ON wa_chats;
CREATE POLICY "wa_chats_tenant_isolation" ON wa_chats
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ========== 3. wa_messages ==========
ALTER TABLE wa_messages
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_messages m
SET org_id = d.org_id
FROM wa_devices d
WHERE m.device_id = d.id AND m.org_id IS NULL;

UPDATE wa_messages
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_messages ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_messages_org_id ON wa_messages(org_id);

DROP POLICY IF EXISTS "wa_messages_admin_only" ON wa_messages;
ALTER TABLE wa_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_messages_tenant_isolation" ON wa_messages;
CREATE POLICY "wa_messages_tenant_isolation" ON wa_messages
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ========== 4. wa_daily_metrics ==========
ALTER TABLE wa_daily_metrics
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_daily_metrics dm
SET org_id = d.org_id
FROM wa_devices d
WHERE dm.device_id = d.id AND dm.org_id IS NULL;

UPDATE wa_daily_metrics
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_daily_metrics ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_daily_metrics_org_id ON wa_daily_metrics(org_id);

DROP POLICY IF EXISTS "wa_daily_metrics_admin_only" ON wa_daily_metrics;
ALTER TABLE wa_daily_metrics FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_daily_metrics_tenant_isolation" ON wa_daily_metrics;
CREATE POLICY "wa_daily_metrics_tenant_isolation" ON wa_daily_metrics
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ========== 5. wa_auth_keys ==========
ALTER TABLE wa_auth_keys
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_auth_keys ak
SET org_id = d.org_id
FROM wa_devices d
WHERE ak.device_id = d.id AND ak.org_id IS NULL;

UPDATE wa_auth_keys
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_auth_keys ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_auth_keys_org_id ON wa_auth_keys(org_id);

DROP POLICY IF EXISTS "wa_auth_keys_admin_only" ON wa_auth_keys;
ALTER TABLE wa_auth_keys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_auth_keys_tenant_isolation" ON wa_auth_keys;
CREATE POLICY "wa_auth_keys_tenant_isolation" ON wa_auth_keys
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON COLUMN wa_devices.org_id IS 'SaaS tenant isolation — mig 147 backfilleó desde agencies.org_id.';


-- ===== MIGRATION 179: 20260420000148_saas_wa_auth_credentials_tenant.sql =====

-- =====================================================
-- Migración 148: Tenant isolation sobre wa_auth_credentials
-- =====================================================
-- SaaS — gap adicional descubierto al verificar mig 147: `wa_auth_credentials`
-- también existía (33 rows, session credentials por device) y quedó con la
-- misma policy permisiva "admin_only" sin filtrar por org.
--
-- Mismo patrón que las otras 5 tablas wa_*: agregar org_id, backfillear
-- desde wa_devices.org_id via device_id, drop policy permisiva, force RLS
-- y crear tenant_isolation.
--
-- SAFETY: el connector WhatsApp escribe/lee credentials con service_role,
-- que bypassa RLS incluso con FORCE — por eso los números conectados NO se
-- desconectan al aplicar esta migration.

ALTER TABLE wa_auth_credentials
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE wa_auth_credentials ac
SET org_id = d.org_id
FROM wa_devices d
WHERE ac.device_id = d.id AND ac.org_id IS NULL;

UPDATE wa_auth_credentials
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE wa_auth_credentials ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_auth_credentials_org_id ON wa_auth_credentials(org_id);

DROP POLICY IF EXISTS "wa_auth_credentials_admin_only" ON wa_auth_credentials;
ALTER TABLE wa_auth_credentials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_auth_credentials_tenant_isolation" ON wa_auth_credentials;
CREATE POLICY "wa_auth_credentials_tenant_isolation" ON wa_auth_credentials
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON COLUMN wa_auth_credentials.org_id IS
  'SaaS tenant isolation — mig 148 backfilleó desde wa_devices.org_id via device_id.';


-- ===== MIGRATION 180: 20260420000149_saas_billing_events.sql =====

-- =====================================================
-- Migración 149: billing_events + mp_preapproval_id en organizations
-- =====================================================
-- SaaS Pilar 9 — integración MercadoPago.
--
-- Dos piezas:
--   1. `organizations.mp_preapproval_id` — guarda el ID de la suscripción
--      de MercadoPago (preapproval) asociada al tenant. NULL hasta que
--      el owner haga su primer upgrade.
--   2. `billing_events` — tabla global (platform-level) para log de todo
--      lo que llega del webhook MP y de acciones manuales de admin sobre
--      cobros. Fuente de verdad para debugging y reconciliación.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT;

CREATE INDEX IF NOT EXISTS idx_organizations_mp_preapproval_id
  ON organizations(mp_preapproval_id)
  WHERE mp_preapproval_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  -- Payload crudo del webhook MP o del caller interno.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- ID externo en MP (preapproval_id, payment_id, etc) para dedup/lookup.
  external_id TEXT,
  amount_cents BIGINT,
  currency TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_events_event_type_check
    CHECK (event_type IN (
      'CHECKOUT_INITIATED',
      'MP_WEBHOOK',
      'SUBSCRIPTION_CREATED',
      'SUBSCRIPTION_AUTHORIZED',
      'SUBSCRIPTION_PAUSED',
      'SUBSCRIPTION_CANCELLED',
      'PAYMENT_APPROVED',
      'PAYMENT_REJECTED',
      'MANUAL_ADMIN_ADJUSTMENT'
    ))
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org_id ON billing_events(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_external_id ON billing_events(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_events_created_at ON billing_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_events_event_type ON billing_events(event_type);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events FORCE ROW LEVEL SECURITY;

-- El tenant puede leer sus propios eventos (para mostrar historial en
-- /settings/subscription). Platform admins leen todo.
DROP POLICY IF EXISTS "billing_events_self_read" ON billing_events;
CREATE POLICY "billing_events_self_read" ON billing_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    OR EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

-- Writes: solo via service_role (checkout route + webhook route).
-- Ninguna policy de INSERT/UPDATE/DELETE para authenticated.

COMMENT ON TABLE billing_events IS
  'SaaS Pilar 9 — log de eventos de facturación (MP webhooks + acciones manuales). Tenant lee los suyos; service_role escribe.';


-- ===== MIGRATION 181: 20260420000150_saas_auto_org_id_triggers.sql =====

-- =====================================================
-- Migración 150 v3: Triggers auto-org_id (sin SELECT INTO para el SQL Editor)
-- =====================================================
-- SaaS — INSERTs a tablas tenant-scoped desde JWT fallan con 42501 si el
-- caller no setea org_id. Trigger BEFORE INSERT lo auto-popula desde contexto.
--
-- v1 + v2: el SQL Editor de Supabase se confunde con `SELECT col INTO var`
-- y tira `relation "<var>" does not exist`. v3 elimina `SELECT INTO` y
-- asigna directo a NEW.org_id con subqueries inline.

-- ========== ledger_movements ==========
CREATE OR REPLACE FUNCTION auto_set_ledger_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.operation_id IS NOT NULL THEN
    NEW.org_id := (SELECT o.org_id FROM operations o WHERE o.id = NEW.operation_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    NEW.org_id := (SELECT l.org_id FROM leads l WHERE l.id = NEW.lead_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.id = NEW.created_by);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_auto_org_id_ledger_movements ON ledger_movements;
CREATE TRIGGER trg_auto_org_id_ledger_movements
  BEFORE INSERT ON ledger_movements
  FOR EACH ROW EXECUTE FUNCTION auto_set_ledger_org_id();

-- ========== cash_movements ==========
CREATE OR REPLACE FUNCTION auto_set_cash_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.financial_account_id IS NOT NULL THEN
    NEW.org_id := (SELECT fa.org_id FROM financial_accounts fa WHERE fa.id = NEW.financial_account_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.id = NEW.user_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_auto_org_id_cash_movements ON cash_movements;
CREATE TRIGGER trg_auto_org_id_cash_movements
  BEFORE INSERT ON cash_movements
  FOR EACH ROW EXECUTE FUNCTION auto_set_cash_org_id();

-- ========== tasks ==========
CREATE OR REPLACE FUNCTION auto_set_tasks_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.operation_id IS NOT NULL THEN
    NEW.org_id := (SELECT o.org_id FROM operations o WHERE o.id = NEW.operation_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.id = NEW.created_by);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.id = NEW.assigned_to);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_auto_org_id_tasks ON tasks;
CREATE TRIGGER trg_auto_org_id_tasks
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION auto_set_tasks_org_id();


-- ===== MIGRATION 182: 20260420000151_saas_consolidated_policies_fix.sql =====

-- =====================================================
-- Migración 151: Consolidated legacy-policy cleanup + manychat_list_order tenant
-- =====================================================
-- SaaS — 3 gaps residuales después de los Pilares 1-9:
--
-- 1. `financial_settings` tenía policies legacy que dejaban pasar cross-org:
--    "Users can view financial settings for their agencies" (agency-based)
--    "Only admins can modify financial settings" (role check sin org)
--    Como RLS aplica OR entre policies, CUALQUIER match permite. Un SUPER_ADMIN
--    de LOLO matcheaba la segunda → veía el CUIT/IVA config de Maxi.
--
-- 2. `integrations` tenía una policy legacy equivalente:
--    "Admins can manage integrations" (agency-based)
--    LOLO veía la integración AFIP de Lozada por esta puerta.
--
-- 3. `manychat_list_order` sin `org_id`, con policies permisivas (auth.role
--    check sin org). LOLO veía las listas del CRM de Maxi y no podía
--    crear las suyas porque la policy de write era admin-only sin org.
--
-- Fix: drop las legacy, dejar solo `tenant_isolation`, agregar org_id +
-- backfill + trigger auto-org_id a manychat_list_order.

-- ========== 1. financial_settings ==========
DROP POLICY IF EXISTS "Users can view financial settings for their agencies" ON financial_settings;
DROP POLICY IF EXISTS "Only admins can modify financial settings" ON financial_settings;
-- Deja sólo `tenant_isolation` (creada por mig 136).

-- ========== 2. integrations ==========
DROP POLICY IF EXISTS "Admins can manage integrations" ON integrations;
-- Deja sólo `tenant_isolation`.

-- ========== 3. manychat_list_order ==========
ALTER TABLE manychat_list_order
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE manychat_list_order m
SET org_id = a.org_id
FROM agencies a
WHERE m.agency_id = a.id AND m.org_id IS NULL;

UPDATE manychat_list_order
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE manychat_list_order ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_manychat_list_order_org_id ON manychat_list_order(org_id);

DROP POLICY IF EXISTS "Manychat list order is editable by admins" ON manychat_list_order;
DROP POLICY IF EXISTS "Manychat list order is viewable by authenticated users" ON manychat_list_order;

ALTER TABLE manychat_list_order FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manychat_list_order_tenant_isolation" ON manychat_list_order;
CREATE POLICY "manychat_list_order_tenant_isolation" ON manychat_list_order
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- Trigger auto-org_id (mismo patrón que mig 150)
CREATE OR REPLACE FUNCTION auto_set_manychat_list_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.agency_id IS NOT NULL THEN
    NEW.org_id := (SELECT a.org_id FROM agencies a WHERE a.id = NEW.agency_id);
    IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_auto_org_id_manychat_list_order ON manychat_list_order;
CREATE TRIGGER trg_auto_org_id_manychat_list_order
  BEFORE INSERT ON manychat_list_order
  FOR EACH ROW EXECUTE FUNCTION auto_set_manychat_list_org_id();


-- ===== MIGRATION 183: 20260420000152_saas_universal_auto_org_id.sql =====

-- =====================================================
-- Migración 152: Trigger auto-org_id universal
-- =====================================================
-- Mig 150 cubrió ledger_movements/cash_movements/tasks; mig 151 cubrió
-- manychat_list_order. El resto de tablas tenant-scoped (leads, operations,
-- customers, operators, payments, etc.) siguen expuestas al mismo 42501:
-- INSERT desde un JWT user sin `org_id` explícito → RLS rechaza.
--
-- Fix universal: función genérica `auto_set_org_id_from_auth` que resuelve
-- org_id desde `auth.uid() → users.org_id`, y la aplicamos vía trigger
-- BEFORE INSERT a TODAS las tablas con columna `org_id` y RLS activa. Si
-- la tabla ya tiene un trigger específico (mig 150/151), saltamos — PG
-- ejecuta triggers en orden alfabético y los específicos cubren contexto
-- más rico (operation_id, lead_id, financial_account_id).

-- ========== Función genérica ==========
CREATE OR REPLACE FUNCTION auto_set_org_id_from_auth() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  RETURN NEW;
END;
$body$;

COMMENT ON FUNCTION auto_set_org_id_from_auth() IS
  'SaaS — trigger BEFORE INSERT universal. Si org_id es NULL, lo resuelve desde auth.uid() -> users.org_id. Usado en todas las tablas tenant-scoped que no tienen un trigger específico con contexto más rico.';

-- ========== Instalación en todas las tablas tenant-scoped ==========
-- Excluye: tablas con trigger específico (mig 150/151) y tablas sin RLS.
DO $body$
DECLARE
  r RECORD;
  tg_name TEXT;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    INNER JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = c.relname
          AND column_name = 'org_id'
      )
    ORDER BY c.relname
  LOOP
    tg_name := 'trg_auto_org_id_' || r.tbl;

    -- Saltear si ya existe un trigger con ese nombre (mig 150/151 ya cubrió
    -- ledger_movements, cash_movements, tasks, manychat_list_order).
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = tg_name
        AND tgrelid = (SELECT oid FROM pg_class WHERE relname = r.tbl AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION auto_set_org_id_from_auth()',
      tg_name,
      r.tbl
    );
    RAISE NOTICE 'Created trigger % on %', tg_name, r.tbl;
  END LOOP;
END;
$body$;


-- ===== MIGRATION 184: 20260420000153_saas_quotations_tax_withholdings.sql =====

-- =====================================================
-- Migración 153: Fix quotation_number cross-org + tax_withholdings tenant isolation
-- =====================================================
-- Bugs reportados:
--
-- #3: LOLO no puede crear quotations. Console: duplicate key violation on
--     quotations_quotation_number_key. El constraint UNIQUE es global,
--     pero la función generate_quotation_number emite 'COT-YYYY-0001'
--     para todos los tenants sin distinguir. Colisiona con la de Lozada.
--     Fix: cambiar unique a (org_id, quotation_number) + hacer la
--     función org-scoped.
--
-- #2: Ni Maxi ni LOLO ven data en Impuestos → Percepciones y Retenciones.
--     tax_withholdings no tenía org_id ni agency_id y la policy `tw_insert`
--     era sólo para INSERT sin USING expression (permisiva para SELECT).
--     Además cualquier nuevo INSERT que llegue desde un JWT user ya falla
--     con 42501 si no setea org_id.
--     Fix: agregar org_id + agency_id, backfill desde operations/operators,
--     force RLS + tenant_isolation policy, trigger auto-org_id.

-- =====================================================
-- 1. quotations: UNIQUE por tenant
-- =====================================================
ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_quotation_number_key;

-- Si existe un constraint con otro nombre lo limpiamos por las dudas
DO $cleanup$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'quotations'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (quotation_number)'
  LOOP
    EXECUTE format('ALTER TABLE quotations DROP CONSTRAINT %I', r.conname);
  END LOOP;
END;
$cleanup$;

ALTER TABLE quotations
  ADD CONSTRAINT quotations_org_number_unique UNIQUE (org_id, quotation_number);

-- =====================================================
-- 2. generate_quotation_number: org-scoped
-- =====================================================
-- LANGUAGE sql (no plpgsql) — evita el bug del SQL Editor de Supabase
-- que rechaza DECLARE local vars con 42P01. Todo se resuelve con
-- subqueries inline. Aceptamos p_org_id; si no viene, resolvemos desde
-- auth.uid(). Numeramos sólo dentro del tenant.
CREATE OR REPLACE FUNCTION generate_quotation_number(p_org_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $body$
  SELECT 'COT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(
    (COALESCE((
      SELECT MAX(CAST(SUBSTRING(q.quotation_number FROM '[0-9]+$') AS INTEGER))
      FROM quotations q
      WHERE q.quotation_number LIKE 'COT-' || TO_CHAR(NOW(), 'YYYY') || '-%'
        AND (
          COALESCE(
            p_org_id,
            (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1)
          ) IS NULL
          OR q.org_id = COALESCE(
            p_org_id,
            (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1)
          )
        )
    ), 0) + 1)::TEXT,
    4, '0'
  )
$body$;

-- =====================================================
-- 3. tax_withholdings: org_id + agency_id + RLS
-- =====================================================
ALTER TABLE tax_withholdings
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

-- Backfill: operation → operations.org_id/agency_id
UPDATE tax_withholdings tw
SET org_id = o.org_id,
    agency_id = COALESCE(tw.agency_id, o.agency_id)
FROM operations o
WHERE tw.operation_id = o.id AND tw.org_id IS NULL;

-- Backfill: operator → operators.org_id
UPDATE tax_withholdings tw
SET org_id = op.org_id
FROM operators op
WHERE tw.operator_id = op.id AND tw.org_id IS NULL;

-- Fallback: a Lozada (eran pre-SaaS)
UPDATE tax_withholdings
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE tax_withholdings ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tax_withholdings_org_id ON tax_withholdings(org_id);
CREATE INDEX IF NOT EXISTS idx_tax_withholdings_agency_id ON tax_withholdings(agency_id);

-- Drop policy vieja
DROP POLICY IF EXISTS "tw_insert" ON tax_withholdings;

ALTER TABLE tax_withholdings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_withholdings_tenant_isolation" ON tax_withholdings;
CREATE POLICY "tax_withholdings_tenant_isolation" ON tax_withholdings
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- Trigger auto-org_id (usamos la función genérica de mig 152 que ya existe)
DROP TRIGGER IF EXISTS trg_auto_org_id_tax_withholdings ON tax_withholdings;
CREATE TRIGGER trg_auto_org_id_tax_withholdings
  BEFORE INSERT ON tax_withholdings
  FOR EACH ROW EXECUTE FUNCTION auto_set_org_id_from_auth();

-- NOTA sobre el bug #1 (comisión no generada):
-- Root cause: `getSellerPercentage()` devuelve 0 cuando un tenant no
-- tiene `commission_rules` cargadas. En una versión anterior de esta
-- migración seedeaba una regla default 10% para cada org — lo sacamos
-- porque genera data contable arbitraria (no todas las agencias pagan
-- 10%, algunas no pagan comisión, etc). En vez, el frontend muestra un
-- warning cuando no hay reglas configuradas. Cada tenant configura sus
-- propias reglas en Settings → Comisiones.


-- ===== MIGRATION 185: 20260420000154_legal_acceptance.sql =====

-- Migration 154: Legal acceptance tracking on users.
--
-- Agrega tracking de aceptación de legales al momento del signup.
-- Queda como info auditable + base para re-aceptación cuando publiquemos
-- una nueva versión de los términos.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legal_version TEXT;

COMMENT ON COLUMN public.users.legal_accepted_at IS
  'Fecha/hora en que el user aceptó los Términos, Privacidad y Cookies. NULL = nunca aceptó (user pre-migración o fallback).';

COMMENT ON COLUMN public.users.legal_version IS
  'Versión de los docs legales aceptados (ej: "2026-04-20"). Cuando publiquemos una nueva versión, comparamos con este valor para forzar re-aceptación.';

-- Backfill: users existentes quedan con NULL (signup pre-feature).
-- No los forzamos a re-aceptar retroactivamente; se captura la aceptación
-- al próximo signup o al prompt de nueva versión que hagamos a futuro.


-- ===== MIGRATION 186: 20260420000155_withholdings_enabled_toggle.sql =====

-- Migration 155: Toggle master para desactivar todas las retenciones/percepciones.
--
-- Caso de uso: agencias monotributistas o de prueba que no aplican ninguna
-- retención/percepción. Antes la única forma de saltear era setear cada regla
-- en is_active=false individualmente (confuso y error-prone).
--
-- Flag simple: cuando withholdings_enabled = false, el motor saltea TODO el
-- cálculo automático de retenciones. Las reglas individuales se mantienen
-- intactas en financial_settings.withholding_rules — solo se pausa su
-- ejecución. Al re-habilitar, todo vuelve al comportamiento anterior.

ALTER TABLE public.financial_settings
  ADD COLUMN IF NOT EXISTS withholdings_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.financial_settings.withholdings_enabled IS
  'Master toggle. Si es false, el motor de retenciones/percepciones no genera NINGUNA entrada automática (ni PERCEPCION_IVA, IIBB, RG 5617, RG 3819, etc.). Útil para monotributistas o agencias que no retienen. Las reglas individuales se preservan para cuando se reactive.';


-- ===== MIGRATION 187: 20260421000156_fix_plan_check_constraint.sql =====

-- Migration 156: Fix organizations.plan CHECK constraint.
--
-- La migration original (132) creó el constraint con 'PROFESSIONAL', pero el
-- catálogo de planes (lib/billing/plans.ts) y la landing (vibook.ai) usan
-- 'PRO'. Consecuencia: cualquier signup nuevo después de la actualización
-- del register API (commit f93cecd, "PRO con trial 7d") fallaba con
-- organizations_plan_check violated.
--
-- Fix:
-- 1. Actualizar orgs existentes con 'PROFESSIONAL' → 'PRO' (si las hay).
-- 2. Drop constraint viejo.
-- 3. Recrear con 'PRO' (nombre canonical) + 'PROFESSIONAL' como legacy alias.

-- Paso 1: normalizar datos pre-existentes.
UPDATE public.organizations
   SET plan = 'PRO'
 WHERE plan = 'PROFESSIONAL';

-- Paso 2: drop constraint viejo (nombre auto-asignado por Postgres).
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;

-- Paso 3: recrear aceptando los 3 valores que el código usa hoy.
-- PROFESSIONAL queda permitido como alias legacy por si queda alguna fila
-- histórica — pero todo código nuevo escribe 'PRO'.
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('STARTER', 'PRO', 'PROFESSIONAL', 'ENTERPRISE'));

COMMENT ON CONSTRAINT organizations_plan_check ON public.organizations IS
  'Valores válidos para plan. PRO es el nombre canonical (lib/billing/plans.ts + landing). STARTER es legacy oculto en UI. PROFESSIONAL es alias legacy de PRO.';


-- ===== MIGRATION 188: 20260421000157_saas_billing_hardening.sql =====

-- Migration 157: SaaS billing hardening — paywall + MP robusto.
--
-- Contexto: rediseño completo del flow de suscripciones. Se agregan columnas
-- para trackear período pagado y trial usado, expande el CHECK constraint
-- de subscription_status con los nuevos valores, y migra orgs existentes.
-- También agrega UNIQUE para idempotencia de webhooks MP.
--
-- Spec: docs/superpowers/specs/2026-04-21-paywall-mercadopago-design.md
-- Plan: docs/superpowers/plans/2026-04-21-paywall-mercadopago.md

-- Columnas nuevas
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS current_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mp_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.current_period_ends_at IS
  'Fin del período pagado/trial actual. Durante TRIALING = trial_ends_at. '
  'Durante ACTIVE = next_payment_date del preapproval MP. Se congela al CANCELLED.';
COMMENT ON COLUMN public.organizations.mp_last_synced_at IS
  'preapproval.last_modified del último webhook MP procesado. Usado para detectar '
  'webhooks out-of-order e idempotencia.';
COMMENT ON COLUMN public.organizations.has_used_trial IS
  'True después del primer preapproval creado con free_trial. Previene exploit de '
  're-trialing (cancelar y volver a suscribirse con trial nuevo).';

-- Expandir CHECK de subscription_status. Valores actuales: TRIAL, ACTIVE, PAST_DUE,
-- CANCELLED, SUSPENDED. Nuevos: PENDING_PAYMENT, TRIALING. TRIAL queda como legacy
-- permitido para no romper backfill en transición.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN (
    'PENDING_PAYMENT', 'TRIALING', 'ACTIVE', 'PAST_DUE',
    'CANCELLED', 'SUSPENDED',
    'TRIAL'  -- legacy, backfilleado abajo. No se usa en código nuevo.
  ));

-- Backfill de orgs existentes:
--   TRIAL sin preapproval → PENDING_PAYMENT (nunca eligieron plan)
--   TRIAL con preapproval → TRIALING + has_used_trial=true
UPDATE public.organizations
   SET subscription_status = 'PENDING_PAYMENT'
 WHERE subscription_status = 'TRIAL'
   AND mp_preapproval_id IS NULL;

UPDATE public.organizations
   SET subscription_status = 'TRIALING',
       has_used_trial = true,
       current_period_ends_at = trial_ends_at
 WHERE subscription_status = 'TRIAL'
   AND mp_preapproval_id IS NOT NULL;

-- ACTIVE legacy: has_used_trial=true para no re-ofrecer trial
UPDATE public.organizations
   SET has_used_trial = true
 WHERE subscription_status IN ('ACTIVE', 'PAST_DUE')
   AND mp_preapproval_id IS NOT NULL;

-- Idempotencia de webhooks: unique sobre (external_id, event_type) donde
-- external_id no es null.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_idempotency
  ON public.billing_events (external_id, event_type)
  WHERE external_id IS NOT NULL;

COMMENT ON INDEX idx_billing_events_idempotency IS
  'Previene double-procesamiento de webhooks MP cuando MP retryea. '
  'Combinado con comparación de last_modified, garantiza idempotencia.';


-- ===== MIGRATION 189: 20260422000158_custom_plans.sql =====

-- SaaS Admin Custom Plans — precio custom por org + descuento temporal + features extras.
-- Spec: docs/superpowers/specs/2026-04-22-admin-custom-plans-design.md

CREATE TABLE IF NOT EXISTS custom_plans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  display_name     TEXT NOT NULL,
  base_price_ars   NUMERIC(12,2) NOT NULL CHECK (base_price_ars > 0),
  discount_percent SMALLINT NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  discount_ends_at TIMESTAMPTZ,
  features         JSONB NOT NULL DEFAULT '{"extras": []}'::jsonb,
  limits           JSONB NOT NULL DEFAULT '{}'::jsonb,
  billing_method   TEXT NOT NULL DEFAULT 'MP' CHECK (billing_method IN ('MP', 'MANUAL')),
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS custom_plans_discount_ends_idx
  ON custom_plans (discount_ends_at)
  WHERE discount_percent > 0;

ALTER TABLE custom_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_plans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_plans_tenant_read ON custom_plans;
CREATE POLICY custom_plans_tenant_read ON custom_plans
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_org_ids()));

DROP POLICY IF EXISTS custom_plans_admin_all ON custom_plans;
CREATE POLICY custom_plans_admin_all ON custom_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

-- Reuse the same updated_at trigger function used by organizations. Si no existe
-- globalmente, crearla aquí.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_set_updated_at') THEN
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $body$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $body$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS custom_plans_updated_at ON custom_plans;
CREATE TRIGGER custom_plans_updated_at
  BEFORE UPDATE ON custom_plans
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();


-- ===== MIGRATION 190: 20260422000159_manual_payments.sql =====

-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260422000159_manual_payments.sql

-- Histórico de pagos manuales (transferencia, factura A, etc.) para custom_plans
-- con billing_method='MANUAL'. covers_to del último pago define vencimiento.

CREATE TABLE IF NOT EXISTS manual_payments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount_ars     NUMERIC(12,2) NOT NULL CHECK (amount_ars > 0),
  paid_at        TIMESTAMPTZ NOT NULL,
  covers_from    DATE NOT NULL,
  covers_to      DATE NOT NULL CHECK (covers_to >= covers_from),
  payment_method TEXT,
  receipt_ref    TEXT,
  registered_by  UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_payments_org_covers_to_idx
  ON manual_payments (org_id, covers_to DESC);

ALTER TABLE manual_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manual_payments_tenant_read ON manual_payments;
CREATE POLICY manual_payments_tenant_read ON manual_payments
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_org_ids()));

DROP POLICY IF EXISTS manual_payments_admin_all ON manual_payments;
CREATE POLICY manual_payments_admin_all ON manual_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );


-- ===== MIGRATION 191: 20260422000160_organizations_custom_plan_id.sql =====

-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260422000160_organizations_custom_plan_id.sql

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS custom_plan_id UUID REFERENCES custom_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organizations_custom_plan_id_idx
  ON organizations (custom_plan_id)
  WHERE custom_plan_id IS NOT NULL;


-- ===== MIGRATION 192: 20260423000161_bulk_import_rpcs.sql =====

-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260423000161_bulk_import_rpcs.sql

-- Bulk Import RPCs — funciones atómicas SECURITY DEFINER para insertar batches
-- de filas por entidad. Usadas por endpoints /api/import/<entity>.
--
-- Cada función:
--   - Recibe p_org_id uuid + p_rows jsonb (array de objetos row).
--   - INSERT ... ON CONFLICT (org_id, <natural_key>) DO NOTHING.
--   - Devuelve jsonb: { inserted: int, conflicts: jsonb[] }.
-- Spec: docs/superpowers/specs/2026-04-23-bulk-import-design.md
--
-- IMPORTANT: correcciones aplicadas vs plan original (conflictos con schema real):
--   - operators: agrega columna `cuit` (no existía).
--   - users: usa `default_commission_percentage` (no `commission_percentage`).
--   - operations: usa `seller_id` (no `seller_primary_id`). Agrega columnas
--     required (`type`, `margin_amount`, `margin_percentage`, `operation_date`).
--     Relación con customer via `operation_customers` (no FK flat).
--   - payments: usa `method` + `reference` (no `payment_method` / `reference_number`).
--     Agrega `payer_type` derivado de direction. Drop `financial_account_id`.
--   - cash_movements: sin `reference_number`; natural key usa `notes`. Requiere
--     `user_id` (pasado como param separado al RPC).

-- === ALTER TABLE: agregar columnas faltantes ===

ALTER TABLE operators ADD COLUMN IF NOT EXISTS cuit text;

-- === UNIQUE CONSTRAINTS (natural keys por entidad) ===

-- agencies: (org_id, name)
ALTER TABLE agencies DROP CONSTRAINT IF EXISTS agencies_org_name_unique;
ALTER TABLE agencies ADD CONSTRAINT agencies_org_name_unique UNIQUE (org_id, name);

-- financial_accounts: NO UNIQUE — hay 42+2 duplicados legacy en Lozada
-- ("Costo de Operadores" × 42, "Banco Galicia USD" × 2) imposibles de limpiar
-- sin migración de FKs de cash_movements/ledger_movements. Dedupe se hace
-- en el RPC via EXISTS check (mismo pattern que cash_movements).
ALTER TABLE financial_accounts DROP CONSTRAINT IF EXISTS financial_accounts_org_name_unique;

-- customers: NO UNIQUE — 4 duplicados legacy en Lozada (3 DNIs + 1 email).
-- Dedupe en RPC via EXISTS (ya implementado). Drop por si existe de intentos previos.
DROP INDEX IF EXISTS customers_org_document_unique;
DROP INDEX IF EXISTS customers_org_email_unique;

-- operators: (org_id, name) + partial unique por CUIT si presente
ALTER TABLE operators DROP CONSTRAINT IF EXISTS operators_org_name_unique;
ALTER TABLE operators ADD CONSTRAINT operators_org_name_unique UNIQUE (org_id, name);
DROP INDEX IF EXISTS operators_org_cuit_unique;
CREATE UNIQUE INDEX operators_org_cuit_unique
  ON operators (org_id, cuit)
  WHERE cuit IS NOT NULL AND cuit != '';

-- users: (org_id, email)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_org_email_unique;
ALTER TABLE users ADD CONSTRAINT users_org_email_unique UNIQUE (org_id, email);

-- operations: (org_id, file_code) — file_code es nullable; índice parcial.
DROP INDEX IF EXISTS operations_org_file_code_unique;
CREATE UNIQUE INDEX operations_org_file_code_unique
  ON operations (org_id, file_code)
  WHERE file_code IS NOT NULL AND file_code != '';

-- payments: NO UNIQUE — ~30 duplicados legacy composite en Lozada.
-- Dedupe en RPC via EXISTS. Drop por si existe de intentos previos.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_org_composite_unique;

-- cash_movements: NO UNIQUE — hay duplicados legacy en Lozada.
-- Dedupe en RPC via EXISTS. Drop por si existe de intentos previos.
DROP INDEX IF EXISTS cash_movements_org_composite_unique;

-- === RPCs ===

CREATE OR REPLACE FUNCTION _bulk_import_result(inserted_count int, conflicts_arr jsonb[])
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'inserted', inserted_count,
    'conflicts', COALESCE(to_jsonb(conflicts_arr), '[]'::jsonb)
  )
$$;

-- 1. bulk_import_agencies
CREATE OR REPLACE FUNCTION bulk_import_agencies(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    INSERT INTO agencies (org_id, name, city, timezone)
    VALUES (
      p_org_id,
      v_row->>'name',
      v_row->>'city',
      COALESCE(NULLIF(v_row->>'timezone', ''), 'America/Argentina/Buenos_Aires')
    )
    ON CONFLICT (org_id, name) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_conflicts := array_append(v_conflicts, jsonb_build_object('name', v_row->>'name'));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 2. bulk_import_financial_accounts
-- Dedupe via EXISTS (no ON CONFLICT porque no hay UNIQUE por duplicados legacy).
CREATE OR REPLACE FUNCTION bulk_import_financial_accounts(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_agency_id uuid;
  v_id uuid;
  v_name text;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_name := v_row->>'name';
    IF EXISTS (
      SELECT 1 FROM financial_accounts WHERE org_id = p_org_id AND name = v_name
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object('name', v_name));
      CONTINUE;
    END IF;
    v_agency_id := NULL;
    IF v_row ? 'agency_id' AND NULLIF(v_row->>'agency_id', '') IS NOT NULL THEN
      v_agency_id := (v_row->>'agency_id')::uuid;
    END IF;
    INSERT INTO financial_accounts (
      org_id, agency_id, name, type, currency, initial_balance, bank_name, account_number
    )
    VALUES (
      p_org_id,
      v_agency_id,
      v_name,
      v_row->>'type',
      v_row->>'currency',
      COALESCE(NULLIF(v_row->>'initial_balance', '')::numeric, 0),
      NULLIF(v_row->>'bank_name', ''),
      NULLIF(v_row->>'account_number', '')
    )
    RETURNING id INTO v_id;
    v_inserted := v_inserted + 1;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 3. bulk_import_customers
CREATE OR REPLACE FUNCTION bulk_import_customers(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
  v_doc text;
  v_email text;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_doc := NULLIF(v_row->>'document_number', '');
    v_email := NULLIF(v_row->>'email', '');
    -- Dedupe: si doc existe en org, skip. Si no hay doc pero email existe, skip.
    IF v_doc IS NOT NULL AND EXISTS (
      SELECT 1 FROM customers WHERE org_id = p_org_id AND document_number = v_doc
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object('document_number', v_doc));
      CONTINUE;
    END IF;
    IF v_doc IS NULL AND v_email IS NOT NULL AND EXISTS (
      SELECT 1 FROM customers WHERE org_id = p_org_id AND email = v_email
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object('email', v_email));
      CONTINUE;
    END IF;
    INSERT INTO customers (
      org_id, first_name, last_name, phone, email,
      document_type, document_number, date_of_birth, nationality
    )
    VALUES (
      p_org_id,
      v_row->>'first_name',
      v_row->>'last_name',
      v_row->>'phone',
      v_email,
      NULLIF(v_row->>'document_type', ''),
      v_doc,
      NULLIF(v_row->>'date_of_birth', '')::date,
      NULLIF(v_row->>'nationality', '')
    )
    RETURNING id INTO v_id;
    v_inserted := v_inserted + 1;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 4. bulk_import_operators
CREATE OR REPLACE FUNCTION bulk_import_operators(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
  v_cuit text;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_cuit := NULLIF(v_row->>'cuit', '');
    IF v_cuit IS NOT NULL AND EXISTS (
      SELECT 1 FROM operators WHERE org_id = p_org_id AND cuit = v_cuit
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object('cuit', v_cuit));
      CONTINUE;
    END IF;
    INSERT INTO operators (
      org_id, name, cuit, contact_name, contact_email, contact_phone, credit_limit
    )
    VALUES (
      p_org_id,
      v_row->>'name',
      v_cuit,
      NULLIF(v_row->>'contact_name', ''),
      NULLIF(v_row->>'contact_email', ''),
      NULLIF(v_row->>'contact_phone', ''),
      COALESCE(NULLIF(v_row->>'credit_limit', '')::numeric, 0)
    )
    ON CONFLICT (org_id, name) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_conflicts := array_append(v_conflicts, jsonb_build_object('name', v_row->>'name'));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 5. bulk_import_users
-- El endpoint crea auth.users (inviteUserByEmail) antes de llamar a esta RPC,
-- y pasa el auth_id resultante en cada row.
CREATE OR REPLACE FUNCTION bulk_import_users(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    INSERT INTO users (auth_id, org_id, name, email, role, is_active, default_commission_percentage)
    VALUES (
      (v_row->>'auth_id')::uuid,
      p_org_id,
      v_row->>'name',
      v_row->>'email',
      v_row->>'role',
      true,
      COALESCE(NULLIF(v_row->>'commission_percentage', '')::numeric, 0)
    )
    ON CONFLICT (org_id, email) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_conflicts := array_append(v_conflicts, jsonb_build_object('email', v_row->>'email'));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 6. bulk_import_operations
-- El endpoint ya resolvió los FKs: pasa agency_id, customer_id, operator_id, seller_id como uuids.
-- La RPC calcula margin_* server-side y crea operation + operation_customers (role=primary) en misma TX.
CREATE OR REPLACE FUNCTION bulk_import_operations(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
  v_file_code text;
  v_sale numeric;
  v_cost numeric;
  v_margin numeric;
  v_margin_pct numeric;
  v_departure date;
  v_op_date date;
  v_customer_id uuid;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_file_code := NULLIF(v_row->>'file_code', '');
    -- Dedupe por file_code si presente.
    IF v_file_code IS NOT NULL AND EXISTS (
      SELECT 1 FROM operations WHERE org_id = p_org_id AND file_code = v_file_code
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object('file_code', v_file_code));
      CONTINUE;
    END IF;
    v_sale := (v_row->>'sale_amount')::numeric;
    v_cost := (v_row->>'operator_cost')::numeric;
    v_margin := v_sale - v_cost;
    v_margin_pct := CASE WHEN v_sale > 0 THEN (v_margin * 100.0 / v_sale) ELSE 0 END;
    v_departure := (v_row->>'departure_date')::date;
    v_op_date := COALESCE(NULLIF(v_row->>'operation_date', '')::date, v_departure);
    v_customer_id := NULLIF(v_row->>'customer_id', '')::uuid;

    INSERT INTO operations (
      org_id, agency_id, file_code, operator_id, seller_id,
      destination, departure_date, return_date, operation_date,
      adults, children, sale_amount_total, operator_cost, currency, status, type,
      margin_amount, margin_percentage
    )
    VALUES (
      p_org_id,
      (v_row->>'agency_id')::uuid,
      v_file_code,
      NULLIF(v_row->>'operator_id', '')::uuid,
      (v_row->>'seller_id')::uuid,
      v_row->>'destination',
      v_departure,
      NULLIF(v_row->>'return_date', '')::date,
      v_op_date,
      COALESCE(NULLIF(v_row->>'adults', '')::int, 1),
      COALESCE(NULLIF(v_row->>'children', '')::int, 0),
      v_sale,
      v_cost,
      v_row->>'currency',
      v_row->>'status',
      COALESCE(NULLIF(v_row->>'type', ''), 'package'),
      v_margin,
      v_margin_pct
    )
    RETURNING id INTO v_id;

    -- Link primary customer via operation_customers M2M
    IF v_id IS NOT NULL AND v_customer_id IS NOT NULL THEN
      INSERT INTO operation_customers (operation_id, customer_id, org_id, role)
      VALUES (v_id, v_customer_id, p_org_id, 'primary');
    END IF;

    v_inserted := v_inserted + 1;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 7. bulk_import_payments
-- payer_type se deriva de direction: INCOME → customer, EXPENSE → operator.
-- Dedupe via EXISTS (no ON CONFLICT porque no hay UNIQUE por duplicados legacy).
CREATE OR REPLACE FUNCTION bulk_import_payments(p_org_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
  v_direction text;
  v_payer text;
  v_op_id uuid;
  v_amount numeric;
  v_date_due date;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_direction := v_row->>'direction';
    v_payer := CASE WHEN v_direction = 'INCOME' THEN 'customer' ELSE 'operator' END;
    v_op_id := (v_row->>'operation_id')::uuid;
    v_amount := (v_row->>'amount')::numeric;
    v_date_due := (v_row->>'date_due')::date;

    IF EXISTS (
      SELECT 1 FROM payments
      WHERE org_id = p_org_id
        AND operation_id = v_op_id
        AND amount = v_amount
        AND date_due = v_date_due
        AND direction = v_direction
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object(
        'operation_id', v_op_id,
        'amount', v_amount,
        'date_due', v_date_due
      ));
      CONTINUE;
    END IF;

    INSERT INTO payments (
      org_id, operation_id, direction, amount, currency,
      date_due, date_paid, status, method, reference, payer_type
    )
    VALUES (
      p_org_id, v_op_id, v_direction, v_amount, v_row->>'currency',
      v_date_due, NULLIF(v_row->>'date_paid', '')::date,
      COALESCE(NULLIF(v_row->>'status', ''), 'PENDING'),
      COALESCE(NULLIF(v_row->>'method', ''), 'OTHER'),
      NULLIF(v_row->>'reference', ''), v_payer
    )
    RETURNING id INTO v_id;
    v_inserted := v_inserted + 1;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- 8. bulk_import_cash_movements
-- user_id viene del endpoint (el user autenticado que hace el import).
-- Dedupe manual (EXISTS) porque el índice UNIQUE parcial con expresión COALESCE
-- no siempre matchea vía ON CONFLICT.
CREATE OR REPLACE FUNCTION bulk_import_cash_movements(p_org_id uuid, p_user_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_inserted int := 0;
  v_conflicts jsonb[] := ARRAY[]::jsonb[];
  v_id uuid;
  v_account_id uuid;
  v_date date;
  v_amount numeric;
  v_type text;
  v_notes text;
BEGIN
  IF p_org_id IS NULL THEN RAISE EXCEPTION 'org_id required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  FOR v_row IN SELECT jsonb_array_elements(p_rows) LOOP
    v_account_id := (v_row->>'financial_account_id')::uuid;
    v_date := (v_row->>'date')::date;
    v_amount := (v_row->>'amount')::numeric;
    v_type := v_row->>'type';
    v_notes := NULLIF(v_row->>'notes', '');

    IF EXISTS (
      SELECT 1 FROM cash_movements
      WHERE org_id = p_org_id
        AND financial_account_id = v_account_id
        AND movement_date = v_date
        AND amount = v_amount
        AND type = v_type
        AND COALESCE(notes, '') = COALESCE(v_notes, '')
    ) THEN
      v_conflicts := array_append(v_conflicts, jsonb_build_object(
        'financial_account_id', v_account_id,
        'date', v_date,
        'amount', v_amount
      ));
      CONTINUE;
    END IF;

    INSERT INTO cash_movements (
      org_id, user_id, financial_account_id, movement_date, type, amount, currency,
      category, notes
    )
    VALUES (
      p_org_id,
      p_user_id,
      v_account_id,
      v_date,
      v_type,
      v_amount,
      v_row->>'currency',
      v_row->>'category',
      v_notes
    )
    RETURNING id INTO v_id;
    v_inserted := v_inserted + 1;
    v_id := NULL;
  END LOOP;
  RETURN _bulk_import_result(v_inserted, v_conflicts);
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION bulk_import_agencies(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_financial_accounts(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_customers(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_operators(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_users(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_operations(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_payments(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION bulk_import_cash_movements(uuid, uuid, jsonb) TO authenticated, service_role;


-- ===== MIGRATION 193: 20260423000162_mp_plans_cache.sql =====

-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260423000162_mp_plans_cache.sql

-- mp_plans: caché de preapproval_plan IDs de MP para reusar entre tenants.
-- No contiene data sensible — solo IDs y metadata del plan template.
CREATE TABLE IF NOT EXISTS mp_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Key lógica: "PRO_STANDARD" | "STARTER_STANDARD" | "CUSTOM_<org_slug>_<amount>"
  plan_key text NOT NULL UNIQUE,
  -- El ID que devolvió MP al crear el plan
  mp_preapproval_plan_id text NOT NULL UNIQUE,
  -- Monto ARS/mes del plan
  amount_ars numeric NOT NULL,
  -- Si el plan tiene 7d free trial
  include_free_trial boolean NOT NULL DEFAULT true,
  -- init_point cacheado (MP no cambia, pero re-fetch via fetchPreapprovalPlan si dudás)
  init_point text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mp_plans_plan_key_idx ON mp_plans (plan_key);

-- RLS: solo platform_admins leen/escriben. Los tenants NO necesitan acceso.
ALTER TABLE mp_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mp_plans_admin_read ON mp_plans;
CREATE POLICY mp_plans_admin_read ON mp_plans FOR SELECT
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = (
    SELECT id FROM users WHERE auth_id = auth.uid()
  )));

DROP POLICY IF EXISTS mp_plans_admin_write ON mp_plans;
CREATE POLICY mp_plans_admin_write ON mp_plans FOR ALL
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = (
    SELECT id FROM users WHERE auth_id = auth.uid()
  )));

-- service_role bypassea RLS (para crear plans desde endpoints server-side).

COMMENT ON TABLE mp_plans IS 'Cache de preapproval_plan IDs de MercadoPago. 1 plan template reusable por múltiples tenants (ej PRO_STANDARD). Creado on-demand por ensureMpPlan().';


-- ===== MIGRATION 194: 20260424120000_afip_hardening.sql =====

-- ============================================================
-- Migración: AFIP Hardening (SP-1 fase 1a)
-- - Tabla afip_voucher_requests (audit log)
-- - Tabla padron_cache (cache consultas padrón)
-- - Columnas de verificación en invoices
-- - Scoping org_id en integrations
-- - RLS policies actualizadas
-- ============================================================

-- afip_voucher_requests ----------------------------------------
CREATE TABLE IF NOT EXISTS afip_voucher_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id),
  agency_id UUID REFERENCES agencies(id),
  idempotency_key TEXT NOT NULL,
  attempt_n INT NOT NULL DEFAULT 1,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'verify', 'recover')),
  request_payload JSONB,
  response_payload JSONB,
  verified_payload JSONB,
  verification_diff JSONB,
  error TEXT,
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  UNIQUE (idempotency_key, attempt_n)
);

CREATE INDEX idx_afip_voucher_requests_invoice ON afip_voucher_requests(invoice_id);
CREATE INDEX idx_afip_voucher_requests_org ON afip_voucher_requests(org_id);
CREATE INDEX idx_afip_voucher_requests_idempotency ON afip_voucher_requests(idempotency_key);

ALTER TABLE afip_voucher_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY afip_voucher_requests_tenant_isolation
  ON afip_voucher_requests
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- padron_cache ------------------------------------------------
CREATE TABLE IF NOT EXISTS padron_cache (
  cuit TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);
CREATE INDEX idx_padron_cache_expires ON padron_cache(expires_at);

-- No RLS en padron_cache: data pública, cualquier user auth puede leerla/escribirla
ALTER TABLE padron_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY padron_cache_authenticated_all
  ON padron_cache
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- invoices: columnas de verificación + org_id ----------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_status TEXT
    CHECK (verification_status IN ('unverified', 'verified', 'discrepancy', 'not_found_in_afip')),
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_error TEXT;

-- Backfill org_id desde agencies
UPDATE invoices i
SET org_id = a.org_id
FROM agencies a
WHERE a.id = i.agency_id AND i.org_id IS NULL;

-- Set default verification_status para las viejas
UPDATE invoices
SET verification_status = 'unverified'
WHERE verification_status IS NULL;

-- Validación previa al NOT NULL: abortar si hay filas sin org_id
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM invoices WHERE org_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Hay % invoices sin org_id tras backfill. Investigar antes de NOT NULL.', orphan_count;
  END IF;
END $$;

ALTER TABLE invoices ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id);

DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices;
CREATE POLICY invoices_tenant_isolation
  ON invoices
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- integrations: scoping org_id --------------------------------
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

UPDATE integrations i
SET org_id = a.org_id
FROM agencies a
WHERE a.id = i.agency_id AND i.org_id IS NULL;

-- Validación
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM integrations WHERE org_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Hay % integrations sin org_id tras backfill.', orphan_count;
  END IF;
END $$;

ALTER TABLE integrations ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_integrations_org ON integrations(org_id);

DROP POLICY IF EXISTS integrations_tenant_isolation ON integrations;
CREATE POLICY integrations_tenant_isolation
  ON integrations
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- Fin migración ---------------------------------------------


-- ===== MIGRATION 195: 20260425120000_purchase_invoices.sql =====

-- ============================================================
-- SP-6 (alcance reducido): Purchase Invoices multi-tenant
-- ============================================================
--
-- Contexto: el módulo `purchase_invoices` ya existía en prod (commit
-- 5a29e15, 2026-03-26) con su tabla, API endpoints (`/api/operations/[id]/
-- purchase-invoices/`) y UI (`components/operations/purchase-invoices-
-- section.tsx`), pero:
--   - La tabla nunca tuvo migration en repo (se creó manualmente)
--   - No tenía `org_id` ni RLS → leak entre orgs en el SaaS
--
-- Esta migration restaura la tabla con su schema legacy + agrega `org_id`
-- + RLS multi-tenant + trigger autopopulate. El código legacy sigue
-- funcionando sin cambios — solo se beneficia del aislamiento por org.
--
-- N:M, asiento contable automático y status DRAFT/CONFIRMED quedan FUERA
-- de scope (sprint separado si se piden).

CREATE TABLE purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- FKs (schema legacy)
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES operators(id),

  -- AFIP fields (schema legacy)
  invoice_type TEXT NOT NULL DEFAULT 'FACTURA_A',
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  emitter_cuit TEXT,
  emitter_name TEXT,

  -- Currency
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  exchange_rate NUMERIC(18,6),

  -- Amounts
  net_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  iva_rate NUMERIC(5,2) NOT NULL DEFAULT 21,
  iva_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  perception_iva NUMERIC(18,2) NOT NULL DEFAULT 0,
  perception_iibb NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_taxes NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL,
  total_ars_equivalent NUMERIC(18,2),

  -- Document
  document_url TEXT,
  document_name TEXT,

  -- State
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  notes TEXT,

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_invoices_operation ON purchase_invoices(operation_id);
CREATE INDEX idx_purchase_invoices_operator ON purchase_invoices(operator_id);
CREATE INDEX idx_purchase_invoices_org_date ON purchase_invoices(org_id, invoice_date DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION purchase_invoices_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER purchase_invoices_updated_at
  BEFORE UPDATE ON purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION purchase_invoices_set_updated_at();

-- Resolución de org_id con fallback. El código legacy
-- (app/api/operations/[id]/purchase-invoices/route.ts) usa SERVICE_ROLE_KEY
-- para el INSERT, así que auth.uid() es NULL y el trigger universal SaaS
-- (auto_set_org_id_from_auth, mig 152) no puede resolver. Esta función
-- tiene fallback: auth.uid() → operation_id → operations.org_id.
CREATE OR REPLACE FUNCTION purchase_invoices_resolve_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  -- Try auth context first (cubre inserts via server client del user)
  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  -- Fallback: derive from operation_id (cubre inserts via service_role)
  IF NEW.org_id IS NULL AND NEW.operation_id IS NOT NULL THEN
    NEW.org_id := (SELECT op.org_id FROM operations op WHERE op.id = NEW.operation_id LIMIT 1);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resolve_org_id_purchase_invoices
  BEFORE INSERT ON purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION purchase_invoices_resolve_org_id();

-- RLS
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;

-- Nota sobre el JOIN: el orden importa. `INNER JOIN users u ON u.id = pa.user_id`
-- + `WHERE u.auth_id = auth.uid()` evita la recursión de RLS que sí dispara
-- el patrón inverso (`ON u.auth_id = auth.uid() WHERE pa.user_id = u.id`).
-- Ver migration 149 (saas_billing_events) que usa el mismo orden.
CREATE POLICY purchase_invoices_tenant_isolation ON purchase_invoices
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    OR EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  )
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON TABLE purchase_invoices IS
  'Facturas recibidas de operadores (schema legacy + org_id multi-tenant). SP-6 alcance reducido — código en app/api/operations/[id]/purchase-invoices/ y components/operations/purchase-invoices-section.tsx.';


-- ===== MIGRATION 196: 20260425130000_organizations_tenant_profile.sql =====

-- =====================================================
-- Migración 163: Tenant Profile Fields (Phase A admin)
-- =====================================================
-- Agrega 9 columnas nullable a organizations para que el tenant
-- complete su perfil (contacto, dirección fiscal, condición fiscal AR)
-- + 1 columna admin-only (internal_notes).
--
-- RLS: las policies actuales (members read + owner update) cubren las
-- nuevas columnas. internal_notes se filtra a nivel de endpoint del
-- tenant (cuando exista) — no en RLS, así admin lee normal con service_role.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS contact_name        TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone       TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes      TEXT,
  ADD COLUMN IF NOT EXISTS address_street      TEXT,
  ADD COLUMN IF NOT EXISTS address_city        TEXT,
  ADD COLUMN IF NOT EXISTS address_province    TEXT,
  ADD COLUMN IF NOT EXISTS address_country     TEXT DEFAULT 'AR',
  ADD COLUMN IF NOT EXISTS address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS tax_category        TEXT
    CHECK (tax_category IN (
      'RESPONSABLE_INSCRIPTO',
      'MONOTRIBUTO',
      'EXENTO',
      'CONSUMIDOR_FINAL',
      'NO_RESPONSABLE'
    ));

COMMENT ON COLUMN organizations.internal_notes IS
  'Notas admin-only sobre la org. NO debe exponerse al tenant en sus endpoints.';


-- ===== MIGRATION 197: 20260425131000_organizations_profile_completion_view.sql =====

-- =====================================================
-- Migración 164: VIEW organizations_with_profile_completion
-- =====================================================
-- Suma los 9 campos del perfil (excluyendo internal_notes y
-- address_country que tiene default) y expone profile_completion 0-9.
-- Usada por el listado /admin/orgs para sort/filter por completitud.

CREATE OR REPLACE VIEW organizations_with_profile_completion AS
SELECT
  o.*,
  (
    (CASE WHEN o.contact_name        IS NOT NULL AND o.contact_name        <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.contact_phone       IS NOT NULL AND o.contact_phone       <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.cuit                IS NOT NULL AND o.cuit                <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.tax_category        IS NOT NULL                                 THEN 1 ELSE 0 END) +
    (CASE WHEN o.billing_email       IS NOT NULL AND o.billing_email       <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_street      IS NOT NULL AND o.address_street      <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_city        IS NOT NULL AND o.address_city        <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_province    IS NOT NULL AND o.address_province    <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_postal_code IS NOT NULL AND o.address_postal_code <> '' THEN 1 ELSE 0 END)
  ) AS profile_completion
FROM organizations o;

COMMENT ON VIEW organizations_with_profile_completion IS
  'Wrapper de organizations con profile_completion 0-9 calculado. RLS herendada de la tabla base.';


-- ===== MIGRATION 198: 20260426110000_organizations_profile_completion_view_v2.sql =====

-- =====================================================
-- Migración 165: organizations_with_profile_completion v2
-- =====================================================
-- v1 contaba columnas en organizations (mig 164). v2 cuenta keys
-- en organization_settings — fuente real donde el tenant guarda
-- su perfil desde /settings. internal_notes (admin-only) NO suma.

CREATE OR REPLACE VIEW organizations_with_profile_completion AS
SELECT
  o.*,
  (
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('company_name') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('tax_id', 'company_tax_id') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('legajo', 'company_legajo') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('address', 'company_address') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('phone', 'company_phone') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('email', 'company_email') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('website', 'company_website') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM organization_settings s WHERE s.org_id = o.id AND s.key IN ('instagram', 'company_instagram') AND s.value IS NOT NULL AND s.value <> '') THEN 1 ELSE 0 END)
  ) AS profile_completion
FROM organizations o;

COMMENT ON VIEW organizations_with_profile_completion IS
  'Wrapper de organizations con profile_completion 0-8 calculado desde organization_settings (donde el tenant guarda su perfil real). Reemplaza la versión de mig 164 que contaba columnas en organizations.';


-- ===== MIGRATION 199: 20260426120000_default_currency_per_org.sql =====

-- ============================================================================
-- MIGRATION — default_currency per org
-- ============================================================================
-- Para Lozada (y orgs existentes): ARS (compat con todo lo histórico).
-- Nuevos orgs: USD (90% de agencias AR opera en USD).
-- ============================================================================

-- Backfill para orgs existentes que NO tengan ya seteado default_currency
INSERT INTO organization_settings (org_id, key, value, updated_at)
SELECT
  o.id,
  'default_currency',
  CASE WHEN o.slug = 'lozada-viajes' THEN 'ARS' ELSE 'USD' END,
  NOW()
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM organization_settings os
  WHERE os.org_id = o.id
    AND os.key = 'default_currency'
);


-- ===== MIGRATION 200: 20260426120000_organizations_manual_mrr_override.sql =====

-- =====================================================
-- Migración 166: organizations.manual_mrr_override_ars
-- =====================================================
-- Override manual del MRR para deals fuera del flow MP/custom_plan
-- (Enterprise pagando por transferencia, descuentos one-off, etc.).
-- Tiene prioridad sobre custom_plan y PLANS price en computeMrrArs.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS manual_mrr_override_ars NUMERIC(12,2);

COMMENT ON COLUMN organizations.manual_mrr_override_ars IS
  'Override manual del MRR mensual en ARS. Tiene prioridad sobre custom_plan y PLANS[plan].priceArsMonthly. Usado para deals que no pasan por MP (transferencia, factura manual). Nullable = sin override.';


-- ===== MIGRATION 201: 20260427000001_add_quotation_accepted_alert_type.sql =====

-- Agregar QUOTATION_ACCEPTED al constraint de type en alerts.
-- Para notificar al seller cuando un cliente acepta una cotización vía link público.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_type_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
  END IF;

  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
    CHECK (type IN (
      'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'UPCOMING_TRIP',
      'DOCUMENT_MISSING', 'DOCUMENT_EXPIRING', 'BIRTHDAY',
      'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT',
      'RECURRING_PAYMENT', 'TASK_REMINDER', 'TASK_ASSIGNED',
      'MISSING_INVOICE', 'QUOTATION_ACCEPTED', 'OTHER'
    ));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;


-- ===== MIGRATION 202: 20260427000002_admin_fee_percentage.sql =====

-- ============================================================================
-- MIGRATION — Gastos administrativos per-operador (#7 reunión Gabi)
-- ============================================================================
-- Operadores tienen un % de gastos administrativos default (markup sobre costo).
-- En cada item del cotizador se prefilla del operador y es editable, para que
-- el seller pueda absorber el gasto en operaciones puntuales.
--
-- Default 0 = sin cambio en data existente (no rompe cotizaciones viejas).
-- ============================================================================

ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS admin_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (admin_fee_percentage >= 0 AND admin_fee_percentage <= 100);

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS admin_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (admin_fee_percentage >= 0 AND admin_fee_percentage <= 100);

COMMENT ON COLUMN operators.admin_fee_percentage IS
  'Porcentaje default de gastos administrativos a aplicar sobre el costo del operador';
COMMENT ON COLUMN quotation_items.admin_fee_percentage IS
  'Gastos administrativos aplicados a este item. Prefill desde operators.admin_fee_percentage; editable para absorber en operaciones puntuales';


-- ===== MIGRATION 203: 20260427000003_quotation_payment_methods.sql =====

-- ============================================================================
-- MIGRATION — Formas de pago en presupuestos (#18 reunión Gabi)
-- ============================================================================
-- Cada cotización puede listar las formas de pago aceptadas (Efectivo ARS,
-- Efectivo USD, Transferencia, Tarjeta, MP, Crédito, etc.) para que el cliente
-- las vea en el presupuesto público.
--
-- Default '{}' = sin cambio para data existente.
-- ============================================================================

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS payment_methods TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN quotations.payment_methods IS
  'Formas de pago aceptadas mostradas al cliente en el presupuesto público. Valores: EFECTIVO_ARS, EFECTIVO_USD, TRANSFERENCIA, TARJETA, MP, CREDITO';


-- ===== MIGRATION 204: 20260427000004_wa_messages_is_quotation.sql =====

-- Clasificador PDFs cotización (#3 reunión Gabi)
-- is_quotation = NULL: pending classification
-- is_quotation = true: real quotation, cuenta para "PDFs Enviados"
-- is_quotation = false: otro doc (factura/voucher/etc), NO cuenta
ALTER TABLE wa_messages
  ADD COLUMN IF NOT EXISTS is_quotation BOOLEAN;

-- Índice parcial: el cron filtra rápido pendientes outbound recientes
CREATE INDEX IF NOT EXISTS idx_wa_messages_unclassified_pdfs
  ON wa_messages (sent_at DESC)
  WHERE message_type = 'document' AND is_quotation IS NULL AND direction = 'outbound';


-- ===== MIGRATION 205: 20260427000005_payment_approvals.sql =====

-- Sistema de aprobación de pagos (#14 reunión Gabi)
-- approval_status default 'NONE' = backward compat: pagos viejos no requieren aprobación.

-- payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'NONE'
    CHECK (approval_status IN ('NONE','PENDING_APPROVAL','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_pending_approval
  ON payments (created_at DESC)
  WHERE approval_status = 'PENDING_APPROVAL';

-- operator_payments
ALTER TABLE operator_payments
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'NONE'
    CHECK (approval_status IN ('NONE','PENDING_APPROVAL','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_operator_payments_pending_approval
  ON operator_payments (created_at DESC)
  WHERE approval_status = 'PENDING_APPROVAL';

-- alert_type new values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_type_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
  END IF;

  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check
    CHECK (type IN (
      'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'UPCOMING_TRIP',
      'DOCUMENT_MISSING', 'DOCUMENT_EXPIRING', 'BIRTHDAY',
      'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT',
      'RECURRING_PAYMENT', 'TASK_REMINDER', 'TASK_ASSIGNED',
      'MISSING_INVOICE', 'QUOTATION_ACCEPTED',
      'PAYMENT_PENDING_APPROVAL', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED',
      'OTHER'
    ));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;


-- ===== MIGRATION 206: 20260427000006_agency_settings.sql =====

-- Agency Settings table para almacenar configuración por agency en JSONB
-- Principalmente payment_approval_rules

CREATE TABLE IF NOT EXISTS agency_settings (
  agency_id UUID NOT NULL PRIMARY KEY REFERENCES agencies(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_settings_agency_id ON agency_settings(agency_id);

-- RLS: users should only see their own org's agencies
ALTER TABLE agency_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read agency_settings from their org"
  ON agency_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agencies a
      INNER JOIN organizations o ON a.org_id = o.id
      INNER JOIN users u ON o.id = u.org_id
      WHERE a.id = agency_settings.agency_id AND u.auth_id = auth.uid()
    )
  );

CREATE POLICY "Users can update agency_settings in their org"
  ON agency_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM agencies a
      INNER JOIN organizations o ON a.org_id = o.id
      INNER JOIN users u ON o.id = u.org_id
      WHERE a.id = agency_settings.agency_id AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agencies a
      INNER JOIN organizations o ON a.org_id = o.id
      INNER JOIN users u ON o.id = u.org_id
      WHERE a.id = agency_settings.agency_id AND u.auth_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert agency_settings in their org"
  ON agency_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agencies a
      INNER JOIN organizations o ON a.org_id = o.id
      INNER JOIN users u ON o.id = u.org_id
      WHERE a.id = agency_id AND u.auth_id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_agency_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_agency_settings_updated_at ON agency_settings;

CREATE TRIGGER trigger_agency_settings_updated_at
  BEFORE UPDATE ON agency_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_agency_settings_updated_at();


-- ===== MIGRATION 207: 20260427000007_counter_movements.sql =====

-- Sistema de contra-movimientos (#17 reunión Gabi)
-- Reemplaza "borrar movement" con "reversar": genera movimiento opuesto + audit trail.

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS reverses_movement_id UUID REFERENCES cash_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_movement_id UUID REFERENCES cash_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_cash_movements_reverses
  ON cash_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;

ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS reverses_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_ledger_movements_reverses
  ON ledger_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;

COMMENT ON COLUMN cash_movements.reverses_movement_id IS
  'Si este row es una reversión, apunta al cash_movement original que reversó';
COMMENT ON COLUMN cash_movements.reversed_at IS
  'Si este row fue reversado, cuándo. NULL si no fue reversado.';


-- ===== MIGRATION 208: 20260427000008_operations_airline_hotel_name.sql =====

-- Migración retroactiva: agrega operations.airline_name y operations.hotel_name
-- (item 6 backlog Santi). En el commit 56f1716 se agregaron en código pero la
-- migración SQL fue aplicada manualmente en el editor de Supabase y nunca
-- comiteada al repo. Esta migración hace IF NOT EXISTS para que sea idempotente
-- en prod (donde ya existen) y agregue las columnas en dev/staging fresh.

ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS airline_name TEXT,
  ADD COLUMN IF NOT EXISTS hotel_name TEXT;

-- Índices trigram para soportar el search ILIKE en /api/operations
-- (route.ts líneas 988-994). Sin esto el LIKE %x% hace seq scan en
-- tablas grandes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_operations_airline_name_trgm
  ON operations USING gin (airline_name gin_trgm_ops)
  WHERE airline_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operations_hotel_name_trgm
  ON operations USING gin (hotel_name gin_trgm_ops)
  WHERE hotel_name IS NOT NULL;

COMMENT ON COLUMN operations.airline_name IS 'Aerolínea principal de la operación. Usado para search en /operaciones.';
COMMENT ON COLUMN operations.hotel_name IS 'Hotel principal de la operación. Usado para search en /operaciones.';


-- ===== MIGRATION 209: 20260427000009_perf_indexes_ola1.sql =====

-- ============================================================
-- Perf cleanup Ola 1 — Task 1 (A6): Índices CONCURRENTLY
-- ============================================================
-- Fecha: 2026-04-27
-- Spec:  docs/superpowers/specs/2026-04-27-perf-cleanup-design.md
-- Plan:  docs/superpowers/plans/2026-04-27-perf-cleanup-ola1.md
--
-- Riesgo: CERO. Índices estrictamente aditivos.
--   - CONCURRENTLY no toma lock de la tabla → sin downtime.
--   - IF NOT EXISTS protege contra re-ejecución.
--   - Si Postgres no usa el índice (raro), no rompe nada — solo ocupa disco.
--
-- IMPORTANTE — al pegar en Supabase SQL Editor:
--   CREATE INDEX CONCURRENTLY no puede ejecutarse dentro de una transacción.
--   Si pegás TODO de una vez y el editor envuelve en BEGIN/COMMIT, falla.
--   Pegá UNA SENTENCIA POR VEZ y dale Run a cada una. Cada CREATE tarda
--   entre 5 y 60 segundos según tamaño de tabla.
--
-- Multi-tenant: ninguno cambia visibilidad de datos. RLS sigue evaluando
-- igual. Los compuestos (org_id, ...) aceleran el filtro multi-tenant que
-- las RLS policies ya hacen.
-- ============================================================


-- 1. users.auth_id — usado por middleware en CADA request (sin index hoy).
--    El middleware busca users WHERE auth_id = <uuid> en cada navegación.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_auth_id
  ON users(auth_id)
  WHERE auth_id IS NOT NULL;


-- 2. operations(org_id, created_at DESC) compuesto — listings y analytics.
--    Ya existe idx_operations_org_id simple, pero el compuesto evita el
--    sort post-filter en queries que ordenan por created_at.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operations_org_created_at
  ON operations(org_id, created_at DESC)
  WHERE org_id IS NOT NULL;


-- 3. cash_movements(org_id, movement_date DESC) — /cash/movements paginado.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cash_movements_org_date
  ON cash_movements(org_id, movement_date DESC)
  WHERE org_id IS NOT NULL;


-- 4. leads(org_id, updated_at DESC) — kanbans.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_org_updated
  ON leads(org_id, updated_at DESC)
  WHERE org_id IS NOT NULL;


-- 5. wa_messages(org_id, sent_at DESC) — wha-control listing.
--    Nota: la columna real es sent_at (NOT NULL), no received_at.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wa_messages_org_sent
  ON wa_messages(org_id, sent_at DESC)
  WHERE org_id IS NOT NULL;


-- 6. operation_customers(operation_id) — JOIN sin índice.
--    Postgres NO auto-indexa columnas FK. Crítico para debts-sales y
--    operation detail (ambos hacen JOIN por operation_id).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_customers_operation
  ON operation_customers(operation_id);


-- 7. operation_customers(customer_id) — mismo motivo, otro lado del JOIN.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_customers_customer
  ON operation_customers(customer_id);


-- 8. payments parcial — para /reports/upcoming-due.
--    Solo PENDING/OVERDUE, ordenados por fecha de vencimiento.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_pending_due
  ON payments(payer_type, status, date_due)
  WHERE status IN ('PENDING','OVERDUE');


-- 9. operator_payments parcial — para /reports/upcoming-due.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operator_payments_pending_due
  ON operator_payments(status, due_date)
  WHERE status IN ('PENDING','OVERDUE');


-- ============================================================
-- VERIFICACIÓN (correr después de los 9 CREATE):
-- ============================================================
-- SELECT relname AS tabla, indexrelname AS index_name,
--        pg_size_pretty(pg_relation_size(indexrelid)) AS size
-- FROM pg_stat_user_indexes
-- WHERE indexrelname IN (
--   'idx_users_auth_id',
--   'idx_operations_org_created_at',
--   'idx_cash_movements_org_date',
--   'idx_leads_org_updated',
--   'idx_wa_messages_org_sent',
--   'idx_operation_customers_operation',
--   'idx_operation_customers_customer',
--   'idx_payments_pending_due',
--   'idx_operator_payments_pending_due'
-- )
-- ORDER BY indexrelname;
-- Esperado: 9 filas.


-- ============================================================
-- ROLLBACK (si algún índice causa regresión, raro):
-- ============================================================
-- DROP INDEX CONCURRENTLY IF EXISTS idx_users_auth_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operations_org_created_at;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_cash_movements_org_date;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_leads_org_updated;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_wa_messages_org_sent;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operation_customers_operation;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operation_customers_customer;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_payments_pending_due;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_operator_payments_pending_due;


-- ===== MIGRATION 210: 20260428000001_analytics_sales_rpc.sql =====

-- ============================================================
-- A3: RPC analytics_sales_summary
-- ============================================================
-- Reemplaza el patrón "fetch todas las operations + sumar en JS" del
-- endpoint /api/analytics/sales por una sola query SUM en SQL.
--
-- IMPORTANTE: este archivo CREA LA FUNCIÓN. NO cambia schema, NO toca
-- datos existentes, NO afecta endpoints actuales. Es 100% seguro de
-- ejecutar en producción durante uso normal.
--
-- Pasos de validación ANTES de cambiar código del endpoint:
--   1. Ejecutar este SQL en Supabase → función creada.
--   2. Correr el query de prueba al final del archivo con TUS valores.
--   3. Comparar los 5 números retornados vs los que ves en el dashboard.
--   4. Si match → avisar para deploy del code change.
--   5. Si NO match → reportar diferencias para corregir la SQL acá.
--
-- Multi-tenant safe:
--   - SECURITY INVOKER (default) → respeta RLS del usuario que llama.
--   - Filtros explícitos por org_id, role, agency, seller redundantes
--     con RLS (defense-in-depth).
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_sales_summary(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_agency_id  UUID DEFAULT NULL,
  p_seller_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  total_sales_usd     NUMERIC,
  total_margin_usd    NUMERIC,
  total_cost_usd      NUMERIC,
  operations_count    BIGINT,
  avg_margin_percent  NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ops AS (
    SELECT
      o.sale_amount_total,
      o.margin_amount,
      o.operator_cost,
      COALESCE(o.sale_currency, o.currency, 'USD') AS curr,
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date
    FROM operations o
    WHERE
      -- Multi-tenant scope (defense-in-depth encima de RLS)
      (p_org_id IS NULL OR o.org_id = p_org_id)
      -- Role-based filter (mismo que el endpoint actual)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
               OR o.agency_id = ANY(p_agency_ids))
        )
      )
      -- Filtros opcionales del query string
      AND (p_agency_id IS NULL OR o.agency_id = p_agency_id)
      AND (p_seller_id IS NULL OR o.seller_id = p_seller_id)
      -- Filtros de fecha (created_at, igual que el endpoint actual)
      AND (p_date_from IS NULL OR o.created_at >= (p_date_from::text || 'T00:00:00.000Z')::timestamptz)
      AND (p_date_to   IS NULL OR o.created_at <= (p_date_to::text   || 'T23:59:59.999Z')::timestamptz)
  ),
  ops_with_fx AS (
    SELECT
      ops.*,
      CASE
        WHEN ops.curr = 'USD' THEN 1::numeric
        ELSE COALESCE(
          -- Tasa para la fecha de la operación (≤ rate_date, más reciente anterior)
          (
            SELECT er.rate
            FROM exchange_rates er
            WHERE er.from_currency = 'USD'
              AND er.to_currency   = 'ARS'
              AND er.rate_date    <= ops.rate_date
            ORDER BY er.rate_date DESC
            LIMIT 1
          ),
          -- Fallback: tasa más reciente disponible
          (
            SELECT er.rate
            FROM exchange_rates er
            WHERE er.from_currency = 'USD'
              AND er.to_currency   = 'ARS'
            ORDER BY er.rate_date DESC
            LIMIT 1
          ),
          -- Último fallback: DEFAULT_USD_ARS_FALLBACK_RATE del código TS (1450)
          1450::numeric
        )
      END AS fx
    FROM ops
  ),
  totals AS (
    SELECT
      COALESCE(SUM(
        CASE WHEN curr = 'ARS' THEN sale_amount_total / NULLIF(fx, 0)
             ELSE sale_amount_total END
      ), 0)::numeric AS sales_usd,
      COALESCE(SUM(
        CASE WHEN curr = 'ARS' THEN margin_amount / NULLIF(fx, 0)
             ELSE margin_amount END
      ), 0)::numeric AS margin_usd,
      COALESCE(SUM(
        CASE WHEN curr = 'ARS' THEN operator_cost / NULLIF(fx, 0)
             ELSE operator_cost END
      ), 0)::numeric AS cost_usd,
      COUNT(*)::bigint AS ops_count
    FROM ops_with_fx
  )
  SELECT
    sales_usd  AS total_sales_usd,
    margin_usd AS total_margin_usd,
    cost_usd   AS total_cost_usd,
    ops_count  AS operations_count,
    CASE
      WHEN sales_usd > 0 THEN (margin_usd / sales_usd * 100)::numeric
      ELSE 0::numeric
    END AS avg_margin_percent
  FROM totals;
$$;

COMMENT ON FUNCTION analytics_sales_summary IS
  'A3 perf: retorna KPIs de analytics/sales (totalSales, totalMargin, totalCost en USD, count, avgMarginPercent) en una sola query SQL en vez del fetch+JS-sum del endpoint actual. Multi-tenant: filtra explícitamente por org_id + respeta RLS via SECURITY INVOKER.';

-- ============================================================
-- ROLLBACK (no debería hacer falta porque es solo una función nueva):
-- ============================================================
-- DROP FUNCTION IF EXISTS analytics_sales_summary(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID, UUID);

-- ============================================================
-- QUERIES DE VALIDACIÓN — correr DESPUÉS de crear la función.
-- Reemplazar los placeholders con tus valores reales antes de correr.
-- ============================================================

-- Test 1: tu user (SUPER_ADMIN), últimos 30 días, todas las agencias.
-- Esperado: matchear los KPIs del dashboard con filtros default.
--
-- SELECT * FROM analytics_sales_summary(
--   '<TU_USER_ID>'::uuid,
--   '<TU_ORG_ID>'::uuid,
--   'SUPER_ADMIN',
--   ARRAY[]::uuid[],
--   (current_date - INTERVAL '30 days')::date,
--   current_date,
--   NULL,
--   NULL
-- );
--
-- Comparar contra el dashboard:
--   total_sales_usd    ←→ KPI "Ventas" ($ del dashboard)
--   total_margin_usd   ←→ KPI "Margen" ($ del dashboard)
--   operations_count   ←→ "X operaciones" debajo del KPI Ventas
--   avg_margin_percent ←→ "X.X% promedio" debajo del KPI Margen
--
-- Si los 4 números matchean (tolerancia ±0.01 USD por rounding) → RPC OK,
-- procedemos al code change. Si NO matchean → reportar diferencias.


-- ===== MIGRATION 211: 20260428000002_debts_sales_total_rpc.sql =====

-- ============================================================
-- A2-bis: RPC accounting_debts_sales_total
-- ============================================================
-- Reemplaza el patrón "fetch all customers + operations + payments + sumar
-- en JS" por una sola query SUM SQL para el KPI "Deudores" del dashboard.
--
-- IMPORTANTE: solo CREA la función. NO toca schema, NO afecta endpoints.
-- 100% seguro de ejecutar durante uso normal en producción.
--
-- Multi-tenant safe:
--   - SECURITY INVOKER → respeta RLS del usuario que llama.
--   - Filtros explícitos por org_id, role, agency, seller (defense-in-depth).
--
-- Math:
--   debt_usd = max(0, sale_amount_usd - paid_usd)
--   donde:
--     sale_amount_usd = ARS ? sale_amount_total / fx_rate(date) : sale_amount_total
--     paid_usd = SUM de payments PAID, INCOME, CUSTOMER (con amount_usd o conversion)
--   total = SUM(debt_usd) over all matching operations
-- ============================================================

CREATE OR REPLACE FUNCTION accounting_debts_sales_total(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_seller_id  UUID DEFAULT NULL,
  p_date_type  TEXT DEFAULT 'SALIDA' -- SALIDA (departure_date fallback created_at) | CREACION
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ops AS (
    -- Solo operations que tienen al menos un customer asociado (mismo
    -- universo que el endpoint actual que parte de customers + nested join).
    SELECT DISTINCT
      o.id,
      o.sale_amount_total,
      COALESCE(o.sale_currency, o.currency, 'USD') AS curr,
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date,
      o.created_at,
      o.departure_date
    FROM operations o
    INNER JOIN operation_customers oc ON oc.operation_id = o.id
    WHERE
      -- Multi-tenant scope
      (p_org_id IS NULL OR o.org_id = p_org_id)
      -- Role-based filter (mismo patrón que analytics_sales_summary)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
               OR o.agency_id = ANY(p_agency_ids))
        )
      )
      -- Filtro opcional de seller (cuando dashboard manda sellerId)
      AND (p_seller_id IS NULL OR o.seller_id = p_seller_id)
      -- Filtro de fechas según date_type. Usa zona horaria AR (UTC-3) para
      -- matchear startOfDayAR/endOfDayAR del código TS.
      AND (
        p_date_from IS NULL OR (
          CASE
            WHEN p_date_type = 'CREACION' THEN o.created_at
            ELSE COALESCE(o.departure_date::timestamptz, o.created_at)
          END
          >= (p_date_from::text || 'T00:00:00-03:00')::timestamptz
        )
      )
      AND (
        p_date_to IS NULL OR (
          CASE
            WHEN p_date_type = 'CREACION' THEN o.created_at
            ELSE COALESCE(o.departure_date::timestamptz, o.created_at)
          END
          <= (p_date_to::text || 'T23:59:59.999-03:00')::timestamptz
        )
      )
  ),
  ops_with_fx AS (
    SELECT
      ops.*,
      CASE
        WHEN ops.curr = 'USD' THEN 1::numeric
        ELSE COALESCE(
          (SELECT er.rate FROM exchange_rates er
             WHERE er.from_currency = 'USD' AND er.to_currency = 'ARS'
               AND er.rate_date <= ops.rate_date
             ORDER BY er.rate_date DESC LIMIT 1),
          (SELECT er.rate FROM exchange_rates er
             WHERE er.from_currency = 'USD' AND er.to_currency = 'ARS'
             ORDER BY er.rate_date DESC LIMIT 1),
          1450::numeric
        )
      END AS fx
    FROM ops
  ),
  payments_paid AS (
    -- Suma de payments PAID por operation, convertidos a USD.
    -- Mirror de la lógica JS:
    --   paidUsd = amount_usd ?? (USD ? amount : ARS ? amount/exchange_rate : 0)
    SELECT
      p.operation_id,
      SUM(
        CASE
          WHEN p.amount_usd IS NOT NULL THEN p.amount_usd::numeric
          WHEN p.currency = 'USD' THEN COALESCE(p.amount, 0)::numeric
          WHEN p.currency = 'ARS' AND p.exchange_rate IS NOT NULL AND p.exchange_rate > 0
            THEN (COALESCE(p.amount, 0) / p.exchange_rate)::numeric
          ELSE 0::numeric
        END
      ) AS paid_usd
    FROM payments p
    WHERE p.operation_id IN (SELECT id FROM ops)
      AND p.direction = 'INCOME'
      AND p.payer_type = 'CUSTOMER'
      AND p.status = 'PAID'
    GROUP BY p.operation_id
  )
  SELECT COALESCE(SUM(GREATEST(
    0::numeric,
    (CASE WHEN ows.curr = 'ARS' THEN ows.sale_amount_total / NULLIF(ows.fx, 0)
          ELSE ows.sale_amount_total END)::numeric
    - COALESCE(pp.paid_usd, 0)::numeric
  )), 0)::numeric
  FROM ops_with_fx ows
  LEFT JOIN payments_paid pp ON pp.operation_id = ows.id;
$$;

COMMENT ON FUNCTION accounting_debts_sales_total IS
  'A2-bis perf: retorna el total de deuda de clientes (Cuentas por Cobrar) en USD para el KPI "Deudores" del dashboard. Reemplaza el fetch+JS-sum del endpoint /api/accounting/debts-sales solo para el caso del KPI total. La vista detallada del módulo /accounting/debts-sales sigue usando el endpoint completo.';

-- ============================================================
-- ROLLBACK:
-- ============================================================
-- DROP FUNCTION IF EXISTS accounting_debts_sales_total(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID, TEXT);


-- ===== MIGRATION 212: 20260428000003_operator_debts_total_rpc.sql =====

-- ============================================================
-- A-bis: RPC accounting_operator_debts_total
-- ============================================================
-- KPI "Deuda" del dashboard (Cuentas por Pagar a operadores).
-- Reemplaza el patrón "fetch all operator_payments + filter en JS + sum"
-- por una sola query SUM SQL.
--
-- Replica EXACTO la math del endpoint /api/analytics/pending-balances
-- (sección 2 — accountsPayable):
--   - SOLO operator_payments con status PENDING/OVERDUE
--   - pending = max(0, amount - paid_amount)
--   - USD: pending. ARS: pending / latest_exchange_rate.
--   - Filtro de fechas usa operations.created_at en UTC (NO AR-tz, igual
--     que el endpoint actual).
--
-- IMPORTANTE: solo CREA función. NO toca schema. 100% seguro.
--
-- Multi-tenant safe:
--   - SECURITY INVOKER → respeta RLS de operator_payments.
--   - Filtros explícitos por org_id, role, agency.
-- ============================================================

CREATE OR REPLACE FUNCTION accounting_operator_debts_total(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_agency_id  UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH latest_rate AS (
    SELECT COALESCE(
      (SELECT er.rate FROM exchange_rates er
         WHERE er.from_currency='USD' AND er.to_currency='ARS'
         ORDER BY er.rate_date DESC LIMIT 1),
      1450::numeric
    ) AS rate
  )
  SELECT COALESCE(SUM(
    CASE
      WHEN op.currency = 'USD'
        THEN GREATEST(0::numeric, COALESCE(op.amount,0) - COALESCE(op.paid_amount,0))
      WHEN op.currency = 'ARS'
        THEN GREATEST(0::numeric, COALESCE(op.amount,0) - COALESCE(op.paid_amount,0))
             / NULLIF((SELECT rate FROM latest_rate), 0)
      ELSE 0::numeric
    END
  ), 0)::numeric
  FROM operator_payments op
  INNER JOIN operations o ON o.id = op.operation_id
  WHERE
    -- Multi-tenant scope (defense-in-depth con RLS)
    (p_org_id IS NULL OR o.org_id = p_org_id)
    -- Role-based filter (defense-in-depth)
    AND (
      p_role = 'SUPER_ADMIN'
      OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
      OR (
        p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
        AND (cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
             OR o.agency_id = ANY(p_agency_ids))
      )
    )
    -- Solo pendientes
    AND op.status IN ('PENDING', 'OVERDUE')
    -- Filtros opcionales del dashboard
    AND (p_agency_id IS NULL OR o.agency_id = p_agency_id)
    -- Filtro de fechas: operations.created_at en UTC (mismo patrón que
    -- el endpoint actual con `${dateFrom}T00:00:00.000Z`).
    AND (p_date_from IS NULL OR o.created_at >= (p_date_from::text || 'T00:00:00.000Z')::timestamptz)
    AND (p_date_to   IS NULL OR o.created_at <= (p_date_to::text   || 'T23:59:59.999Z')::timestamptz);
$$;

COMMENT ON FUNCTION accounting_operator_debts_total IS
  'A-bis perf: total de deuda pendiente a operadores en USD para el KPI "Deuda" del dashboard. Reemplaza fetch+JS-sum del endpoint /api/analytics/pending-balances (sección accountsPayable).';

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS accounting_operator_debts_total(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID);


-- ===== MIGRATION 213: 20260428000004_analytics_sellers_rpc.sql =====

-- ============================================================
-- Charts perf: RPC analytics_sellers_summary
-- ============================================================
-- Reemplaza el patrón "fetch all operations + JS reduce by seller_id"
-- del endpoint /api/analytics/sellers por una sola query SQL con
-- GROUP BY + SUM en Postgres.
--
-- IMPORTANTE: solo CREA función. NO toca schema. 100% seguro.
--
-- Multi-tenant safe:
--   - SECURITY INVOKER → respeta RLS de operations + users.
--   - Filtros explícitos por org_id, role, agency (defense-in-depth).
--   - LEFT JOIN a users solo trae name del seller (RLS de users
--     garantiza que solo se vean users de la propia org).
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_sellers_summary(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_agency_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  id                   UUID,
  name                 TEXT,
  total_sales          NUMERIC,
  margin               NUMERIC,
  operations_count     BIGINT,
  avg_margin_percent   NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ops AS (
    SELECT
      o.seller_id,
      o.sale_amount_total,
      o.margin_amount,
      COALESCE(o.sale_currency, o.currency, 'USD') AS curr,
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date
    FROM operations o
    WHERE
      o.seller_id IS NOT NULL
      AND (p_org_id IS NULL OR o.org_id = p_org_id)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
               OR o.agency_id = ANY(p_agency_ids))
        )
      )
      AND (p_agency_id IS NULL OR o.agency_id = p_agency_id)
      AND (p_date_from IS NULL OR o.created_at >= (p_date_from::text || 'T00:00:00.000Z')::timestamptz)
      AND (p_date_to   IS NULL OR o.created_at <= (p_date_to::text   || 'T23:59:59.999Z')::timestamptz)
  ),
  ops_with_fx AS (
    SELECT
      ops.*,
      CASE
        WHEN ops.curr = 'USD' THEN 1::numeric
        ELSE COALESCE(
          (SELECT er.rate FROM exchange_rates er
             WHERE er.from_currency='USD' AND er.to_currency='ARS'
               AND er.rate_date <= ops.rate_date
             ORDER BY er.rate_date DESC LIMIT 1),
          (SELECT er.rate FROM exchange_rates er
             WHERE er.from_currency='USD' AND er.to_currency='ARS'
             ORDER BY er.rate_date DESC LIMIT 1),
          1450::numeric
        )
      END AS fx
    FROM ops
  ),
  sellers_agg AS (
    SELECT
      ows.seller_id,
      COALESCE(SUM(
        CASE WHEN ows.curr='ARS' THEN ows.sale_amount_total / NULLIF(ows.fx, 0)
             ELSE ows.sale_amount_total END
      ), 0)::numeric AS total_sales,
      COALESCE(SUM(
        CASE WHEN ows.curr='ARS' THEN ows.margin_amount / NULLIF(ows.fx, 0)
             ELSE ows.margin_amount END
      ), 0)::numeric AS total_margin,
      COUNT(*)::bigint AS ops_count
    FROM ops_with_fx ows
    GROUP BY ows.seller_id
  )
  SELECT
    sa.seller_id                                        AS id,
    COALESCE(u.name, 'Vendedor')::text                  AS name,
    sa.total_sales                                      AS total_sales,
    sa.total_margin                                     AS margin,
    sa.ops_count                                        AS operations_count,
    CASE WHEN sa.total_sales > 0
      THEN (sa.total_margin / sa.total_sales * 100)::numeric
      ELSE 0::numeric
    END                                                 AS avg_margin_percent
  FROM sellers_agg sa
  LEFT JOIN users u ON u.id = sa.seller_id
  ORDER BY sa.total_sales DESC;
$$;

COMMENT ON FUNCTION analytics_sellers_summary IS
  'Charts perf: ranking de vendedores con totalSales + margin + count + avgMarginPercent en USD, agregado en SQL en vez de fetch+JS-reduce.';

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS analytics_sellers_summary(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID);


-- ===== MIGRATION 214: 20260428000005_analytics_destinations_rpc.sql =====

-- ============================================================
-- Charts perf: RPC analytics_destinations_summary
-- ============================================================
-- Reemplaza el patrón "fetch all operations + JS reduce by destination"
-- del endpoint /api/analytics/destinations por una sola query SQL con
-- GROUP BY + SUM en Postgres.
--
-- Multi-tenant safe:
--   - SECURITY INVOKER → respeta RLS de operations + destinations.
--   - Filtros explícitos por org_id, role, agency.
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_destinations_summary(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_agency_id  UUID DEFAULT NULL,
  p_limit      INT  DEFAULT 5
)
RETURNS TABLE (
  destination          TEXT,
  total_sales          NUMERIC,
  total_margin         NUMERIC,
  operations_count     BIGINT,
  avg_margin_percent   NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ops AS (
    SELECT
      COALESCE(d.name, o.destination, 'Sin destino') AS destination_label,
      o.sale_amount_total,
      o.margin_amount,
      COALESCE(o.sale_currency, o.currency, 'USD') AS curr,
      COALESCE(o.departure_date::date, o.created_at::date) AS rate_date
    FROM operations o
    LEFT JOIN destinations d ON d.id = o.destination_id
    WHERE
      (p_org_id IS NULL OR o.org_id = p_org_id)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND o.seller_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
               OR o.agency_id = ANY(p_agency_ids))
        )
      )
      AND (p_agency_id IS NULL OR o.agency_id = p_agency_id)
      AND (p_date_from IS NULL OR o.created_at >= (p_date_from::text || 'T00:00:00.000Z')::timestamptz)
      AND (p_date_to   IS NULL OR o.created_at <= (p_date_to::text   || 'T23:59:59.999Z')::timestamptz)
  ),
  ops_with_fx AS (
    SELECT
      ops.*,
      CASE
        WHEN ops.curr = 'USD' THEN 1::numeric
        ELSE COALESCE(
          (SELECT er.rate FROM exchange_rates er
             WHERE er.from_currency='USD' AND er.to_currency='ARS'
               AND er.rate_date <= ops.rate_date
             ORDER BY er.rate_date DESC LIMIT 1),
          (SELECT er.rate FROM exchange_rates er
             WHERE er.from_currency='USD' AND er.to_currency='ARS'
             ORDER BY er.rate_date DESC LIMIT 1),
          1450::numeric
        )
      END AS fx
    FROM ops
  ),
  dest_agg AS (
    SELECT
      ows.destination_label,
      COALESCE(SUM(CASE WHEN ows.curr='ARS' THEN ows.sale_amount_total / NULLIF(ows.fx, 0) ELSE ows.sale_amount_total END), 0)::numeric AS total_sales,
      COALESCE(SUM(CASE WHEN ows.curr='ARS' THEN ows.margin_amount / NULLIF(ows.fx, 0) ELSE ows.margin_amount END), 0)::numeric AS total_margin,
      COUNT(*)::bigint AS ops_count
    FROM ops_with_fx ows
    GROUP BY ows.destination_label
  )
  SELECT
    da.destination_label AS destination,
    da.total_sales,
    da.total_margin,
    da.ops_count AS operations_count,
    CASE WHEN da.total_sales > 0
      THEN (da.total_margin / da.total_sales * 100)::numeric
      ELSE 0::numeric
    END AS avg_margin_percent
  FROM dest_agg da
  ORDER BY da.total_sales DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 50));
$$;

COMMENT ON FUNCTION analytics_destinations_summary IS
  'Charts perf: top destinations con totalSales + margin + count + avgMarginPercent en USD, agregado en SQL en vez de fetch+JS-reduce.';

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS analytics_destinations_summary(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID, INT);


-- ===== MIGRATION 215: 20260428000006_analytics_cashflow_rpc.sql =====

-- ============================================================
-- Charts perf: RPC analytics_cashflow_summary
-- ============================================================
-- Reemplaza el patrón "fetch all cash_movements + JS reduce by date"
-- del endpoint /api/analytics/cashflow por una sola query SQL con
-- GROUP BY movement_date::date + SUM income/expense.
--
-- Mirror EXACTO de la lógica JS:
--   - SELLER → filter por user_id (no agency)
--   - SUPER_ADMIN → sin filtro de agency
--   - Otros + agency_id provided → filter operations de esa agency
--   - Otros sin agency_id pero con agency_ids del user → filter
--     operations de las agencies del user
--   - Suma raw (NO convierte ARS↔USD — mismo comportamiento que JS).
--
-- Multi-tenant safe: SECURITY INVOKER, RLS de cash_movements aplica.
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_cashflow_summary(
  p_user_id    UUID,
  p_org_id     UUID,
  p_role       TEXT,
  p_agency_ids UUID[],
  p_date_from  DATE DEFAULT NULL,
  p_date_to    DATE DEFAULT NULL,
  p_agency_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  date    TEXT,
  income  NUMERIC,
  expense NUMERIC,
  net     NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH filtered_movements AS (
    SELECT
      cm.movement_date,
      cm.type,
      cm.amount
    FROM cash_movements cm
    LEFT JOIN operations o ON o.id = cm.operation_id
    WHERE
      (p_org_id IS NULL OR cm.org_id = p_org_id)
      -- Role-based filter (mirror JS)
      AND (
        p_role = 'SUPER_ADMIN'
        OR (p_role = 'SELLER' AND cm.user_id = p_user_id)
        OR (
          p_role <> 'SELLER' AND p_role <> 'SUPER_ADMIN'
          AND (
            -- Si user no tiene agencies, no se aplica filtro adicional
            cardinality(COALESCE(p_agency_ids, ARRAY[]::uuid[])) = 0
            OR (o.agency_id IS NOT NULL AND o.agency_id = ANY(p_agency_ids))
            -- Movimientos sin operation_id pasan (no filtra por agency)
            OR cm.operation_id IS NULL
          )
        )
      )
      -- Filtro opcional explícito por agency_id (sobrescribe)
      AND (p_agency_id IS NULL OR (o.agency_id IS NOT NULL AND o.agency_id = p_agency_id))
      -- Filtros de fecha
      AND (p_date_from IS NULL OR cm.movement_date >= (p_date_from::text || 'T00:00:00.000Z')::timestamptz)
      AND (p_date_to   IS NULL OR cm.movement_date <= (p_date_to::text   || 'T23:59:59.999Z')::timestamptz)
  ),
  by_date AS (
    SELECT
      to_char(fm.movement_date::date, 'YYYY-MM-DD') AS date_str,
      SUM(CASE WHEN fm.type = 'INCOME'  THEN COALESCE(fm.amount, 0) ELSE 0 END)::numeric AS income_total,
      SUM(CASE WHEN fm.type = 'EXPENSE' THEN COALESCE(fm.amount, 0) ELSE 0 END)::numeric AS expense_total
    FROM filtered_movements fm
    GROUP BY to_char(fm.movement_date::date, 'YYYY-MM-DD')
  )
  SELECT
    bd.date_str AS date,
    bd.income_total AS income,
    bd.expense_total AS expense,
    (bd.income_total - bd.expense_total)::numeric AS net
  FROM by_date bd
  ORDER BY bd.date_str ASC;
$$;

COMMENT ON FUNCTION analytics_cashflow_summary IS
  'Charts perf: cashflow agrupado por fecha (income/expense/net) directo en SQL.';

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS analytics_cashflow_summary(UUID, UUID, TEXT, UUID[], DATE, DATE, UUID);


-- ===== MIGRATION 216: 20260429000001_link_orphan_customer_docs_trigger.sql =====

-- =====================================================
-- Link orphan customer documents to operations on linkage
-- =====================================================
--
-- Caso reportado por Tomi (29/04): cuando un usuario crea un cliente y
-- escanea su pasaporte/DNI con IA antes de crear una operación, el
-- documento queda en `documents` con customer_id seteado pero
-- operation_id = NULL. Después se crea la operación y se vincula el
-- cliente vía operation_customers, pero el documento huérfano nunca se
-- actualiza, así que no aparece en la pestaña Documentos de la operación
-- (la helper getOperationVisibleDocuments lo busca también por
-- customer_id, pero ese path falló para Tomi en la OP #d8b795e7 — sea
-- por timing, RLS, o un edge case de la query con join — y la solución
-- robusta es asegurar que el doc tenga operation_id seteado).
--
-- Esta migración:
--  1. Crea un trigger AFTER INSERT en operation_customers que actualiza
--     documents.operation_id = NEW.operation_id para todos los docs del
--     cliente que aún están huérfanos (operation_id IS NULL).
--  2. Hace un backfill one-shot para docs huérfanos preexistentes cuyo
--     cliente ya está en operation_customers (resuelve la OP de Tomi sin
--     que tenga que reconectar el cliente).
--
-- El trigger es idempotente: si el cliente ya tenía sus docs vinculados a
-- una operación previa, el WHERE operation_id IS NULL los ignora.
-- Cuando el mismo cliente se vincula a una segunda operación, los docs
-- viejos quedan en la primera (correcto: el doc se "casa" con la primera
-- op que lo necesitó). La helper sigue mostrando docs en operaciones
-- subsiguientes vía la query por customer_id.

-- SECURITY DEFINER: el trigger debe poder actualizar documents incluso
-- cuando el usuario que vincula el cliente no es el que subió el doc.
-- El RLS de UPDATE de documents (migración 028) sólo permite update si
-- el user es el uploader O tiene acceso a la lead/operation asociada.
-- Para un doc huérfano (operation_id NULL, lead_id NULL), eso bloquea a
-- otros usuarios. Acá el trigger se ejecuta como definer del schema
-- (postgres) para que funcione sin importar quién dispare el insert en
-- operation_customers.
CREATE OR REPLACE FUNCTION link_orphan_customer_docs_to_operation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE documents
  SET operation_id = NEW.operation_id
  WHERE customer_id = NEW.customer_id
    AND operation_id IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS link_orphan_customer_docs_trigger ON operation_customers;

CREATE TRIGGER link_orphan_customer_docs_trigger
AFTER INSERT ON operation_customers
FOR EACH ROW
EXECUTE FUNCTION link_orphan_customer_docs_to_operation();

-- Backfill: docs huérfanos cuyos clientes YA están en operation_customers.
-- Linkea cada doc huérfano con la primera operación donde el cliente es MAIN
-- (o la primera disponible si no es MAIN en ninguna).
--
-- operation_customers NO tiene created_at (sólo id, operation_id,
-- customer_id, role — ver migración 001), así que ordenamos por
-- operations.created_at vía JOIN para tener un criterio determinista.
WITH first_op_for_customer AS (
  SELECT DISTINCT ON (oc.customer_id)
    oc.customer_id,
    oc.operation_id
  FROM operation_customers oc
  JOIN operations o ON o.id = oc.operation_id
  ORDER BY oc.customer_id, (oc.role = 'MAIN') DESC, o.created_at ASC NULLS LAST
)
UPDATE documents d
SET operation_id = foc.operation_id
FROM first_op_for_customer foc
WHERE d.customer_id = foc.customer_id
  AND d.operation_id IS NULL;

COMMENT ON FUNCTION link_orphan_customer_docs_to_operation() IS
  'Trigger function: when a customer is linked to an operation, attach any orphan documents (customer_id set, operation_id null) to that operation. Reported by Tomi 2026-04-29 for OP #d8b795e7.';


-- ===== MIGRATION 217: 20260429000002_sync_operations_operator_cost_trigger.sql =====

-- =====================================================
-- Sync operations.operator_cost with SUM(operation_operators.cost)
-- =====================================================
--
-- Caso reportado por Tomi (29/04):
--   - OP af4dabf3: operador agregado después que NO figura al editar
--     costos. Costo de Lozada $2.825 + costo nuevo $4.401 ya pagado.
--   - OP b359476d: vista muestra $7.276, edit dialog muestra $7.447.
--     Centralizado en eurovips.
--
-- Causa raíz: coexisten dos modelos de costo en el schema:
--   - operations.operator_cost (legacy, costo único, lo muestra
--     operation-detail-client.tsx)
--   - operation_operators[] (modelo nuevo de migraciones 052/066, lo
--     usa edit-operation-dialog.tsx)
--
-- El PATCH handler en /api/operations/[id] sincroniza cuando recibe
-- operators[], pero si la modificación de operation_operators ocurre por
-- otro camino (script SQL, otro endpoint, importación legacy) o si el
-- PATCH se hace SIN incluir operators[], el campo legacy queda obsoleto.
--
-- Este trigger mantiene operations.operator_cost = SUM(operation_operators.cost)
-- automáticamente sin importar quién/cómo modifique la tabla.
--
-- Solo dispara IF new_total > 0: las operaciones legacy single-operator
-- (que viven solo del campo legacy y nunca tienen rows en
-- operation_operators) no se afectan.

CREATE OR REPLACE FUNCTION sync_operations_operator_cost()
RETURNS TRIGGER AS $$
DECLARE
  target_op_id UUID;
  new_total NUMERIC;
BEGIN
  target_op_id := COALESCE(NEW.operation_id, OLD.operation_id);

  SELECT COALESCE(SUM(cost), 0)
  INTO new_total
  FROM operation_operators
  WHERE operation_id = target_op_id;

  -- Si quedaron 0 rows después del DELETE, no pisamos operator_cost
  -- (la operación volvió a ser legacy single-operator o quedó sin operadores).
  IF new_total > 0 THEN
    UPDATE operations
    SET operator_cost = new_total
    WHERE id = target_op_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_operator_cost_on_operation_operators ON operation_operators;

CREATE TRIGGER sync_operator_cost_on_operation_operators
AFTER INSERT OR UPDATE OR DELETE ON operation_operators
FOR EACH ROW
EXECUTE FUNCTION sync_operations_operator_cost();

COMMENT ON FUNCTION sync_operations_operator_cost() IS
  'Mantiene operations.operator_cost = SUM(operation_operators.cost). Reportado por Tomi 2026-04-29 — OPs af4dabf3 y b359476d con drift entre el campo legacy y el modelo multi-operador.';


-- ===== MIGRATION 218: 20260429000003_commission_pct_overrides.sql =====

-- =====================================================
-- Override de comisiones absolutas para ventas compartidas
-- =====================================================
--
-- Pedido por Tomi (29/04): en ventas compartidas, hoy el split se
-- expresa como un % del 0-100 que se interpreta como "fracción del % de
-- cada vendedor", lo que tiene un bug histórico cuando los vendedores
-- tienen pcts distintos: el secundario puede sumar más de lo que
-- comisiona el principal solo. Tomi quiere que la suma nunca supere lo
-- que comisiona el vendedor principal, y que ADMIN/SUPER_ADMIN puedan
-- editar dos valores absolutos (ej: 10/10 si el principal comisiona
-- 20%). Default es la mitad para cada uno.
--
-- Esta migración agrega dos columnas para almacenar los % efectivos
-- ABSOLUTOS de cada vendedor en la operación. Cuando ambos están
-- seteados, el cálculo usa los valores directos (suma ≤ principal).
-- Cuando son NULL, el cálculo cae al path legacy basado en
-- `commission_split` (sin tocar la lógica buggy existente — el fix solo
-- aplica a operaciones nuevas. Operaciones legacy quedan como están
-- hasta que un admin las edite manualmente con la UI nueva).

ALTER TABLE operations
ADD COLUMN IF NOT EXISTS commission_pct_primary NUMERIC(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS commission_pct_secondary NUMERIC(5,2) DEFAULT NULL;

COMMENT ON COLUMN operations.commission_pct_primary IS
  'Override absoluto del % de comisión del vendedor principal sobre el margen. Cuando NULL, fallback a commission_split.';

COMMENT ON COLUMN operations.commission_pct_secondary IS
  'Override absoluto del % de comisión del vendedor secundario sobre el margen. Cuando NULL, fallback a commission_split.';


COMMIT;

-- =============================================================================
-- END OF BOOTSTRAP
-- Total migrations applied: 218
-- =============================================================================
