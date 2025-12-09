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

