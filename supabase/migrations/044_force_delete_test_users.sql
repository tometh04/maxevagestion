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

