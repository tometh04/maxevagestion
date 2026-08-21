-- Las orgs creadas despues del 2026-06-04 no pueden crear NINGUN lead
--
-- Sintoma reportado por Kyo Viajes (org "Kayzen Sas", alta 2026-06-24):
-- "queremos crear un lead y nos dice que no se puede". 17 usuarios, 0 leads
-- creados desde el alta.
--
-- Causa: la migracion 20260604000001_lead_regions_configurable seedeo las 7
-- regiones default SOLO para las orgs que existian al momento de correrla, y
-- no dejo ningun mecanismo para las orgs nuevas. Ni `POST /api/onboarding` ni
-- `POST /api/admin/orgs` insertaban en `lead_regions`. Una org nueva arranca
-- con 0 regiones y `POST /api/leads` valida `region` contra esa tabla, asi que
-- devuelve 400 "Region invalida para tu organizacion" para cualquier valor.
--
-- El front lo disimula: `lib/hooks/use-lead-regions.ts` cae a un
-- FALLBACK_REGIONS hardcodeado cuando la org no tiene regiones, asi que el
-- select se ve normal y el usuario elige una opcion que el server siempre
-- rechaza.
--
-- Alcance medido en produccion antes de esta migracion: 13 orgs con 0 filas
-- en `lead_regions`, todas con alta posterior al 2026-06-04. La unica con
-- subscription_status ACTIVE era Kayzen Sas.
--
-- Esta migracion rellena lo existente y evita que vuelva a pasar. El fix de
-- codigo (`lib/leads/seed-lead-regions.ts`, llamado desde las dos rutas de
-- alta de org) es la fuente de verdad; el trigger es red de seguridad para
-- cualquier org creada por fuera de esas rutas.

BEGIN;

-- ============================================================
-- 1. Backfill: regiones default para toda org que no tenga ninguna
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
WHERE NOT EXISTS (
  SELECT 1 FROM lead_regions lr WHERE lr.org_id = o.id
)
ON CONFLICT (org_id, code) DO NOTHING;

-- ============================================================
-- 2. Red de seguridad: seedear al crear la org
-- ============================================================
-- Solo aplica a orgs nuevas y solo si no tienen regiones, asi que no pisa
-- nada de un tenant que ya configuro las suyas.
CREATE OR REPLACE FUNCTION seed_default_lead_regions()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO lead_regions (org_id, code, name, position)
  SELECT NEW.id, v.code, v.name, v.position
  FROM (VALUES
    ('ARGENTINA', 'Argentina', 0),
    ('CARIBE',    'Caribe',    1),
    ('BRASIL',    'Brasil',    2),
    ('EUROPA',    'Europa',    3),
    ('EEUU',      'EEUU',      4),
    ('CRUCEROS',  'Cruceros',  5),
    ('OTROS',     'Otros',     6)
  ) AS v(code, name, position)
  ON CONFLICT (org_id, code) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_seed_default_lead_regions ON organizations;
CREATE TRIGGER trigger_seed_default_lead_regions
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION seed_default_lead_regions();

COMMENT ON FUNCTION seed_default_lead_regions() IS
  'Seedea las 7 regiones default del CRM al crear una org. Sin regiones, POST /api/leads rechaza todos los leads del tenant.';

COMMIT;
