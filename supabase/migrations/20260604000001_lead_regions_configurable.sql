-- Migration 2026-06-04: regiones del CRM configurables por organización.
--
-- ANTES: leads.region tenía un CHECK constraint con 7 valores hardcoded
-- (ARGENTINA/CARIBE/BRASIL/EUROPA/EEUU/OTROS/CRUCEROS). Cada tenant pedía
-- agregar/sacar regiones distintas y había que tocar código + migrar el
-- enum. Esta migración:
--   1. Crea tabla `lead_regions` por org con CRUD libre.
--   2. Seedea las 7 regiones default para cada org existente.
--   3. Quita el CHECK constraint de leads.region (se valida en app contra
--      las regiones del org).
--
-- La columna `code` es el identificador interno (lo que se guarda en
-- leads.region — uppercase, sin espacios). `name` es el label visible.

BEGIN;

-- ============================================================
-- 1. Tabla lead_regions
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_lead_regions_org ON lead_regions(org_id);
CREATE INDEX IF NOT EXISTS idx_lead_regions_org_active ON lead_regions(org_id, is_active);

COMMENT ON TABLE lead_regions IS 'Regiones configurables del CRM por organización (multi-tenant).';
COMMENT ON COLUMN lead_regions.code IS 'Identificador interno que se guarda en leads.region (uppercase).';
COMMENT ON COLUMN lead_regions.name IS 'Label visible en UI.';
COMMENT ON COLUMN lead_regions.position IS 'Orden en selects y filtros.';

-- ============================================================
-- 2. Trigger updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_lead_regions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_lead_regions_updated_at ON lead_regions;
CREATE TRIGGER trigger_update_lead_regions_updated_at
  BEFORE UPDATE ON lead_regions
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_regions_updated_at();

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE lead_regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_regions_org_isolation" ON lead_regions;
CREATE POLICY "lead_regions_org_isolation" ON lead_regions
  FOR ALL
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- ============================================================
-- 4. Seed default regions para cada org existente
-- ============================================================
INSERT INTO lead_regions (org_id, code, name, position)
SELECT o.id, v.code, v.name, v.position
FROM organizations o
CROSS JOIN (VALUES
  ('ARGENTINA', 'Argentina', 0),
  ('CARIBE',    'Caribe',    1),
  ('BRASIL',    'Brasil',    2),
  ('EUROPA',    'Europa',    3),
  ('EEUU',      'EEUU',      4),
  ('CRUCEROS',  'Cruceros',  5),
  ('OTROS',     'Otros',     6)
) AS v(code, name, position)
ON CONFLICT (org_id, code) DO NOTHING;

-- ============================================================
-- 5. Quitar CHECK constraint de leads.region
-- ============================================================
-- El nombre del constraint creado por CHECK en CREATE TABLE depende de PG.
-- Intentamos los nombres conocidos sin fallar si no existen.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'leads'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%region%IN%'
  LOOP
    EXECUTE format('ALTER TABLE leads DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

COMMIT;
