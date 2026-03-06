-- Eliminar agencias de QA y Test
-- Primero eliminar referencias en user_agencies, luego la agencia

-- Eliminar asociaciones de usuarios con agencias QA/Test
DELETE FROM user_agencies
WHERE agency_id IN (
  SELECT id FROM agencies WHERE name ILIKE '%QA%' OR name ILIKE '%Test%'
);

-- Eliminar las agencias QA y Test
DELETE FROM agencies WHERE name ILIKE '%QA%' OR name ILIKE '%Test%';
