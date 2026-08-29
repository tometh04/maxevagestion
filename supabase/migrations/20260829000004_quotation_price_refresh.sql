-- Actualizacion provider-agnostic de precios de cotizaciones.
-- Las credenciales, handles y runs son server-only. El browser opera siempre
-- mediante rutas que validan org/agencia/vendedor antes de usar service_role.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TABLE IF NOT EXISTS public.agency_emilia_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  api_key_encrypted TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL CHECK (key_fingerprint ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rotated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, agency_id),
  UNIQUE (key_fingerprint)
);

CREATE INDEX IF NOT EXISTS agency_emilia_credentials_scope_idx
  ON public.agency_emilia_credentials(org_id, agency_id, status);

ALTER TABLE public.quotation_items
  ADD COLUMN IF NOT EXISTS offer_source JSONB,
  ADD COLUMN IF NOT EXISTS offer_refresh_fallback JSONB,
  ADD COLUMN IF NOT EXISTS cost_basis TEXT;

ALTER TABLE public.quotation_items
  DROP CONSTRAINT IF EXISTS quotation_items_cost_basis_check;
ALTER TABLE public.quotation_items
  ADD CONSTRAINT quotation_items_cost_basis_check CHECK (
    cost_basis IS NULL OR cost_basis IN (
      'AGENCY_NET', 'PROVIDER_TOTAL', 'COMMISSIONABLE_GROSS', 'UNKNOWN'
    )
  ) NOT VALID;
ALTER TABLE public.quotation_items
  VALIDATE CONSTRAINT quotation_items_cost_basis_check;

COMMENT ON COLUMN public.quotation_items.cost_basis IS
  'Semantica provider-agnostic del costo: neto agencia, total proveedor, bruto comisionable o desconocido.';

ALTER TABLE public.quotation_items
  DROP CONSTRAINT IF EXISTS quotation_items_offer_source_shape;
ALTER TABLE public.quotation_items
  ADD CONSTRAINT quotation_items_offer_source_shape CHECK (
    offer_source IS NULL OR (
      jsonb_typeof(offer_source) = 'object'
      AND jsonb_typeof(offer_source->'artifact_id') = 'string'
      AND (offer_source->>'artifact_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND offer_source->>'product' IN ('flights', 'hotels')
      AND length(btrim(COALESCE(offer_source->>'offer_id', ''))) BETWEEN 1 AND 512
      AND (
        NOT (offer_source ? 'selection_id')
        OR (
          jsonb_typeof(offer_source->'selection_id') = 'string'
          AND length(btrim(offer_source->>'selection_id')) BETWEEN 1 AND 512
        )
      )
    )
  ) NOT VALID;
ALTER TABLE public.quotation_items
  VALIDATE CONSTRAINT quotation_items_offer_source_shape;

COMMENT ON COLUMN public.quotation_items.offer_source IS
  'Handle canonico provider-agnostic: {artifact_id, product, offer_id}. Server-only; nunca contiene credenciales del proveedor.';

ALTER TABLE public.quotation_items
  DROP CONSTRAINT IF EXISTS quotation_items_offer_refresh_fallback_shape;
ALTER TABLE public.quotation_items
  ADD CONSTRAINT quotation_items_offer_refresh_fallback_shape CHECK (
    offer_refresh_fallback IS NULL OR (
      jsonb_typeof(offer_refresh_fallback) = 'object'
      AND offer_refresh_fallback->>'product' IN ('flights', 'hotels')
      AND jsonb_typeof(offer_refresh_fallback->'query') = 'object'
      AND jsonb_typeof(offer_refresh_fallback->'identity') = 'object'
    )
  ) NOT VALID;
ALTER TABLE public.quotation_items
  VALIDATE CONSTRAINT quotation_items_offer_refresh_fallback_shape;

COMMENT ON COLUMN public.quotation_items.offer_refresh_fallback IS
  'Query e identidad canonicas para research generico cuando no existe un source exacto.';

CREATE TABLE IF NOT EXISTS public.quotation_price_refresh_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  credential_id UUID NOT NULL REFERENCES public.agency_emilia_credentials(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  idempotency_key UUID NOT NULL,
  remote_request_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'REVIEW_REQUIRED', 'APPLIED', 'FAILED', 'STALE')),
  source_quotation_updated_at TIMESTAMPTZ NOT NULL,
  source_active_document_id UUID REFERENCES public.issued_quotation_documents(id) ON DELETE SET NULL,
  source_snapshot JSONB NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
  proposal_snapshot JSONB CHECK (proposal_snapshot IS NULL OR jsonb_typeof(proposal_snapshot) = 'object'),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary) = 'object'),
  error_code TEXT,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  issued_document_id UUID REFERENCES public.issued_quotation_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, agency_id, idempotency_key)
);

