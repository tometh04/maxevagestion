-- Agregar campo commission_split a operations
-- Representa el % de comisión que se lleva el vendedor principal (default 50%)
-- El vendedor secundario recibe 100 - commission_split
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS commission_split NUMERIC(5,2) DEFAULT 50;

COMMENT ON COLUMN operations.commission_split IS 'Porcentaje de comisión para el vendedor principal (0-100). El secundario recibe el resto.';
