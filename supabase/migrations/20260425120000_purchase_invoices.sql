-- ============================================================
-- SP-6 (alcance reducido): Purchase Invoices multi-tenant
-- ============================================================
--
-- Contexto: el módulo `purchase_invoices` ya existía en prod (commit
-- 5a29e15, 2026-03-26) con su tabla, API endpoints (`/api/operations/[id]/
-- purchase-invoices/`) y UI (`components/operations/purchase-invoices-
-- section.tsx`), pero:
--   - La tabla nunca tuvo migration en repo (se creó manualmente)
--   - No tenía `org_id` ni RLS → leak entre orgs en el SaaS
--
-- Esta migration restaura la tabla con su schema legacy + agrega `org_id`
-- + RLS multi-tenant + trigger autopopulate. El código legacy sigue
-- funcionando sin cambios — solo se beneficia del aislamiento por org.
--
-- N:M, asiento contable automático y status DRAFT/CONFIRMED quedan FUERA
-- de scope (sprint separado si se piden).

CREATE TABLE purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- FKs (schema legacy)
  operation_id UUID NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES operators(id),

  -- AFIP fields (schema legacy)
  invoice_type TEXT NOT NULL DEFAULT 'FACTURA_A',
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  emitter_cuit TEXT,
  emitter_name TEXT,

  -- Currency
  currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  exchange_rate NUMERIC(18,6),

  -- Amounts
  net_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  iva_rate NUMERIC(5,2) NOT NULL DEFAULT 21,
  iva_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  perception_iva NUMERIC(18,2) NOT NULL DEFAULT 0,
  perception_iibb NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_taxes NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL,
  total_ars_equivalent NUMERIC(18,2),

  -- Document
  document_url TEXT,
  document_name TEXT,

  -- State
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  notes TEXT,

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_invoices_operation ON purchase_invoices(operation_id);
CREATE INDEX idx_purchase_invoices_operator ON purchase_invoices(operator_id);
CREATE INDEX idx_purchase_invoices_org_date ON purchase_invoices(org_id, invoice_date DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION purchase_invoices_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER purchase_invoices_updated_at
  BEFORE UPDATE ON purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION purchase_invoices_set_updated_at();

-- Resolución de org_id con fallback. El código legacy
-- (app/api/operations/[id]/purchase-invoices/route.ts) usa SERVICE_ROLE_KEY
-- para el INSERT, así que auth.uid() es NULL y el trigger universal SaaS
-- (auto_set_org_id_from_auth, mig 152) no puede resolver. Esta función
-- tiene fallback: auth.uid() → operation_id → operations.org_id.
CREATE OR REPLACE FUNCTION purchase_invoices_resolve_org_id() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;

  -- Try auth context first (cubre inserts via server client del user)
  IF auth.uid() IS NOT NULL THEN
    NEW.org_id := (SELECT u.org_id FROM users u WHERE u.auth_id = auth.uid() LIMIT 1);
  END IF;

  -- Fallback: derive from operation_id (cubre inserts via service_role)
  IF NEW.org_id IS NULL AND NEW.operation_id IS NOT NULL THEN
    NEW.org_id := (SELECT op.org_id FROM operations op WHERE op.id = NEW.operation_id LIMIT 1);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resolve_org_id_purchase_invoices
  BEFORE INSERT ON purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION purchase_invoices_resolve_org_id();

-- RLS
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;

-- Nota sobre el JOIN: el orden importa. `INNER JOIN users u ON u.id = pa.user_id`
-- + `WHERE u.auth_id = auth.uid()` evita la recursión de RLS que sí dispara
-- el patrón inverso (`ON u.auth_id = auth.uid() WHERE pa.user_id = u.id`).
-- Ver migration 149 (saas_billing_events) que usa el mismo orden.
CREATE POLICY purchase_invoices_tenant_isolation ON purchase_invoices
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    OR EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  )
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON TABLE purchase_invoices IS
  'Facturas recibidas de operadores (schema legacy + org_id multi-tenant). SP-6 alcance reducido — código en app/api/operations/[id]/purchase-invoices/ y components/operations/purchase-invoices-section.tsx.';
