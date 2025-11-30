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

