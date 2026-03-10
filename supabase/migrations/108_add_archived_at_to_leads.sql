-- Agrega columna archived_at a leads para soft-delete (archivar)
-- Cuando archived_at IS NOT NULL, el lead está archivado.
-- Se mantiene list_name para mostrarlo en la tab "Archivados" de su lista.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Índice para filtrar rápido (la mayoría de las queries excluyen archivados)
CREATE INDEX IF NOT EXISTS idx_leads_archived_at ON leads (archived_at)
  WHERE archived_at IS NOT NULL;
