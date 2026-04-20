-- =====================================================
-- Migración 153: Fix quotation_number cross-org + tax_withholdings tenant isolation
-- =====================================================
-- Bugs reportados:
--
-- #3: LOLO no puede crear quotations. Console: duplicate key violation on
--     quotations_quotation_number_key. El constraint UNIQUE es global,
--     pero la función generate_quotation_number emite 'COT-YYYY-0001'
--     para todos los tenants sin distinguir. Colisiona con la de Lozada.
--     Fix: cambiar unique a (org_id, quotation_number) + hacer la
--     función org-scoped.
--
-- #2: Ni Maxi ni LOLO ven data en Impuestos → Percepciones y Retenciones.
--     tax_withholdings no tenía org_id ni agency_id y la policy `tw_insert`
--     era sólo para INSERT sin USING expression (permisiva para SELECT).
--     Además cualquier nuevo INSERT que llegue desde un JWT user ya falla
--     con 42501 si no setea org_id.
--     Fix: agregar org_id + agency_id, backfill desde operations/operators,
--     force RLS + tenant_isolation policy, trigger auto-org_id.

-- =====================================================
-- 1. quotations: UNIQUE por tenant
-- =====================================================
ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_quotation_number_key;

-- Si existe un constraint con otro nombre lo limpiamos por las dudas
DO $cleanup$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'quotations'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (quotation_number)'
  LOOP
    EXECUTE format('ALTER TABLE quotations DROP CONSTRAINT %I', r.conname);
  END LOOP;
END;
$cleanup$;

ALTER TABLE quotations
  ADD CONSTRAINT quotations_org_number_unique UNIQUE (org_id, quotation_number);

-- =====================================================
-- 2. generate_quotation_number: org-scoped
-- =====================================================
-- Aceptamos un org_id explícito; si no viene, lo resolvemos de auth.uid().
-- Además numeramos solo dentro de ese tenant (LOLO puede reiniciar en
-- COT-2026-0001 aunque Lozada ya esté en 0500).
CREATE OR REPLACE FUNCTION generate_quotation_number(p_org_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  new_number TEXT;
  effective_org UUID;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  effective_org := p_org_id;

  IF effective_org IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT u.org_id INTO effective_org
    FROM users u WHERE u.auth_id = auth.uid() LIMIT 1;
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM quotations
  WHERE quotation_number LIKE 'COT-' || year_part || '-%'
    AND (effective_org IS NULL OR org_id = effective_org);

  new_number := 'COT-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');
  RETURN new_number;
END;
$body$;

-- =====================================================
-- 3. tax_withholdings: org_id + agency_id + RLS
-- =====================================================
ALTER TABLE tax_withholdings
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

-- Backfill: operation → operations.org_id/agency_id
UPDATE tax_withholdings tw
SET org_id = o.org_id,
    agency_id = COALESCE(tw.agency_id, o.agency_id)
FROM operations o
WHERE tw.operation_id = o.id AND tw.org_id IS NULL;

-- Backfill: operator → operators.org_id
UPDATE tax_withholdings tw
SET org_id = op.org_id
FROM operators op
WHERE tw.operator_id = op.id AND tw.org_id IS NULL;

-- Fallback: a Lozada (eran pre-SaaS)
UPDATE tax_withholdings
SET org_id = (SELECT id FROM organizations WHERE slug = 'lozada-viajes')
WHERE org_id IS NULL;

ALTER TABLE tax_withholdings ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tax_withholdings_org_id ON tax_withholdings(org_id);
CREATE INDEX IF NOT EXISTS idx_tax_withholdings_agency_id ON tax_withholdings(agency_id);

-- Drop policy vieja
DROP POLICY IF EXISTS "tw_insert" ON tax_withholdings;

ALTER TABLE tax_withholdings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_withholdings_tenant_isolation" ON tax_withholdings;
CREATE POLICY "tax_withholdings_tenant_isolation" ON tax_withholdings
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- Trigger auto-org_id (usamos la función genérica de mig 152 que ya existe)
DROP TRIGGER IF EXISTS trg_auto_org_id_tax_withholdings ON tax_withholdings;
CREATE TRIGGER trg_auto_org_id_tax_withholdings
  BEFORE INSERT ON tax_withholdings
  FOR EACH ROW EXECUTE FUNCTION auto_set_org_id_from_auth();

-- =====================================================
-- 4. commission_rules default para tenants que no tengan ninguna
-- =====================================================
-- Bug #1: LOLO creó una venta y no se generó comisión. Root cause:
-- commission_rules solo tenía reglas de Lozada; LOLO no tenía ninguna,
-- así que getSellerPercentage() devolvía 0 y no se creaba commission_record.
--
-- Seedeamos una regla generic de SELLER 10% para cada org que no tenga
-- ninguna. El owner puede ajustarla/eliminarla en Settings → Comisiones.
INSERT INTO commission_rules (
  org_id, agency_id, seller_id, type, basis, value, destination_region, valid_from, valid_to
)
SELECT o.id, NULL, NULL, 'SELLER', 'MARGIN', 10, NULL, CURRENT_DATE, NULL
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM commission_rules cr WHERE cr.org_id = o.id
);
