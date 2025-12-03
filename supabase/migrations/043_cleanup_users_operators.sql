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

