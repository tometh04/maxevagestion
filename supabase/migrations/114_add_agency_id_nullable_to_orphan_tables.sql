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
