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

