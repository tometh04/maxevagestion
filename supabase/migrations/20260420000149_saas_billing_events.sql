-- =====================================================
-- Migración 149: billing_events + mp_preapproval_id en organizations
-- =====================================================
-- SaaS Pilar 9 — integración MercadoPago.
--
-- Dos piezas:
--   1. `organizations.mp_preapproval_id` — guarda el ID de la suscripción
--      de MercadoPago (preapproval) asociada al tenant. NULL hasta que
--      el owner haga su primer upgrade.
--   2. `billing_events` — tabla global (platform-level) para log de todo
--      lo que llega del webhook MP y de acciones manuales de admin sobre
--      cobros. Fuente de verdad para debugging y reconciliación.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT;

CREATE INDEX IF NOT EXISTS idx_organizations_mp_preapproval_id
  ON organizations(mp_preapproval_id)
  WHERE mp_preapproval_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  -- Payload crudo del webhook MP o del caller interno.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- ID externo en MP (preapproval_id, payment_id, etc) para dedup/lookup.
  external_id TEXT,
  amount_cents BIGINT,
  currency TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_events_event_type_check
    CHECK (event_type IN (
      'CHECKOUT_INITIATED',
      'MP_WEBHOOK',
      'SUBSCRIPTION_CREATED',
      'SUBSCRIPTION_AUTHORIZED',
      'SUBSCRIPTION_PAUSED',
      'SUBSCRIPTION_CANCELLED',
      'PAYMENT_APPROVED',
      'PAYMENT_REJECTED',
      'MANUAL_ADMIN_ADJUSTMENT'
    ))
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org_id ON billing_events(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_external_id ON billing_events(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_events_created_at ON billing_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_events_event_type ON billing_events(event_type);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events FORCE ROW LEVEL SECURITY;

-- El tenant puede leer sus propios eventos (para mostrar historial en
-- /settings/subscription). Platform admins leen todo.
DROP POLICY IF EXISTS "billing_events_self_read" ON billing_events;
CREATE POLICY "billing_events_self_read" ON billing_events
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT user_org_ids())
    OR EXISTS (
      SELECT 1 FROM platform_admins pa
      INNER JOIN users u ON u.id = pa.user_id
      WHERE u.auth_id = auth.uid()
    )
  );

-- Writes: solo via service_role (checkout route + webhook route).
-- Ninguna policy de INSERT/UPDATE/DELETE para authenticated.

COMMENT ON TABLE billing_events IS
  'SaaS Pilar 9 — log de eventos de facturación (MP webhooks + acciones manuales). Tenant lee los suyos; service_role escribe.';
