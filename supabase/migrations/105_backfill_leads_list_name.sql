-- Backfill: asignar list_name a leads que tienen NULL basándose en su región
-- Esto hace que todos los leads existentes aparezcan en el Kanban del CRM

UPDATE leads
SET list_name = CASE region
  WHEN 'ARGENTINA' THEN 'Leads - Argentina'
  WHEN 'CARIBE' THEN 'Leads - Caribe'
  WHEN 'BRASIL' THEN 'Leads - Brasil'
  WHEN 'EUROPA' THEN 'Leads - Europa'
  WHEN 'EEUU' THEN 'Leads - EEUU'
  WHEN 'CRUCEROS' THEN 'Leads - Exoticos'
  ELSE 'Leads - Otros'
END
WHERE list_name IS NULL;
