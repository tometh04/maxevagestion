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

