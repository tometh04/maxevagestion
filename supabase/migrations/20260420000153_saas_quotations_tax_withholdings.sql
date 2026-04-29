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
-- LANGUAGE sql (no plpgsql) — evita el bug del SQL Editor de Supabase
-- que rechaza DECLARE local vars con 42P01. Todo se resuelve con
-- subqueries inline. Aceptamos p_org_id; si no viene, resolvemos desde
-- auth.uid(). Numeramos sólo dentro del tenant.
CREATE OR REPLACE FUNCTION generate_quotation_number(p_org_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $body$
  SELECT 'COT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(
    (COALESCE((
      SELECT MAX(CAST(SUBSTRING(q.quotation_number FROM '[0-9]+$') AS INTEGER))
      FROM quotations q
      WHERE q.quotation_number LIKE 'COT-' || TO_CHAR(NOW(), 'YYYY') || '-%'
        AND (
          COALESCE(
            p_org_id,
            (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1)
          ) IS NULL
          OR q.org_id = COALESCE(
            p_org_id,
            (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1)
          )
        )
    ), 0) + 1)::TEXT,
    4, '0'
  )
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

-- NOTA sobre el bug #1 (comisión no generada):
-- Root cause: `getSellerPercentage()` devuelve 0 cuando un tenant no
-- tiene `commission_rules` cargadas. En una versión anterior de esta
-- migración seedeaba una regla default 10% para cada org — lo sacamos
-- porque genera data contable arbitraria (no todas las agencias pagan
-- 10%, algunas no pagan comisión, etc). En vez, el frontend muestra un
-- warning cuando no hay reglas configuradas. Cada tenant configura sus
-- propias reglas en Settings → Comisiones.
