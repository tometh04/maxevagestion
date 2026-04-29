-- ============================================================
-- Migración: AFIP Hardening (SP-1 fase 1a)
-- - Tabla afip_voucher_requests (audit log)
-- - Tabla padron_cache (cache consultas padrón)
-- - Columnas de verificación en invoices
-- - Scoping org_id en integrations
-- - RLS policies actualizadas
-- ============================================================

-- afip_voucher_requests ----------------------------------------
CREATE TABLE IF NOT EXISTS afip_voucher_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id),
  agency_id UUID REFERENCES agencies(id),
  idempotency_key TEXT NOT NULL,
  attempt_n INT NOT NULL DEFAULT 1,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'verify', 'recover')),
  request_payload JSONB,
  response_payload JSONB,
  verified_payload JSONB,
  verification_diff JSONB,
  error TEXT,
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  UNIQUE (idempotency_key, attempt_n)
);

CREATE INDEX idx_afip_voucher_requests_invoice ON afip_voucher_requests(invoice_id);
CREATE INDEX idx_afip_voucher_requests_org ON afip_voucher_requests(org_id);
CREATE INDEX idx_afip_voucher_requests_idempotency ON afip_voucher_requests(idempotency_key);

ALTER TABLE afip_voucher_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY afip_voucher_requests_tenant_isolation
  ON afip_voucher_requests
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- padron_cache ------------------------------------------------
CREATE TABLE IF NOT EXISTS padron_cache (
  cuit TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);
CREATE INDEX idx_padron_cache_expires ON padron_cache(expires_at);

-- No RLS en padron_cache: data pública, cualquier user auth puede leerla/escribirla
ALTER TABLE padron_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY padron_cache_authenticated_all
  ON padron_cache
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- invoices: columnas de verificación + org_id ----------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_status TEXT
    CHECK (verification_status IN ('unverified', 'verified', 'discrepancy', 'not_found_in_afip')),
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_error TEXT;

-- Backfill org_id desde agencies
UPDATE invoices i
SET org_id = a.org_id
FROM agencies a
WHERE a.id = i.agency_id AND i.org_id IS NULL;

-- Set default verification_status para las viejas
UPDATE invoices
SET verification_status = 'unverified'
WHERE verification_status IS NULL;

-- Validación previa al NOT NULL: abortar si hay filas sin org_id
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM invoices WHERE org_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Hay % invoices sin org_id tras backfill. Investigar antes de NOT NULL.', orphan_count;
  END IF;
END $$;

ALTER TABLE invoices ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id);

DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices;
CREATE POLICY invoices_tenant_isolation
  ON invoices
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- integrations: scoping org_id --------------------------------
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

UPDATE integrations i
SET org_id = a.org_id
FROM agencies a
WHERE a.id = i.agency_id AND i.org_id IS NULL;

-- Validación
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM integrations WHERE org_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Hay % integrations sin org_id tras backfill.', orphan_count;
  END IF;
END $$;

ALTER TABLE integrations ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_integrations_org ON integrations(org_id);

DROP POLICY IF EXISTS integrations_tenant_isolation ON integrations;
CREATE POLICY integrations_tenant_isolation
  ON integrations
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_org_ids()))
  WITH CHECK (org_id IN (SELECT user_org_ids()));

-- Fin migración ---------------------------------------------