ALTER TABLE public.quotation_price_refresh_runs
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS quotation_price_refresh_runs_scope_idx
  ON public.quotation_price_refresh_runs(org_id, agency_id, quotation_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS quotation_price_refresh_runs_one_active_idx
  ON public.quotation_price_refresh_runs(quotation_id)
  WHERE status IN ('RUNNING', 'REVIEW_REQUIRED');

CREATE UNIQUE INDEX IF NOT EXISTS agencies_id_org_id_refresh_uq
  ON public.agencies(id, org_id);
CREATE UNIQUE INDEX IF NOT EXISTS quotations_id_org_agency_refresh_uq
  ON public.quotations(id, org_id, agency_id);
CREATE UNIQUE INDEX IF NOT EXISTS agency_emilia_credentials_id_scope_uq
  ON public.agency_emilia_credentials(id, org_id, agency_id);
CREATE UNIQUE INDEX IF NOT EXISTS quotation_price_refresh_runs_id_scope_uq
  ON public.quotation_price_refresh_runs(id, quotation_id, org_id, agency_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_emilia_credentials_agency_scope_fkey') THEN
    ALTER TABLE public.agency_emilia_credentials
      ADD CONSTRAINT agency_emilia_credentials_agency_scope_fkey
      FOREIGN KEY (agency_id, org_id) REFERENCES public.agencies(id, org_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotation_price_refresh_runs_quote_scope_fkey') THEN
    ALTER TABLE public.quotation_price_refresh_runs
      ADD CONSTRAINT quotation_price_refresh_runs_quote_scope_fkey
      FOREIGN KEY (quotation_id, org_id, agency_id)
      REFERENCES public.quotations(id, org_id, agency_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotation_price_refresh_runs_credential_scope_fkey') THEN
    ALTER TABLE public.quotation_price_refresh_runs
      ADD CONSTRAINT quotation_price_refresh_runs_credential_scope_fkey
      FOREIGN KEY (credential_id, org_id, agency_id)
      REFERENCES public.agency_emilia_credentials(id, org_id, agency_id) ON DELETE RESTRICT;
  END IF;
END;
$$;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS last_price_refresh_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_price_refresh_run_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_last_price_refresh_run_id_fkey'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_last_price_refresh_run_id_fkey
      FOREIGN KEY (last_price_refresh_run_id)
      REFERENCES public.quotation_price_refresh_runs(id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_last_price_refresh_run_scope_fkey'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_last_price_refresh_run_scope_fkey
      FOREIGN KEY (last_price_refresh_run_id, id, org_id, agency_id)
      REFERENCES public.quotation_price_refresh_runs(id, quotation_id, org_id, agency_id)
      ON DELETE NO ACTION;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_agency_emilia_credentials
  ON public.agency_emilia_credentials;
CREATE TRIGGER set_updated_at_agency_emilia_credentials
BEFORE UPDATE ON public.agency_emilia_credentials
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_quotation_price_refresh_runs
  ON public.quotation_price_refresh_runs;
CREATE TRIGGER set_updated_at_quotation_price_refresh_runs
BEFORE UPDATE ON public.quotation_price_refresh_runs
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

ALTER TABLE public.agency_emilia_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_emilia_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_price_refresh_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_price_refresh_runs FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.agency_emilia_credentials,
  public.quotation_price_refresh_runs
FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE
  public.agency_emilia_credentials,
  public.quotation_price_refresh_runs
TO service_role;

-- Aplica estructura + documento como un unico swap. El documento anterior
-- sigue READY e inmutable; active_document_id cambia solamente al final de la
-- misma transaccion que reemplaza precios y fuentes.
CREATE OR REPLACE FUNCTION public.apply_quotation_price_refresh(
  p_run_id UUID,
  p_quotation_id UUID,
  p_org_id UUID,
  p_agency_id UUID,
  p_actor_id UUID,
  p_expected_quotation_updated_at TIMESTAMPTZ,
  p_expected_run_updated_at TIMESTAMPTZ,
  p_options JSONB,
  p_items JSONB,
  p_revision_id UUID,
  p_data_snapshot JSONB,
  p_manifest_snapshot JSONB,
  p_html_snapshot TEXT,
  p_content_hash TEXT,
  p_file_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_run public.quotation_price_refresh_runs%ROWTYPE;
  v_document public.issued_quotation_documents%ROWTYPE;
  v_selected_option_number INTEGER;
  v_first_total NUMERIC;
  v_actor_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_run_id IS NULL OR p_quotation_id IS NULL OR p_org_id IS NULL
    OR p_agency_id IS NULL OR p_actor_id IS NULL
    OR jsonb_typeof(p_options) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_options) = 0
    OR jsonb_typeof(p_data_snapshot) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_manifest_snapshot) IS DISTINCT FROM 'object'
    OR COALESCE(length(p_html_snapshot), 0) = 0
    OR p_content_hash !~ '^[a-f0-9]{64}$'
    OR COALESCE(length(btrim(p_file_name)), 0) = 0
  THEN
    RAISE EXCEPTION 'invalid quotation refresh payload' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_options) row_value
    WHERE row_value->>'quotation_id' IS DISTINCT FROM p_quotation_id::TEXT
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) row_value
    WHERE row_value->>'quotation_id' IS DISTINCT FROM p_quotation_id::TEXT
      OR row_value->>'org_id' IS DISTINCT FROM p_org_id::TEXT
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item_value
    WHERE item_value->>'option_id' IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_options) option_value
        WHERE option_value->>'id' = item_value->>'option_id'
      )
  ) THEN
    RAISE EXCEPTION 'quotation refresh structure scope mismatch' USING ERRCODE = '23514';
  END IF;

  -- Orden compartido con los writers existentes.
  PERFORM id FROM public.quotation_items
  WHERE quotation_id = p_quotation_id ORDER BY id FOR UPDATE;
  PERFORM id FROM public.quotation_options
  WHERE quotation_id = p_quotation_id ORDER BY id FOR UPDATE;
  SELECT * INTO v_quote
  FROM public.quotations
  WHERE id = p_quotation_id AND org_id = p_org_id AND agency_id = p_agency_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation not found in expected scope' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_run
  FROM public.quotation_price_refresh_runs
  WHERE id = p_run_id AND quotation_id = p_quotation_id
    AND org_id = p_org_id AND agency_id = p_agency_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation refresh run not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT id INTO v_actor_id FROM public.users
  WHERE id = p_actor_id AND org_id = p_org_id AND is_active = true;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor does not belong to quotation org' USING ERRCODE = '23514';
  END IF;
  IF v_run.status = 'APPLIED' AND v_run.issued_document_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'quotation_id', v_quote.id,
      'quotation_updated_at', v_quote.updated_at,
      'run_id', v_run.id,
      'run_updated_at', v_run.updated_at,
      'issued_document_id', v_run.issued_document_id,
      'already_applied', true
    );
  END IF;
  IF v_quote.updated_at IS DISTINCT FROM p_expected_quotation_updated_at
    OR v_quote.updated_at IS DISTINCT FROM v_run.source_quotation_updated_at
  THEN
    UPDATE public.quotation_price_refresh_runs
    SET status = 'STALE', error_code = 'STALE_QUOTATION',
        error_message = 'La cotizacion cambio despues de iniciar la actualizacion.'
    WHERE id = p_run_id;
    RETURN jsonb_build_object(
      'quotation_id', v_quote.id,
      'quotation_updated_at', v_quote.updated_at,
      'run_id', v_run.id,
      'stale', true
    );
  END IF;
  IF v_run.updated_at IS DISTINCT FROM p_expected_run_updated_at THEN
    RAISE EXCEPTION 'quotation refresh run changed' USING ERRCODE = '40001';
  END IF;
  IF v_run.status IS DISTINCT FROM 'REVIEW_REQUIRED' THEN
    RAISE EXCEPTION 'quotation refresh run is not applicable' USING ERRCODE = '55000';
  END IF;
  IF v_run.valid_until IS NULL OR v_run.valid_until <= clock_timestamp() THEN
    UPDATE public.quotation_price_refresh_runs
    SET status = 'STALE', error_code = 'REVIEW_EXPIRED',
        error_message = 'La propuesta de precios vencio y debe volver a consultarse.'
    WHERE id = p_run_id;
    RETURN jsonb_build_object(
      'quotation_id', v_quote.id,
      'quotation_updated_at', v_quote.updated_at,
      'run_id', v_run.id,
      'expired', true
    );
  END IF;
  IF v_quote.status NOT IN ('DRAFT', 'SENT', 'PENDING_APPROVAL') THEN
    RAISE EXCEPTION 'quotation status does not allow price refresh' USING ERRCODE = '55000';
  END IF;
  SELECT option_number INTO v_selected_option_number
  FROM public.quotation_options
  WHERE quotation_id = p_quotation_id AND is_selected IS TRUE
  ORDER BY option_number LIMIT 1;

  DELETE FROM public.quotation_items WHERE quotation_id = p_quotation_id;
  DELETE FROM public.quotation_options WHERE quotation_id = p_quotation_id;
  INSERT INTO public.quotation_options
  SELECT * FROM jsonb_populate_recordset(NULL::public.quotation_options, p_options);
  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.quotation_items
    SELECT * FROM jsonb_populate_recordset(NULL::public.quotation_items, p_items);
  END IF;
  IF v_selected_option_number IS NOT NULL THEN
    UPDATE public.quotation_options SET is_selected = TRUE
    WHERE quotation_id = p_quotation_id AND option_number = v_selected_option_number;
  END IF;

  SELECT total_amount INTO v_first_total
  FROM public.quotation_options
  WHERE quotation_id = p_quotation_id ORDER BY option_number LIMIT 1;

  UPDATE public.quotations
  SET subtotal = v_first_total,
      total_amount = v_first_total,
      active_document_id = NULL,
      last_price_refresh_at = COALESCE(v_run.completed_at, clock_timestamp()),
      last_price_refresh_run_id = v_run.id,
      updated_at = clock_timestamp()
  WHERE id = p_quotation_id
  RETURNING * INTO v_quote;

  PERFORM public.assert_quotation_structure_valid(
    p_quotation_id, p_org_id, v_quote.currency
  );

  v_document := public.issue_quotation_document(
    p_quotation_id,
    p_revision_id,
    v_quote.updated_at,
    p_data_snapshot,
    p_manifest_snapshot,
    p_html_snapshot,
    p_content_hash,
    p_file_name,
    p_actor_id,
    false
  );

  UPDATE public.quotation_price_refresh_runs
  SET status = 'APPLIED', applied_at = clock_timestamp(), applied_by = p_actor_id,
      issued_document_id = v_document.id, error_code = NULL, error_message = NULL
  WHERE id = p_run_id
  RETURNING * INTO v_run;

  SELECT * INTO v_quote FROM public.quotations WHERE id = p_quotation_id;
  RETURN jsonb_build_object(
    'quotation_id', v_quote.id,
    'quotation_updated_at', v_quote.updated_at,
    'active_document_id', v_quote.active_document_id,
    'run_id', v_run.id,
    'run_updated_at', v_run.updated_at,
    'issued_document_id', v_document.id,
    'issued_document_sequence', v_document.sequence,
    'file_name', v_document.file_name,
    'already_applied', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_quotation_price_refresh(
  UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  JSONB, JSONB, UUID, JSONB, JSONB, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_quotation_price_refresh(
  UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  JSONB, JSONB, UUID, JSONB, JSONB, TEXT, TEXT, TEXT
) TO service_role;

COMMIT;
