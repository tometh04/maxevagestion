-- =====================================================
-- Script SQL: Borrar TODOS los leads de Trello
-- =====================================================
-- Ejecutar este script en Supabase SQL Editor
-- o usar el script delete-all-trello-leads.ts

BEGIN;

-- Verificar conteo antes
DO $$
DECLARE
  trello_leads_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO trello_leads_count FROM leads WHERE source = 'Trello';
  RAISE NOTICE '📊 Leads de Trello encontrados: %', trello_leads_count;
END $$;

-- Borrar documentos asociados
DELETE FROM documents
WHERE lead_id IN (SELECT id FROM leads WHERE source = 'Trello');

-- Borrar alertas asociadas
DELETE FROM alerts
WHERE lead_id IN (SELECT id FROM leads WHERE source = 'Trello');

-- Borrar comunicaciones asociadas
DELETE FROM communications
WHERE lead_id IN (SELECT id FROM leads WHERE source = 'Trello');

-- Borrar cotizaciones asociadas
DELETE FROM quotations
WHERE lead_id IN (SELECT id FROM leads WHERE source = 'Trello');

-- Limpiar referencias en ledger_movements
UPDATE ledger_movements
SET lead_id = NULL
WHERE lead_id IN (SELECT id FROM leads WHERE source = 'Trello');

-- Limpiar referencias en operations
UPDATE operations
SET lead_id = NULL
WHERE lead_id IN (SELECT id FROM leads WHERE source = 'Trello');

-- BORRAR TODOS LOS LEADS DE TRELLO
DELETE FROM leads WHERE source = 'Trello';

-- Resetear last_sync_at
UPDATE settings_trello
SET last_sync_at = NULL, updated_at = NOW();

-- Verificar resultado
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM leads WHERE source = 'Trello';
  IF remaining_count > 0 THEN
    RAISE EXCEPTION '⚠️  Aún quedan % leads de Trello', remaining_count;
  ELSE
    RAISE NOTICE '✅ Todos los leads de Trello fueron borrados exitosamente';
  END IF;
END $$;

COMMIT;

