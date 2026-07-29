-- VIB-68: Medición de conversión de leads a ventas reales.
--
-- Agrega un eje de "resultado" (outcome) por lead, INDEPENDIENTE del pipeline
-- (status legacy) y del funnel (advanced). Permite marcar explícitamente por
-- lead si terminó en venta o si se descartó, sin depender de en qué columna
-- del tablero esté.
--
-- Distinción venta real vs venta manual: NO se guarda como campo aparte, se
-- deriva de si el lead tiene una operación asociada (operations.lead_id).
--   - outcome = 'SALE' + tiene operación  -> venta real confirmada
--   - outcome = 'SALE' + sin operación    -> venta manual (falta cargar la op)
--   - outcome = 'DISCARDED'               -> descartado
--   - outcome = NULL                      -> abierto / en trabajo

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS outcome TEXT
    CHECK (outcome IN ('SALE', 'DISCARDED')),
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN leads.outcome IS 'Resultado del lead: SALE | DISCARDED | NULL (abierto). Eje independiente del status/funnel. Venta real vs manual se deriva de operations.lead_id.';
COMMENT ON COLUMN leads.outcome_at IS 'Cuándo se marcó el resultado (venta/descarte).';
COMMENT ON COLUMN leads.outcome_by IS 'Usuario que marcó el resultado.';

-- Índice para reportes de conversión por org.
CREATE INDEX IF NOT EXISTS idx_leads_org_outcome ON leads(org_id, outcome);

-- ============================================================================
-- Backfill: dejar el histórico coherente desde el día uno.
-- ============================================================================

-- Leads que ya generaron una operación => venta real confirmada.
UPDATE leads
SET outcome = 'SALE'
WHERE outcome IS NULL
  AND id IN (
    SELECT lead_id FROM operations WHERE lead_id IS NOT NULL
  );

-- Leads marcados como perdidos en el pipeline legacy => descartados.
UPDATE leads
SET outcome = 'DISCARDED'
WHERE outcome IS NULL
  AND status = 'LOST';
