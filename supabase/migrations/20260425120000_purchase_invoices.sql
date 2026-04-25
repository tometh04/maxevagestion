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

-- Universal org_id auto-populate (matches SaaS migration 152 pattern).
-- Sin esto, el código legacy que hace INSERT sin org_id sería rechazado por RLS.
CREATE TRIGGER trg_auto_org_id_purchase_invoices
  BEFORE INSERT ON purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION auto_set_org_id_from_auth();

-- RLS
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_invoices_tenant_isolation ON purchase_invoices
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    OR EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.auth_id = auth.uid()
      WHERE pa.user_id = u.id
    )
  )
  WITH CHECK (org_id IN (SELECT user_org_ids()));

COMMENT ON TABLE purchase_invoices IS
  'Facturas recibidas de operadores (schema legacy + org_id multi-tenant). SP-6 alcance reducido — código en app/api/operations/[id]/purchase-invoices/ y components/operations/purchase-invoices-section.tsx.';
