-- /Users/tomiisanchezz/Desktop/Repos/erplozada/supabase/migrations/20260422000159_manual_payments.sql

-- Histórico de pagos manuales (transferencia, factura A, etc.) para custom_plans
-- con billing_method='MANUAL'. covers_to del último pago define vencimiento.

CREATE TABLE IF NOT EXISTS manual_payments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount_ars     NUMERIC(12,2) NOT NULL CHECK (amount_ars > 0),
  paid_at        TIMESTAMPTZ NOT NULL,
  covers_from    DATE NOT NULL,
  covers_to      DATE NOT NULL CHECK (covers_to >= covers_from),
  payment_method TEXT,
  receipt_ref    TEXT,
  registered_by  UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_payments_org_covers_to_idx
  ON manual_payments (org_id, covers_to DESC);

ALTER TABLE manual_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manual_payments_tenant_read ON manual_payments;
CREATE POLICY manual_payments_tenant_read ON manual_payments
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_org_ids()));

DROP POLICY IF EXISTS manual_payments_admin_all ON manual_payments;
CREATE POLICY manual_payments_admin_all ON manual_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );
