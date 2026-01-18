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
